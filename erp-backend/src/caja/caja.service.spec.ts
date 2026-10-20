import { resumir } from './caja.service'

describe('arqueo de caja', () => {
  it('esperado = fondo + ventas en efectivo − reembolsos en efectivo; otros medios no cuentan', () => {
    const r = resumir(20000, [
      { tipoTransaccion: 'VENTA', medioPago: 'Efectivo', montoTotal: 10470 },
      { tipoTransaccion: 'VENTA', medioPago: 'Efectivo', montoTotal: 3490 },
      { tipoTransaccion: 'VENTA', medioPago: 'Tarjeta', montoTotal: 50000 },
      { tipoTransaccion: 'NOTA_CREDITO', medioPago: 'Efectivo', montoTotal: 3490 },
      { tipoTransaccion: 'DEVOLUCION', medioPago: 'Tarjeta', montoTotal: 1000 },
    ])
    expect(r.efectivoEsperado).toBe('30470')
    expect(r.totalVentas).toBe('63960')
    expect(r.porMedio.find((m) => m.medio === 'Efectivo')).toEqual({ medio: 'Efectivo', ventas: 2, montoVentas: '13960', reembolsos: 1, montoReembolsos: '3490' })
    expect(r.porMedio.find((m) => m.medio === 'Tarjeta')).toMatchObject({ ventas: 1, reembolsos: 1 })
  })

  it('sin movimientos el esperado es el fondo inicial', () => {
    expect(resumir(15000, []).efectivoEsperado).toBe('15000')
  })
})
