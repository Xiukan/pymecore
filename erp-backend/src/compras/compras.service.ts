import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { EstadoOrdenCompra, Prisma } from '@prisma/client';
import { esAdmin, exigirSucursal, sucursalDe, UsuarioSesion } from '../auth/sucursal-scope';
import { EmpresaService } from '../empresa/empresa.service';
import { PrismaService } from '../prisma/prisma.service';
import { calcularDocumentoNeto, dec, ZERO } from '../utils/money.util';
import { DteRecibidosService } from './dte-recibidos.service';
import { CreateFacturaCompraDto, CreateOrdenCompraDto, CreateRecepcionDto } from './dto/compras.dto';

type Tx = Prisma.TransactionClient;
const D = Prisma.Decimal;

const INCLUDE_LISTA = {
  proveedor: { select: { id: true, rut: true, nombreRazonSocial: true } },
  sucursal: { select: { id: true, nombre: true } },
  usuario: { select: { nombreCompleto: true } },
  detalles: { include: { item: { select: { nombre: true, codigoSku: true, unidadMedida: true } } } },
} satisfies Prisma.OrdenCompraInclude;

export interface AvanceLinea {
  recibido: Prisma.Decimal;
  facturado: Prisma.Decimal;
}

/** Costo promedio con 2 decimales, como la columna items.costo_promedio. */
const costo = (v: Prisma.Decimal) => v.toDecimalPlaces(2, D.ROUND_HALF_UP);

/**
 * Costo promedio ponderado global del producto (todas las sucursales).
 * ingreso: (stock × costo + cant × costoOC) / (stock + cant), con `stock` previo al ingreso.
 * reverso: ((stock + cant) × costo − cant × costoOC) / stock, con `stock` posterior a la salida.
 * Devuelve null cuando no hay base para recalcular (reverso que deja el stock en cero).
 */
export function costoPromedio(
  tipo: 'ingreso' | 'reverso',
  stock: Prisma.Decimal,
  costoActual: Prisma.Decimal,
  cantidad: Prisma.Decimal,
  costoUnitario: Prisma.Decimal,
): Prisma.Decimal | null {
  const base = D.max(stock, ZERO);
  if (tipo === 'ingreso') {
    if (base.lte(0)) return costo(costoUnitario);
    return costo(base.mul(costoActual).add(cantidad.mul(costoUnitario)).div(base.add(cantidad)));
  }
  if (base.lte(0)) return null;
  return costo(D.max(base.add(cantidad).mul(costoActual).sub(cantidad.mul(costoUnitario)).div(base), ZERO));
}

/**
 * Compras a proveedores (adaptado del flujo OC → recepción → factura de APS).
 * Cada mutación bloquea primero la OC: recepciones, facturas y anulaciones
 * concurrentes sobre una misma orden se ejecutan una tras otra.
 */
@Injectable()
export class ComprasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly empresa: EmpresaService,
    private readonly dtes: DteRecibidosService,
  ) {}

  async crearOrden(dto: CreateOrdenCompraDto, user: UsuarioSesion) {
    if (!esAdmin(user) && user.sucursalId !== dto.sucursalId) {
      throw new ForbiddenException('Solo puedes emitir órdenes de compra para tu sucursal.');
    }
    const itemIds = dto.detalles.map((d) => d.itemId);
    if (new Set(itemIds).size !== itemIds.length) {
      throw new BadRequestException('La orden repite un producto; agrupe las cantidades en una sola línea.');
    }
    const proveedor = await this.prisma.entidad.findUnique({ where: { id: dto.proveedorId } });
    if (!proveedor || proveedor.tipoEntidad !== 'PROVEEDOR' || proveedor.estado !== 'Activo') {
      throw new BadRequestException('El proveedor no existe o no está activo.');
    }
    const sucursal = await this.prisma.sucursal.findUnique({ where: { id: dto.sucursalId } });
    if (!sucursal) throw new BadRequestException('La sucursal no existe.');
    const items = await this.prisma.item.findMany({ where: { id: { in: itemIds }, estado: 'Activo' } });
    if (items.length !== itemIds.length) throw new BadRequestException('Uno o más productos no existen o están inactivos.');
    const itemMap = new Map(items.map((i) => [i.id, i]));

    const { tasaIva } = await this.empresa.get();
    const calculo = calcularDocumentoNeto(
      dto.detalles.map((d) => ({
        cantidad: d.cantidad,
        costoUnitario: d.costoUnitario,
        afectoIva: itemMap.get(d.itemId)!.afectoIva,
      })),
      tasaIva,
    );

    return this.prisma.$transaction(async (tx) => {
      // Correlativo sin repetidos: las emisiones concurrentes esperan su turno aquí.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('ordenes_compra_folio'))`;
      const ultima = await tx.ordenCompra.findFirst({ orderBy: { folio: 'desc' }, select: { folio: true } });
      return tx.ordenCompra.create({
        data: {
          folio: (ultima?.folio ?? 0) + 1,
          proveedorId: proveedor.id,
          sucursalId: sucursal.id,
          usuarioId: user.id,
          fechaEntrega: dto.fechaEntrega ? new Date(dto.fechaEntrega) : undefined,
          notas: dto.notas,
          montoNeto: calculo.montoNeto,
          montoIva: calculo.montoIva,
          montoTotal: calculo.montoTotal,
          detalles: {
            create: dto.detalles.map((d, i) => ({
              itemId: d.itemId,
              cantidad: dec(d.cantidad),
              costoUnitario: dec(d.costoUnitario),
              subtotal: calculo.subtotales[i],
            })),
          },
        },
        include: INCLUDE_LISTA,
      });
    });
  }

  async listar(user: UsuarioSesion, filtros: { sucursalId?: string; estado?: EstadoOrdenCompra }) {
    const sucursalId = sucursalDe(user, filtros.sucursalId);
    const ordenes = await this.prisma.ordenCompra.findMany({
      where: { ...(sucursalId && { sucursalId }), ...(filtros.estado && { estado: filtros.estado }) },
      include: INCLUDE_LISTA,
      orderBy: { folio: 'desc' },
    });
    const avance = await this.avance(this.prisma, ordenes.flatMap((o) => o.detalles.map((d) => d.id)));
    return ordenes.map((o) => ({ ...o, resumen: this.resumen(o.detalles, avance) }));
  }

  async detalle(id: string, user: UsuarioSesion) {
    const orden = await this.prisma.ordenCompra.findUnique({
      where: { id },
      include: {
        ...INCLUDE_LISTA,
        recepciones: {
          include: { usuario: { select: { nombreCompleto: true } }, detalles: true },
          orderBy: { fecha: 'desc' },
        },
        facturas: {
          include: { usuario: { select: { nombreCompleto: true } }, detalles: true },
          orderBy: { creadoEn: 'desc' },
        },
      },
    });
    if (!orden) throw new NotFoundException('Orden de compra no encontrada');
    exigirSucursal(user, orden.sucursalId);
    const avance = await this.avance(this.prisma, orden.detalles.map((d) => d.id));
    return {
      ...orden,
      detalles: orden.detalles.map((d) => ({ ...d, ...this.lineaAvance(d, avance) })),
      resumen: this.resumen(orden.detalles, avance),
    };
  }

  async recibir(ordenId: string, dto: CreateRecepcionDto, user: UsuarioSesion) {
    return this.prisma.$transaction(async (tx) => {
      const orden = await this.bloquearOrden(tx, ordenId, user);
      if (orden.estado !== 'ABIERTA') throw new BadRequestException('Solo se recibe contra una orden abierta.');
      const lineas = this.lineasDeOrden(orden, dto.detalles);
      const avance = await this.avance(tx, orden.detalles.map((d) => d.id));

      for (const { detalle, cantidad } of lineas) {
        const pendiente = detalle.cantidad.sub(avance.get(detalle.id)?.recibido ?? ZERO);
        if (cantidad.gt(pendiente)) {
          throw new BadRequestException(
            `No se pueden recibir ${cantidad} de "${detalle.item.nombre}": pedidas ${detalle.cantidad}, pendientes ${pendiente}.`,
          );
        }
      }

      const recepcion = await tx.recepcionCompra.create({
        data: {
          ordenId,
          usuarioId: user.id,
          guiaDespacho: dto.guiaDespacho?.trim() || null,
          detalles: { create: lineas.map((l) => ({ detalleOrdenId: l.detalle.id, cantidad: l.cantidad })) },
        },
        include: { detalles: true },
      });
      for (const { detalle, cantidad } of lineas) {
        // El costo se recalcula antes de sumar el stock: el promedio pondera lo que ya había.
        await this.recalcularCosto(tx, detalle.itemId, cantidad, detalle.costoUnitario, 'ingreso');
        await tx.stockLocal.upsert({
          where: { sucursalId_itemId: { sucursalId: orden.sucursalId, itemId: detalle.itemId } },
          update: { stockActual: { increment: cantidad } },
          create: { sucursalId: orden.sucursalId, itemId: detalle.itemId, stockActual: cantidad },
        });
      }
      return recepcion;
    });
  }

  async anularRecepcion(recepcionId: string, user: UsuarioSesion) {
    const ref = await this.prisma.recepcionCompra.findUnique({ where: { id: recepcionId }, select: { ordenId: true } });
    if (!ref) throw new NotFoundException('Recepción no encontrada');
    return this.prisma.$transaction(async (tx) => {
      const orden = await this.bloquearOrden(tx, ref.ordenId, user);
      const recepcion = await tx.recepcionCompra.findUniqueOrThrow({
        where: { id: recepcionId },
        include: { detalles: true },
      });
      if (recepcion.estado !== 'VIGENTE') throw new BadRequestException('La recepción ya está anulada.');
      const avance = await this.avance(tx, orden.detalles.map((d) => d.id));

      for (const linea of recepcion.detalles) {
        const detalle = orden.detalles.find((d) => d.id === linea.detalleOrdenId)!;
        const a = avance.get(detalle.id)!;
        if (a.facturado.gt(a.recibido.sub(linea.cantidad))) {
          throw new BadRequestException(
            `No se puede anular: "${detalle.item.nombre}" ya está facturado sobre esa cantidad. Anule la factura primero.`,
          );
        }
        const { count } = await tx.stockLocal.updateMany({
          where: { sucursalId: orden.sucursalId, itemId: detalle.itemId, stockActual: { gte: linea.cantidad } },
          data: { stockActual: { decrement: linea.cantidad } },
        });
        if (count !== 1) {
          throw new BadRequestException(
            `No se puede anular: parte de "${detalle.item.nombre}" ya se vendió o despachó desde la sucursal.`,
          );
        }
        // El stock ya se descontó: el reverso usa el stock posterior más lo que sale.
        await this.recalcularCosto(tx, detalle.itemId, linea.cantidad, detalle.costoUnitario, 'reverso');
      }
      return tx.recepcionCompra.update({ where: { id: recepcionId }, data: { estado: 'ANULADO' } });
    });
  }

  async registrarFactura(ordenId: string, dto: CreateFacturaCompraDto, user: UsuarioSesion) {
    const emision = new Date(dto.fechaEmision);
    const manana = new Date();
    manana.setDate(manana.getDate() + 1);
    if (emision > manana) throw new BadRequestException('La fecha de emisión no puede ser futura.');
    if (dto.fechaVencimiento && new Date(dto.fechaVencimiento) < emision) {
      throw new BadRequestException('El vencimiento no puede ser anterior a la emisión.');
    }
    const folio = dto.folio.trim();
    const { tasaIva } = await this.empresa.get();

    return this.prisma.$transaction(async (tx) => {
      const orden = await this.bloquearOrden(tx, ordenId, user);
      if (orden.estado === 'ANULADA') throw new BadRequestException('La orden está anulada.');
      // El folio es único por proveedor: el bloqueo del proveedor ordena facturas de distintas OC.
      await tx.$queryRaw`SELECT id FROM entidades WHERE id = ${orden.proveedorId}::uuid FOR UPDATE`;
      const repetida = await tx.facturaCompra.findFirst({
        where: { proveedorId: orden.proveedorId, folio, estado: 'VIGENTE' },
        select: { id: true },
      });
      if (repetida) throw new BadRequestException(`Ya existe una factura vigente con folio ${folio} de este proveedor.`);

      // Desde la bandeja: el DTE manda sobre lo que se digite.
      const dte = dto.dteId ? await this.dtes.tomarPendiente(tx, dto.dteId) : null;
      if (dte) {
        if (dte.proveedorId !== orden.proveedorId) throw new BadRequestException('El DTE es de otro proveedor que la orden.');
        if (![33, 34].includes(dte.tipoDte)) throw new BadRequestException('Solo una factura (33 o 34) se asocia a una orden de compra.');
        if (dte.folio !== folio) throw new BadRequestException(`El folio debe ser el del DTE (${dte.folio}).`);
        if (dte.fechaEmision.toISOString().slice(0, 10) !== dto.fechaEmision.slice(0, 10)) {
          throw new BadRequestException('La fecha de emisión debe ser la del DTE.');
        }
      }

      const lineas = this.lineasDeOrden(orden, dto.detalles);
      const avance = await this.avance(tx, orden.detalles.map((d) => d.id));
      for (const [i, { detalle, cantidad }] of lineas.entries()) {
        const a = avance.get(detalle.id);
        const facturable = (a?.recibido ?? ZERO).sub(a?.facturado ?? ZERO);
        if (cantidad.gt(facturable)) {
          throw new BadRequestException(
            `No se pueden facturar ${cantidad} de "${detalle.item.nombre}": recibidas sin facturar ${facturable}.`,
          );
        }
        const costoFacturado = dec(dto.detalles[i].costoUnitario);
        if (!costoFacturado.eq(detalle.costoUnitario)) {
          throw new BadRequestException(
            `El costo facturado de "${detalle.item.nombre}" ($${costoFacturado}) difiere del pactado en la OC ($${detalle.costoUnitario}). Gestione la corrección con el proveedor.`,
          );
        }
      }

      const calculo = calcularDocumentoNeto(
        lineas.map((l) => ({ cantidad: l.cantidad, costoUnitario: l.detalle.costoUnitario, afectoIva: l.detalle.item.afectoIva })),
        tasaIva,
      );
      if (dte && !(calculo.montoNeto.eq(dte.montoNeto.add(dte.montoExento)) && calculo.montoIva.eq(dte.iva))) {
        throw new BadRequestException(
          `Lo seleccionado (neto $${calculo.montoNeto}, IVA $${calculo.montoIva}) no cuadra con el DTE ` +
            `(neto $${dte.montoNeto.add(dte.montoExento)}, IVA $${dte.iva}). Ajuste las cantidades recibidas a facturar.`,
        );
      }
      if (dto.montoTotal !== undefined && !calculo.montoTotal.eq(dto.montoTotal)) {
        throw new BadRequestException(
          `El total informado ($${dto.montoTotal}) no cuadra con el detalle ($${calculo.montoTotal}). Revise cantidades y costos.`,
        );
      }

      const factura = await tx.facturaCompra.create({
        data: {
          ordenId,
          proveedorId: orden.proveedorId,
          usuarioId: user.id,
          folio,
          fechaEmision: emision,
          fechaVencimiento: dto.fechaVencimiento ? new Date(dto.fechaVencimiento) : null,
          montoNeto: calculo.montoNeto,
          montoIva: calculo.montoIva,
          montoTotal: calculo.montoTotal,
          detalles: {
            create: lineas.map((l, i) => ({
              detalleOrdenId: l.detalle.id,
              cantidad: l.cantidad,
              costoUnitario: l.detalle.costoUnitario,
              subtotal: calculo.subtotales[i],
            })),
          },
        },
        include: { detalles: true },
      });
      if (dte) {
        await tx.dteRecibido.update({ where: { id: dte.id }, data: { estado: 'ASOCIADO_OC', facturaCompraId: factura.id } });
      }
      return factura;
    });
  }

  async anularFactura(facturaId: string, user: UsuarioSesion) {
    const ref = await this.prisma.facturaCompra.findUnique({ where: { id: facturaId }, select: { ordenId: true } });
    if (!ref) throw new NotFoundException('Factura no encontrada');
    return this.prisma.$transaction(async (tx) => {
      await this.bloquearOrden(tx, ref.ordenId, user);
      const { count } = await tx.facturaCompra.updateMany({
        where: { id: facturaId, estado: 'VIGENTE' },
        data: { estado: 'ANULADO' },
      });
      if (count !== 1) throw new BadRequestException('La factura ya está anulada.');
      // El DTE de origen vuelve a la bandeja para asociarlo de nuevo.
      await tx.dteRecibido.updateMany({
        where: { facturaCompraId: facturaId },
        data: { estado: 'PENDIENTE', facturaCompraId: null },
      });
      return tx.facturaCompra.findUniqueOrThrow({ where: { id: facturaId } });
    });
  }

  async cerrar(ordenId: string, user: UsuarioSesion) {
    return this.prisma.$transaction(async (tx) => {
      const orden = await this.bloquearOrden(tx, ordenId, user);
      if (orden.estado !== 'ABIERTA') throw new BadRequestException('Solo se cierra una orden abierta.');
      return tx.ordenCompra.update({ where: { id: ordenId }, data: { estado: 'CERRADA' } });
    });
  }

  async anular(ordenId: string, user: UsuarioSesion) {
    return this.prisma.$transaction(async (tx) => {
      const orden = await this.bloquearOrden(tx, ordenId, user);
      if (orden.estado === 'ANULADA') throw new BadRequestException('La orden ya está anulada.');
      const vigentes = await tx.recepcionCompra.count({ where: { ordenId, estado: 'VIGENTE' } })
        + await tx.facturaCompra.count({ where: { ordenId, estado: 'VIGENTE' } });
      if (vigentes > 0) {
        throw new BadRequestException('La orden tiene recepciones o facturas vigentes. Anúlelas primero.');
      }
      return tx.ordenCompra.update({ where: { id: ordenId }, data: { estado: 'ANULADA' } });
    });
  }

  private async bloquearOrden(tx: Tx, ordenId: string, user: UsuarioSesion) {
    await tx.$queryRaw`SELECT id FROM ordenes_compra WHERE id = ${ordenId}::uuid FOR UPDATE`;
    const orden = await tx.ordenCompra.findUnique({
      where: { id: ordenId },
      include: { detalles: { include: { item: true } } },
    });
    if (!orden) throw new NotFoundException('Orden de compra no encontrada');
    exigirSucursal(user, orden.sucursalId);
    return orden;
  }

  private lineasDeOrden<T extends { id: string }>(
    orden: { detalles: T[] },
    lineas: { detalleId: string; cantidad: number }[],
  ) {
    if (new Set(lineas.map((l) => l.detalleId)).size !== lineas.length) {
      throw new BadRequestException('El documento repite una línea de la orden.');
    }
    return lineas.map((l) => {
      const detalle = orden.detalles.find((d) => d.id === l.detalleId);
      if (!detalle) throw new BadRequestException('Hay líneas que no pertenecen a esta orden de compra.');
      return { detalle, cantidad: dec(l.cantidad) };
    });
  }

  /** Recibido y facturado por línea, contando solo documentos vigentes. */
  private async avance(db: Tx | PrismaService, detalleIds: string[]) {
    const mapa = new Map<string, AvanceLinea>();
    if (detalleIds.length === 0) return mapa;
    // Secuencial: dentro de una transacción ambas consultas comparten la misma conexión.
    const recibidos = await db.recepcionCompraDetalle.groupBy({
      by: ['detalleOrdenId'],
      where: { detalleOrdenId: { in: detalleIds }, recepcion: { estado: 'VIGENTE' } },
      _sum: { cantidad: true },
    });
    const facturados = await db.facturaCompraDetalle.groupBy({
      by: ['detalleOrdenId'],
      where: { detalleOrdenId: { in: detalleIds }, factura: { estado: 'VIGENTE' } },
      _sum: { cantidad: true },
    });
    for (const id of detalleIds) mapa.set(id, { recibido: ZERO, facturado: ZERO });
    for (const r of recibidos) mapa.get(r.detalleOrdenId)!.recibido = r._sum.cantidad ?? ZERO;
    for (const f of facturados) mapa.get(f.detalleOrdenId)!.facturado = f._sum.cantidad ?? ZERO;
    return mapa;
  }

  private lineaAvance(d: { id: string; cantidad: Prisma.Decimal }, avance: Map<string, AvanceLinea>) {
    const a = avance.get(d.id) ?? { recibido: ZERO, facturado: ZERO };
    return {
      recibido: a.recibido,
      facturado: a.facturado,
      porRecibir: D.max(d.cantidad.sub(a.recibido), ZERO),
      porFacturar: D.max(a.recibido.sub(a.facturado), ZERO),
    };
  }

  private resumen(detalles: { id: string; cantidad: Prisma.Decimal }[], avance: Map<string, AvanceLinea>) {
    const lineas = detalles.map((d) => this.lineaAvance(d, avance));
    const porRecibir = lineas.reduce((s, l) => s.add(l.porRecibir), ZERO);
    const porFacturar = lineas.reduce((s, l) => s.add(l.porFacturar), ZERO);
    const recibido = lineas.reduce((s, l) => s.add(l.recibido), ZERO);
    return {
      porRecibir,
      porFacturar,
      situacion: recibido.isZero()
        ? 'SIN_RECEPCION'
        : porRecibir.gt(0)
          ? 'RECEPCION_PARCIAL'
          : porFacturar.gt(0)
            ? 'POR_FACTURAR'
            : 'COMPLETA',
    };
  }

  private async recalcularCosto(
    tx: Tx,
    itemId: string,
    cantidad: Prisma.Decimal,
    costoUnitario: Prisma.Decimal,
    tipo: 'ingreso' | 'reverso',
  ) {
    await tx.$queryRaw`SELECT id FROM items WHERE id = ${itemId}::uuid FOR UPDATE`;
    const item = await tx.item.findUniqueOrThrow({ where: { id: itemId } });
    const { _sum } = await tx.stockLocal.aggregate({ where: { itemId }, _sum: { stockActual: true } });
    const nuevo = costoPromedio(tipo, _sum.stockActual ?? ZERO, item.costoPromedio, cantidad, costoUnitario);
    if (nuevo === null) return;
    await tx.item.update({ where: { id: itemId }, data: { costoPromedio: nuevo } });
  }
}
