export type MedioSimple = 'Efectivo' | 'Tarjeta' | 'Transferencia'

/** Pago mixto: el cliente entrega `efectivo` y el resto va por `otro`. Devuelve null si no corresponde. */
export function repartirPago(total: number, efectivo: number, otro: Exclude<MedioSimple, 'Efectivo'>) {
  const t = Math.round(total)
  const e = Math.round(efectivo)
  if (!(e > 0) || e >= t) return null
  return [
    { medioPago: 'Efectivo' as const, monto: e },
    { medioPago: otro, monto: t - e },
  ]
}
