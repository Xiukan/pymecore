import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
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

    if (new Set(dto.detalles.map((d) => d.itemId)).size !== dto.detalles.length) {
      throw new BadRequestException('La guía repite un ítem; agrupe las cantidades en una sola línea.');
    }

    return this.prisma.$transaction(async (tx) => {
      for (const d of dto.detalles) {
        const { count } = await tx.stockLocal.updateMany({
          where: { sucursalId: dto.sucursalOrigenId, itemId: d.itemId, stockActual: { gte: d.cantidad } },
          data: { stockActual: { decrement: d.cantidad } },
        });
        if (count !== 1) {
          const item = await tx.item.findUnique({ where: { id: d.itemId } });
          throw new BadRequestException(
            `Stock insuficiente para "${item?.nombre ?? d.itemId}"`,
          );
        }
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
    return this.prisma.$transaction(async (tx) => {
      // El cambio de estado condicionado es el candado: solo una petición concurrente lo logra.
      const { count } = await tx.guiaDespacho.updateMany({
        where: { id, estado: { in: ['PENDIENTE', 'EN_TRANSITO'] } },
        data: { estado: 'RECIBIDO', fechaRecepcion: new Date() },
      });
      if (count !== 1) await this.rechazarTransicion(tx, id, 'La guía ya fue recibida o anulada');

      const guia = await tx.guiaDespacho.findUniqueOrThrow({ where: { id }, include: { detalles: true } });
      for (const d of guia.detalles) {
        await tx.stockLocal.upsert({
          where: { sucursalId_itemId: { sucursalId: guia.sucursalDestinoId, itemId: d.itemId } },
          update: { stockActual: { increment: d.cantidad } },
          create: { sucursalId: guia.sucursalDestinoId, itemId: d.itemId, stockActual: d.cantidad },
        });
      }
      return tx.guiaDespacho.findUniqueOrThrow({ where: { id }, include: INCLUDE_FULL });
    });
  }

  async anular(id: string) {
    return this.prisma.$transaction(async (tx) => {
      const { count } = await tx.guiaDespacho.updateMany({
        where: { id, estado: { in: ['PENDIENTE', 'EN_TRANSITO'] } },
        data: { estado: 'ANULADO' },
      });
      if (count !== 1) {
        await this.rechazarTransicion(tx, id, 'No se puede anular una guía recibida o ya anulada');
      }

      const guia = await tx.guiaDespacho.findUniqueOrThrow({ where: { id }, include: { detalles: true } });
      for (const d of guia.detalles) {
        await tx.stockLocal.upsert({
          where: { sucursalId_itemId: { sucursalId: guia.sucursalOrigenId, itemId: d.itemId } },
          update: { stockActual: { increment: d.cantidad } },
          create: { sucursalId: guia.sucursalOrigenId, itemId: d.itemId, stockActual: d.cantidad },
        });
      }
      return tx.guiaDespacho.findUniqueOrThrow({ where: { id }, include: INCLUDE_FULL });
    });
  }

  private async rechazarTransicion(tx: Prisma.TransactionClient, id: string, mensaje: string): Promise<never> {
    const existe = await tx.guiaDespacho.findUnique({ where: { id }, select: { id: true } });
    if (!existe) throw new NotFoundException('Guía no encontrada');
    throw new BadRequestException(mensaje);
  }
}
