import { Prisma } from '@prisma/client'
import { elegirPrecio } from './precios'

const D = (v: number) => new Prisma.Decimal(v)

describe('precio de venta', () => {
  it('sin lista ni ofertas, el precio normal', () => {
    expect(Number(elegirPrecio(D(3490)))).toBe(3490)
  })

  it('la lista del cliente reemplaza al precio normal aunque sea mayor', () => {
    expect(Number(elegirPrecio(D(3490), D(3600)))).toBe(3600)
  })

  it('la oferta más baja gana sobre la lista', () => {
    expect(Number(elegirPrecio(D(3490), D(3000), [D(3200), D(2500)]))).toBe(2500)
    expect(Number(elegirPrecio(D(3490), D(3000), [D(3200)]))).toBe(3000)
  })
})
