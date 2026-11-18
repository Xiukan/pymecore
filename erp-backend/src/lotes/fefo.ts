import { Prisma } from '@prisma/client';

const D = Prisma.Decimal;

export interface LoteDisponible {
  id: string;
  cantidadActual: Prisma.Decimal;
  fechaVencimiento: Date | null;
  fechaIngreso: Date;
}

/** Orden de salida: primero lo que vence antes; sin vencimiento al final; a igualdad, lo más antiguo. */
export function ordenFefo(a: LoteDisponible, b: LoteDisponible) {
  const va = a.fechaVencimiento?.getTime() ?? Infinity;
  const vb = b.fechaVencimiento?.getTime() ?? Infinity;
  return va - vb || a.fechaIngreso.getTime() - b.fechaIngreso.getTime();
}

/** Reparte una salida entre lotes; si no alcanzan, lo que falta sale de stock sin lote. */
export function repartirFefo(lotes: LoteDisponible[], cantidad: Prisma.Decimal.Value) {
  let resto = new D(cantidad);
  const partes: { loteId: string; cantidad: Prisma.Decimal }[] = [];
  for (const l of [...lotes].sort(ordenFefo)) {
    if (resto.lte(0)) break;
    const parte = D.min(l.cantidadActual, resto);
    if (parte.lte(0)) continue;
    partes.push({ loteId: l.id, cantidad: parte });
    resto = resto.sub(parte);
  }
  return { partes, sinLote: resto };
}
