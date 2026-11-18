import { Prisma } from '@prisma/client'
import { compararConteo, sugerirCompra } from './conteo'

const D = (v: number) => new Prisma.Decimal(v)

describe('conteo físico', () => {
  it('separa faltantes y sobrantes valorizados a costo; lo que cuadra no aparece', () => {
    const r = compararConteo([
      { itemId: 'a', nombre: 'A', sistema: D(10), contado: D(8), costo: D(1500) },
      { itemId: 'b', nombre: 'B', sistema: D(5), contado: D(6), costo: D(990) },
      { itemId: 'c', nombre: 'C', sistema: D(3), contado: D(3), costo: D(100) },
    ])
    expect(r.diferencias.map((d) => [d.itemId, Number(d.diferencia), Number(d.valor)])).toEqual([['a', -2, -3000], ['b', 1, 990]])
    expect([Number(r.faltante), Number(r.sobrante), Number(r.neto), r.cuadran]).toEqual([3000, 990, -2010, 1])
  })
})

describe('sugerencia de compra', () => {
  it('cubre la venta de los días objetivo más el mínimo, descontando stock y lo por recibir', () => {
    const r = sugerirCompra({ vendido30: D(60), stock: D(10), minimo: D(5), porRecibir: D(20), diasObjetivo: 30 })
    expect([Number(r.ventaDiaria), Number(r.diasCobertura), Number(r.sugerido)]).toEqual([2, 5, 35])
  })

  it('sin ventas y sobre el mínimo no sugiere; redondea hacia arriba', () => {
    expect(Number(sugerirCompra({ vendido30: D(0), stock: D(10), minimo: D(5), porRecibir: D(0), diasObjetivo: 30 }).sugerido)).toBe(0)
    expect(sugerirCompra({ vendido30: D(0), stock: D(10), minimo: D(5), porRecibir: D(0), diasObjetivo: 30 }).diasCobertura).toBeNull()
    expect(Number(sugerirCompra({ vendido30: D(10), stock: D(0), minimo: D(0), porRecibir: D(0), diasObjetivo: 7 }).sugerido)).toBe(3)
  })
})
