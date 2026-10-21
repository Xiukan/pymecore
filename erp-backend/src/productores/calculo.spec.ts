import { Prisma } from '@prisma/client'
import { repartirFefo } from '../lotes/fefo'
import { resumenIva } from '../tributario/libros'
import { aplicarAnticipos, liquidar } from './calculo'

const D = (v: number) => new Prisma.Decimal(v)
const num = (o: Record<string, Prisma.Decimal>) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, Number(v)]))
const base = { tasaIva: 19, humedadBasePct: 14, retencionIvaPct: 0 }

describe('liquidación de productor', () => {
  it('castiga la humedad sobre la base y las impurezas, y paga por kilo limpio', () => {
    // 10.500 − 500 = 10.000 kg; humedad 16 % sobre base 14 % = 2 puntos + 1 % impurezas = 3 %.
    const r = liquidar({ pesoBruto: 10500, tara: 500, humedadPct: 16, impurezasPct: 1, precioKilo: 300 }, { ...base, tipoDocumento: 'FACTURA_PROVEEDOR' })
    expect(num(r)).toEqual({ pesoNeto: 10000, castigoPct: 3, kilosPagables: 9700, montoNeto: 2910000, iva: 552900, retencionIva: 0, montoTotal: 3462900, montoAPagar: 3462900 })
  })

  it('humedad bajo la base no castiga', () => {
    expect(Number(liquidar({ pesoBruto: 1000, tara: 0, humedadPct: 10, precioKilo: 1 }, { ...base, tipoDocumento: 'FACTURA_PROVEEDOR' }).kilosPagables)).toBe(1000)
  })

  it('factura de compra (DTE 46): se retiene todo el IVA y al productor se le paga el neto', () => {
    const r = liquidar({ pesoBruto: 1000, tara: 0, precioKilo: 500 }, { ...base, tipoDocumento: 'FACTURA_COMPRA' })
    expect([Number(r.iva), Number(r.retencionIva), Number(r.montoAPagar)]).toEqual([95000, 95000, 500000])
  })

  it('cambio de sujeto parcial: retiene el % del neto definido para el producto', () => {
    const r = liquidar({ pesoBruto: 1000, tara: 0, precioKilo: 500 }, { ...base, retencionIvaPct: 11, tipoDocumento: 'FACTURA_PROVEEDOR' })
    expect([Number(r.retencionIva), Number(r.montoAPagar)]).toEqual([55000, 540000])
  })

  it('rechaza tara mayor o igual al bruto y castigos totales', () => {
    expect(() => liquidar({ pesoBruto: 100, tara: 100, precioKilo: 1 }, { ...base, tipoDocumento: 'FACTURA_COMPRA' })).toThrow(/tara/)
    expect(() => liquidar({ pesoBruto: 100, tara: 0, impurezasPct: 100, precioKilo: 1 }, { ...base, tipoDocumento: 'FACTURA_COMPRA' })).toThrow(/castigo/)
  })

  it('los anticipos se descuentan del más antiguo sin pasarse del pago', () => {
    const r = aplicarAnticipos(D(1000), [{ id: 'a', saldo: D(300) }, { id: 'b', saldo: D(900) }, { id: 'c', saldo: D(50) }])
    expect(r.aplicaciones.map((a) => [a.anticipoId, Number(a.monto)])).toEqual([['a', 300], ['b', 700]])
    expect([Number(r.aplicado), Number(r.aPagar)]).toEqual([1000, 0])
    expect(Number(aplicarAnticipos(D(1000), [{ id: 'a', saldo: D(200) }]).aPagar)).toBe(800)
  })

  it('el F29 suma el IVA retenido a terceros al total a pagar', () => {
    const r = resumenIva([], [], 0, 95000)
    expect([Number(r.retencionIva), Number(r.totalAPagar)]).toEqual([95000, 95000])
  })
})

describe('salida de lotes (FEFO)', () => {
  const lote = (id: string, cantidad: number, vence: string | null, ingreso: string) => ({
    id, cantidadActual: D(cantidad), fechaVencimiento: vence ? new Date(vence) : null, fechaIngreso: new Date(ingreso),
  })

  it('sale primero lo que vence antes; lo sin vencimiento al final', () => {
    const r = repartirFefo([lote('sin', 100, null, '2026-01-01'), lote('tarde', 5, '2026-12-01', '2026-01-02'), lote('pronto', 5, '2026-11-01', '2026-01-03')], 12)
    expect(r.partes.map((p) => [p.loteId, Number(p.cantidad)])).toEqual([['pronto', 5], ['tarde', 5], ['sin', 2]])
    expect(Number(r.sinLote)).toBe(0)
  })

  it('si no alcanzan los lotes, informa lo que sale sin lote', () => {
    expect(Number(repartirFefo([lote('a', 3, null, '2026-01-01')], 5).sinLote)).toBe(2)
  })
})
