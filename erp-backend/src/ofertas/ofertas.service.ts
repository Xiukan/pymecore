import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOfertaDto, UpdateOfertaDto } from './dto/oferta.dto';

@Injectable()
export class OfertasService {
  constructor(private readonly prisma: PrismaService) {}

  create(dto: CreateOfertaDto) {
    return this.prisma.oferta.create({
      data: {
        itemId: dto.itemId,
        precioOferta: dto.precioOferta,
        descripcion: dto.descripcion,
        fechaInicio: new Date(dto.fechaInicio),
        fechaFin: new Date(dto.fechaFin),
      },
      include: { item: { select: { nombre: true, codigoSku: true, precioVenta: true } } },
    });
  }

  findAll(soloActivas = false) {
    const now = new Date();
    return this.prisma.oferta.findMany({
      where: soloActivas ? { activo: true, fechaInicio: { lte: now }, fechaFin: { gte: now } } : undefined,
      include: { item: { select: { id: true, nombre: true, codigoSku: true, precioVenta: true } } },
      orderBy: { fechaFin: 'asc' },
    });
  }

  async findVigente(itemId: string) {
    const now = new Date();
    return this.prisma.oferta.findFirst({
      where: { itemId, activo: true, fechaInicio: { lte: now }, fechaFin: { gte: now } },
      orderBy: { precioOferta: 'asc' },
    });
  }

  async update(id: string, dto: UpdateOfertaDto) {
    const oferta = await this.prisma.oferta.findUnique({ where: { id } });
    if (!oferta) throw new NotFoundException('Oferta no encontrada');
    return this.prisma.oferta.update({
      where: { id },
      data: {
        ...dto,
        ...(dto.fechaInicio && { fechaInicio: new Date(dto.fechaInicio) }),
        ...(dto.fechaFin && { fechaFin: new Date(dto.fechaFin) }),
      },
      include: { item: { select: { nombre: true, codigoSku: true } } },
    });
  }

  async remove(id: string) {
    const oferta = await this.prisma.oferta.findUnique({ where: { id } });
    if (!oferta) throw new NotFoundException('Oferta no encontrada');
    return this.prisma.oferta.delete({ where: { id } });
  }
}
