import { CategoriaCosto, Prisma } from '@prisma/client';
import { peso, ZERO } from '../utils/money.util';

const D = Prisma.Decimal;
type Monto = Prisma.Decimal;

export const CATEGORIAS: CategoriaCosto[] = ['INSUMOS', 'MANO_OBRA', 'MAQUINARIA', 'SERVICIOS', 'OTROS'];

/** Primer día en que se puede cosechar después de una aplicación (fecha AAAA-MM-DD). */
export function finCarencia(fecha: Date, carenciaDias: number): string {
  const d = new Date(Date.UTC(fecha.getUTCFullYear(), fecha.getUTCMonth(), fecha.getUTCDate() + carenciaDias));
  return d.toISOString().slice(0, 10);
}

/** La carencia más larga vigente a la fecha `dia` entre las aplicaciones del cuartel; null si se puede cosechar. */
export function carenciaVigente(aplicaciones: { fecha: Date; carenciaDias: number; objetivo: string }[], dia: string) {
  let peor: { hasta: string; objetivo: string } | null = null;
  for (const a of aplicaciones) {
    const hasta = finCarencia(a.fecha, a.carenciaDias);
    if (hasta > dia && (!peor || hasta > peor.hasta)) peor = { hasta, objetivo: a.objetivo };
  }
  return peor;
}

export const montoLabor = (cantidad: Prisma.Decimal.Value, tarifa: Prisma.Decimal.Value) => peso(new D(cantidad).mul(tarifa));

/** Anticipos que caben completos en lo ganado, del más antiguo al más nuevo. */
export function liquidarTrabajador(totalLabores: Monto, anticipos: { id: string; monto: Monto }[]) {
  let descontado = ZERO;
  const aplicados: string[] = [];
  for (const a of anticipos) {
    if (descontado.add(a.monto).gt(totalLabores)) continue;
    descontado = descontado.add(a.monto);
    aplicados.push(a.id);
  }
  return { totalLabores, anticipos: descontado, aPagar: totalLabores.sub(descontado), aplicados };
}

export interface CostoFila {
  cuartelId: string;
  categoria: CategoriaCosto;
  monto: Monto;
}

/**
 * Costo de la temporada por cuartel: real por categoría frente al presupuesto, kilos
 * cosechados, costo por hectárea y por kilo.
 */
export function costosPorCuartel(
  cuarteles: { id: string; nombre: string; predio: string; cultivo: string; hectareas: Monto }[],
  costos: CostoFila[],
  presupuestos: CostoFila[],
  cosechas: { cuartelId: string; kilos: Monto }[],
) {
  const suma = (filas: CostoFila[], cuartelId: string, cat?: CategoriaCosto) =>
    filas.filter((f) => f.cuartelId === cuartelId && (!cat || f.categoria === cat)).reduce((s, f) => s.add(f.monto), ZERO);
  return cuarteles.map((c) => {
    const real = suma(costos, c.id);
    const presupuesto = suma(presupuestos, c.id);
    const kilos = cosechas.filter((k) => k.cuartelId === c.id).reduce((s, k) => s.add(k.kilos), ZERO);
    return {
      ...c,
      categorias: CATEGORIAS.map((cat) => ({ categoria: cat, real: suma(costos, c.id, cat), presupuesto: suma(presupuestos, c.id, cat) })),
      real,
      presupuesto,
      desviacion: real.sub(presupuesto),
      kilos,
      costoKilo: kilos.gt(0) ? peso(real.div(kilos)) : null,
      costoHa: c.hectareas.gt(0) ? peso(real.div(c.hectareas)) : null,
      rendimientoHa: c.hectareas.gt(0) ? kilos.div(c.hectareas).toDecimalPlaces(0) : null,
    };
  });
}
