import { Prisma } from '@prisma/client'
import { costoPromedio } from './compras.service'

const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v)

describe('costo promedio ponderado', () => {
  it('pondera el stock existente con lo recibido', () => {
    // 100 u a $1.800 + 50 u a $2.100 = $1.900
    expect(costoPromedio('ingreso', D(100), D(1800), D(50), D(2100))).toEqual(D(1900))
  })

  it('sin stock previo toma el costo de la compra', () => {
    expect(costoPromedio('ingreso', D(0), D(1800), D(10), D('2050.5'))).toEqual(D('2050.5'))
  })

  it('el reverso de una recepción deja el costo anterior', () => {
    const subido = costoPromedio('ingreso', D(100), D(1800), D(50), D(2100))!
    expect(costoPromedio('reverso', D(100), subido, D(50), D(2100))).toEqual(D(1800))
  })

  it('el reverso que vacía el stock no recalcula', () => {
    expect(costoPromedio('reverso', D(0), D(1900), D(50), D(2100))).toBeNull()
  })

  it('redondea a dos decimales', () => {
    expect(costoPromedio('ingreso', D(3), D(1), D(1), D(2))).toEqual(D('1.25'))
    expect(costoPromedio('ingreso', D(2), D(1), D(1), D(2))).toEqual(D('1.33'))
  })
})
