import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { CategoriaCosto, Prisma } from '@prisma/client';
import { esAdmin, UsuarioSesion } from '../auth/sucursal-scope';
import { costoPromedio } from '../compras/compras.service';
import { CUENTA, debe, fechaLocal, fechaUtc, haber } from '../contabilidad/asientos';
import { ContabilidadService } from '../contabilidad/contabilidad.service';
import { PrismaService } from '../prisma/prisma.service';
import { peso, ZERO } from '../utils/money.util';
import { exigirPeriodoAbierto } from '../utils/periodos';
import { TX_OPCIONES } from '../utils/transacciones';
import { carenciaVigente, costosPorCuartel, CostoFila, finCarencia, liquidarTrabajador, montoLabor } from './calculo';
import {
  AnticipoTrabajadorDto,
  AplicacionDto,
  CosechaDto,
  CuartelDto,
  LaborDto,
  LiquidacionDto,
  PredioDto,
  PresupuestoDto,
  TemporadaDto,
  TrabajadorDto,
} from './dto/campo.dto';

type Tx = Prisma.TransactionClient;
const D = Prisma.Decimal;
const sinCero = <T extends { debe: Prisma.Decimal; haber: Prisma.Decimal }>(l: T[]) => l.filter((x) => !x.debe.isZero() || !x.haber.isZero());
const salida = (medio: string) => (medio === 'Efectivo' ? CUENTA.CAJA : CUENTA.BANCO);
const PRODUCCION_A_EXISTENCIAS = '5116';
const INSUMOS_AGRICOLAS = '5115';

@Injectable()
export class CampoService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly contabilidad: ContabilidadService,
  ) {}

  onModuleInit() {
    this.contabilidad.registrarFuente(async (tx, r) => {
      const [aplicaciones, cosechas, labores, anticipos, liquidaciones] = await Promise.all([
        tx.aplicacionFitosanitaria.findMany({ where: { estado: 'VIGENTE', fecha: r.utc }, include: { cuartel: { select: { nombre: true } } } }),
        tx.cosecha.findMany({ where: { estado: 'VIGENTE', fecha: r.local }, include: { cuartel: { select: { nombre: true } } } }),
        tx.labor.findMany({ where: { fecha: r.utc } }),
        tx.anticipoTrabajador.findMany({ where: { estado: 'VIGENTE', fecha: r.utc }, include: { trabajador: { select: { nombre: true } } } }),
        tx.liquidacionTrabajador.findMany({ where: { fechaPago: r.utc }, include: { trabajador: { select: { nombre: true } } } }),
      ]);
      // La mano de obra se devenga por día: un asiento diario con el total de labores.
      const porDia = new Map<string, Prisma.Decimal>();
      for (const l of labores) porDia.set(fechaUtc(l.fecha), (porDia.get(fechaUtc(l.fecha)) ?? ZERO).add(l.monto));
      return [
        ...aplicaciones.map((a) => ({
          fecha: fechaUtc(a.fecha),
          glosa: `Aplicación en ${a.cuartel.nombre}: ${a.objetivo}`,
          origenTipo: 'APLICACION',
          origenId: a.id,
          lineas: sinCero([debe(INSUMOS_AGRICOLAS, a.costo), haber(CUENTA.MERCADERIAS, a.costo)]),
        })),
        ...cosechas.map((c) => ({
          fecha: fechaLocal(c.fecha),
          glosa: `Cosecha ${c.cuartel.nombre}`,
          origenTipo: 'COSECHA',
          origenId: c.id,
          lineas: sinCero([debe(CUENTA.MERCADERIAS, c.costoTotal), haber(PRODUCCION_A_EXISTENCIAS, c.costoTotal)]),
        })),
        ...[...porDia.entries()].map(([dia, monto]) => ({
          fecha: dia,
          glosa: 'Mano de obra del día (jornadas y tratos)',
          origenTipo: 'LABORES',
          origenId: dia,
          lineas: sinCero([debe(CUENTA.MANO_OBRA, monto), haber(CUENTA.REMUNERACIONES_POR_PAGAR, monto)]),
        })),
        ...anticipos.map((a) => ({
          fecha: fechaUtc(a.fecha),
          glosa: `Anticipo a ${a.trabajador.nombre}`,
          origenTipo: 'ANTICIPO_TRABAJADOR',
          origenId: a.id,
          lineas: [debe(CUENTA.ANTICIPOS_PERSONAL, a.monto), haber(salida(a.medioPago), a.monto)],
        })),
        ...liquidaciones.map((l) => ({
          fecha: fechaUtc(l.fechaPago),
          glosa: `Pago a ${l.trabajador.nombre}`,
          origenTipo: 'LIQUIDACION_TRABAJADOR',
          origenId: l.id,
          lineas: sinCero([debe(CUENTA.REMUNERACIONES_POR_PAGAR, l.totalLabores), haber(CUENTA.ANTICIPOS_PERSONAL, l.anticipos), haber(salida(l.medioPago), l.aPagar)]),
        })),
      ];
    });
  }

  // ── Predios, cuarteles y temporadas ──

  predios() {
    return this.prisma.predio.findMany({ include: { cuarteles: { orderBy: { nombre: 'asc' } } }, orderBy: { nombre: 'asc' } });
  }

  crearPredio(dto: PredioDto) {
    return this.prisma.predio.create({ data: { ...dto, nombre: dto.nombre.trim() } });
  }

  actualizarPredio(id: string, dto: PredioDto) {
    return this.prisma.predio.update({ where: { id }, data: dto });
  }

  crearCuartel(dto: CuartelDto) {
    return this.prisma.cuartel.create({ data: { ...dto, nombre: dto.nombre.trim() } });
  }

  actualizarCuartel(id: string, dto: CuartelDto) {
    return this.prisma.cuartel.update({ where: { id }, data: dto });
  }

  temporadas() {
    return this.prisma.temporada.findMany({ orderBy: { fechaInicio: 'desc' } });
  }

  crearTemporada(dto: TemporadaDto) {
    if (dto.fechaFin <= dto.fechaInicio) throw new BadRequestException('La temporada debe terminar después de empezar.');
    return this.prisma.temporada.create({ data: { nombre: dto.nombre.trim(), fechaInicio: new Date(dto.fechaInicio), fechaFin: new Date(dto.fechaFin) } });
  }

  private async exigirCuartel(db: Tx | PrismaService, id: string) {
    const c = await db.cuartel.findUnique({ where: { id } });
    if (!c || !c.activo) throw new BadRequestException('El cuartel no existe o está inactivo.');
    return c;
  }

  private async exigirTemporada(db: Tx | PrismaService, id: string, fecha?: string) {
    const t = await db.temporada.findUnique({ where: { id } });
    if (!t) throw new BadRequestException('La temporada no existe.');
    if (fecha && (fecha < fechaUtc(t.fechaInicio) || fecha > fechaUtc(t.fechaFin))) {
      throw new BadRequestException(`La fecha está fuera de la temporada ${t.nombre}.`);
    }
    return t;
  }

  private exigirLocal(user: UsuarioSesion, sucursalId: string) {
    if (!esAdmin(user) && user.sucursalId !== sucursalId) throw new ForbiddenException('Solo puedes mover stock de tu sucursal.');
  }

  // ── Cuaderno de campo ──

  async aplicar(dto: AplicacionDto, user: UsuarioSesion) {
    this.exigirLocal(user, dto.sucursalId);
    return this.prisma.$transaction(async (tx) => {
      await exigirPeriodoAbierto(tx, dto.fecha);
      const cuartel = await this.exigirCuartel(tx, dto.cuartelId);
      await this.exigirTemporada(tx, dto.temporadaId, dto.fecha);
      const item = await tx.item.findUnique({ where: { id: dto.itemId } });
      if (!item) throw new BadRequestException('El producto aplicado no existe.');
      const cantidad = new D(dto.dosisPorHa).mul(cuartel.hectareas).toDecimalPlaces(3);
      const { count } = await tx.stockLocal.updateMany({
        where: { sucursalId: dto.sucursalId, itemId: item.id, stockActual: { gte: cantidad } },
        data: { stockActual: { decrement: cantidad } },
      });
      if (count !== 1) throw new BadRequestException(`No hay ${cantidad} ${item.unidadMedida} de "${item.nombre}" en bodega.`);
      return tx.aplicacionFitosanitaria.create({
        data: {
          ...dto,
          fecha: new Date(dto.fecha),
          objetivo: dto.objetivo.trim(),
          aplicador: dto.aplicador.trim(),
          usuarioId: user.id,
          cantidad,
          costo: peso(cantidad.mul(item.costoPromedio)),
        },
      });
    }, TX_OPCIONES);
  }

  async anularAplicacion(id: string, user: UsuarioSesion) {
    return this.prisma.$transaction(async (tx) => {
      const { count } = await tx.aplicacionFitosanitaria.updateMany({ where: { id, estado: 'VIGENTE' }, data: { estado: 'ANULADO' } });
      if (count !== 1) throw new BadRequestException('La aplicación no existe o ya está anulada.');
      const a = await tx.aplicacionFitosanitaria.findUniqueOrThrow({ where: { id } });
      this.exigirLocal(user, a.sucursalId);
      await exigirPeriodoAbierto(tx, a.fecha, true);
      await tx.stockLocal.update({ where: { sucursalId_itemId: { sucursalId: a.sucursalId, itemId: a.itemId } }, data: { stockActual: { increment: a.cantidad } } });
      return a;
    }, TX_OPCIONES);
  }

  aplicaciones(filtros: { cuartelId?: string; temporadaId?: string }) {
    return this.prisma.aplicacionFitosanitaria.findMany({
      where: { ...(filtros.cuartelId && { cuartelId: filtros.cuartelId }), ...(filtros.temporadaId && { temporadaId: filtros.temporadaId }) },
      include: { cuartel: { select: { nombre: true, predio: { select: { nombre: true } } } }, item: { select: { nombre: true, unidadMedida: true } } },
      orderBy: [{ fecha: 'desc' }, { creadoEn: 'desc' }],
      take: 500,
    });
  }

  /** Cuarteles donde hoy no se puede cosechar, con la fecha desde la que se podrá. */
  async carencias() {
    const hoy = fechaLocal(new Date());
    const desde = new Date(Date.now() - 400 * 86_400_000);
    const aps = await this.prisma.aplicacionFitosanitaria.findMany({
      where: { estado: 'VIGENTE', fecha: { gte: desde } },
      include: { cuartel: { select: { id: true, nombre: true, predio: { select: { nombre: true } } } } },
    });
    const porCuartel = new Map<string, typeof aps>();
    for (const a of aps) porCuartel.set(a.cuartelId, [...(porCuartel.get(a.cuartelId) ?? []), a]);
    return [...porCuartel.values()]
      .map((lista) => ({ cuartel: lista[0].cuartel, carencia: carenciaVigente(lista, hoy) }))
      .filter((c) => c.carencia)
      .map((c) => ({ cuartel: c.cuartel, cosecharDesde: c.carencia!.hasta, objetivo: c.carencia!.objetivo }));
  }

  // ── Costos ──

  private async costos(db: Tx | PrismaService, temporadaId: string, cuartelId?: string): Promise<CostoFila[]> {
    const filtro = { temporadaId, ...(cuartelId ? { cuartelId } : { cuartelId: { not: null } }) };
    const [aps, labores, gastos] = await Promise.all([
      db.aplicacionFitosanitaria.groupBy({ by: ['cuartelId'], where: { temporadaId, estado: 'VIGENTE', ...(cuartelId && { cuartelId }) }, _sum: { costo: true } }),
      db.labor.groupBy({ by: ['cuartelId'], where: filtro, _sum: { monto: true } }),
      db.gastoOperacional.groupBy({ by: ['cuartelId', 'categoriaCosto'], where: { ...filtro, estado: 'VIGENTE' }, _sum: { monto: true } }),
    ]);
    return [
      ...aps.map((a) => ({ cuartelId: a.cuartelId, categoria: 'INSUMOS' as CategoriaCosto, monto: a._sum?.costo ?? ZERO })),
      ...labores.map((l) => ({ cuartelId: l.cuartelId!, categoria: 'MANO_OBRA' as CategoriaCosto, monto: l._sum.monto ?? ZERO })),
      ...gastos.map((g) => ({ cuartelId: g.cuartelId!, categoria: g.categoriaCosto ?? ('OTROS' as CategoriaCosto), monto: g._sum.monto ?? ZERO })),
    ];
  }

  async informeCostos(temporadaId: string) {
    const temporada = await this.exigirTemporada(this.prisma, temporadaId);
    const [cuarteles, costos, presupuestos, cosechas] = await Promise.all([
      this.prisma.cuartel.findMany({ include: { predio: { select: { nombre: true } } }, orderBy: [{ predio: { nombre: 'asc' } }, { nombre: 'asc' }] }),
      this.costos(this.prisma, temporadaId),
      this.prisma.presupuesto.findMany({ where: { temporadaId } }),
      this.prisma.cosecha.groupBy({ by: ['cuartelId'], where: { temporadaId, estado: 'VIGENTE' }, _sum: { kilos: true } }),
    ]);
    const filas = costosPorCuartel(
      cuarteles.map((c) => ({ id: c.id, nombre: c.nombre, predio: c.predio.nombre, cultivo: c.cultivo, hectareas: c.hectareas })),
      costos,
      presupuestos.map((p) => ({ cuartelId: p.cuartelId, categoria: p.categoria, monto: p.monto })),
      cosechas.map((c) => ({ cuartelId: c.cuartelId, kilos: c._sum.kilos ?? ZERO })),
    );
    return { temporada, cuarteles: filas };
  }

  async guardarPresupuesto(temporadaId: string, dto: PresupuestoDto) {
    await this.exigirTemporada(this.prisma, temporadaId);
    return this.prisma.$transaction(async (tx) => {
      for (const l of dto.lineas) {
        await tx.presupuesto.upsert({
          where: { temporadaId_cuartelId_categoria: { temporadaId, cuartelId: l.cuartelId, categoria: l.categoria } },
          update: { monto: l.monto },
          create: { temporadaId, cuartelId: l.cuartelId, categoria: l.categoria, monto: l.monto },
        });
      }
      return tx.presupuesto.findMany({ where: { temporadaId } });
    });
  }

  // ── Cosecha ──

  async cosechar(dto: CosechaDto, user: UsuarioSesion) {
    this.exigirLocal(user, dto.sucursalId);
    const hoy = fechaLocal(new Date());
    return this.prisma.$transaction(async (tx) => {
      await exigirPeriodoAbierto(tx, hoy);
      await tx.$queryRaw`SELECT id FROM cuarteles WHERE id = ${dto.cuartelId}::uuid FOR UPDATE`;
      const cuartel = await this.exigirCuartel(tx, dto.cuartelId);
      await this.exigirTemporada(tx, dto.temporadaId, hoy);
      const item = await tx.item.findUnique({ where: { id: dto.itemId } });
      if (!item || item.estado !== 'Activo') throw new BadRequestException('El producto no existe o está inactivo.');
      const aps = await tx.aplicacionFitosanitaria.findMany({ where: { cuartelId: cuartel.id, estado: 'VIGENTE' } });
      const carencia = carenciaVigente(aps, hoy);
      if (carencia) {
        throw new ConflictException(`${cuartel.nombre} está en carencia por "${carencia.objetivo}": se puede cosechar desde el ${carencia.hasta}.`);
      }
      // El costo aún no traspasado del cuartel en la temporada pasa a esta cosecha.
      const acumulado = (await this.costos(tx, dto.temporadaId, cuartel.id)).reduce((s, c) => s.add(c.monto), ZERO);
      const { _sum } = await tx.cosecha.aggregate({ where: { cuartelId: cuartel.id, temporadaId: dto.temporadaId, estado: 'VIGENTE' }, _sum: { costoTotal: true } });
      const costoTotal = D.max(acumulado.sub(_sum.costoTotal ?? ZERO), 0);
      const kilos = new D(dto.kilos);
      const costoKilo = peso(costoTotal.div(kilos));

      const n = (await tx.cosecha.count()) + 1;
      const lote = await tx.lote.create({
        data: {
          codigo: `CO-${n}`,
          itemId: item.id,
          sucursalId: dto.sucursalId,
          origen: 'COSECHA',
          cuartelId: cuartel.id,
          fechaVencimiento: dto.fechaVencimiento ? new Date(dto.fechaVencimiento) : null,
          cantidadInicial: kilos,
          cantidadActual: kilos,
        },
      });
      await tx.$queryRaw`SELECT id FROM items WHERE id = ${item.id}::uuid FOR UPDATE`;
      const stock = await tx.stockLocal.aggregate({ where: { itemId: item.id }, _sum: { stockActual: true } });
      const nuevo = costoPromedio('ingreso', stock._sum.stockActual ?? ZERO, item.costoPromedio, kilos, costoKilo);
      if (nuevo) await tx.item.update({ where: { id: item.id }, data: { costoPromedio: nuevo } });
      await tx.stockLocal.upsert({
        where: { sucursalId_itemId: { sucursalId: dto.sucursalId, itemId: item.id } },
        update: { stockActual: { increment: kilos } },
        create: { sucursalId: dto.sucursalId, itemId: item.id, stockActual: kilos },
      });
      return tx.cosecha.create({
        data: { cuartelId: cuartel.id, temporadaId: dto.temporadaId, itemId: item.id, sucursalId: dto.sucursalId, usuarioId: user.id, kilos, costoKilo, costoTotal, loteId: lote.id },
        include: { lote: { select: { codigo: true } }, cuartel: { select: { nombre: true } } },
      });
    }, TX_OPCIONES);
  }

  async anularCosecha(id: string, user: UsuarioSesion) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM cosechas WHERE id = ${id}::uuid FOR UPDATE`;
      const c = await tx.cosecha.findUnique({ where: { id } });
      if (!c) throw new NotFoundException('Cosecha no encontrada');
      this.exigirLocal(user, c.sucursalId);
      if (c.estado !== 'VIGENTE') throw new BadRequestException('La cosecha ya está anulada.');
      await exigirPeriodoAbierto(tx, c.fecha);
      const lote = await tx.lote.updateMany({ where: { id: c.loteId!, cantidadActual: c.kilos }, data: { cantidadActual: 0 } });
      if (lote.count !== 1) throw new BadRequestException('Parte de esta cosecha ya salió de bodega; no se puede anular.');
      const stock = await tx.stockLocal.updateMany({
        where: { sucursalId: c.sucursalId, itemId: c.itemId, stockActual: { gte: c.kilos } },
        data: { stockActual: { decrement: c.kilos } },
      });
      if (stock.count !== 1) throw new BadRequestException('No hay stock suficiente para anular la cosecha.');
      await tx.$queryRaw`SELECT id FROM items WHERE id = ${c.itemId}::uuid FOR UPDATE`;
      const item = await tx.item.findUniqueOrThrow({ where: { id: c.itemId } });
      const total = await tx.stockLocal.aggregate({ where: { itemId: c.itemId }, _sum: { stockActual: true } });
      const costo = costoPromedio('reverso', total._sum.stockActual ?? ZERO, item.costoPromedio, c.kilos, c.costoKilo);
      if (costo) await tx.item.update({ where: { id: c.itemId }, data: { costoPromedio: costo } });
      return tx.cosecha.update({ where: { id }, data: { estado: 'ANULADO' } });
    }, TX_OPCIONES);
  }

  cosechas(temporadaId?: string) {
    return this.prisma.cosecha.findMany({
      where: temporadaId ? { temporadaId } : undefined,
      include: { cuartel: { select: { nombre: true } }, item: { select: { nombre: true } }, lote: { select: { codigo: true } } },
      orderBy: { fecha: 'desc' },
      take: 300,
    });
  }

  // ── Trabajadores ──

  trabajadores() {
    return this.prisma.trabajador.findMany({
      include: { contratista: { select: { id: true, nombreRazonSocial: true, f30Vigencia: true } } },
      orderBy: { nombre: 'asc' },
    });
  }

  async crearTrabajador(dto: TrabajadorDto) {
    await this.validarContratista(dto);
    return this.prisma.trabajador.create({ data: { ...dto, rut: dto.rut.replace(/\./g, '').toUpperCase(), nombre: dto.nombre.trim() } });
  }

  async actualizarTrabajador(id: string, dto: TrabajadorDto) {
    await this.validarContratista(dto);
    return this.prisma.trabajador.update({ where: { id }, data: { ...dto, rut: dto.rut.replace(/\./g, '').toUpperCase() } });
  }

  private async validarContratista(dto: TrabajadorDto) {
    if (dto.tipo === 'CONTRATISTA') {
      if (!dto.contratistaId) throw new BadRequestException('Indica la empresa contratista.');
      const e = await this.prisma.entidad.findUnique({ where: { id: dto.contratistaId } });
      if (!e || e.tipoEntidad !== 'PROVEEDOR') throw new BadRequestException('La empresa contratista debe estar registrada como proveedor.');
    } else if (dto.contratistaId) {
      throw new BadRequestException('Un trabajador propio no tiene contratista.');
    }
  }

  async registrarLabor(dto: LaborDto) {
    const t = await this.prisma.trabajador.findUnique({ where: { id: dto.trabajadorId }, include: { contratista: true } });
    if (!t || !t.activo) throw new BadRequestException('El trabajador no existe o está inactivo.');
    if (dto.cuartelId) await this.exigirCuartel(this.prisma, dto.cuartelId);
    if (dto.temporadaId) await this.exigirTemporada(this.prisma, dto.temporadaId, dto.fecha);
    if (dto.cuartelId && !dto.temporadaId) throw new BadRequestException('Indica la temporada para imputar la labor al cuartel.');
    const tarifa = dto.tarifa ?? (dto.tipo === 'JORNADA' ? Number(t.valorJornada) : undefined);
    if (tarifa === undefined) throw new BadRequestException('Indica la tarifa del trato.');
    await exigirPeriodoAbierto(this.prisma, dto.fecha);
    const labor = await this.prisma.labor.create({
      data: { ...dto, descripcion: dto.descripcion.trim(), fecha: new Date(dto.fecha), tarifa, monto: montoLabor(dto.cantidad, tarifa) },
    });
    const vence = t.contratista?.f30Vigencia;
    const advertencia =
      t.tipo === 'CONTRATISTA' && (!vence || fechaUtc(vence) < dto.fecha)
        ? `El certificado F30-1 de ${t.contratista!.nombreRazonSocial} no está vigente: si no cumple, la empresa responde por sus cotizaciones.`
        : null;
    return { ...labor, advertencia };
  }

  async eliminarLabor(id: string) {
    const l = await this.prisma.labor.findUnique({ where: { id } });
    if (!l) throw new NotFoundException('Labor no encontrada');
    if (l.liquidacionId) throw new BadRequestException('La labor ya está pagada.');
    await exigirPeriodoAbierto(this.prisma, l.fecha, true);
    return this.prisma.labor.delete({ where: { id } });
  }

  labores(filtros: { trabajadorId?: string; desde?: string; hasta?: string; pendientes?: boolean }) {
    return this.prisma.labor.findMany({
      where: {
        ...(filtros.trabajadorId && { trabajadorId: filtros.trabajadorId }),
        ...(filtros.pendientes && { liquidacionId: null }),
        ...((filtros.desde || filtros.hasta) && {
          fecha: { ...(filtros.desde && { gte: new Date(filtros.desde) }), ...(filtros.hasta && { lte: new Date(filtros.hasta) }) },
        }),
      },
      include: { trabajador: { select: { nombre: true, rut: true } }, cuartel: { select: { nombre: true } } },
      orderBy: [{ fecha: 'desc' }, { creadoEn: 'desc' }],
      take: 1000,
    });
  }

  async anticipoTrabajador(dto: AnticipoTrabajadorDto) {
    const t = await this.prisma.trabajador.findUnique({ where: { id: dto.trabajadorId } });
    if (!t) throw new BadRequestException('El trabajador no existe.');
    const fecha = dto.fecha ?? fechaLocal(new Date());
    await exigirPeriodoAbierto(this.prisma, fecha);
    return this.prisma.anticipoTrabajador.create({ data: { trabajadorId: t.id, monto: dto.monto, medioPago: dto.medioPago, fecha: new Date(fecha) } });
  }

  /** Paga las labores pendientes hasta la fecha y descuenta los anticipos que caben. */
  async liquidar(dto: LiquidacionDto) {
    const hoy = fechaLocal(new Date());
    return this.prisma.$transaction(async (tx) => {
      await exigirPeriodoAbierto(tx, hoy);
      await tx.$queryRaw`SELECT id FROM trabajadores WHERE id = ${dto.trabajadorId}::uuid FOR UPDATE`;
      const labores = await tx.labor.findMany({ where: { trabajadorId: dto.trabajadorId, liquidacionId: null, fecha: { lte: new Date(dto.hasta) } } });
      if (!labores.length) throw new BadRequestException('No hay labores pendientes de pago hasta esa fecha.');
      const anticipos = await tx.anticipoTrabajador.findMany({
        where: { trabajadorId: dto.trabajadorId, estado: 'VIGENTE', liquidacionId: null },
        orderBy: { fecha: 'asc' },
      });
      const r = liquidarTrabajador(labores.reduce((s, l) => s.add(l.monto), ZERO), anticipos);
      const liq = await tx.liquidacionTrabajador.create({
        data: {
          trabajadorId: dto.trabajadorId,
          hasta: new Date(dto.hasta),
          totalLabores: r.totalLabores,
          anticipos: r.anticipos,
          aPagar: r.aPagar,
          fechaPago: new Date(hoy),
          medioPago: dto.medioPago,
        },
      });
      await tx.labor.updateMany({ where: { id: { in: labores.map((l) => l.id) } }, data: { liquidacionId: liq.id } });
      if (r.aplicados.length) await tx.anticipoTrabajador.updateMany({ where: { id: { in: r.aplicados } }, data: { liquidacionId: liq.id } });
      return tx.liquidacionTrabajador.findUniqueOrThrow({ where: { id: liq.id }, include: { trabajador: true, labores: true } });
    }, TX_OPCIONES);
  }

  liquidaciones(desde?: string, hasta?: string) {
    return this.prisma.liquidacionTrabajador.findMany({
      where: desde || hasta ? { fechaPago: { ...(desde && { gte: new Date(desde) }), ...(hasta && { lte: new Date(hasta) }) } } : undefined,
      include: { trabajador: { include: { contratista: { select: { nombreRazonSocial: true } } } } },
      orderBy: { creadoEn: 'desc' },
      take: 500,
    });
  }

  anticiposTrabajador() {
    return this.prisma.anticipoTrabajador.findMany({ include: { trabajador: { select: { nombre: true } } }, orderBy: { fecha: 'desc' }, take: 300 });
  }

  async actualizarF30(entidadId: string, vigencia: string | null | undefined) {
    const e = await this.prisma.entidad.findUnique({ where: { id: entidadId } });
    if (!e || e.tipoEntidad !== 'PROVEEDOR') throw new NotFoundException('Contratista no encontrado');
    return this.prisma.entidad.update({ where: { id: entidadId }, data: { f30Vigencia: vigencia ? new Date(vigencia) : null } });
  }

  /** Contratistas con trabajadores activos y certificado F30-1 vencido o sin registrar. */
  async alertasContratistas() {
    const hoy = fechaLocal(new Date());
    const contratistas = await this.prisma.entidad.findMany({
      where: { trabajadores: { some: { activo: true, tipo: 'CONTRATISTA' } } },
      select: { id: true, rut: true, nombreRazonSocial: true, f30Vigencia: true, _count: { select: { trabajadores: true } } },
    });
    return contratistas.filter((c) => !c.f30Vigencia || fechaUtc(c.f30Vigencia) < hoy);
  }

  /** Para la ficha del cuartel: la carencia que hoy impide cosechar, si la hay. */
  async estadoCuartel(id: string) {
    const cuartel = await this.prisma.cuartel.findUnique({ where: { id }, include: { predio: true } });
    if (!cuartel) throw new NotFoundException('Cuartel no encontrado');
    const aps = await this.prisma.aplicacionFitosanitaria.findMany({ where: { cuartelId: id, estado: 'VIGENTE' }, orderBy: { fecha: 'desc' } });
    const carencia = carenciaVigente(aps, fechaLocal(new Date()));
    return { cuartel, carencia, ultimas: aps.slice(0, 10).map((a) => ({ ...a, cosecharDesde: finCarencia(a.fecha, a.carenciaDias) })) };
  }
}
