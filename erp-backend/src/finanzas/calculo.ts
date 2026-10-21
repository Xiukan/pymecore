import { Prisma } from '@prisma/client';
import { peso, ZERO } from '../utils/money.util';

const D = Prisma.Decimal;
type Monto = Prisma.Decimal;

/** Meses completos entre el mes de compra y el mes dado (AAAA-MM): la depreciación parte el mes siguiente. */
export function mesesDesde(fechaCompra: Date, mes: string) {
  const [a, m] = mes.split('-').map(Number);
  return (a - fechaCompra.getUTCFullYear()) * 12 + (m - 1 - fechaCompra.getUTCMonth());
}

/**
 * Cuota de depreciación lineal del mes n (1 = mes siguiente a la compra). La última cuota
 * absorbe el redondeo para que lo depreciado sume exactamente valor − residual.
 */
export function cuotaDepreciacion(valor: Monto, residual: Monto, vidaMeses: number, n: number): Monto {
  if (n < 1 || n > vidaMeses) return ZERO;
  const depreciable = valor.sub(residual);
  const cuota = peso(depreciable.div(vidaMeses));
  return n === vidaMeses ? depreciable.sub(cuota.mul(vidaMeses - 1)) : cuota;
}

export function depreciacionAcumulada(valor: Monto, residual: Monto, vidaMeses: number, mesesTranscurridos: number): Monto {
  let total = ZERO;
  for (let n = 1; n <= Math.min(mesesTranscurridos, vidaMeses); n++) total = total.add(cuotaDepreciacion(valor, residual, vidaMeses, n));
  return total;
}

export interface Movimiento {
  fecha: string;
  monto: number;
  tipo: string;
  detalle: string;
}

/**
 * Flujo de caja por semana desde `desde`: lo vencido entra en la primera semana. Devuelve
 * entradas, salidas y saldo al cierre de cada semana partiendo del saldo disponible.
 */
export function proyectarFlujo(saldoInicial: number, movimientos: Movimiento[], desde: string, semanas: number) {
  const inicio = Date.parse(`${desde}T00:00:00Z`);
  const filas = Array.from({ length: semanas }, (_, i) => {
    const d = new Date(inicio + i * 7 * 86_400_000).toISOString().slice(0, 10);
    const h = new Date(inicio + (i * 7 + 6) * 86_400_000).toISOString().slice(0, 10);
    return { desde: d, hasta: h, entradas: 0, salidas: 0, saldo: 0, detalle: [] as Movimiento[] };
  });
  for (const m of movimientos) {
    const dias = Math.floor((Date.parse(`${m.fecha}T00:00:00Z`) - inicio) / 86_400_000);
    const i = Math.max(0, Math.floor(dias / 7));
    if (i >= semanas) continue;
    if (m.monto >= 0) filas[i].entradas += m.monto;
    else filas[i].salidas += -m.monto;
    filas[i].detalle.push(m);
  }
  let saldo = saldoInicial;
  for (const f of filas) {
    saldo += f.entradas - f.salidas;
    f.saldo = saldo;
  }
  const primeraNegativa = filas.find((f) => f.saldo < 0);
  return { saldoInicial, semanas: filas, alerta: primeraNegativa ? `El saldo quedaría negativo la semana del ${primeraNegativa.desde}.` : null };
}

export const sumarDias = (fecha: string, dias: number) => new Date(Date.parse(`${fecha}T00:00:00Z`) + dias * 86_400_000).toISOString().slice(0, 10);

/** Saldo de un activo a una fecha: lo depreciado hasta el mes anterior y el valor libro. */
export function valorLibro(a: { valorCompra: Monto; valorResidual: Monto; vidaUtilMeses: number; fechaCompra: Date }, mes: string) {
  const acumulada = depreciacionAcumulada(a.valorCompra, a.valorResidual, a.vidaUtilMeses, mesesDesde(a.fechaCompra, mes));
  return { acumulada, valorLibro: new D(a.valorCompra).sub(acumulada) };
}
