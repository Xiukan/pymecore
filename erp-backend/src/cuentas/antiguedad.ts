import { Prisma } from '@prisma/client';

const D = Prisma.Decimal;
export const TRAMOS = ['porVencer', 'd1a30', 'd31a60', 'd61a90', 'mas90'] as const;
export type Tramo = (typeof TRAMOS)[number];

/** Tramo de antigüedad según los días transcurridos desde el vencimiento. */
export function tramo(vencimiento: Date, hoy: Date): Tramo {
  const dias = Math.floor((Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), hoy.getUTCDate()) -
    Date.UTC(vencimiento.getUTCFullYear(), vencimiento.getUTCMonth(), vencimiento.getUTCDate())) / 86_400_000);
  if (dias <= 0) return 'porVencer';
  if (dias <= 30) return 'd1a30';
  if (dias <= 60) return 'd31a60';
  if (dias <= 90) return 'd61a90';
  return 'mas90';
}

export function sumarPorTramo(items: { saldo: Prisma.Decimal; vencimiento: Date }[], hoy: Date) {
  const total = Object.fromEntries(TRAMOS.map((t) => [t, new D(0)])) as Record<Tramo, Prisma.Decimal>;
  for (const i of items) total[tramo(i.vencimiento, hoy)] = total[tramo(i.vencimiento, hoy)].add(i.saldo);
  return total;
}

export const sumarDias = (fecha: Date, dias: number) => new Date(fecha.getTime() + dias * 86_400_000);
