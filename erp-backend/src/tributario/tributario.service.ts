import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { EmpresaService } from '../empresa/empresa.service';
import { PrismaService } from '../prisma/prisma.service';
import { FilaLibro, resumenIva, totalesPorTipo } from './libros';
import { cuadrarRcv, leerRcv } from './rcv';

const D = Prisma.Decimal;
const cero = () => new D(0);
const dia = (d: Date) => d.toISOString().slice(0, 10);
const fechaLocal = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Rango del mes: ventas usan fecha y hora local; documentos recibidos y gastos, días UTC. */
function rangoMes(mes: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) throw new BadRequestException('Indique el mes como AAAA-MM.');
  const [a, m] = mes.split('-').map(Number);
  return {
    local: { gte: new Date(a, m - 1, 1), lt: new Date(a, m, 1) },
    utc: { gte: new Date(Date.UTC(a, m - 1, 1)), lt: new Date(Date.UTC(a, m, 1)) },
  };
}

@Injectable()
export class TributarioService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly empresa: EmpresaService,
  ) {}

  /** Boletas y facturas emitidas, y devoluciones/NC como documento 61. */
  async libroVentas(mes: string) {
    const { local } = rangoMes(mes);
    const [docs, empresa] = await Promise.all([
      this.prisma.transaccion.findMany({
        where: {
          estado: 'Activa',
          tipoTransaccion: { in: ['VENTA', 'DEVOLUCION', 'NOTA_CREDITO'] },
          fechaRegistro: local,
        },
        include: { detalles: { include: { item: { select: { afectoIva: true } } } }, entidad: true },
        orderBy: { fechaRegistro: 'asc' },
      }),
      this.empresa.get(),
    ]);
    const filas: FilaLibro[] = docs.map((t) => {
      let neto = cero();
      let exento = cero();
      let iva = cero();
      for (const d of t.detalles) {
        iva = iva.add(d.montoIva);
        if (d.item.afectoIva) neto = neto.add(d.subtotal.sub(d.montoIva));
        else exento = exento.add(d.subtotal);
      }
      const meta = (t.metadatosSii ?? {}) as { tipoDoc?: number };
      return {
        fecha: dia(t.fechaRegistro),
        tipoDte: t.tipoTransaccion === 'VENTA' ? (meta.tipoDoc ?? 39) : 61,
        folio: t.numeroFactura ?? '',
        rut: t.entidad?.rut ?? empresa.rutConsumidorFinal,
        razonSocial: t.entidad?.nombreRazonSocial ?? empresa.nombreConsumidorFinal,
        neto,
        exento,
        iva,
        otros: cero(),
        total: t.montoTotal,
      };
    });
    return { mes, filas, totales: totalesPorTipo(filas) };
  }

  /**
   * DTE recibidos (salvo descartados), más facturas de compra y gastos con factura ingresados
   * a mano. El IVA de gastos en categorías sin crédito fiscal se informa como no recuperable.
   */
  async libroCompras(mes: string) {
    const { utc } = rangoMes(mes);
    const { local } = rangoMes(mes);
    const [dtes, facturas, gastos, productores] = await Promise.all([
      this.prisma.dteRecibido.findMany({
        where: { estado: { not: 'DESCARTADO' }, fechaEmision: utc },
        include: { gasto: { include: { categoria: true } } },
        orderBy: { fechaEmision: 'asc' },
      }),
      this.prisma.facturaCompra.findMany({
        where: { estado: 'VIGENTE', fechaEmision: utc, dte: null },
        include: { proveedor: true },
      }),
      this.prisma.gastoOperacional.findMany({
        where: { estado: 'VIGENTE', tipoDocumento: 'FACTURA', fechaRegistro: utc, dte: null },
        include: { proveedor: true, categoria: true },
      }),
      this.prisma.recepcionProductor.findMany({
        where: { estado: 'VIGENTE', fecha: local },
        include: { productor: true },
      }),
    ]);
    const filas: FilaLibro[] = [
      ...dtes.map((d) => ({
        fecha: dia(d.fechaEmision),
        tipoDte: d.tipoDte,
        folio: d.folio,
        rut: d.rutEmisor,
        razonSocial: d.razonSocialEmisor,
        neto: d.montoNeto,
        exento: d.montoExento,
        iva: d.iva,
        otros: d.otrosImpuestos,
        total: d.montoTotal,
        ivaRecuperable: d.gasto ? d.gasto.categoria.ivaRecuperable : true,
        origen: 'DTE recibido',
      })),
      ...facturas.map((f) => ({
        fecha: dia(f.fechaEmision),
        tipoDte: 33,
        folio: f.folio,
        rut: f.proveedor.rut,
        razonSocial: f.proveedor.nombreRazonSocial,
        neto: f.montoNeto,
        exento: cero(),
        iva: f.montoIva,
        otros: cero(),
        total: f.montoTotal,
        ivaRecuperable: true,
        origen: 'Factura de compra (manual)',
      })),
      ...gastos.map((g) => ({
        fecha: dia(g.fechaRegistro),
        tipoDte: 33,
        folio: g.numeroDocumento ?? '',
        rut: g.proveedor?.rut ?? '',
        razonSocial: g.proveedor?.nombreRazonSocial ?? g.descripcion,
        neto: g.montoNeto,
        exento: cero(),
        iva: g.iva,
        otros: cero(),
        total: g.total,
        ivaRecuperable: g.categoria.ivaRecuperable,
        origen: `Gasto: ${g.categoria.nombre}`,
      })),
      // Con factura de compra (46) el documento lo emite el comprador; con cambio de sujeto
      // la factura es del productor (33). En ambos el IVA es crédito y la retención va al F29.
      ...productores.map((p) => ({
        fecha: fechaLocal(p.fecha),
        tipoDte: p.tipoDocumento === 'FACTURA_COMPRA' ? 46 : 33,
        folio: p.folioDocumento,
        rut: p.productor.rut,
        razonSocial: p.productor.nombreRazonSocial,
        neto: p.montoNeto,
        exento: cero(),
        iva: p.iva,
        otros: cero(),
        total: p.montoTotal,
        ivaRecuperable: true,
        retencionIva: p.retencionIva,
        origen: 'Recepción de productor',
      })),
    ].sort((a, b) => a.fecha.localeCompare(b.fecha));
    return { mes, filas, totales: totalesPorTipo(filas) };
  }

  async resumen(mes: string) {
    const { utc } = rangoMes(mes);
    const [ventas, compras, honorarios] = await Promise.all([
      this.libroVentas(mes),
      this.libroCompras(mes),
      this.prisma.gastoOperacional.aggregate({
        where: { estado: 'VIGENTE', tipoDocumento: 'BOLETA_HONORARIOS', fechaRegistro: utc },
        _sum: { retencion: true },
      }),
    ]);
    const retencionIva = compras.filas.reduce((s, f) => s.add(f.retencionIva ?? 0), cero());
    return { mes, ...resumenIva(ventas.filas, compras.filas, honorarios._sum.retencion ?? 0, retencionIva) };
  }

  /** Cuadra el Registro de Compras del SII del mes con el libro de compras del sistema. */
  async cuadrarRcv(mes: string, contenido: string) {
    const rcv = leerRcv(contenido);
    const libro = await this.libroCompras(mes);
    return {
      mes,
      ...cuadrarRcv(
        rcv,
        libro.filas.map((f) => ({ tipoDte: f.tipoDte, rut: f.rut, razonSocial: f.razonSocial, folio: f.folio, fecha: f.fecha, neto: Number(f.neto), iva: Number(f.iva), total: Number(f.total) })),
      ),
    };
  }
}
