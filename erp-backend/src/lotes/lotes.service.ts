import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { exigirSucursal, sucursalDe, UsuarioSesion } from '../auth/sucursal-scope';
import { PrismaService } from '../prisma/prisma.service';
import { ZERO } from '../utils/money.util';
import { EmpresaService } from '../empresa/empresa.service';
import { BajaLoteDto, RegistrarLoteDto } from './dto/lotes.dto';
import { resumenMermas, vendidaEnAlerta } from './mermas';
import { exigirPeriodoAbierto } from '../utils/periodos';
import { peso } from '../utils/money.util';
import { repartirFefo } from './fefo';
import { estadoVencimiento } from './vencimiento';

type Tx = Prisma.TransactionClient;
const D = Prisma.Decimal;

@Injectable()
export class LotesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly empresa: EmpresaService,
  ) {}

  private hoy() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  /**
   * Estado de vencimiento del inventario con existencias: un registro por lote con saldo y,
   * si parte del stock no tiene lote con fecha, un registro "Sin dato" por esa parte.
   */
  async alertasInventario(user: UsuarioSesion, sucursalId?: string) {
    const sucursal = sucursalDe(user, sucursalId);
    const { diasAlertaVencimiento } = await this.empresa.get();
    const [stock, lotes] = await Promise.all([
      this.prisma.stockLocal.findMany({
        where: { stockActual: { gt: 0 }, item: { estado: 'Activo' }, ...(sucursal && { sucursalId: sucursal }) },
        include: { item: { select: { nombre: true, unidadMedida: true, diasAlertaVencimiento: true } }, sucursal: { select: { nombre: true } } },
      }),
      this.prisma.lote.findMany({ where: { cantidadActual: { gt: 0 }, ...(sucursal && { sucursalId: sucursal }) } }),
    ]);
    const hoy = this.hoy();
    const filas = stock.flatMap((s) => {
      const propios = lotes.filter((l) => l.itemId === s.itemId && l.sucursalId === s.sucursalId);
      const conFecha = propios.filter((l) => l.fechaVencimiento);
      const cubierto = conFecha.reduce((t, l) => t.add(l.cantidadActual), new D(0));
      // Umbral del producto si lo tiene (PBI-07); si no, el de la empresa.
      const umbral = s.item.diasAlertaVencimiento ?? diasAlertaVencimiento;
      const base = { productoId: s.itemId, nombre: s.item.nombre, unidad: s.item.unidadMedida, sucursal: s.sucursal.nombre, umbralDias: umbral };
      const porLote = conFecha.map((l) => ({ ...base, loteId: l.id, lote: l.codigo, cantidad: l.cantidadActual, fechaVencimiento: l.fechaVencimiento, ...this.estado(l.fechaVencimiento, hoy, umbral) }));
      const sinFecha = D.max(s.stockActual.sub(cubierto), 0);
      return sinFecha.gt(0)
        ? [...porLote, { ...base, loteId: null, lote: null, cantidad: sinFecha, fechaVencimiento: null, ...this.estado(null, hoy, umbral) }]
        : porLote;
    });
    const orden = { VENCIDO: 0, PROXIMO_A_VENCER: 1, OK: 2, SIN_DATO: 3 };
    return filas.sort((a, b) => orden[a.estadoVencimiento] - orden[b.estadoVencimiento] || (a.diasRestantes ?? 0) - (b.diasRestantes ?? 0));
  }

  private estado(fecha: Date | null, hoy: string, umbral: number) {
    const r = estadoVencimiento(fecha, hoy, umbral);
    return { estadoVencimiento: r.estado, diasRestantes: r.diasRestantes };
  }

  /**
   * Da de baja un lote (PBI-06): descuenta del lote y del stock, registra la merma valorizada a
   * costo promedio (con su asiento contable) y deja el movimiento en la trazabilidad del lote.
   */
  async darDeBaja(loteId: string, dto: BajaLoteDto, user: UsuarioSesion) {
    return this.prisma.$transaction(async (tx) => {
      await exigirPeriodoAbierto(tx, new Date());
      await tx.$queryRaw`SELECT id FROM lotes WHERE id = ${loteId}::uuid FOR UPDATE`;
      const lote = await tx.lote.findUnique({ where: { id: loteId }, include: { item: true } });
      if (!lote) throw new NotFoundException('Lote no encontrado');
      exigirSucursal(user, lote.sucursalId);
      if (lote.cantidadActual.lte(0)) throw new BadRequestException('Este lote ya no tiene saldo: se vendió o ya se dio de baja.');
      const cantidad = dto.cantidad !== undefined ? new D(dto.cantidad) : lote.cantidadActual;
      if (cantidad.gt(lote.cantidadActual)) throw new BadRequestException(`Al lote solo le quedan ${lote.cantidadActual} ${lote.item.unidadMedida.toLowerCase()}.`);
      if (dto.motivo === 'VENCIDO' && (!lote.fechaVencimiento || lote.fechaVencimiento.toISOString().slice(0, 10) >= this.hoy())) {
        throw new BadRequestException('El lote aún no vence: usa el motivo "dañado" si hay que retirarlo antes.');
      }
      const stock = await tx.stockLocal.updateMany({
        where: { sucursalId: lote.sucursalId, itemId: lote.itemId, stockActual: { gte: cantidad } },
        data: { stockActual: { decrement: cantidad } },
      });
      if (stock.count !== 1) throw new BadRequestException('El stock del producto es menor que el saldo del lote; ajusta el inventario primero.');
      await tx.lote.update({ where: { id: lote.id }, data: { cantidadActual: { decrement: cantidad } } });
      const costo = lote.item.costoPromedio;
      const valor = peso(cantidad.mul(costo));
      const merma = await tx.transaccion.create({
        data: {
          sucursalId: lote.sucursalId,
          usuarioId: user.id,
          tipoTransaccion: 'MERMA',
          montoTotal: valor,
          motivoMerma: `${dto.motivo === 'VENCIDO' ? 'Vencido' : 'Dañado'}: lote ${lote.codigo}${dto.observacion ? ` (${dto.observacion.trim()})` : ''}`,
          detalles: { create: { itemId: lote.itemId, cantidad, costoUnitario: costo, precioUnitario: costo, subtotal: valor } },
        },
      });
      await tx.movimientoLote.create({ data: { loteId: lote.id, tipo: dto.motivo === 'VENCIDO' ? 'BAJA_VENCIDO' : 'BAJA_DANADO', cantidad: cantidad.neg(), transaccionId: merma.id } });
      return { loteId: lote.id, codigo: lote.codigo, cantidad, valor, mermaId: merma.id, saldo: lote.cantidadActual.sub(cantidad) };
    });
  }

  /** Perdido por vencimiento frente a lo salvado gracias a la alerta (señal de H-01). */
  async reporteMermas(user: UsuarioSesion, desde: string, hasta: string, sucursalId?: string) {
    const sucursal = sucursalDe(user, sucursalId);
    const { diasAlertaVencimiento } = await this.empresa.get();
    const rango = { gte: new Date(`${desde}T00:00:00`), lt: new Date(new Date(`${hasta}T00:00:00`).getTime() + 86_400_000) };
    const movs = await this.prisma.movimientoLote.findMany({
      where: { fecha: rango, tipo: { in: ['BAJA_VENCIDO', 'BAJA_DANADO', 'VENTA'] }, lote: sucursal ? { sucursalId: sucursal } : undefined },
      include: { lote: { include: { item: { select: { nombre: true, diasAlertaVencimiento: true } } } } },
    });
    const detalles = await this.prisma.transaccionDetalle.findMany({
      where: { transaccionId: { in: movs.map((m) => m.transaccionId).filter((x): x is string => !!x) } },
      select: { transaccionId: true, itemId: true, costoUnitario: true },
    });
    const costo = (m: (typeof movs)[number]) => Number(detalles.find((d) => d.transaccionId === m.transaccionId && d.itemId === m.lote.itemId)?.costoUnitario ?? 0);
    const dia = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const valorizar = (m: (typeof movs)[number]) => {
      const cantidad = Math.abs(Number(m.cantidad));
      return { fecha: dia(m.fecha), itemId: m.lote.itemId, nombre: m.lote.item.nombre, cantidad, valor: cantidad * costo(m) };
    };
    const bajas = movs.filter((m) => m.tipo.startsWith('BAJA_')).map(valorizar);
    const salvadas = movs
      .filter((m) => m.tipo === 'VENTA' && m.lote.fechaVencimiento && vendidaEnAlerta(dia(m.fecha), m.lote.fechaVencimiento.toISOString().slice(0, 10), m.lote.item.diasAlertaVencimiento ?? diasAlertaVencimiento))
      .map(valorizar);
    return { desde, hasta, ...resumenMermas(bajas, salvadas) };
  }

  /** Registra la fecha de vencimiento de stock que ya está en bodega (sin lote con fecha). */
  async registrar(dto: RegistrarLoteDto, user: UsuarioSesion) {
    exigirSucursal(user, dto.sucursalId);
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM stock_local WHERE sucursal_id = ${dto.sucursalId}::uuid AND item_id = ${dto.itemId}::uuid FOR UPDATE`;
      const stock = await tx.stockLocal.findUnique({ where: { sucursalId_itemId: { sucursalId: dto.sucursalId, itemId: dto.itemId } } });
      if (!stock) throw new BadRequestException('Ese producto no tiene stock en el local.');
      const { _sum } = await tx.lote.aggregate({ where: { itemId: dto.itemId, sucursalId: dto.sucursalId }, _sum: { cantidadActual: true } });
      const libre = stock.stockActual.sub(_sum.cantidadActual ?? 0);
      if (new D(dto.cantidad).gt(libre)) throw new BadRequestException(`Solo hay ${libre} sin lote registrado para este producto.`);
      const n = await tx.lote.count({ where: { sucursalId: dto.sucursalId } });
      return tx.lote.create({
        data: {
          codigo: dto.codigo?.trim() || `L-${n + 1}`,
          itemId: dto.itemId,
          sucursalId: dto.sucursalId,
          origen: 'MANUAL',
          fechaVencimiento: new Date(dto.fechaVencimiento),
          cantidadInicial: dto.cantidad,
          cantidadActual: dto.cantidad,
        },
      });
    });
  }

  /** Descuenta una salida de los lotes del ítem en la sucursal (FEFO) y deja el rastro. */
  static async consumir(
    tx: Tx,
    sucursalId: string,
    itemId: string,
    cantidad: Prisma.Decimal.Value,
    ref: { tipo: string; transaccionId?: string; guiaId?: string },
  ) {
    const lotes = await tx.$queryRaw<{ id: string; cantidadActual: Prisma.Decimal; fechaVencimiento: Date | null; fechaIngreso: Date }[]>`
      SELECT id, cantidad_actual AS "cantidadActual", fecha_vencimiento AS "fechaVencimiento", fecha_ingreso AS "fechaIngreso"
      FROM lotes WHERE item_id = ${itemId}::uuid AND sucursal_id = ${sucursalId}::uuid AND cantidad_actual > 0
      FOR UPDATE`;
    if (!lotes.length) return;
    const { partes } = repartirFefo(lotes.map((l) => ({ ...l, cantidadActual: new D(l.cantidadActual) })), cantidad);
    for (const p of partes) {
      await tx.lote.update({ where: { id: p.loteId }, data: { cantidadActual: { decrement: p.cantidad } } });
      await tx.movimientoLote.create({ data: { loteId: p.loteId, tipo: ref.tipo, cantidad: p.cantidad.neg(), transaccionId: ref.transaccionId, guiaId: ref.guiaId } });
    }
  }

  /** Lo devuelto vuelve a los lotes de los que salió la venta original. */
  static async restaurarDevolucion(tx: Tx, ventaId: string, itemId: string, cantidad: Prisma.Decimal.Value, transaccionId: string) {
    const salidas = await tx.movimientoLote.findMany({
      where: { transaccionId: ventaId, lote: { itemId } },
      orderBy: { fecha: 'desc' },
    });
    if (!salidas.length) return;
    const ya = await tx.movimientoLote.groupBy({
      by: ['loteId'],
      where: { tipo: 'DEVOLUCION', lote: { itemId }, transaccionId: { in: await idsDevoluciones(tx, ventaId) } },
      _sum: { cantidad: true },
    });
    const devuelto = new Map(ya.map((y) => [y.loteId, y._sum.cantidad ?? ZERO]));
    let resto = new D(cantidad);
    for (const s of salidas) {
      if (resto.lte(0)) break;
      const disponible = s.cantidad.neg().sub(devuelto.get(s.loteId) ?? ZERO);
      const parte = D.min(disponible, resto);
      if (parte.lte(0)) continue;
      await tx.lote.update({ where: { id: s.loteId }, data: { cantidadActual: { increment: parte } } });
      await tx.movimientoLote.create({ data: { loteId: s.loteId, tipo: 'DEVOLUCION', cantidad: parte, transaccionId } });
      devuelto.set(s.loteId, (devuelto.get(s.loteId) ?? ZERO).add(parte));
      resto = resto.sub(parte);
    }
  }

  /** Al recibir una guía, los lotes despachados aparecen en la sucursal de destino con el mismo código. */
  static async recibirGuia(tx: Tx, guiaId: string, sucursalDestinoId: string) {
    const salidas = await tx.movimientoLote.findMany({ where: { guiaId, tipo: 'DESPACHO' }, include: { lote: true } });
    for (const s of salidas) {
      const cantidad = s.cantidad.neg();
      const { lote } = s;
      const destino = await tx.lote.upsert({
        where: { codigo_sucursalId: { codigo: lote.codigo, sucursalId: sucursalDestinoId } },
        update: { cantidadActual: { increment: cantidad }, cantidadInicial: { increment: cantidad } },
        create: {
          codigo: lote.codigo,
          itemId: lote.itemId,
          sucursalId: sucursalDestinoId,
          origen: lote.origen,
          productorId: lote.productorId,
          cuartelId: lote.cuartelId,
          fechaIngreso: lote.fechaIngreso,
          fechaVencimiento: lote.fechaVencimiento,
          cantidadInicial: cantidad,
          cantidadActual: cantidad,
        },
      });
      await tx.movimientoLote.create({ data: { loteId: destino.id, tipo: 'RECEPCION_GUIA', cantidad, guiaId } });
    }
  }

  /** Guía anulada: lo despachado vuelve a sus lotes de origen. */
  static async anularGuia(tx: Tx, guiaId: string) {
    const salidas = await tx.movimientoLote.findMany({ where: { guiaId, tipo: 'DESPACHO' } });
    for (const s of salidas) {
      await tx.lote.update({ where: { id: s.loteId }, data: { cantidadActual: { increment: s.cantidad.neg() } } });
      await tx.movimientoLote.create({ data: { loteId: s.loteId, tipo: 'ANULACION_GUIA', cantidad: s.cantidad.neg(), guiaId } });
    }
  }

  async listar(user: UsuarioSesion, filtros: { sucursalId?: string; itemId?: string; conSaldo?: boolean }) {
    const sucursal = sucursalDe(user, filtros.sucursalId);
    return this.prisma.lote.findMany({
      where: {
        ...(sucursal && { sucursalId: sucursal }),
        ...(filtros.itemId && { itemId: filtros.itemId }),
        ...(filtros.conSaldo && { cantidadActual: { gt: 0 } }),
      },
      include: {
        item: { select: { nombre: true, codigoSku: true, unidadMedida: true } },
        sucursal: { select: { nombre: true } },
        productor: { select: { nombreRazonSocial: true } },
      },
      orderBy: [{ fechaVencimiento: { sort: 'asc', nulls: 'last' } }, { fechaIngreso: 'asc' }],
      take: 500,
    });
  }

  /** Lotes con saldo que vencen dentro de `dias` (incluye los ya vencidos). */
  async porVencer(user: UsuarioSesion, dias: number, sucursalId?: string) {
    if (!Number.isInteger(dias) || dias < 0 || dias > 365) throw new BadRequestException('Días entre 0 y 365.');
    const limite = new Date();
    limite.setUTCDate(limite.getUTCDate() + dias);
    const sucursal = sucursalDe(user, sucursalId);
    return this.prisma.lote.findMany({
      where: { cantidadActual: { gt: 0 }, fechaVencimiento: { lte: limite }, ...(sucursal && { sucursalId: sucursal }) },
      include: { item: { select: { nombre: true, unidadMedida: true } }, sucursal: { select: { nombre: true } } },
      orderBy: { fechaVencimiento: 'asc' },
    });
  }

  /** De dónde vino el lote y a qué documentos y clientes se fue. */
  async trazabilidad(id: string, user: UsuarioSesion) {
    const lote = await this.prisma.lote.findUnique({
      where: { id },
      include: {
        item: { select: { nombre: true, unidadMedida: true } },
        sucursal: { select: { nombre: true } },
        productor: { select: { rut: true, nombreRazonSocial: true } },
        recepcion: { select: { folio: true, fecha: true, tipoDocumento: true, folioDocumento: true } },
        movimientos: { orderBy: { fecha: 'asc' } },
      },
    });
    if (!lote) throw new NotFoundException('Lote no encontrado');
    exigirSucursal(user, lote.sucursalId);
    const transacciones = await this.prisma.transaccion.findMany({
      where: { id: { in: lote.movimientos.map((m) => m.transaccionId).filter((x): x is string => !!x) } },
      select: { id: true, tipoTransaccion: true, numeroFactura: true, fechaRegistro: true, entidad: { select: { rut: true, nombreRazonSocial: true } } },
    });
    const guias = await this.prisma.guiaDespacho.findMany({
      where: { id: { in: lote.movimientos.map((m) => m.guiaId).filter((x): x is string => !!x) } },
      select: { id: true, folio: true, sucursalDestino: { select: { nombre: true } } },
    });
    const porTx = new Map(transacciones.map((t) => [t.id, t]));
    const porGuia = new Map(guias.map((g) => [g.id, g]));
    return {
      ...lote,
      movimientos: lote.movimientos.map((m) => ({
        ...m,
        documento: m.transaccionId ? porTx.get(m.transaccionId) ?? null : null,
        guia: m.guiaId ? porGuia.get(m.guiaId) ?? null : null,
      })),
    };
  }
}

async function idsDevoluciones(tx: Tx, ventaId: string) {
  const r = await tx.transaccion.findMany({ where: { transaccionOrigenId: ventaId }, select: { id: true } });
  return r.map((x) => x.id);
}
