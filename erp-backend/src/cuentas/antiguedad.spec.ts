import { Prisma } from '@prisma/client'
import { sumarDias, sumarPorTramo, tramo } from './antiguedad'

const D = (v: number) => new Prisma.Decimal(v)
const hoy = new Date('2026-10-20T15:00:00Z')

describe('antigüedad de saldos', () => {
  it('clasifica por días desde el vencimiento', () => {
    expect(tramo(new Date('2026-10-20T00:00:00Z'), hoy)).toBe('porVencer')
    expect(tramo(new Date('2026-11-05T00:00:00Z'), hoy)).toBe('porVencer')
    expect(tramo(new Date('2026-10-19T00:00:00Z'), hoy)).toBe('d1a30')
    expect(tramo(new Date('2026-09-20T00:00:00Z'), hoy)).toBe('d1a30')
    expect(tramo(new Date('2026-09-19T00:00:00Z'), hoy)).toBe('d31a60')
    expect(tramo(new Date('2026-08-01T00:00:00Z'), hoy)).toBe('d61a90')
    expect(tramo(new Date('2026-01-01T00:00:00Z'), hoy)).toBe('mas90')
  })

  it('suma saldos por tramo', () => {
    const r = sumarPorTramo([
      { saldo: D(1000), vencimiento: new Date('2026-11-01T00:00:00Z') },
      { saldo: D(500), vencimiento: new Date('2026-10-01T00:00:00Z') },
      { saldo: D(200), vencimiento: new Date('2026-10-02T00:00:00Z') },
    ], hoy)
    expect([r.porVencer, r.d1a30, r.mas90]).toEqual([D(1000), D(700), D(0)])
  })

  it('el vencimiento suma el plazo en días', () => {
    expect(sumarDias(new Date('2026-10-01T12:00:00Z'), 30).toISOString().slice(0, 10)).toBe('2026-10-31')
  })
})
