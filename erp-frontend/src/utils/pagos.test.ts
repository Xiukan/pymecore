import { describe, expect, it } from 'vitest'
import { repartirPago } from './pagos'

describe('pago mixto', () => {
  it('el resto del total va al segundo medio', () => {
    expect(repartirPago(3490, 1490, 'Tarjeta')).toEqual([
      { medioPago: 'Efectivo', monto: 1490 },
      { medioPago: 'Tarjeta', monto: 2000 },
    ])
  })

  it('sin efectivo o con efectivo que cubre todo no es mixto', () => {
    expect(repartirPago(3490, 0, 'Tarjeta')).toBeNull()
    expect(repartirPago(3490, 3490, 'Transferencia')).toBeNull()
    expect(repartirPago(3490, Number.NaN, 'Tarjeta')).toBeNull()
  })
})
