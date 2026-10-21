import { BadRequestException, ConflictException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { exigirSucursal, UsuarioSesion } from '../auth/sucursal-scope';
import { CUENTA, debe, fechaLocal, haber } from '../contabilidad/asientos';
import { ContabilidadService } from '../contabilidad/contabilidad.service';
import { PrismaService } from '../prisma/prisma.service';
import { peso, ZERO } from '../utils/money.util';
import { exigirPeriodoAbierto } from '../utils/periodos';
import { TX_OPCIONES } from '../utils/transacciones';
import { compararConteo, sugerirCompra } from './conteo';
import { AdjustStockDto, ConteoDto, CreateStockDto } from './dto/adjust-stock.dto';

const D = Prisma.Decimal;

@Injectable()
export class StockService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly contabilidad: ContabilidadService,
  ) {}

  onModuleInit() {
    // Faltante de inventario es merma; sobrante, otro ingreso. Valorizado a costo promedio.
    this.contabilidad.registrarFuente(async (tx, r) => {
      const ajustes = await tx.ajusteStock.findMany({ where: { creadoEn: r.local, costoUnitario: { gt: 0 } } });
      return ajustes.map((a) => {
        const valor = peso(a.nuevo.sub(a.anterior).mul(a.costoUnitario));
        return {
          fecha: fechaLocal(a.creadoEn),
          glosa: `Ajuste de inventario${a.motivo ? `: ${a.motivo}` : ''}`,
          origenTipo: 'AJUSTE_STOCK',
          origenId: a.id,
          lineas: valor.isNeg() ? [debe(CUENTA.MERMAS, valor.abs()), haber(CUENTA.MERCADERIAS, valor.abs())] : [debe(CUENTA.MERCADERIAS, valor), haber(CUENTA.OTROS_INGRESOS, valor)],
        };
      });
    });
  }

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
            costoUnitario: (await tx.item.findUniqueOrThrow({ where: { id: stock.itemId }, select: { costoPromedio: true } })).costoPromedio,
          },
        });
      }
      return tx.stockLocal.update({ where: { id }, data });
    }, TX_OPCIONES);
  }

  private async filasConteo(db: Prisma.TransactionClient | PrismaService, dto: ConteoDto) {
    if (new Set(dto.lineas.map((l) => l.itemId)).size !== dto.lineas.length) throw new BadRequestException('El conteo repite un producto.');
    const items = await db.item.findMany({ where: { id: { in: dto.lineas.map((l) => l.itemId) } }, select: { id: true, nombre: true, costoPromedio: true } });
    if (items.length !== dto.lineas.length) throw new BadRequestException('Algún producto contado no existe.');
    const stock = await db.stockLocal.findMany({ where: { sucursalId: dto.sucursalId, itemId: { in: items.map((i) => i.id) } } });
    return dto.lineas.map((l) => {
      const item = items.find((i) => i.id === l.itemId)!;
      return { itemId: l.itemId, nombre: item.nombre, sistema: stock.find((s) => s.itemId === l.itemId)?.stockActual ?? ZERO, contado: new D(l.contado), costo: item.costoPromedio };
    });
  }

  /** Vista previa del conteo físico: qué productos no cuadran y cuánto vale la diferencia. */
  async previaConteo(dto: ConteoDto, user: UsuarioSesion) {
    exigirSucursal(user, dto.sucursalId);
    return compararConteo(await this.filasConteo(this.prisma, dto));
  }

  /** Aplica el conteo: el stock queda igual a lo contado y cada diferencia queda como ajuste. */
  async aplicarConteo(dto: ConteoDto, user: UsuarioSesion) {
    exigirSucursal(user, dto.sucursalId);
    const motivo = `Conteo físico${dto.observaciones ? `: ${dto.observaciones.trim()}` : ''}`;
    return this.prisma.$transaction(async (tx) => {
      await exigirPeriodoAbierto(tx, new Date());
      await tx.$queryRaw`SELECT id FROM stock_local WHERE sucursal_id = ${dto.sucursalId}::uuid AND item_id = ANY(${dto.lineas.map((l) => l.itemId)}::uuid[]) FOR UPDATE`;
      const resultado = compararConteo(await this.filasConteo(tx, dto));
      for (const d of resultado.diferencias) {
        const fila = await tx.stockLocal.upsert({
          where: { sucursalId_itemId: { sucursalId: dto.sucursalId, itemId: d.itemId } },
          update: { stockActual: d.contado },
          create: { sucursalId: dto.sucursalId, itemId: d.itemId, stockActual: d.contado },
        });
        await tx.ajusteStock.create({ data: { stockLocalId: fila.id, usuarioId: user.id, anterior: d.sistema, nuevo: d.contado, motivo, costoUnitario: d.costo } });
      }
      return resultado;
    }, TX_OPCIONES);
  }

  /** Sugerencia de compra por producto según la venta de los últimos 30 días. */
  async sugerenciaCompra(sucursalId: string, diasObjetivo: number) {
    if (!Number.isInteger(diasObjetivo) || diasObjetivo < 1 || diasObjetivo > 180) throw new BadRequestException('Días entre 1 y 180.');
    const desde = new Date(Date.now() - 30 * 86_400_000);
    const [stock, vendido, porRecibir] = await Promise.all([
      this.prisma.stockLocal.findMany({ where: { sucursalId, item: { estado: 'Activo' } }, include: { item: { select: { nombre: true, unidadMedida: true, costoPromedio: true } } } }),
      this.prisma.$queryRaw<{ itemId: string; cantidad: Prisma.Decimal }[]>`
        SELECT d.item_id AS "itemId", SUM(d.cantidad) AS cantidad FROM transacciones_detalle d JOIN transacciones t ON t.id = d.transaccion_id
        WHERE t.sucursal_id = ${sucursalId}::uuid AND t.tipo_transaccion = 'VENTA' AND t.estado = 'Activa' AND t.fecha_registro >= ${desde}
        GROUP BY d.item_id`,
      this.prisma.$queryRaw<{ itemId: string; cantidad: Prisma.Decimal }[]>`
        SELECT od.item_id AS "itemId", SUM(od.cantidad) - COALESCE(SUM(r.recibido), 0) AS cantidad
        FROM ordenes_compra_detalle od JOIN ordenes_compra o ON o.id = od.orden_id
        LEFT JOIN (SELECT rd.detalle_orden_id, SUM(rd.cantidad) AS recibido FROM recepciones_compra_detalle rd
                   JOIN recepciones_compra rc ON rc.id = rd.recepcion_id WHERE rc.estado = 'VIGENTE' GROUP BY rd.detalle_orden_id) r ON r.detalle_orden_id = od.id
        WHERE o.sucursal_id = ${sucursalId}::uuid AND o.estado = 'ABIERTA'
        GROUP BY od.item_id`,
    ]);
    const de = (lista: { itemId: string; cantidad: Prisma.Decimal }[], id: string) => new D(lista.find((x) => x.itemId === id)?.cantidad ?? 0);
    return stock
      .map((s) => {
        const r = sugerirCompra({ vendido30: de(vendido, s.itemId), stock: s.stockActual, minimo: s.stockMinimo, porRecibir: D.max(de(porRecibir, s.itemId), 0), diasObjetivo });
        return { itemId: s.itemId, nombre: s.item.nombre, unidad: s.item.unidadMedida, stock: s.stockActual, minimo: s.stockMinimo, vendido30: de(vendido, s.itemId), porRecibir: D.max(de(porRecibir, s.itemId), 0), ...r, costoEstimado: peso(r.sugerido.mul(s.item.costoPromedio)) };
      })
      .filter((x) => x.sugerido.gt(0))
      .sort((a, b) => (a.diasCobertura === null ? 1 : b.diasCobertura === null ? -1 : a.diasCobertura.comparedTo(b.diasCobertura)));
  }
}
