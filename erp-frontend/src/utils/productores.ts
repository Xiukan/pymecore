export type DocumentoProductor = 'FACTURA_COMPRA' | 'FACTURA_PROVEEDOR'

/** Vista previa de la liquidación (el servidor recalcula y manda). Mismo criterio que el backend. */
export function liquidarPrevia(
  p: { pesoBruto: number; tara: number; humedadPct: number; impurezasPct: number; precioKilo: number },
  par: { tipoDocumento: DocumentoProductor; tasaIva: number; humedadBasePct: number; retencionIvaPct: number },
) {
  const pesoNeto = p.pesoBruto - p.tara
  if (!(pesoNeto > 0)) return null
  const castigoPct = Math.max(p.humedadPct - par.humedadBasePct, 0) + p.impurezasPct
  if (castigoPct >= 100) return null
  const kilosPagables = Math.round((pesoNeto * (100 - castigoPct)) / 100)
  const montoNeto = Math.round(kilosPagables * p.precioKilo)
  const iva = Math.round((montoNeto * par.tasaIva) / 100)
  const retencionIva = par.tipoDocumento === 'FACTURA_COMPRA' ? iva : Math.min(Math.round((montoNeto * par.retencionIvaPct) / 100), iva)
  return { pesoNeto, castigoPct, kilosPagables, montoNeto, iva, retencionIva, montoTotal: montoNeto + iva, montoAPagar: montoNeto + iva - retencionIva }
}

/** Días hasta el vencimiento (negativo si ya venció); null sin fecha. */
export function diasParaVencer(fecha: string | null, hoy = new Date()): number | null {
  if (!fecha) return null
  const v = Date.UTC(Number(fecha.slice(0, 4)), Number(fecha.slice(5, 7)) - 1, Number(fecha.slice(8, 10)))
  const h = Date.UTC(hoy.getFullYear(), hoy.getMonth(), hoy.getDate())
  return Math.round((v - h) / 86_400_000)
}
