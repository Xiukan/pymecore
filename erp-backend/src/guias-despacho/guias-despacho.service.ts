import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateGuiaDto } from './dto/guia.dto';

const INCLUDE_FULL = {
  sucursalOrigen: { select: { nombre: true } },
  sucursalDestino: { select: { nombre: true } },
  usuario: { select: { nombreCompleto: true } },
  detalles: { include: { item: { select: { nombre: true, codigoSku: true, unidadMedida: true } } } },
};

@Injectable()
export class GuiasDespachoService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateGuiaDto, usuarioId: string) {
    if (dto.sucursalOrigenId === dto.sucursalDestinoId) {
      throw new BadRequestException('El origen y destino no pueden ser la misma sucursal');
    }

    const lastGuia = await this.prisma.guiaDespacho.findFirst({
      orderBy: { folio: 'desc' },
    });
    const folio = (lastGuia?.folio ?? 0) + 1;

    return this.prisma.$transaction(async (tx) => {
      for (const d of dto.detalles) {
        const stock = await tx.stockLocal.findUnique({
          where: { sucursalId_itemId: { sucursalId: dto.sucursalOrigenId, itemId: d.itemId } },
        });
        if (!stock || Number(stock.stockActual) < d.cantidad) {
          const item = await tx.item.findUnique({ where: { id: d.itemId } });
          throw new BadRequestException(
            `Stock insuficiente para "${item?.nombre ?? d.itemId}"`,
          );
        }
        await tx.stockLocal.update({
          where: { sucursalId_itemId: { sucursalId: dto.sucursalOrigenId, itemId: d.itemId } },
          data: { stockActual: { decrement: d.cantidad } },
        });
      }

      return tx.guiaDespacho.create({
        data: {
          folio,
          sucursalOrigenId: dto.sucursalOrigenId,
          sucursalDestinoId: dto.sucursalDestinoId,
          usuarioId,
          notas: dto.notas,
          detalles: { createMany: { data: dto.detalles } },
        },
        include: INCLUDE_FULL,
      });
    });
  }

  findAll(sucursalId?: string) {
    return this.prisma.guiaDespacho.findMany({
      where: sucursalId
        ? { OR: [{ sucursalOrigenId: sucursalId }, { sucursalDestinoId: sucursalId }] }
        : undefined,
      include: INCLUDE_FULL,
      orderBy: { fechaEmision: 'desc' },
    });
  }

  async findOne(id: string) {
    const guia = await this.prisma.guiaDespacho.findUnique({ where: { id }, include: INCLUDE_FULL });
    if (!guia) throw new NotFoundException('Guía no encontrada');
    return guia;
  }

  async recibir(id: string) {
    const guia = await this.findOne(id);
    if (guia.estado !== 'PENDIENTE' && guia.estado !== 'EN_TRANSITO') {
      throw new BadRequestException('La guía ya fue recibida o anulada');
    }

    return this.prisma.$transaction(async (tx) => {
      for (const d of guia.detalles) {
        const existing = await tx.stockLocal.findUnique({
          where: { sucursalId_itemId: { sucursalId: guia.sucursalDestinoId, itemId: d.itemId } },
        });
        if (existing) {
          await tx.stockLocal.update({
            where: { sucursalId_itemId: { sucursalId: guia.sucursalDestinoId, itemId: d.itemId } },
            data: { stockActual: { increment: Number(d.cantidad) } },
          });
        } else {
          await tx.stockLocal.create({
            data: { sucursalId: guia.sucursalDestinoId, itemId: d.itemId, stockActual: Number(d.cantidad) },
          });
        }
      }
      return tx.guiaDespacho.update({
        where: { id },
        data: { estado: 'RECIBIDO', fechaRecepcion: new Date() },
        include: INCLUDE_FULL,
      });
    });
  }

  async anular(id: string) {
    const guia = await this.findOne(id);
    if (guia.estado === 'RECIBIDO' || guia.estado === 'ANULADO') {
      throw new BadRequestException('No se puede anular una guía recibida o ya anulada');
    }

    return this.prisma.$transaction(async (tx) => {
      for (const d of guia.detalles) {
        await tx.stockLocal.update({
          where: { sucursalId_itemId: { sucursalId: guia.sucursalOrigenId, itemId: d.itemId } },
          data: { stockActual: { increment: Number(d.cantidad) } },
        });
      }
      return tx.guiaDespacho.update({
        where: { id },
        data: { estado: 'ANULADO' },
        include: INCLUDE_FULL,
      });
    });
  }
}
