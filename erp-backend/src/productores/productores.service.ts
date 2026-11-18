import { BadRequestException, ForbiddenException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { esAdmin, exigirSucursal, sucursalDe, UsuarioSesion } from '../auth/sucursal-scope';
import { costoPromedio } from '../compras/compras.service';
import { CUENTA, debe, fechaLocal, fechaUtc, haber } from '../contabilidad/asientos';
import { ContabilidadService } from '../contabilidad/contabilidad.service';
import { EmpresaService } from '../empresa/empresa.service';
import { PrismaService } from '../prisma/prisma.service';
import { ZERO } from '../utils/money.util';
import { exigirPeriodoAbierto } from '../utils/periodos';
import { TX_OPCIONES } from '../utils/transacciones';
import { aplicarAnticipos, liquidar } from './calculo';
import { CreateAnticipoDto, CreateRecepcionProductorDto, PagoProductorDto } from './dto/productores.dto';

type Tx = Prisma.TransactionClient;
const D = Prisma.Decimal;

const INCLUDE = {
  productor: { select: { id: true, rut: true, nombreRazonSocial: true } },
  item: { select: { id: true, nombre: true, unidadMedida: true } },
  sucursal: { select: { nombre: true } },
  lote: { select: { id: true, codigo: true, fechaVencimiento: true } },
} satisfies Prisma.RecepcionProductorInclude;

@Injectable()
export class ProductoresService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly empresa: EmpresaService,
    private readonly contabilidad: ContabilidadService,
  ) {}

  onModuleInit() {
    this.contabilidad.registrarFuente(async (tx, r) => {
      const [recepciones, pagadas, anticipos] = await Promise.all([
        tx.recepcionProductor.findMany({ where: { estado: 'VIGENTE', fecha: r.local }, include: { productor: { select: { nombreRazonSocial: true } } } }),
        tx.recepcionProductor.findMany({ where: { estado: 'VIGENTE', estadoPago: 'PAGADO', fechaPago: r.utc } }),
        tx.anticipoProductor.findMany({ where: { estado: 'VIGENTE', fecha: r.utc } }),
      ]);
      const salida = (medio: string | null) => (medio === 'Efectivo' ? CUENTA.CAJA : CUENTA.BANCO);
      return [
        // El IVA retenido se debe al SII; al productor, el resto.
        ...recepciones.map((x) => ({
          fecha: fechaLocal(x.fecha),
          glosa: `Recepción productor N° ${x.folio} (${x.productor.nombreRazonSocial})`,
          origenTipo: 'RECEPCION_PRODUCTOR',
          origenId: x.id,
          lineas: [debe(CUENTA.MERCADERIAS, x.montoNeto), debe(CUENTA.IVA_CREDITO, x.iva), haber(CUENTA.PROVEEDORES, x.montoAPagar), haber(CUENTA.RETENCIONES, x.retencionIva)].filter(
            (l) => !l.debe.isZero() || !l.haber.isZero(),
          ),
        })),
        ...pagadas.map((x) => ({
          fecha: fechaUtc(x.fechaPago!),
          glosa: `Pago a productor, recepción N° ${x.folio}`,
          origenTipo: 'PAGO_PRODUCTOR',
          origenId: x.id,
          lineas: [debe(CUENTA.PROVEEDORES, x.montoAPagar), haber(CUENTA.ANTICIPOS_PRODUCTORES, x.anticipoAplicado), haber(salida(x.medioPago), x.montoAPagar.sub(x.anticipoAplicado))].filter(
            (l) => !l.debe.isZero() || !l.haber.isZero(),
          ),
        })),
        ...anticipos.map((a) => ({
          fecha: fechaUtc(a.fecha),
          glosa: `Anticipo a productor: ${a.descripcion}`,
          origenTipo: 'ANTICIPO_PRODUCTOR',
          origenId: a.id,
          lineas: [debe(CUENTA.ANTICIPOS_PRODUCTORES, a.monto), haber(salida(a.medioPago), a.monto)],
        })),
      ];
    });
  }

  async recibir(dto: CreateRecepcionProductorDto, user: UsuarioSesion) {
    if (!esAdmin(user) && dto.sucursalId !== user.sucursalId) throw new ForbiddenException('Solo puedes recibir en tu sucursal.');
    if (dto.tipoDocumento === 'FACTURA_PROVEEDOR' && !dto.folioDocumento?.trim()) {
      throw new BadRequestException('Indica el folio de la factura del productor.');
    }
    const [item, productor, empresa] = await Promise.all([
      this.prisma.item.findUnique({ where: { id: dto.itemId } }),
      this.prisma.entidad.findUnique({ where: { id: dto.productorId } }),
      this.empresa.get(),
    ]);
    if (!item || item.estado !== 'Activo') throw new BadRequestException('El producto no existe o está inactivo.');
    if (!productor || productor.tipoEntidad !== 'PROVEEDOR') throw new BadRequestException('El productor debe estar registrado como proveedor.');
    let montos: ReturnType<typeof liquidar>;
    try {
      montos = liquidar(dto, {
        tipoDocumento: dto.tipoDocumento,
        tasaIva: empresa.tasaIva,
        humedadBasePct: item.humedadBasePct,
        retencionIvaPct: item.retencionIvaPct,
      });
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
    if (montos.kilosPagables.lte(0)) throw new BadRequestException('No quedan kilos a pagar después del castigo.');

    return this.prisma.$transaction(async (tx) => {
      await exigirPeriodoAbierto(tx, new Date());
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('recepciones_productor_folio'))`;
      const ultima = await tx.recepcionProductor.findFirst({ orderBy: { folio: 'desc' }, select: { folio: true } });
      const folio = (ultima?.folio ?? 0) + 1;
      if (dto.tipoDocumento === 'FACTURA_PROVEEDOR') {
        const repetida = await tx.recepcionProductor.findFirst({
          where: { productorId: productor.id, tipoDocumento: 'FACTURA_PROVEEDOR', folioDocumento: dto.folioDocumento!.trim(), estado: 'VIGENTE' },
        });
        if (repetida) throw new BadRequestException('Esa factura del productor ya está registrada.');
      }
      const kilos = montos.kilosPagables;
      const lote = await tx.lote.create({
        data: {
          codigo: `RP-${folio}`,
          itemId: item.id,
          sucursalId: dto.sucursalId,
          origen: 'RECEPCION_PRODUCTOR',
          productorId: productor.id,
          fechaVencimiento: dto.fechaVencimiento ? new Date(dto.fechaVencimiento) : null,
          cantidadInicial: kilos,
          cantidadActual: kilos,
        },
      });
      await tx.$queryRaw`SELECT id FROM items WHERE id = ${item.id}::uuid FOR UPDATE`;
      const { _sum } = await tx.stockLocal.aggregate({ where: { itemId: item.id }, _sum: { stockActual: true } });
      const nuevoCosto = costoPromedio('ingreso', _sum.stockActual ?? ZERO, item.costoPromedio, kilos, new D(dto.precioKilo));
      if (nuevoCosto) await tx.item.update({ where: { id: item.id }, data: { costoPromedio: nuevoCosto } });
      await tx.stockLocal.upsert({
        where: { sucursalId_itemId: { sucursalId: dto.sucursalId, itemId: item.id } },
        update: { stockActual: { increment: kilos } },
        create: { sucursalId: dto.sucursalId, itemId: item.id, stockActual: kilos },
      });
      return tx.recepcionProductor.create({
        data: {
          folio,
          productorId: productor.id,
          sucursalId: dto.sucursalId,
          itemId: item.id,
          usuarioId: user.id,
          pesoBruto: dto.pesoBruto,
          tara: dto.tara,
          humedadPct: dto.humedadPct ?? 0,
          impurezasPct: dto.impurezasPct ?? 0,
          precioKilo: dto.precioKilo,
          tipoDocumento: dto.tipoDocumento,
          folioDocumento: dto.tipoDocumento === 'FACTURA_COMPRA' ? String(folio) : dto.folioDocumento!.trim(),
          observaciones: dto.observaciones,
          loteId: lote.id,
          ...montos,
        },
        include: INCLUDE,
      });
    }, TX_OPCIONES);
  }

  async listar(user: UsuarioSesion, filtros: { productorId?: string; sucursalId?: string; estadoPago?: string }) {
    const sucursal = sucursalDe(user, filtros.sucursalId);
    return this.prisma.recepcionProductor.findMany({
      where: {
        ...(sucursal && { sucursalId: sucursal }),
        ...(filtros.productorId && { productorId: filtros.productorId }),
        ...(filtros.estadoPago === 'POR_PAGAR' || filtros.estadoPago === 'PAGADO' ? { estadoPago: filtros.estadoPago, estado: 'VIGENTE' } : {}),
      },
      include: INCLUDE,
      orderBy: { folio: 'desc' },
      take: 300,
    });
  }

  /** Anula una recepción no pagada cuyo lote sigue completo: devuelve stock y costo. */
  async anular(id: string, user: UsuarioSesion) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM recepciones_productor WHERE id = ${id}::uuid FOR UPDATE`;
      const r = await tx.recepcionProductor.findUnique({ where: { id }, include: { lote: true } });
      if (!r) throw new NotFoundException('Recepción no encontrada');
      exigirSucursal(user, r.sucursalId);
      if (r.estado !== 'VIGENTE') throw new BadRequestException('La recepción ya está anulada.');
      if (r.estadoPago === 'PAGADO') throw new BadRequestException('La recepción ya está pagada; no se puede anular.');
      await exigirPeriodoAbierto(tx, r.fecha);
      const { count } = await tx.lote.updateMany({
        where: { id: r.loteId!, cantidadActual: r.kilosPagables },
        data: { cantidadActual: 0 },
      });
      if (count !== 1) throw new BadRequestException('Parte de este lote ya se vendió o despachó; no se puede anular.');
      const stock = await tx.stockLocal.updateMany({
        where: { sucursalId: r.sucursalId, itemId: r.itemId, stockActual: { gte: r.kilosPagables } },
        data: { stockActual: { decrement: r.kilosPagables } },
      });
      if (stock.count !== 1) throw new BadRequestException('No hay stock suficiente para anular la recepción.');
      await tx.movimientoLote.create({ data: { loteId: r.loteId!, tipo: 'ANULACION', cantidad: r.kilosPagables.neg() } });
      await tx.$queryRaw`SELECT id FROM items WHERE id = ${r.itemId}::uuid FOR UPDATE`;
      const item = await tx.item.findUniqueOrThrow({ where: { id: r.itemId } });
      const { _sum } = await tx.stockLocal.aggregate({ where: { itemId: r.itemId }, _sum: { stockActual: true } });
      const costo = costoPromedio('reverso', _sum.stockActual ?? ZERO, item.costoPromedio, r.kilosPagables, r.precioKilo);
      if (costo) await tx.item.update({ where: { id: r.itemId }, data: { costoPromedio: costo } });
      return tx.recepcionProductor.update({ where: { id }, data: { estado: 'ANULADO' }, include: INCLUDE });
    }, TX_OPCIONES);
  }

  /** Paga la recepción descontando los anticipos pendientes del productor (los más antiguos primero). */
  async pagar(id: string, dto: PagoProductorDto, user: UsuarioSesion) {
    const fechaPago = dto.fechaPago ? new Date(dto.fechaPago) : new Date();
    return this.prisma.$transaction(async (tx) => {
      await exigirPeriodoAbierto(tx, dto.fechaPago ?? new Date());
      await tx.$queryRaw`SELECT id FROM recepciones_productor WHERE id = ${id}::uuid FOR UPDATE`;
      const r = await tx.recepcionProductor.findUnique({ where: { id } });
      if (!r) throw new NotFoundException('Recepción no encontrada');
      exigirSucursal(user, r.sucursalId);
      if (r.estado !== 'VIGENTE' || r.estadoPago !== 'POR_PAGAR') throw new BadRequestException('La recepción está anulada o ya pagada.');
      await tx.$queryRaw`SELECT id FROM entidades WHERE id = ${r.productorId}::uuid FOR UPDATE`;
      const saldos = await this.saldosAnticipos(tx, r.productorId);
      const { aplicaciones, aplicado } = aplicarAnticipos(r.montoAPagar, saldos);
      if (aplicaciones.length) {
        await tx.aplicacionAnticipo.createMany({ data: aplicaciones.map((a) => ({ ...a, recepcionId: id })) });
      }
      return tx.recepcionProductor.update({
        where: { id },
        data: { estadoPago: 'PAGADO', fechaPago, medioPago: dto.medioPago, anticipoAplicado: aplicado },
        include: INCLUDE,
      });
    }, TX_OPCIONES);
  }

  private async saldosAnticipos(tx: Tx | PrismaService, productorId: string) {
    const anticipos = await tx.anticipoProductor.findMany({
      where: { productorId, estado: 'VIGENTE' },
      include: { aplicaciones: { select: { monto: true } } },
      orderBy: [{ fecha: 'asc' }, { creadoEn: 'asc' }],
    });
    return anticipos
      .map((a) => ({ id: a.id, fecha: a.fecha, descripcion: a.descripcion, monto: a.monto, saldo: a.monto.sub(a.aplicaciones.reduce((s, x) => s.add(x.monto), ZERO)) }))
      .filter((a) => a.saldo.gt(0));
  }

  async crearAnticipo(dto: CreateAnticipoDto, user: UsuarioSesion) {
    const productor = await this.prisma.entidad.findUnique({ where: { id: dto.productorId } });
    if (!productor || productor.tipoEntidad !== 'PROVEEDOR') throw new BadRequestException('El productor debe estar registrado como proveedor.');
    const fecha = dto.fecha ?? fechaLocal(new Date());
    await exigirPeriodoAbierto(this.prisma, fecha);
    return this.prisma.anticipoProductor.create({
      data: { productorId: productor.id, usuarioId: user.id, monto: dto.monto, medioPago: dto.medioPago, fecha: new Date(fecha), descripcion: dto.descripcion.trim() },
    });
  }

  async anularAnticipo(id: string) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM anticipos_productor WHERE id = ${id}::uuid FOR UPDATE`;
      const a = await tx.anticipoProductor.findUnique({ where: { id }, include: { aplicaciones: true } });
      if (!a) throw new NotFoundException('Anticipo no encontrado');
      if (a.estado !== 'VIGENTE') throw new BadRequestException('El anticipo ya está anulado.');
      if (a.aplicaciones.length) throw new BadRequestException('El anticipo ya se descontó de un pago; no se puede anular.');
      await exigirPeriodoAbierto(tx, a.fecha, true);
      return tx.anticipoProductor.update({ where: { id }, data: { estado: 'ANULADO' } });
    });
  }

  /** Estado de cuenta del productor: lo que se le debe, sus anticipos pendientes y el neto. */
  async cuenta(productorId: string) {
    const productor = await this.prisma.entidad.findUnique({ where: { id: productorId }, select: { id: true, rut: true, nombreRazonSocial: true } });
    if (!productor) throw new NotFoundException('Productor no encontrado');
    const [porPagar, anticipos] = await Promise.all([
      this.prisma.recepcionProductor.findMany({ where: { productorId, estado: 'VIGENTE', estadoPago: 'POR_PAGAR' }, include: INCLUDE, orderBy: { fecha: 'asc' } }),
      this.saldosAnticipos(this.prisma, productorId),
    ]);
    const deuda = porPagar.reduce((s, r) => s.add(r.montoAPagar), ZERO);
    const anticipado = anticipos.reduce((s, a) => s.add(a.saldo), ZERO);
    return { productor, porPagar, anticipos, deuda, anticipado, saldo: deuda.sub(anticipado) };
  }

  anticipos() {
    return this.prisma.anticipoProductor.findMany({
      include: { productor: { select: { rut: true, nombreRazonSocial: true } }, aplicaciones: { select: { monto: true } } },
      orderBy: [{ fecha: 'desc' }, { creadoEn: 'desc' }],
      take: 300,
    });
  }
}
