import { describe, expect, it } from 'vitest'
import { previaGasto } from './gastos'

// Debe coincidir con calcularGasto del backend (src/gastos/gastos.service.ts).
describe('vista previa de gasto', () => {
  it('factura con IVA recuperable', () => {
    expect(previaGasto('FACTURA', 100000, true, 19, 15.25)).toEqual({ iva: 19000, retencion: 0, total: 119000, costo: 100000, aPagar: 119000 })
  })

  it('factura sin IVA recuperable: el costo es el total', () => {
    expect(previaGasto('FACTURA', 100000, false, 19, 15.25).costo).toBe(119000)
  })

  it('boleta de honorarios: se paga el líquido, el costo es el bruto', () => {
    expect(previaGasto('BOLETA_HONORARIOS', 200000, false, 19, 15.25)).toEqual({ iva: 0, retencion: 30500, total: 200000, costo: 200000, aPagar: 169500 })
  })

  it('boleta y sin documento', () => {
    expect(previaGasto('BOLETA', 8990, true, 19, 15.25)).toMatchObject({ iva: 0, total: 8990, costo: 8990 })
  })
})
