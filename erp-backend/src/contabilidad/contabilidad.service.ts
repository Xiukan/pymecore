import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { dec, ZERO } from '../utils/money.util';
import { exigirPeriodoAbierto } from '../utils/periodos';
import { TX_OPCIONES } from '../utils/transacciones';
import {
  asientoAbono,
  asientoCierreCaja,
  asientoFacturaCompra,
  asientoGasto,
  asientoManual,
  asientoPagoProveedor,
  asientoRecepcion,
  asientoVenta,
  Borrador,
  debe,
  fechaLocal,
  fechaUtc,
  haber,
  Linea,
} from './asientos';
import { AsientoManualDto } from './dto/contabilidad.dto';
import { balanceOchoColumnas, estadoResultados, mayor, mesesEntre, SumaCuenta, validarMes } from './informes';

type Tx = Prisma.TransactionClient;
const MANUAL = 'MANUAL';

/** Origen de asientos adicional que aportan otros módulos (activos fijos, remuneraciones, bancos...). */
export type FuenteAsientos = (tx: Tx, rango: Rango) => Promise<(Borrador | null)[]>;

export interface Rango {
  mes: string;
  local: { gte: Date; lt: Date };
  utc: { gte: Date; lt: Date };
}

export function rangoDeMes(mes: string): Rango {
  const { a, m } = validarMes(mes);
  return {
    mes,
    local: { gte: new Date(a, m - 1, 1), lt: new Date(a, m, 1) },
    utc: { gte: new Date(Date.UTC(a, m - 1, 1)), lt: new Date(Date.UTC(a, m, 1)) },
  };
}

const fechaValida = (v: string | undefined, porDefecto: string) => {
  if (!v) return porDefecto;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(v))) throw new BadRequestException('Fecha inválida (AAAA-MM-DD).');
  return v;
};

@Injectable()
export class ContabilidadService {
  private readonly fuentes: FuenteAsientos[] = [];

  constructor(private readonly prisma: PrismaService) {}

  registrarFuente(fuente: FuenteAsientos) {
    this.fuentes.push(fuente);
  }

  /** Asientos automáticos del mes a partir de los documentos vigentes. */
  async borradores(tx: Tx, r: Rango): Promise<Borrador[]> {
    const [movs, recepciones, facturas, gastos, abonos, cajas] = await Promise.all([
      tx.transaccion.findMany({
        where: { estado: 'Activa', tipoTransaccion: { in: ['VENTA', 'DEVOLUCION', 'NOTA_CREDITO', 'MERMA'] }, fechaRegistro: r.local },
        include: { detalles: { select: { cantidad: true, costoUnitario: true, montoIva: true } }, pagos: true },
      }),
      tx.recepcionCompra.findMany({
        where: { estado: 'VIGENTE', fecha: r.local },
        include: { orden: { select: { folio: true } }, detalles: { include: { detalleOrden: { select: { costoUnitario: true } } } } },
      }),
      tx.facturaCompra.findMany({
        where: { estado: 'VIGENTE', OR: [{ fechaEmision: r.utc }, { estadoPago: 'PAGADO', fechaPago: r.utc }] },
      }),
      tx.gastoOperacional.findMany({
        where: { estado: 'VIGENTE', OR: [{ fechaRegistro: r.utc }, { estadoPago: 'PAGADO', fechaPago: r.utc }] },
        include: { categoria: { select: { cuentaCodigo: true } } },
      }),
      tx.abonoCliente.findMany({ where: { estado: 'VIGENTE', fecha: r.local } }),
      tx.sesionCaja.findMany({ where: { estado: 'CERRADA', cerradaEn: r.local, NOT: { diferencia: 0 } } }),
    ]);
    const enMes = (f: Date | null, utc: boolean) => !!f && (utc ? fechaUtc(f) : fechaLocal(f)).startsWith(r.mes);

    const lista: (Borrador | null)[] = [
      ...movs.map((t) =>
        asientoVenta({
          id: t.id,
          fecha: fechaLocal(t.fechaRegistro),
          tipo: t.tipoTransaccion as 'VENTA',
          folio: t.numeroFactura,
          medioPago: t.medioPago,
          total: t.montoTotal,
          iva: t.detalles.reduce((s, d) => s.add(d.montoIva), ZERO),
          costo: t.detalles.reduce((s, d) => s.add(d.costoUnitario.mul(d.cantidad)), ZERO),
          pagos: t.pagos.map((p) => ({ medio: p.medioPago, monto: p.monto })),
        }),
      ),
      ...recepciones.map((rc) =>
        asientoRecepcion({
          id: rc.id,
          fecha: fechaLocal(rc.fecha),
          folioOc: rc.orden.folio,
          valor: rc.detalles.reduce((s, d) => s.add(d.cantidad.mul(d.detalleOrden.costoUnitario)), ZERO),
        }),
      ),
      ...facturas.flatMap((f) => [
        enMes(f.fechaEmision, true)
          ? asientoFacturaCompra({ id: f.id, fecha: fechaUtc(f.fechaEmision), folio: f.folio, neto: f.montoNeto, iva: f.montoIva, total: f.montoTotal })
          : null,
        f.estadoPago === 'PAGADO' && enMes(f.fechaPago, true)
          ? asientoPagoProveedor({
              origenTipo: 'PAGO_FACTURA',
              id: f.id,
              fecha: fechaUtc(f.fechaPago!),
              glosa: `Pago factura de compra N° ${f.folio}`,
              monto: f.montoTotal,
              medio: f.medioPago,
            })
          : null,
      ]),
      ...gastos.flatMap((g) => [
        enMes(g.fechaRegistro, true)
          ? asientoGasto({
              id: g.id,
              fecha: fechaUtc(g.fechaRegistro),
              descripcion: g.descripcion,
              cuenta: g.categoria.cuentaCodigo,
              monto: g.monto,
              total: g.total,
              retencion: g.retencion,
            })
          : null,
        g.estadoPago === 'PAGADO' && enMes(g.fechaPago, true)
          ? asientoPagoProveedor({
              origenTipo: 'PAGO_GASTO',
              id: g.id,
              fecha: fechaUtc(g.fechaPago!),
              glosa: `Pago: ${g.descripcion}`,
              monto: g.total.sub(g.retencion),
              medio: g.medioPago,
            })
          : null,
      ]),
      ...abonos.map((a) => asientoAbono({ id: a.id, fecha: fechaLocal(a.fecha), monto: a.monto, medio: a.medioPago })),
      ...cajas.map((c) => asientoCierreCaja({ id: c.id, fecha: fechaLocal(c.cerradaEn!), diferencia: c.diferencia! })),
    ];
    for (const fuente of this.fuentes) lista.push(...(await fuente(tx, r)));
    return lista.filter((b): b is Borrador => !!b && b.fecha.startsWith(r.mes));
  }

  /** Regenera los asientos automáticos de un mes abierto; los manuales se conservan. */
  async sincronizar(mes: string) {
    const r = rangoDeMes(mes);
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'contabilidad:' + mes}))`;
      if (await tx.periodoCerrado.findUnique({ where: { mes } })) return { mes, cerrado: true, asientos: null };
      await tx.asiento.deleteMany({ where: { fecha: r.utc, origenTipo: { not: MANUAL } } });
      const borradores = await this.borradores(tx, r);
      await this.guardar(tx, borradores);
      return { mes, cerrado: false, asientos: borradores.length };
    }, TX_OPCIONES);
  }

  private async guardar(tx: Tx, borradores: Borrador[]) {
    const asientos = borradores.map((b) => ({ ...b, id: randomUUID() }));
    if (!asientos.length) return;
    await tx.asiento.createMany({
      data: asientos.map((a) => ({ id: a.id, fecha: new Date(a.fecha), glosa: a.glosa.slice(0, 200), origenTipo: a.origenTipo, origenId: a.origenId })),
    });
    await tx.asientoLinea.createMany({
      data: asientos.flatMap((a) => a.lineas.map((l) => ({ asientoId: a.id, cuentaCodigo: l.cuenta, debe: l.debe, haber: l.haber }))),
    });
  }

  /** Deja al día todos los meses abiertos desde el primer documento hasta `hasta`. */
  async ponerAlDia(hasta: string) {
    const primero = await this.prisma.transaccion.findFirst({ orderBy: { fechaRegistro: 'asc' }, select: { fechaRegistro: true } });
    const desde = primero ? fechaLocal(primero.fechaRegistro) : hasta;
    const cerrados = new Set((await this.prisma.periodoCerrado.findMany({ select: { mes: true } })).map((p) => p.mes));
    for (const mes of mesesEntre(desde < hasta ? desde : hasta, hasta)) {
      if (!cerrados.has(mes)) await this.sincronizar(mes);
    }
  }

  private hoy = () => fechaLocal(new Date());

  async cuentas() {
    return this.prisma.cuentaContable.findMany({ orderBy: { codigo: 'asc' } });
  }

  async diario(mes: string) {
    const r = rangoDeMes(mes);
    await this.sincronizar(mes);
    const asientos = await this.prisma.asiento.findMany({
      where: { fecha: r.utc },
      include: { lineas: { include: { cuenta: { select: { nombre: true } } }, orderBy: { debe: 'desc' } } },
      orderBy: [{ fecha: 'asc' }, { creadoEn: 'asc' }],
    });
    return {
      mes,
      asientos: asientos.map((a) => ({
        id: a.id,
        fecha: fechaUtc(a.fecha),
        glosa: a.glosa,
        origenTipo: a.origenTipo,
        manual: a.origenTipo === MANUAL,
        lineas: a.lineas.map((l) => ({ cuenta: l.cuentaCodigo, nombre: l.cuenta.nombre, debe: l.debe, haber: l.haber })),
      })),
    };
  }

  private async sumas(desde: string, hasta: string): Promise<SumaCuenta[]> {
    const filas = await this.prisma.$queryRaw<{ codigo: string; debe: Prisma.Decimal; haber: Prisma.Decimal }[]>`
      SELECT l.cuenta_codigo AS codigo, SUM(l.debe) AS debe, SUM(l.haber) AS haber
      FROM asiento_lineas l JOIN asientos a ON a.id = l.asiento_id
      WHERE a.fecha BETWEEN ${desde}::date AND ${hasta}::date
      GROUP BY l.cuenta_codigo`;
    const porCodigo = new Map(filas.map((f) => [f.codigo, f]));
    return (await this.cuentas()).map((c) => ({
      codigo: c.codigo,
      nombre: c.nombre,
      tipo: c.tipo,
      debe: dec(porCodigo.get(c.codigo)?.debe ?? 0),
      haber: dec(porCodigo.get(c.codigo)?.haber ?? 0),
    }));
  }

  private periodo(desde?: string, hasta?: string) {
    const h = fechaValida(hasta, this.hoy());
    const d = fechaValida(desde, `${h.slice(0, 4)}-01-01`);
    if (d > h) throw new BadRequestException('La fecha inicial es posterior a la final.');
    return { desde: d, hasta: h };
  }

  async balance(desde?: string, hasta?: string) {
    const p = this.periodo(desde, hasta);
    await this.ponerAlDia(p.hasta);
    return { ...p, ...balanceOchoColumnas(await this.sumas(p.desde, p.hasta)) };
  }

  async resultados(desde?: string, hasta?: string) {
    const p = this.periodo(desde, hasta);
    await this.ponerAlDia(p.hasta);
    return { ...p, ...estadoResultados(await this.sumas(p.desde, p.hasta)) };
  }

  async libroMayor(cuenta: string, desde?: string, hasta?: string) {
    const p = this.periodo(desde, hasta);
    const c = await this.prisma.cuentaContable.findUnique({ where: { codigo: cuenta } });
    if (!c) throw new NotFoundException('La cuenta no existe.');
    await this.ponerAlDia(p.hasta);
    const [previo] = await this.prisma.$queryRaw<{ saldo: Prisma.Decimal | null }[]>`
      SELECT SUM(l.debe - l.haber) AS saldo FROM asiento_lineas l JOIN asientos a ON a.id = l.asiento_id
      WHERE l.cuenta_codigo = ${cuenta} AND a.fecha < ${p.desde}::date`;
    const lineas = await this.prisma.asientoLinea.findMany({
      where: { cuentaCodigo: cuenta, asiento: { fecha: { gte: new Date(p.desde), lte: new Date(p.hasta) } } },
      include: { asiento: { select: { fecha: true, glosa: true } } },
      orderBy: [{ asiento: { fecha: 'asc' } }, { asiento: { creadoEn: 'asc' } }],
    });
    return {
      cuenta: c,
      ...p,
      ...mayor(
        dec(previo?.saldo ?? 0),
        lineas.map((l) => ({ fecha: fechaUtc(l.asiento.fecha), glosa: l.asiento.glosa, debe: l.debe, haber: l.haber })),
      ),
    };
  }

  async crearManual(dto: AsientoManualDto) {
    let lineas: Linea[];
    try {
      lineas = asientoManual({
        fecha: dto.fecha,
        glosa: dto.glosa,
        lineas: dto.lineas.map((l) => (l.debe ? debe(l.cuenta, dec(l.debe)) : haber(l.cuenta, dec(l.haber ?? 0)))),
      });
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
    const codigos = [...new Set(lineas.map((l) => l.cuenta))];
    const existentes = await this.prisma.cuentaContable.count({ where: { codigo: { in: codigos }, activa: true } });
    if (existentes !== codigos.length) throw new BadRequestException('Alguna cuenta no existe o está inactiva.');
    return this.prisma.$transaction(async (tx) => {
      await exigirPeriodoAbierto(tx, dto.fecha);
      return tx.asiento.create({
        data: {
          fecha: new Date(dto.fecha),
          glosa: dto.glosa.trim(),
          origenTipo: MANUAL,
          lineas: { createMany: { data: lineas.map((l) => ({ cuentaCodigo: l.cuenta, debe: l.debe, haber: l.haber })) } },
        },
        include: { lineas: true },
      });
    });
  }

  async eliminarManual(id: string) {
    return this.prisma.$transaction(async (tx) => {
      const a = await tx.asiento.findUnique({ where: { id } });
      if (!a) throw new NotFoundException('Asiento no encontrado.');
      if (a.origenTipo !== MANUAL) throw new BadRequestException('Los asientos automáticos se corrigen anulando el documento que los generó.');
      await exigirPeriodoAbierto(tx, fechaUtc(a.fecha));
      return tx.asiento.delete({ where: { id } });
    });
  }

  periodos() {
    return this.prisma.periodoCerrado.findMany({ orderBy: { mes: 'desc' } });
  }

  async cerrarPeriodo(mes: string, usuarioId: string) {
    const r = rangoDeMes(mes);
    if (r.local.lt > new Date()) throw new BadRequestException('Solo se pueden cerrar meses ya terminados.');
    await this.sincronizar(mes);
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'contabilidad:' + mes}))`;
      const ya = await tx.periodoCerrado.findUnique({ where: { mes } });
      if (ya) throw new BadRequestException(`El mes ${mes} ya está cerrado.`);
      return tx.periodoCerrado.create({ data: { mes, usuarioId } });
    });
  }

  async reabrirPeriodo(mes: string) {
    validarMes(mes);
    const { count } = await this.prisma.periodoCerrado.deleteMany({ where: { mes } });
    if (!count) throw new NotFoundException('Ese mes no está cerrado.');
    return { mes, reabierto: true };
  }
}
