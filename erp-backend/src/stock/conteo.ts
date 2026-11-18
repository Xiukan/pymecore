import { Prisma } from '@prisma/client';
import { peso, ZERO } from '../utils/money.util';

const D = Prisma.Decimal;

export interface FilaConteo {
  itemId: string;
  nombre: string;
  sistema: Prisma.Decimal;
  contado: Prisma.Decimal;
  costo: Prisma.Decimal;
}

/** Diferencias del conteo valorizadas a costo promedio: faltantes y sobrantes por separado. */
export function compararConteo(filas: FilaConteo[]) {
  const diferencias = filas
    .map((f) => {
      const diferencia = f.contado.sub(f.sistema);
      return { ...f, diferencia, valor: peso(diferencia.mul(f.costo)) };
    })
    .filter((f) => !f.diferencia.isZero());
  const faltante = diferencias.filter((d) => d.valor.isNeg()).reduce((s, d) => s.add(d.valor.abs()), ZERO);
  const sobrante = diferencias.filter((d) => d.valor.isPos()).reduce((s, d) => s.add(d.valor), ZERO);
  return { diferencias, faltante, sobrante, neto: sobrante.sub(faltante), contados: filas.length, cuadran: filas.length - diferencias.length };
}

/**
 * Cuánto pedir: lo que se vende en `diasObjetivo` más el mínimo, menos lo que hay y lo que
 * ya viene en órdenes abiertas. Nunca negativo; redondeado hacia arriba a unidades.
 */
export function sugerirCompra(p: { vendido30: Prisma.Decimal; stock: Prisma.Decimal; minimo: Prisma.Decimal; porRecibir: Prisma.Decimal; diasObjetivo: number }) {
  const diario = p.vendido30.div(30);
  const necesidad = diario.mul(p.diasObjetivo).add(p.minimo).sub(p.stock).sub(p.porRecibir);
  return {
    ventaDiaria: diario.toDecimalPlaces(2),
    diasCobertura: diario.gt(0) ? p.stock.div(diario).toDecimalPlaces(0, D.ROUND_DOWN) : null,
    sugerido: necesidad.gt(0) ? necesidad.toDecimalPlaces(0, D.ROUND_UP) : ZERO,
  };
}
