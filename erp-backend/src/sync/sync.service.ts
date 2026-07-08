import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SiiIntegrationService } from '../sii/sii-integration.service';

@Injectable()
export class SyncService {
  private readonly logger = new Logger(SyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sii: SiiIntegrationService,
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
    const pendientes = await this.prisma.transaccion.findMany({
      where: {
        sincronizacion: 'PENDIENTE',
        ...(sucursalId && { sucursalId }),
      },
      include: { detalles: { include: { item: true } }, entidad: true },
      orderBy: { fechaRegistro: 'asc' },
    });

    if (pendientes.length === 0) return { sincronizados: 0, errores: 0, detalle: [] };

    let sincronizados = 0;
    let errores = 0;
    const detalle: { folio: string; resultado: string }[] = [];

    for (const tx of pendientes) {
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
        await this.prisma.transaccion.update({
          where: { id: tx.id },
          data: { sincronizacion: 'ERROR' },
        });
        errores++;
        detalle.push({ folio: tx.numeroFactura ?? tx.id, resultado: `ERROR: ${(err as Error).message}` });
        this.logger.warn(`Error sincronizando folio ${tx.numeroFactura}: ${(err as Error).message}`);
      }
    }

    return { sincronizados, errores, detalle };
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
    if (meta?.xmlFirmado && !meta?.esMock) {
      // Aquí iría el envío real: POST al endpoint SII con el XML
      // Por ahora simulamos latencia de red
      await new Promise((r) => setTimeout(r, 50));
      this.logger.log(`[SIMULADO] XML enviado al SII: folio=${meta.folio} tipo=${meta.tipoDoc}`);
      return;
    }

    // Si es mock o no tiene XML, regeneramos el DTE antes de enviar
    if (tx.tipoTransaccion === 'VENTA' && tx.detalles?.length > 0) {
      const detalles = tx.detalles.map((d: any) => ({
        nombre: d.item?.nombre ?? 'Producto',
        cantidad: Number(d.cantidad),
        precio: Number(d.precioUnitario),
        subtotal: Number(d.subtotal),
      }));

      const dte = this.sii.emitirDTE({
        folio: meta?.folio ?? parseInt(tx.numeroFactura ?? '0'),
        tipoDoc: meta?.tipoDoc ?? 39,
        rutEmisor: '76.000.000-1',
        rutReceptor: tx.entidad?.rut ?? '66.666.666-6',
        razonSocialReceptor: tx.entidad?.nombreRazonSocial ?? 'CLIENTE FINAL',
        fechaEmision: new Date(tx.fechaRegistro).toISOString().substring(0, 10),
        montoTotal: Number(tx.montoTotal),
        primerItem: detalles[0]?.nombre ?? 'Producto',
        detalles,
      });

      await this.prisma.transaccion.update({
        where: { id: tx.id },
        data: { metadatosSii: dte as any },
      });

      await new Promise((r) => setTimeout(r, 50));
      this.logger.log(`[SIMULADO] DTE regenerado y enviado: folio=${dte.folio}`);
    }
  }
}
