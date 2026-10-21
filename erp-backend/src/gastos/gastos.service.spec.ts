import { Prisma } from '@prisma/client'
import { calcularGasto } from './gastos.service'

const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v)
const p = { tasaIva: 19, tasaRetencionHonorarios: '15.25' }

describe('montos de gasto', () => {
  it('factura con IVA recuperable: el costo es el neto', () => {
    expect(calcularGasto('FACTURA', 100000, true, p)).toEqual({ montoNeto: D(100000), iva: D(19000), retencion: D(0), total: D(119000), monto: D(100000) })
  })

  it('factura con IVA no recuperable (ej. combustible): el costo es el total', () => {
    expect(calcularGasto('FACTURA', 100000, false, p).monto).toEqual(D(119000))
  })

  it('boleta de honorarios: retiene sobre el bruto y el costo es el bruto', () => {
    const g = calcularGasto('BOLETA_HONORARIOS', 200000, false, p)
    expect(g.retencion).toEqual(D(30500))
    expect(g.total.sub(g.retencion)).toEqual(D(169500))
    expect(g.monto).toEqual(D(200000))
  })

  it('boleta y sin documento: el total es el costo, sin IVA', () => {
    expect(calcularGasto('BOLETA', 8990, true, p)).toMatchObject({ iva: D(0), total: D(8990), monto: D(8990) })
    expect(calcularGasto('SIN_DOCUMENTO', 3500, true, p).monto).toEqual(D(3500))
  })
})
