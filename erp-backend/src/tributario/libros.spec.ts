import { Prisma } from '@prisma/client'
import { FilaLibro, resumenIva, totalesPorTipo } from './libros'

const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v)
const fila = (tipoDte: number, neto: number, iva: number, extra: Partial<FilaLibro> = {}): FilaLibro => ({
  fecha: '2026-10-01', tipoDte, folio: '1', rut: '1-9', razonSocial: 'x',
  neto: D(neto), exento: D(0), iva: D(iva), otros: D(0), total: D(neto + iva), ...extra,
})

describe('libros e IVA', () => {
  it('totaliza por tipo de documento', () => {
    const t = totalesPorTipo([fila(39, 1000, 190), fila(39, 2000, 380), fila(61, 1000, 190)])
    expect(t).toEqual([
      expect.objectContaining({ tipoDte: 39, documentos: 2, iva: D(570) }),
      expect.objectContaining({ tipoDte: 61, documentos: 1, iva: D(190) }),
    ])
  })

  it('débito menos NC, crédito solo recuperable, más retención de honorarios', () => {
    const r = resumenIva(
      [fila(39, 100000, 19000), fila(33, 50000, 9500), fila(61, 10000, 1900)],
      [fila(33, 40000, 7600), fila(33, 20000, 3800, { ivaRecuperable: false }), fila(61, 5000, 950)],
      30500,
    )
    expect(r.debito).toEqual(D(26600))
    expect(r.credito).toEqual(D(6650))
    expect(r.ivaNoRecuperable).toEqual(D(3800))
    expect(r.ivaAPagar).toEqual(D(19950))
    expect(r.remanente).toEqual(D(0))
    expect(r.totalAPagar).toEqual(D(50450))
    expect(r.ventasNetas).toEqual(D(140000))
  })

  it('si el crédito supera al débito queda remanente y no hay IVA a pagar', () => {
    const r = resumenIva([fila(39, 10000, 1900)], [fila(33, 100000, 19000)], 0)
    expect(r.ivaAPagar).toEqual(D(0))
    expect(r.remanente).toEqual(D(17100))
  })
})
