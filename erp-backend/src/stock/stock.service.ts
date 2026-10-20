import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { exigirSucursal, UsuarioSesion } from '../auth/sucursal-scope';
import { PrismaService } from '../prisma/prisma.service';
import { TX_OPCIONES } from '../utils/transacciones';
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

  /** Conteo físico: fija el valor bajo bloqueo de la fila y deja constancia del cambio. */
  async adjust(id: string, dto: AdjustStockDto, user: UsuarioSesion) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM stock_local WHERE id = ${id}::uuid FOR UPDATE`;
      const stock = await tx.stockLocal.findUnique({ where: { id } });
      if (!stock) throw new NotFoundException('Registro de stock no encontrado');
      exigirSucursal(user, stock.sucursalId);

      const { motivo, ...data } = dto;
      if (data.stockActual !== undefined && !stock.stockActual.eq(data.stockActual)) {
        await tx.ajusteStock.create({
          data: {
            stockLocalId: id,
            usuarioId: user.id,
            anterior: stock.stockActual,
            nuevo: data.stockActual,
            motivo,
          },
        });
      }
      return tx.stockLocal.update({ where: { id }, data });
    }, TX_OPCIONES);
  }
}
