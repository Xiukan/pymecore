import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { validarLease } from '../lease/lease';
import { dteDeVenta, enviarAlSiiSimulado } from '../sii/sii-gateway';
import { modo } from '../utils/modo';
import { PrismaService } from '../prisma/prisma.service';
import { EmpresaService } from '../empresa/empresa.service';
import { SiiIntegrationService } from '../sii/sii-integration.service';
import { desglose } from '../transactions/transactions.service';
import { reclamarFolio } from '../utils/folios.util';

class SinFolioError extends Error {}

const ENVIO_ATASCADO_MS = 10 * 60_000;
const TAMANO_LOTE = 50;
/** Renueva la licencia cuando le quedan menos de 12 h. */
const RENOVAR_ANTES_MS = 12 * 3_600_000;

type Conectividad = 'EN_LINEA' | 'SIN_CONEXION' | 'NO_CONFIGURADA';

/** Espera creciente entre reintentos fallidos: 5 s, 10 s, 20 s... hasta 5 min. */
export const esperaReintento = (fallos: number) => Math.min(5_000 * 2 ** Math.max(fallos - 1, 0), 300_000);

@Injectable()
export class SyncService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SyncService.name);
  private conectividad: Conectividad = 'NO_CONFIGURADA';
  private fallosSeguidos = 0;
  private proximoIntento = 0;
  private temporizador?: NodeJS.Timeout;
  private enCurso = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly sii: SiiIntegrationService,
    private readonly empresa: EmpresaService,
  ) {}

  onModuleInit() {
    const intervalo = Number(process.env.SYNC_INTERVALO_MS ?? 30_000);
    if (modo() === 'edge' && intervalo > 0) {
      this.temporizador = setInterval(() => {
        if (Date.now() >= this.proximoIntento) this.enviarANube().catch(() => {});
      }, intervalo);
    }
  }

  onModuleDestroy() {
    if (this.temporizador) clearInterval(this.temporizador);
  }

  private nube() {
    const url = process.env.CLOUD_URL;
    const id = process.env.INSTALACION_ID;
    const secreto = process.env.INSTALACION_SECRETO;
    if (!url || !id || !secreto) return null;
    return { url: url.replace(/\/$/, ''), headers: { 'content-type': 'application/json', 'x-instalacion-id': id, 'x-instalacion-secreto': secreto }, id };
  }

  private async post(ruta: string, cuerpo: unknown) {
    const n = this.nube();
    if (!n) throw new Error('Nube no configurada (CLOUD_URL, INSTALACION_ID, INSTALACION_SECRETO).');
    const r = await fetch(`${n.url}${ruta}`, { method: 'POST', headers: n.headers, body: JSON.stringify(cuerpo), signal: AbortSignal.timeout(10_000) });
    const datos = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`La nube respondió ${r.status}: ${(datos as { message?: string }).message ?? ''}`);
    return datos;
  }

  /** Pide una licencia nueva a la nube y la guarda en el local. */
  async renovarLease() {
    const n = this.nube();
    if (!n) return null;
    const { token, venceEn } = (await this.post('/lease/renovar', { instalacionId: n.id })) as { token: string; venceEn: string };
    const ahora = new Date();
    return this.prisma.leaseToken.upsert({
      where: { instalacionId: n.id },
      update: { jwt: token, emitidoEn: ahora, venceEn: new Date(venceEn), ultimaValidacionEn: ahora },
      create: { instalacionId: n.id, jwt: token, emitidoEn: ahora, venceEn: new Date(venceEn) },
    });
  }

  /**
   * SyncService (ADR-02): envía la cola en lotes ordenados por secuencia local. Marca una
   * venta como enviada solo cuando la nube confirma (aceptada o duplicada); si falla la red,
   * todo queda en la cola y se reintenta con espera creciente.
   */
  async enviarANube() {
    if (this.enCurso) return { enviadas: 0, enCurso: true };
    this.enCurso = true;
    let enviadas = 0;
    try {
      const lease = await this.prisma.leaseToken.findUnique({ where: { instalacionId: process.env.INSTALACION_ID ?? '' } });
      if (!lease || lease.venceEn.getTime() - Date.now() < RENOVAR_ANTES_MS) await this.renovarLease();
      for (;;) {
        const cola = await this.prisma.outboxSync.findMany({ where: { enviadoEn: null }, orderBy: { secuencia: 'asc' }, take: TAMANO_LOTE });
        if (!cola.length) break;
        const ventas = await this.prisma.transaccion.findMany({
          where: { id: { in: cola.map((c) => c.ventaId) } },
          include: { detalles: { include: { item: { select: { nombre: true } } } }, entidad: { select: { rut: true } } },
        });
        const empresa = await this.empresa.get();
        const porId = new Map(ventas.map((v) => [v.id, v]));
        // Una venta sin folio espera en la cola hasta obtenerlo: el SII la rechazaría.
        const lote = cola.flatMap((c) => {
          const v = porId.get(c.ventaId);
          if (!v || !v.numeroFactura) return [];
          return [{
            ventaId: v.id,
            secuencia: c.secuencia,
            creadaEn: v.fechaRegistro.toISOString(),
            total: Number(v.montoTotal),
            items: v.detalles.map((d) => ({ itemId: d.itemId, nombre: d.item.nombre, cantidad: Number(d.cantidad), precioUnitario: Number(d.precioUnitario), subtotal: Number(d.subtotal) })),
            dte: dteDeVenta(v, v.entidad?.rut ?? empresa.rutConsumidorFinal),
          }];
        });
        if (!lote.length) break;
        let respuesta: { aceptadas: string[]; duplicadas: string[]; dte: { ventaId: string; estado: string; glosa: string | null }[] };
        try {
          respuesta = (await this.post('/sync/lotes', { lote })) as typeof respuesta;
        } catch (err) {
          await this.prisma.outboxSync.updateMany({ where: { id: { in: cola.map((c) => c.id) } }, data: { intentos: { increment: 1 }, ultimoError: String((err as Error).message).slice(0, 300) } });
          throw err;
        }
        const confirmadas = new Set([...respuesta.aceptadas, ...respuesta.duplicadas]);
        const ahora = new Date();
        await this.prisma.$transaction(async (tx) => {
          await tx.outboxSync.updateMany({ where: { ventaId: { in: [...confirmadas] } }, data: { enviadoEn: ahora, ultimoError: null } });
          for (const d of respuesta.dte) {
            if (!confirmadas.has(d.ventaId)) continue;
            await tx.transaccion.update({
              where: { id: d.ventaId },
              data: { sincronizacion: 'SINCRONIZADO', ...(d.estado !== 'PENDIENTE_ENVIO_SII' && { estadoDte: d.estado as 'ACEPTADO', glosaSii: d.glosa }) },
            });
          }
        });
        enviadas += confirmadas.size;
        if (confirmadas.size < cola.length) break;
      }
      this.conectividad = 'EN_LINEA';
      this.fallosSeguidos = 0;
      this.proximoIntento = 0;
      return { enviadas };
    } catch (err) {
      this.conectividad = this.nube() ? 'SIN_CONEXION' : 'NO_CONFIGURADA';
      this.fallosSeguidos++;
      this.proximoIntento = Date.now() + esperaReintento(this.fallosSeguidos);
      this.logger.warn(`Sincronización con la nube pendiente: ${(err as Error).message}`);
      return { enviadas, error: (err as Error).message };
    } finally {
      this.enCurso = false;
    }
  }

  /** Estado visible en el local: cola pendiente, último envío y licencia. */
  async estado() {
    const [pendientes, ultimo, lease] = await Promise.all([
      this.prisma.outboxSync.count({ where: { enviadoEn: null } }),
      this.prisma.outboxSync.aggregate({ _max: { enviadoEn: true } }),
      process.env.INSTALACION_ID ? this.prisma.leaseToken.findUnique({ where: { instalacionId: process.env.INSTALACION_ID } }) : null,
    ]);
    const validacion = modo() === 'edge' ? validarLease(lease?.jwt, process.env.INSTALACION_ID ?? '', process.env.LEASE_SECRET ?? '') : null;
    return {
      modo: modo(),
      pendientes,
      ultimoSyncExitoso: ultimo._max.enviadoEn,
      conectividad: modo() === 'edge' ? this.conectividad : 'NO_CONFIGURADA',
      licencia: validacion && (validacion.permitido ? { vigente: true, venceEn: validacion.venceEn, enGracia: validacion.enGracia } : { vigente: false, motivo: validacion.motivo }),
    };
  }

  async getPendientes(sucursalId?: string) {
    if (modo() === 'edge') return { pendientes: await this.prisma.outboxSync.count({ where: { enviadoEn: null } }) };
    const count = await this.prisma.transaccion.count({
      where: {
        sincronizacion: 'PENDIENTE',
        ...(sucursalId && { sucursalId }),
      },
    });
    return { pendientes: count };
  }

  async sincronizar(sucursalId?: string) {
    if (modo() === 'edge') return this.enviarANube();
    // Una venta que quedó "enviando" porque el servidor se cayó a mitad vuelve a la cola.
    await this.prisma.transaccion.updateMany({
      where: { sincronizacion: 'ENVIANDO', OR: [{ enviandoDesde: null }, { enviandoDesde: { lt: new Date(Date.now() - ENVIO_ATASCADO_MS) } }] },
      data: { sincronizacion: 'PENDIENTE', enviandoDesde: null },
    });
    const pendientes = await this.prisma.transaccion.findMany({
      where: {
        sincronizacion: 'PENDIENTE',
        ...(sucursalId && { sucursalId }),
      },
      include: { detalles: { include: { item: true } }, entidad: true },
      orderBy: { fechaRegistro: 'asc' },
    });

    if (pendientes.length === 0) return { sincronizados: 0, errores: 0, sinFolio: 0, detalle: [] };

    let sincronizados = 0;
    let errores = 0;
    let sinFolio = 0;
    const detalle: { folio: string; resultado: string }[] = [];

    for (const tx of pendientes) {
      // Reserva: si otra sincronización ya la tomó, count es 0 y no se envía dos veces.
      const { count } = await this.prisma.transaccion.updateMany({
        where: { id: tx.id, sincronizacion: 'PENDIENTE' },
        data: { sincronizacion: 'ENVIANDO', enviandoDesde: new Date() },
      });
      if (count !== 1) continue;
      try {
        await this.enviarSII(tx);
        const enviada = await this.prisma.transaccion.findUniqueOrThrow({ where: { id: tx.id }, include: { entidad: { select: { rut: true } } } });
        const empresa = await this.empresa.get();
        const sii = enviarAlSiiSimulado(dteDeVenta(enviada, enviada.entidad?.rut ?? empresa.rutConsumidorFinal));
        await this.prisma.transaccion.update({
          where: { id: tx.id },
          data: { sincronizacion: 'SINCRONIZADO', estadoDte: sii.estado, glosaSii: sii.glosa },
        });
        sincronizados++;
        detalle.push({ folio: tx.numeroFactura ?? tx.id, resultado: 'OK' });
        this.logger.log(`DTE folio ${tx.numeroFactura} sincronizado con SII`);
      } catch (err) {
        if (err instanceof SinFolioError) {
          await this.prisma.transaccion.update({
            where: { id: tx.id },
            data: { sincronizacion: 'PENDIENTE' },
          });
          sinFolio++;
          detalle.push({ folio: tx.id, resultado: 'PENDIENTE: sin folio disponible' });
          continue;
        }
        await this.prisma.transaccion.update({
          where: { id: tx.id },
          data: { sincronizacion: 'ERROR' },
        });
        errores++;
        detalle.push({ folio: tx.numeroFactura ?? tx.id, resultado: `ERROR: ${(err as Error).message}` });
        this.logger.warn(`Error sincronizando folio ${tx.numeroFactura}: ${(err as Error).message}`);
      }
    }

    return { sincronizados, errores, sinFolio, detalle };
  }

  async reintentarErrores(sucursalId?: string) {
    await this.prisma.transaccion.updateMany({
      where: {
        sincronizacion: 'ERROR',
        ...(sucursalId && { sucursalId }),
      },
      data: { sincronizacion: 'PENDIENTE' },
    });
    return this.sincronizar(sucursalId);
  }

  private async enviarSII(tx: any): Promise<void> {
    const meta = tx.metadatosSii as any;

    // Si ya tiene XML firmado, simulamos el envío al SII
    // Los DTE simulados anteriores a la marca esMock se reconocen por su raíz DTE_MOCK.
    const esMock = meta?.esMock || String(meta?.xmlFirmado ?? '').includes('<DTE_MOCK');
    if (meta?.xmlFirmado && !esMock) {
      // Aquí iría el envío real: POST al endpoint SII con el XML
      // Por ahora simulamos latencia de red
      await new Promise((r) => setTimeout(r, 50));
      this.logger.log(`[SIMULADO] XML enviado al SII: folio=${meta.folio} tipo=${meta.tipoDoc}`);
      return;
    }

    if (tx.tipoTransaccion !== 'VENTA' || !tx.detalles?.length) {
      throw new Error('Solo se envían al SII ventas con detalle');
    }

    // Una venta sin folio nunca se marca sincronizada: primero obtiene uno del pool.
    const tipoDoc = meta?.tipoDoc ?? 39;
    let folio = tx.numeroFactura ? parseInt(tx.numeroFactura, 10) : null;
    if (!folio) {
      folio = await this.prisma.$transaction((t) => reclamarFolio(t, tipoDoc, tx.id));
      if (!folio) throw new SinFolioError();
      await this.prisma.transaccion.update({ where: { id: tx.id }, data: { numeroFactura: String(folio) } });
    }

    const detalles = tx.detalles.map((d: any) => ({
      nombre: d.item?.nombre ?? 'Producto',
      cantidad: Number(d.cantidad),
      precio: Number(d.precioUnitario),
      subtotal: Number(d.subtotal),
    }));
    const empresa = await this.empresa.get();
    const dte = this.sii.emitirDTE({
      folio,
      tipoDoc,
      emisor: empresa,
      rutReceptor: tx.entidad?.rut ?? empresa.rutConsumidorFinal,
      razonSocialReceptor: tx.entidad?.nombreRazonSocial ?? empresa.nombreConsumidorFinal,
      direccionReceptor: tx.entidad?.direccion,
      fechaEmision: new Date(tx.fechaRegistro).toISOString().substring(0, 10),
      montoTotal: Number(tx.montoTotal),
      ...desglose(tx),
      primerItem: detalles[0]?.nombre ?? 'Producto',
      detalles,
    });

    await this.prisma.transaccion.update({
      where: { id: tx.id },
      data: { metadatosSii: dte as any },
    });
    if (dte.esMock) throw new Error('No se pudo firmar el DTE; revise certificado y CAF');

    await new Promise((r) => setTimeout(r, 50));
    this.logger.log(`[SIMULADO] DTE regenerado y enviado: folio=${dte.folio}`);
  }
}
