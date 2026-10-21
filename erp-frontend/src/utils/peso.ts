/** Productos que se venden pesados en balanza. */
export const esPorPeso = (unidad: string) => ['KG', 'GR'].includes(unidad.toUpperCase())

/** "1,250" o "1.25" → 1.25 kg (hasta 3 decimales); null si no es un peso válido. */
export function leerPeso(valor: string): number | null {
  const n = Number(valor.trim().replace(',', '.'))
  if (!Number.isFinite(n) || n <= 0) return null
  return Math.round(n * 1000) / 1000
}
