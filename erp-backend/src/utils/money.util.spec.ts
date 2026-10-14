import { Prisma } from '@prisma/client'
import { allocate, calcularDocumento, calcularDocumentoNeto, peso } from './money.util'

const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v)

describe('money.util', () => {
  it('redondea a pesos con mitad hacia arriba', () => {
    expect(peso('10.5')).toEqual(D(11))
    expect(peso('10.49')).toEqual(D(10))
  })

  it('reparte sin perder pesos', () => {
    const partes = allocate(100, [D(1), D(1), D(1)])
    expect(partes.reduce((s, p) => s.add(p), D(0))).toEqual(D(100))
  })

  it('desglosa el IVA una vez sobre el total afecto y las líneas suman el total', () => {
    const doc = calcularDocumento(
      [
        { cantidad: 3, precioUnitario: 3490, descuentoLinea: 0, afectoIva: true },
        { cantidad: 1, precioUnitario: 1290, descuentoLinea: 0, afectoIva: true },
        { cantidad: 2, precioUnitario: 500, descuentoLinea: 0, afectoIva: false },
      ],
      760,
      19,
    )
    const suma = doc.detalle.reduce((s, l) => s.add(l.subtotal), D(0))
    const ivas = doc.detalle.reduce((s, l) => s.add(l.montoIva), D(0))

    expect(doc.montoTotal).toEqual(D(12000))
    expect(suma).toEqual(doc.montoTotal)
    expect(ivas).toEqual(doc.montoIva)
    expect(doc.detalle[2].montoIva).toEqual(D(0))
    expect(doc.montoNeto.add(doc.montoIva)).toEqual(doc.montoTotal)
  })

  it('rechaza descuentos que dejan montos negativos', () => {
    const linea = { cantidad: 1, precioUnitario: 1000, descuentoLinea: 0, afectoIva: true }
    expect(() => calcularDocumento([linea], 1001, 19)).toThrow(RangeError)
    expect(() => calcularDocumento([{ ...linea, descuentoLinea: 1001 }], 0, 19)).toThrow(RangeError)
  })

  it('la tasa de IVA viene de la configuración', () => {
    const linea = { cantidad: 1, precioUnitario: 1100, descuentoLinea: 0, afectoIva: true }
    expect(calcularDocumento([linea], 0, 10).montoIva).toEqual(D(100))
  })

  it('compras: IVA sobre el neto afecto del documento, no por línea', () => {
    const doc = calcularDocumentoNeto(
      [
        { cantidad: 3, costoUnitario: '333.33', afectoIva: true },
        { cantidad: 2, costoUnitario: 500, afectoIva: false },
      ],
      19,
    )
    expect(doc.subtotales).toEqual([D(1000), D(1000)])
    expect(doc.montoNeto).toEqual(D(2000))
    expect(doc.montoIva).toEqual(D(190))
    expect(doc.montoTotal).toEqual(D(2190))
  })
})
