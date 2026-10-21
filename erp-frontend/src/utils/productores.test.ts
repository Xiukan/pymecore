import { describe, expect, it } from 'vitest'
import { diasParaVencer, liquidarPrevia } from './productores'

const par = { tasaIva: 19, humedadBasePct: 14, retencionIvaPct: 0 }

describe('liquidación de productor (vista previa)', () => {
  it('coincide con el backend: castigo, kilos limpios e IVA', () => {
    expect(liquidarPrevia({ pesoBruto: 10500, tara: 500, humedadPct: 16, impurezasPct: 1, precioKilo: 300 }, { ...par, tipoDocumento: 'FACTURA_PROVEEDOR' })).toEqual({
      pesoNeto: 10000, castigoPct: 3, kilosPagables: 9700, montoNeto: 2910000, iva: 552900, retencionIva: 0, montoTotal: 3462900, montoAPagar: 3462900,
    })
  })

  it('factura de compra retiene todo el IVA', () => {
    expect(liquidarPrevia({ pesoBruto: 1000, tara: 0, humedadPct: 0, impurezasPct: 0, precioKilo: 500 }, { ...par, tipoDocumento: 'FACTURA_COMPRA' })?.montoAPagar).toBe(500000)
  })

  it('sin peso neto o con castigo total no hay liquidación', () => {
    expect(liquidarPrevia({ pesoBruto: 10, tara: 10, humedadPct: 0, impurezasPct: 0, precioKilo: 1 }, { ...par, tipoDocumento: 'FACTURA_COMPRA' })).toBeNull()
    expect(liquidarPrevia({ pesoBruto: 10, tara: 0, humedadPct: 0, impurezasPct: 100, precioKilo: 1 }, { ...par, tipoDocumento: 'FACTURA_COMPRA' })).toBeNull()
  })
})

describe('vencimiento', () => {
  it('cuenta días hasta la fecha', () => {
    const hoy = new Date(2026, 9, 20)
    expect(diasParaVencer('2026-10-30', hoy)).toBe(10)
    expect(diasParaVencer('2026-10-18', hoy)).toBe(-2)
    expect(diasParaVencer(null, hoy)).toBeNull()
  })
})
