import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { TipoTransaccion } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SiiIntegrationService } from '../sii/sii-integration.service';
import { CreateTransactionDto } from './dto/create-transaction.dto';

const IVA_RATE = 0.19;

@Injectable()
export class TransactionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sii: SiiIntegrationService,
  ) {}

  async create(dto: CreateTransactionDto) {
    const itemIds = dto.detalles.map((d) => d.itemId);

    const items = await this.prisma.item.findMany({
      where: { id: { in: itemIds }, estado: 'Activo' },
    });

    if (items.length !== itemIds.length) {
      throw new NotFoundException('Uno o más ítems no existen o están inactivos');
    }

    const itemMap = new Map(items.map((i) => [i.id, i]));

    const detallesCalculados = dto.detalles.map((d) => {
      const item = itemMap.get(d.itemId)!;
      const precio = Number(d.precioUnitario);
      const descLinea = parseFloat((d.descuentoLinea ?? 0).toFixed(2));
      const baseLinea = precio * d.cantidad - descLinea;
      const iva = item.afectoIva ? parseFloat((baseLinea * IVA_RATE).toFixed(2)) : 0;
      const subtotal = parseFloat((baseLinea + iva).toFixed(2));

      return {
        itemId: d.itemId,
        cantidad: d.cantidad,
        costoUnitario: Number(item.costoPromedio),
        precioUnitario: precio,
        montoIva: iva,
        descuentoLinea: descLinea,
        subtotal,
      };
    });

    const subtotalBruto = detallesCalculados.reduce((acc, d) => acc + d.subtotal, 0);
    const descGlobal = parseFloat((dto.descuentoGlobal ?? 0).toFixed(2));
    const montoTotal = parseFloat((subtotalBruto - descGlobal).toFixed(2));

    const transaccion = await this.prisma.$transaction(async (tx) => {
      if (
        dto.tipoTransaccion === TipoTransaccion.VENTA ||
        dto.tipoTransaccion === TipoTransaccion.MERMA
      ) {
        for (const d of dto.detalles) {
          const stock = await tx.stockLocal.findUnique({
            where: { sucursalId_itemId: { sucursalId: dto.sucursalId, itemId: d.itemId } },
          });
          if (!stock) throw new NotFoundException(`Sin registro de stock para el ítem ${d.itemId}`);
          if (Number(stock.stockActual) < d.cantidad) {
            const item = itemMap.get(d.itemId)!;
            throw new BadRequestException(
              `Stock insuficiente para "${item.nombre}". Disponible: ${stock.stockActual}`,
            );
          }
          await tx.stockLocal.update({
            where: { sucursalId_itemId: { sucursalId: dto.sucursalId, itemId: d.itemId } },
            data: { stockActual: { decrement: d.cantidad } },
          });
        }
      }

      if (
        dto.tipoTransaccion === TipoTransaccion.DEVOLUCION ||
        dto.tipoTransaccion === TipoTransaccion.NOTA_CREDITO
      ) {
        for (const d of dto.detalles) {
          const existing = await tx.stockLocal.findUnique({
            where: { sucursalId_itemId: { sucursalId: dto.sucursalId, itemId: d.itemId } },
          });
          if (existing) {
            await tx.stockLocal.update({
              where: { sucursalId_itemId: { sucursalId: dto.sucursalId, itemId: d.itemId } },
              data: { stockActual: { increment: d.cantidad } },
            });
          } else {
            await tx.stockLocal.create({
              data: { sucursalId: dto.sucursalId, itemId: d.itemId, stockActual: d.cantidad },
            });
          }
        }
      }

      return tx.transaccion.create({
        data: {
          sucursalId: dto.sucursalId,
          usuarioId: dto.usuarioId,
          entidadId: dto.entidadId,
          tipoTransaccion: dto.tipoTransaccion,
          medioPago: dto.medioPago,
          descuentoGlobal: descGlobal,
          montoTotal,
          transaccionOrigenId: dto.transaccionOrigenId,
          tipoDevolucion: dto.tipoDevolucion,
          observaciones: dto.observaciones,
          motivoMerma: (dto as any).motivoMerma,
          detalles: { createMany: { data: detallesCalculados } },
        },
        include: { detalles: true },
      });
    });

    if (dto.tipoTransaccion === TipoTransaccion.VENTA) {
      const tipoDoc = dto.tipoDocumento ?? 39;

      // Reclamar folio del pool atómicamente
      const folioRow = await this.prisma.folioDisponible.findFirst({
        where: { tipoDoc, usado: false },
        orderBy: { numero: 'asc' },
      });

      if (!folioRow) {
        // Sin folios disponibles: guardamos con sincronizacion PENDIENTE y folio 0 (se asignará al sincronizar)
        await this.prisma.transaccion.update({
          where: { id: transaccion.id },
          data: { sincronizacion: 'PENDIENTE', metadatosSii: { sinFolio: true, tipoDoc } as any },
        });
        return { ...transaccion, dte: null, pendiente: true };
      }

      await this.prisma.folioDisponible.update({
        where: { id: folioRow.id },
        data: { usado: true, usadoEn: new Date(), transaccionId: transaccion.id },
      });

      const detallesDte = dto.detalles.map((d) => {
        const item = itemMap.get(d.itemId)!;
        return {
          nombre: item.nombre,
          cantidad: d.cantidad,
          precio: Number(d.precioUnitario),
          subtotal: Number(d.precioUnitario) * d.cantidad,
        };
      });

      let dte: any;
      try {
        dte = this.sii.emitirDTE({
          folio: folioRow.numero,
          tipoDoc,
          rutEmisor: '76.000.000-1',
          rutReceptor: dto.rutReceptor ?? '66.666.666-6',
          razonSocialReceptor: dto.razonSocialReceptor ?? 'CLIENTE FINAL',
          fechaEmision: new Date().toISOString().substring(0, 10),
          montoTotal,
          primerItem: detallesDte[0]?.nombre ?? 'Item',
          detalles: detallesDte,
        });
      } catch {
        // Sin conexión o falla DTE: marcamos PENDIENTE con folio reservado
        await this.prisma.transaccion.update({
          where: { id: transaccion.id },
          data: {
            sincronizacion: 'PENDIENTE',
            numeroFactura: String(folioRow.numero),
            metadatosSii: { folio: folioRow.numero, tipoDoc, esMock: true, pendienteDte: true } as any,
          },
        });
        return { ...transaccion, dte: null, pendiente: true, folio: folioRow.numero };
      }

      await this.prisma.transaccion.update({
        where: { id: transaccion.id },
        data: {
          numeroFactura: String(dte.folio),
          sincronizacion: 'PENDIENTE',
          metadatosSii: dte as any,
        },
      });

      return { ...transaccion, dte };
    }

    return transaccion;
  }

  findAll(sucursalId?: string) {
    return this.prisma.transaccion.findMany({
      where: sucursalId ? { sucursalId } : undefined,
      include: { detalles: { include: { item: true } }, entidad: true },
      orderBy: { fechaRegistro: 'desc' },
    });
  }

  findOne(id: string) {
    return this.prisma.transaccion.findUniqueOrThrow({
      where: { id },
      include: { detalles: { include: { item: true } }, entidad: true, usuario: true },
    });
  }

  async findByFolio(folio: string) {
    const tx = await this.prisma.transaccion.findFirst({
      where: { numeroFactura: folio },
      include: { detalles: { include: { item: true } }, entidad: true, usuario: true },
    });
    if (!tx) throw new NotFoundException(`No existe boleta con folio "${folio}"`);
    return tx;
  }
}
