import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export type Granularidad = 'dia' | 'semana' | 'mes';

interface Acumulado {
  monto: number;
  ventas: number;
  unidades: number;
  margen: number;
}

const nuevo = (): Acumulado => ({ monto: 0, ventas: 0, unidades: 0, margen: 0 });

const pad = (n: number) => String(n).padStart(2, '0');
const fechaLocal = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

function periodo(fecha: Date, gran: Granularidad): string {
  if (gran === 'mes') return `${fecha.getFullYear()}-${pad(fecha.getMonth() + 1)}`;
  if (gran === 'semana') {
    const lunes = new Date(fecha);
    lunes.setDate(fecha.getDate() - ((fecha.getDay() + 6) % 7));
    return fechaLocal(lunes);
  }
  return fechaLocal(fecha);
}

const redondear = (n: number) => Math.round(n * 100) / 100;

@Injectable()
export class ReportesService {
  constructor(private readonly prisma: PrismaService) {}

  async dashboard(desde: string, hasta: string, gran: Granularidad, sucursalId?: string) {
    const inicio = new Date(`${desde}T00:00:00`);
    const fin = new Date(`${hasta}T23:59:59.999`);
    if (isNaN(inicio.getTime()) || isNaN(fin.getTime()) || inicio > fin) {
      throw new BadRequestException('Rango de fechas inválido');
    }

    const filtroSucursal = sucursalId ? { sucursalId } : {};

    const [transacciones, stock] = await Promise.all([
      this.prisma.transaccion.findMany({
        where: {
          ...filtroSucursal,
          estado: 'Activa',
          fechaRegistro: { gte: inicio, lte: fin },
        },
        include: {
          detalles: { include: { item: { select: { nombre: true, codigoSku: true } } } },
          sucursal: { select: { nombre: true } },
          usuario: { select: { nombreCompleto: true } },
        },
      }),
      this.prisma.stockLocal.findMany({
        where: filtroSucursal,
        include: {
          item: { select: { costoPromedio: true, estado: true } },
          sucursal: { select: { nombre: true } },
        },
      }),
    ]);

    const total = nuevo();
    let netoSinIva = 0;
    const clientes = new Set<string>();
    const serie = new Map<string, Acumulado>();
    const medios = new Map<string, number>();
    const productos = new Map<string, Acumulado & { nombre: string; sku: string }>();
    const sucursales = new Map<string, Acumulado>();
    const vendedores = new Map<string, Acumulado>();
    let devoluciones = 0;
    let numDevoluciones = 0;
    let costoMermas = 0;

    for (const t of transacciones) {
      const monto = Number(t.montoTotal);

      if (t.tipoTransaccion === 'DEVOLUCION' || t.tipoTransaccion === 'NOTA_CREDITO') {
        devoluciones += monto;
        numDevoluciones++;
        continue;
      }
      if (t.tipoTransaccion === 'MERMA') {
        costoMermas += t.detalles.reduce((s, d) => s + Number(d.cantidad) * Number(d.costoUnitario), 0);
        continue;
      }
      if (t.tipoTransaccion !== 'VENTA') continue;

      let unidades = 0;
      let margen = 0;
      for (const d of t.detalles) {
        const cantidad = Number(d.cantidad);
        const neto = Number(d.subtotal) - Number(d.montoIva);
        const margenLinea = neto - Number(d.costoUnitario) * cantidad;
        unidades += cantidad;
        margen += margenLinea;
        netoSinIva += neto;

        const p = productos.get(d.itemId) ?? { ...nuevo(), nombre: d.item.nombre, sku: d.item.codigoSku };
        p.monto += Number(d.subtotal);
        p.unidades += cantidad;
        p.margen += margenLinea;
        p.ventas++;
        productos.set(d.itemId, p);
      }

      const sumar = (map: Map<string, Acumulado>, clave: string) => {
        const a = map.get(clave) ?? nuevo();
        a.monto += monto;
        a.ventas++;
        a.unidades += unidades;
        a.margen += margen;
        map.set(clave, a);
      };

      sumar(serie, periodo(t.fechaRegistro, gran));
      sumar(sucursales, t.sucursal.nombre);
      sumar(vendedores, t.usuario.nombreCompleto);
      medios.set(t.medioPago, (medios.get(t.medioPago) ?? 0) + monto);
      if (t.entidadId) clientes.add(t.entidadId);

      total.monto += monto;
      total.ventas++;
      total.unidades += unidades;
      total.margen += margen;
    }

    const inventario = new Map<string, { valor: number; productos: number; alertas: number }>();
    for (const s of stock) {
      if (s.item.estado !== 'Activo') continue;
      const inv = inventario.get(s.sucursal.nombre) ?? { valor: 0, productos: 0, alertas: 0 };
      inv.valor += Number(s.stockActual) * Number(s.item.costoPromedio);
      inv.productos++;
      if (Number(s.stockActual) <= Number(s.stockMinimo)) inv.alertas++;
      inventario.set(s.sucursal.nombre, inv);
    }

    const ranking = (map: Map<string, Acumulado>) =>
      [...map.entries()]
        .map(([nombre, a]) => ({
          nombre,
          monto: redondear(a.monto),
          ventas: a.ventas,
          unidades: a.unidades,
          margen: redondear(a.margen),
        }))
        .sort((a, b) => b.monto - a.monto);

    return {
      kpis: {
        ventasTotales: redondear(total.monto),
        numVentas: total.ventas,
        ticketPromedio: total.ventas ? redondear(total.monto / total.ventas) : 0,
        unidadesVendidas: total.unidades,
        margenBruto: redondear(total.margen),
        margenPct: netoSinIva ? redondear((total.margen / netoSinIva) * 100) : 0,
        clientesUnicos: clientes.size,
        devoluciones: redondear(devoluciones),
        numDevoluciones,
        costoMermas: redondear(costoMermas),
      },
      serie: [...serie.entries()]
        .map(([p, a]) => ({ periodo: p, monto: redondear(a.monto), ventas: a.ventas, margen: redondear(a.margen) }))
        .sort((a, b) => a.periodo.localeCompare(b.periodo)),
      mediosPago: [...medios.entries()]
        .map(([medio, monto]) => ({ medio, monto: redondear(monto) }))
        .sort((a, b) => b.monto - a.monto),
      productos: [...productos.entries()]
        .map(([itemId, p]) => ({
          itemId,
          nombre: p.nombre,
          sku: p.sku,
          monto: redondear(p.monto),
          unidades: p.unidades,
          margen: redondear(p.margen),
          lineas: p.ventas,
        }))
        .sort((a, b) => b.monto - a.monto),
      sucursales: ranking(sucursales),
      vendedores: ranking(vendedores),
      inventario: [...inventario.entries()]
        .map(([sucursal, i]) => ({ sucursal, valor: redondear(i.valor), productos: i.productos, alertas: i.alertas }))
        .sort((a, b) => b.valor - a.valor),
    };
  }
}
