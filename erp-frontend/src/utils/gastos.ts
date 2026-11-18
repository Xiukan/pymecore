import type { TipoDocumentoGasto } from '@/types'

/** Vista previa de los montos con la misma regla del backend (calcularGasto). */
export function previaGasto(tipo: TipoDocumentoGasto, monto: number, ivaRecuperable: boolean, tasaIva: number, tasaRetencion: number) {
  const base = Math.round(monto)
  if (tipo === 'FACTURA') {
    const iva = Math.round((base * tasaIva) / 100)
    return { iva, retencion: 0, total: base + iva, costo: ivaRecuperable ? base : base + iva, aPagar: base + iva }
  }
  if (tipo === 'BOLETA_HONORARIOS') {
    const retencion = Math.round((base * tasaRetencion) / 100)
    return { iva: 0, retencion, total: base, costo: base, aPagar: base - retencion }
  }
  return { iva: 0, retencion: 0, total: base, costo: base, aPagar: base }
}
