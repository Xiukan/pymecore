import { Prisma } from '@prisma/client'
import { carenciaVigente, costosPorCuartel, finCarencia, liquidarTrabajador, montoLabor } from './calculo'

const D = (v: number) => new Prisma.Decimal(v)

describe('campo', () => {
  it('la carencia termina N días después de la aplicación', () => {
    expect(finCarencia(new Date('2026-10-01'), 14)).toBe('2026-10-15')
  })

  it('manda la carencia más larga que siga vigente', () => {
    const aps = [
      { fecha: new Date('2026-10-01'), carenciaDias: 7, objetivo: 'Oídio' },
      { fecha: new Date('2026-10-05'), carenciaDias: 21, objetivo: 'Polilla' },
    ]
    expect(carenciaVigente(aps, '2026-10-10')).toEqual({ hasta: '2026-10-26', objetivo: 'Polilla' })
    expect(carenciaVigente(aps, '2026-10-26')).toBeNull()
  })

  it('trato: cantidad por tarifa en pesos enteros', () => {
    expect(Number(montoLabor(312.5, 85))).toBe(26563)
  })

  it('liquidación descuenta solo anticipos que caben completos', () => {
    const r = liquidarTrabajador(D(100000), [{ id: 'a', monto: D(60000) }, { id: 'b', monto: D(50000) }, { id: 'c', monto: D(30000) }])
    expect(r.aplicados).toEqual(['a', 'c'])
    expect([Number(r.anticipos), Number(r.aPagar)]).toEqual([90000, 10000])
  })

  it('costo por cuartel: real vs presupuesto, por hectárea y por kilo', () => {
    const [c] = costosPorCuartel(
      [{ id: 'c1', nombre: 'Norte', predio: 'Fundo', cultivo: 'Manzano', hectareas: D(2) }],
      [{ cuartelId: 'c1', categoria: 'INSUMOS', monto: D(300000) }, { cuartelId: 'c1', categoria: 'MANO_OBRA', monto: D(700000) }],
      [{ cuartelId: 'c1', categoria: 'INSUMOS', monto: D(250000) }],
      [{ cuartelId: 'c1', kilos: D(40000) }],
    )
    expect([Number(c.real), Number(c.presupuesto), Number(c.desviacion), Number(c.costoKilo), Number(c.costoHa), Number(c.rendimientoHa)]).toEqual([1000000, 250000, 750000, 25, 500000, 20000])
    expect(c.categorias.find((x) => x.categoria === 'MANO_OBRA')!.real.toString()).toBe('700000')
  })

  it('sin cosecha no hay costo por kilo', () => {
    expect(costosPorCuartel([{ id: 'c', nombre: 'x', predio: 'p', cultivo: 'c', hectareas: D(0) }], [], [], [])[0].costoKilo).toBeNull()
  })
})
