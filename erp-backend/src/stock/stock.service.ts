import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AdjustStockDto, CreateStockDto } from './dto/adjust-stock.dto';

@Injectable()
export class StockService {
  constructor(private readonly prisma: PrismaService) {}

  findBySucursal(sucursalId: string) {
    return this.prisma.stockLocal.findMany({
      where: { sucursalId },
      include: { item: { select: { id: true, nombre: true, codigoSku: true, unidadMedida: true } } },
      orderBy: { item: { nombre: 'asc' } },
    });
  }

  findAll() {
    return this.prisma.stockLocal.findMany({
      include: {
        item: { select: { id: true, nombre: true, codigoSku: true, unidadMedida: true } },
        sucursal: { select: { id: true, nombre: true } },
      },
      orderBy: [{ sucursal: { nombre: 'asc' } }, { item: { nombre: 'asc' } }],
    });
  }

  async alertasBajoStock(sucursalId?: string) {
    const stock = await this.prisma.stockLocal.findMany({
      where: sucursalId ? { sucursalId } : undefined,
      include: { item: true, sucursal: { select: { nombre: true } } },
    });
    return stock.filter((s) => Number(s.stockActual) <= Number(s.stockMinimo));
  }

  async create(dto: CreateStockDto) {
    const exists = await this.prisma.stockLocal.findUnique({
      where: { sucursalId_itemId: { sucursalId: dto.sucursalId, itemId: dto.itemId } },
    });
    if (exists) throw new ConflictException('Ya existe stock para este ítem en esta sucursal');

    return this.prisma.stockLocal.create({ data: dto });
  }

  async adjust(id: string, dto: AdjustStockDto) {
    const stock = await this.prisma.stockLocal.findUnique({ where: { id } });
    if (!stock) throw new NotFoundException('Registro de stock no encontrado');

    return this.prisma.stockLocal.update({ where: { id }, data: dto });
  }
}
