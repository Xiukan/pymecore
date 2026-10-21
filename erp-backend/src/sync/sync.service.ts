import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EmpresaService } from '../empresa/empresa.service';
import { SiiIntegrationService } from '../sii/sii-integration.service';
import { desglose } from '../transactions/transactions.service';
import { reclamarFolio } from '../utils/folios.util';

class SinFolioError extends Error {}

const ENVIO_ATASCADO_MS = 10 * 60_000;

@Injectable()
export class SyncService {
  private readonly logger = new Logger(SyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sii: SiiIntegrationService,
    private readonly empresa: EmpresaService,
  ) {}

  async getPendientes(sucursalId?: string) {
    const count = await this.prisma.transaccion.count({
      where: {
        sincronizacion: 'PENDIENTE',
        ...(sucursalId && { sucursalId }),
      },
    });
    return { pendientes: count };
  }

  async sincronizar(sucursalId?: string) {
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
        await this.prisma.transaccion.update({
          where: { id: tx.id },
          data: { sincronizacion: 'SINCRONIZADO' },
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
