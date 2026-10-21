import { BadRequestException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { MedioPago, Prisma } from '@prisma/client';
import { Borrador, CUENTA, debe, fechaLocal, fechaUtc, haber } from '../contabilidad/asientos';
import { ContabilidadService } from '../contabilidad/contabilidad.service';
import { CuentasService } from '../cuentas/cuentas.service';
import { PrismaService } from '../prisma/prisma.service';
import { TributarioService } from '../tributario/tributario.service';
import { ZERO } from '../utils/money.util';
import { exigirPeriodoAbierto } from '../utils/periodos';
import { cuotaDepreciacion, depreciacionAcumulada, mesesDesde, Movimiento, proyectarFlujo, sumarDias, valorLibro } from './calculo';
import { leerCartola } from './cartola';
import { ActivoDto, ConciliarDto, CuentaBancariaDto } from './dto/finanzas.dto';

const BAJA_ACTIVO = '5117';
const ultimoDia = (mes: string) => {
  const [a, m] = mes.split('-').map(Number);
  return new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10);
};
const cuentaPago = (medio: MedioPago | null) => (medio === 'Efectivo' ? CUENTA.CAJA : medio === 'Transferencia' ? CUENTA.BANCO : CUENTA.PROVEEDORES);

export interface Candidato {
  tipo: string;
  id: string;
  fecha: string;
  monto: number;
  detalle: string;
}

@Injectable()
export class FinanzasService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly contabilidad: ContabilidadService,
    private readonly tributario: TributarioService,
  ) {}

  onModuleInit() {
    this.contabilidad.registrarFuente(async (tx, r) => {
      const [movs, activos] = await Promise.all([
        tx.movimientoBancario.findMany({ where: { fecha: r.utc, cuentaCodigo: { not: null } } }),
        tx.activoFijo.findMany({ where: { fechaCompra: { lt: r.utc.lt } } }),
      ]);
      const finMes = ultimoDia(r.mes);
      return [
        // Movimientos sin documento: la contrapartida es la cuenta elegida al conciliar.
        ...movs.map((m) => ({
          fecha: fechaUtc(m.fecha),
          glosa: `Banco: ${m.descripcion}`,
          origenTipo: 'BANCO',
          origenId: m.id,
          lineas: m.monto.isPos() ? [debe(CUENTA.BANCO, m.monto), haber(m.cuentaCodigo!, m.monto)] : [debe(m.cuentaCodigo!, m.monto.abs()), haber(CUENTA.BANCO, m.monto.abs())],
        })),
        ...activos.flatMap((a) => {
          const salida: Borrador[] = [];
          if (fechaUtc(a.fechaCompra).startsWith(r.mes)) {
            salida.push({
              fecha: fechaUtc(a.fechaCompra),
              glosa: `Compra de activo: ${a.nombre}`,
              origenTipo: 'ACTIVO_ALTA',
              origenId: a.id,
              lineas: [debe(CUENTA.ACTIVO_FIJO, a.valorCompra), debe(CUENTA.IVA_CREDITO, a.ivaCredito), haber(cuentaPago(a.medioPago), a.valorCompra.add(a.ivaCredito))].filter((l) => !l.debe.isZero() || !l.haber.isZero()),
            });
          }
          const mesBaja = a.fechaBaja ? fechaUtc(a.fechaBaja).slice(0, 7) : null;
          if (!mesBaja || r.mes <= mesBaja) {
            const cuota = cuotaDepreciacion(a.valorCompra, a.valorResidual, a.vidaUtilMeses, mesesDesde(a.fechaCompra, r.mes));
            if (cuota.gt(0)) {
              salida.push({ fecha: finMes, glosa: `Depreciación: ${a.nombre}`, origenTipo: 'DEPRECIACION', origenId: `${a.id}:${r.mes}`, lineas: [debe(CUENTA.DEPRECIACION, cuota), haber(CUENTA.DEPRECIACION_ACUMULADA, cuota)] });
            }
          }
          if (mesBaja === r.mes) {
            const acumulada = depreciacionAcumulada(a.valorCompra, a.valorResidual, a.vidaUtilMeses, mesesDesde(a.fechaCompra, r.mes));
            salida.push({
              fecha: finMes,
              glosa: `Baja de activo: ${a.nombre}`,
              origenTipo: 'ACTIVO_BAJA',
              origenId: a.id,
              lineas: [debe(CUENTA.DEPRECIACION_ACUMULADA, acumulada), debe(BAJA_ACTIVO, a.valorCompra.sub(acumulada)), haber(CUENTA.ACTIVO_FIJO, a.valorCompra)].filter((l) => !l.debe.isZero() || !l.haber.isZero()),
            });
          }
          return salida;
        }),
      ];
    });
  }

  // ── Bancos ──

  async cuentasBancarias() {
    const cuentas = await this.prisma.cuentaBancaria.findMany({ orderBy: { banco: 'asc' } });
    const sumas = await this.prisma.movimientoBancario.groupBy({ by: ['cuentaBancariaId'], _sum: { monto: true } });
    const pendientes = await this.prisma.movimientoBancario.groupBy({
      by: ['cuentaBancariaId'],
      where: { conciliadoTipo: null, cuentaCodigo: null },
      _count: { _all: true },
    });
    return cuentas.map((c) => ({
      ...c,
      saldoCartola: c.saldoInicial.add(sumas.find((s) => s.cuentaBancariaId === c.id)?._sum.monto ?? ZERO),
      porConciliar: pendientes.find((p) => p.cuentaBancariaId === c.id)?._count._all ?? 0,
    }));
  }

  crearCuentaBancaria(dto: CuentaBancariaDto) {
    return this.prisma.cuentaBancaria.create({ data: { ...dto, fechaSaldoInicial: new Date(dto.fechaSaldoInicial) } });
  }

  /** Importa la cartola; los movimientos ya importados (misma huella) se omiten. */
  async importarCartola(cuentaId: string, contenido: string) {
    const cuenta = await this.prisma.cuentaBancaria.findUnique({ where: { id: cuentaId } });
    if (!cuenta) throw new NotFoundException('Cuenta bancaria no encontrada');
    const lineas = leerCartola(contenido);
    const { count } = await this.prisma.movimientoBancario.createMany({
      data: lineas.map((l) => ({ cuentaBancariaId: cuentaId, fecha: new Date(l.fecha), descripcion: l.descripcion, monto: l.monto, huella: l.huella })),
      skipDuplicates: true,
    });
    return { leidos: lineas.length, nuevos: count, repetidos: lineas.length - count };
  }

  movimientos(cuentaId: string, pendientes: boolean) {
    return this.prisma.movimientoBancario.findMany({
      where: { cuentaBancariaId: cuentaId, ...(pendientes && { conciliadoTipo: null, cuentaCodigo: null }) },
      include: { cuenta: { select: { nombre: true } } },
      orderBy: [{ fecha: 'desc' }, { creadoEn: 'desc' }],
      take: 500,
    });
  }

  /** Documentos pagados o cobrados por banco que podrían explicar el movimiento. */
  private async candidatos(desde: Date, hasta: Date): Promise<Candidato[]> {
    const rango = { gte: desde, lte: hasta };
    const t = 'Transferencia' as const;
    const [facturas, gastos, productores, antProd, liquidaciones, antTrab, abonos, ventas, partes, activos] = await Promise.all([
      this.prisma.facturaCompra.findMany({ where: { estado: 'VIGENTE', estadoPago: 'PAGADO', medioPago: t, fechaPago: rango }, include: { proveedor: true } }),
      this.prisma.gastoOperacional.findMany({ where: { estado: 'VIGENTE', estadoPago: 'PAGADO', medioPago: { in: [t, 'Tarjeta'] }, fechaPago: rango } }),
      this.prisma.recepcionProductor.findMany({ where: { estado: 'VIGENTE', estadoPago: 'PAGADO', medioPago: t, fechaPago: rango }, include: { productor: true } }),
      this.prisma.anticipoProductor.findMany({ where: { estado: 'VIGENTE', medioPago: t, fecha: rango }, include: { productor: true } }),
      this.prisma.liquidacionTrabajador.findMany({ where: { medioPago: t, fechaPago: rango }, include: { trabajador: true } }),
      this.prisma.anticipoTrabajador.findMany({ where: { estado: 'VIGENTE', medioPago: t, fecha: rango }, include: { trabajador: true } }),
      this.prisma.abonoCliente.findMany({ where: { estado: 'VIGENTE', medioPago: t, fecha: rango } }),
      this.prisma.transaccion.findMany({ where: { estado: 'Activa', tipoTransaccion: 'VENTA', medioPago: t, pagos: { none: {} }, fechaRegistro: rango } }),
      this.prisma.pagoTransaccion.findMany({ where: { medioPago: t, transaccion: { estado: 'Activa', fechaRegistro: rango } }, include: { transaccion: true } }),
      this.prisma.activoFijo.findMany({ where: { medioPago: t, fechaCompra: rango } }),
    ]);
    const n = (v: Prisma.Decimal) => Number(v);
    return [
      ...facturas.map((f) => ({ tipo: 'PAGO_FACTURA', id: f.id, fecha: fechaUtc(f.fechaPago!), monto: -n(f.montoTotal), detalle: `Pago factura ${f.folio} de ${f.proveedor.nombreRazonSocial}` })),
      ...gastos.map((g) => ({ tipo: 'PAGO_GASTO', id: g.id, fecha: fechaUtc(g.fechaPago!), monto: -n(g.total.sub(g.retencion)), detalle: `Gasto: ${g.descripcion}` })),
      ...productores.map((p) => ({ tipo: 'PAGO_PRODUCTOR', id: p.id, fecha: fechaUtc(p.fechaPago!), monto: -n(p.montoAPagar.sub(p.anticipoAplicado)), detalle: `Pago a ${p.productor.nombreRazonSocial} (recepción ${p.folio})` })),
      ...antProd.map((a) => ({ tipo: 'ANTICIPO_PRODUCTOR', id: a.id, fecha: fechaUtc(a.fecha), monto: -n(a.monto), detalle: `Anticipo a ${a.productor.nombreRazonSocial}` })),
      ...liquidaciones.map((l) => ({ tipo: 'LIQUIDACION_TRABAJADOR', id: l.id, fecha: fechaUtc(l.fechaPago), monto: -n(l.aPagar), detalle: `Pago a ${l.trabajador.nombre}` })),
      ...antTrab.map((a) => ({ tipo: 'ANTICIPO_TRABAJADOR', id: a.id, fecha: fechaUtc(a.fecha), monto: -n(a.monto), detalle: `Anticipo a ${a.trabajador.nombre}` })),
      ...activos.map((a) => ({ tipo: 'ACTIVO_ALTA', id: a.id, fecha: fechaUtc(a.fechaCompra), monto: -n(a.valorCompra.add(a.ivaCredito)), detalle: `Compra de ${a.nombre}` })),
      ...abonos.map((a) => ({ tipo: 'ABONO', id: a.id, fecha: fechaLocal(a.fecha), monto: n(a.monto), detalle: 'Abono de cliente' })),
      ...ventas.map((v) => ({ tipo: 'VENTA', id: v.id, fecha: fechaLocal(v.fechaRegistro), monto: n(v.montoTotal), detalle: `Venta ${v.numeroFactura ?? ''} por transferencia` })),
      ...partes.map((p) => ({ tipo: 'PAGO_VENTA', id: p.id, fecha: fechaLocal(p.transaccion.fechaRegistro), monto: n(p.monto), detalle: `Parte por transferencia de la venta ${p.transaccion.numeroFactura ?? ''}` })),
    ];
  }

  async sugerencias(movimientoId: string) {
    const m = await this.prisma.movimientoBancario.findUnique({ where: { id: movimientoId } });
    if (!m) throw new NotFoundException('Movimiento no encontrado');
    const desde = new Date(m.fecha.getTime() - 7 * 86_400_000);
    const hasta = new Date(m.fecha.getTime() + 7 * 86_400_000);
    const usados = new Set(
      (await this.prisma.movimientoBancario.findMany({ where: { conciliadoTipo: { not: null } }, select: { conciliadoTipo: true, conciliadoId: true } })).map((x) => `${x.conciliadoTipo}|${x.conciliadoId}`),
    );
    const dia = fechaUtc(m.fecha);
    return (await this.candidatos(desde, hasta))
      .filter((c) => c.monto === Number(m.monto) && !usados.has(`${c.tipo}|${c.id}`))
      .sort((a, b) => Math.abs(Date.parse(a.fecha) - Date.parse(dia)) - Math.abs(Date.parse(b.fecha) - Date.parse(dia)));
  }

  async conciliar(movimientoId: string, dto: ConciliarDto) {
    const m = await this.prisma.movimientoBancario.findUnique({ where: { id: movimientoId } });
    if (!m) throw new NotFoundException('Movimiento no encontrado');
    if (m.conciliadoTipo || m.cuentaCodigo) throw new BadRequestException('El movimiento ya está conciliado.');
    if (dto.cuentaCodigo) {
      const cuenta = await this.prisma.cuentaContable.findUnique({ where: { codigo: dto.cuentaCodigo } });
      if (!cuenta || !cuenta.activa || dto.cuentaCodigo === CUENTA.BANCO) throw new BadRequestException('Elige una cuenta contable válida.');
      await exigirPeriodoAbierto(this.prisma, m.fecha, true);
      return this.prisma.movimientoBancario.update({ where: { id: m.id }, data: { cuentaCodigo: dto.cuentaCodigo, conciliadoEn: new Date() } });
    }
    if (!dto.tipo || !dto.id) throw new BadRequestException('Indica el documento o la cuenta contable.');
    const candidato = (await this.sugerencias(m.id)).find((c) => c.tipo === dto.tipo && c.id === dto.id);
    if (!candidato) throw new BadRequestException('Ese documento no calza con el movimiento (monto, fecha o ya conciliado).');
    return this.prisma.movimientoBancario.update({ where: { id: m.id }, data: { conciliadoTipo: dto.tipo, conciliadoId: dto.id, conciliadoEn: new Date() } });
  }

  async desconciliar(movimientoId: string) {
    const m = await this.prisma.movimientoBancario.findUnique({ where: { id: movimientoId } });
    if (!m) throw new NotFoundException('Movimiento no encontrado');
    if (m.cuentaCodigo) await exigirPeriodoAbierto(this.prisma, m.fecha, true);
    return this.prisma.movimientoBancario.update({ where: { id: m.id }, data: { conciliadoTipo: null, conciliadoId: null, cuentaCodigo: null, conciliadoEn: null } });
  }

  // ── Flujo de caja ──

  async flujo(semanas: number) {
    if (!Number.isInteger(semanas) || semanas < 1 || semanas > 52) throw new BadRequestException('Entre 1 y 52 semanas.');
    const hoy = fechaLocal(new Date());
    const saldo = await this.contabilidad.saldo([CUENTA.CAJA, CUENTA.BANCO, CUENTA.TARJETAS], hoy);
    const [creditos, facturas, gastos, productores, labores] = await Promise.all([
      this.prisma.transaccion.findMany({ where: { tipoTransaccion: 'VENTA', medioPago: 'Credito', estado: 'Activa' }, include: { entidad: true } }),
      this.prisma.facturaCompra.findMany({ where: { estado: 'VIGENTE', estadoPago: 'POR_PAGAR' }, include: { proveedor: true } }),
      this.prisma.gastoOperacional.findMany({ where: { estado: 'VIGENTE', estadoPago: 'POR_PAGAR' } }),
      this.prisma.recepcionProductor.findMany({ where: { estado: 'VIGENTE', estadoPago: 'POR_PAGAR' }, include: { productor: true } }),
      this.prisma.labor.aggregate({ where: { liquidacionId: null }, _sum: { monto: true } }),
    ]);
    const movs: Movimiento[] = [];
    for (const v of creditos) {
      const pendiente = await CuentasService.saldoVenta(this.prisma, v.id);
      if (pendiente.gt(0)) {
        movs.push({ fecha: sumarDias(fechaLocal(v.fechaRegistro), v.entidad?.diasCredito ?? 30), monto: Number(pendiente), tipo: 'COBRO', detalle: `Cobro a ${v.entidad?.nombreRazonSocial ?? 'cliente'} (venta ${v.numeroFactura ?? ''})` });
      }
    }
    for (const f of facturas) {
      movs.push({ fecha: f.fechaVencimiento ? fechaUtc(f.fechaVencimiento) : sumarDias(fechaUtc(f.fechaEmision), 30), monto: -Number(f.montoTotal), tipo: 'PAGO', detalle: `Factura ${f.folio} de ${f.proveedor.nombreRazonSocial}` });
    }
    for (const g of gastos) {
      movs.push({ fecha: fechaUtc(g.fechaVencimiento ?? g.fechaRegistro), monto: -Number(g.total.sub(g.retencion)), tipo: 'PAGO', detalle: g.descripcion });
    }
    for (const p of productores) {
      movs.push({ fecha: sumarDias(fechaLocal(p.fecha), 30), monto: -Number(p.montoAPagar), tipo: 'PAGO', detalle: `Productor ${p.productor.nombreRazonSocial} (recepción ${p.folio})` });
    }
    const manoObra = Number(labores._sum.monto ?? 0);
    if (manoObra > 0) movs.push({ fecha: sumarDias(hoy, 6), monto: -manoObra, tipo: 'PAGO', detalle: 'Trabajadores de temporada (labores por pagar)' });
    // El F29 se paga el día 20: el del mes pasado si aún no llega esa fecha, y el del mes en curso.
    const mesActual = hoy.slice(0, 7);
    const [a, m] = mesActual.split('-').map(Number);
    const mesPasado = m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, '0')}`;
    const siguiente = m === 12 ? `${a + 1}-01` : `${a}-${String(m + 1).padStart(2, '0')}`;
    for (const [mes, vence] of [[mesPasado, `${mesActual}-20`], [mesActual, `${siguiente}-20`]] as const) {
      if (vence < hoy) continue;
      const r = await this.tributario.resumen(mes);
      if (Number(r.totalAPagar) > 0) movs.push({ fecha: vence, monto: -Number(r.totalAPagar), tipo: 'IMPUESTO', detalle: `IVA y retenciones de ${mes} (F29)` });
    }
    return proyectarFlujo(Number(saldo), movs, hoy, semanas);
  }

  // ── Activos fijos ──

  async activos() {
    const mes = fechaLocal(new Date()).slice(0, 7);
    const lista = await this.prisma.activoFijo.findMany({ orderBy: { fechaCompra: 'desc' } });
    return lista.map((a) => {
      const hasta = a.fechaBaja ? fechaUtc(a.fechaBaja).slice(0, 7) : mes;
      return { ...a, ...valorLibro(a, hasta), cuotaMensual: cuotaDepreciacion(a.valorCompra, a.valorResidual, a.vidaUtilMeses, 1) };
    });
  }

  async crearActivo(dto: ActivoDto) {
    if ((dto.valorResidual ?? 0) >= dto.valorCompra) throw new BadRequestException('El valor residual debe ser menor que el de compra.');
    await exigirPeriodoAbierto(this.prisma, dto.fechaCompra);
    return this.prisma.activoFijo.create({ data: { ...dto, fechaCompra: new Date(dto.fechaCompra), nombre: dto.nombre.trim(), categoria: dto.categoria.trim() } });
  }

  async bajaActivo(id: string, fecha: string) {
    const a = await this.prisma.activoFijo.findUnique({ where: { id } });
    if (!a) throw new NotFoundException('Activo no encontrado');
    if (a.estado === 'BAJA') throw new BadRequestException('El activo ya está dado de baja.');
    if (fecha < fechaUtc(a.fechaCompra)) throw new BadRequestException('La baja no puede ser anterior a la compra.');
    await exigirPeriodoAbierto(this.prisma, fecha);
    return this.prisma.activoFijo.update({ where: { id }, data: { estado: 'BAJA', fechaBaja: new Date(fecha) } });
  }
}
