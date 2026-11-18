import { Prisma } from '@prisma/client'
import { cuotaDepreciacion, depreciacionAcumulada, mesesDesde, proyectarFlujo, valorLibro } from './calculo'
import { leerCartola, leerFecha, leerMonto } from './cartola'

const D = (v: number) => new Prisma.Decimal(v)

describe('cartola', () => {
  it('lee montos y fechas en formato chileno', () => {
    expect([leerMonto('1.234.567'), leerMonto('-1.234,60'), leerMonto('$ 500'), leerMonto('')]).toEqual([1234567, -1235, 500, 0])
    expect([leerFecha('05/03/2026'), leerFecha('5-3-2026'), leerFecha('2026-03-05')]).toEqual(['2026-03-05', '2026-03-05', '2026-03-05'])
  })

  it('cargo y abono por separado, con separador punto y coma y comillas', () => {
    const r = leerCartola('Fecha;Descripción;Cargo;Abono\n01/10/2026;"Transf. a Proveedor; SpA";11.900;\n02/10/2026;Depósito Transbank;;35.000\n')
    expect(r.map((x) => [x.fecha, x.descripcion, x.monto])).toEqual([['2026-10-01', 'Transf. a Proveedor; SpA', -11900], ['2026-10-02', 'Depósito Transbank', 35000]])
  })

  it('columna única de monto y huellas distintas para movimientos idénticos', () => {
    const r = leerCartola('fecha,detalle,monto\n2026-10-01,Comisión,-990\n2026-10-01,Comisión,-990\n')
    expect(r).toHaveLength(2)
    expect(r[0].huella).not.toBe(r[1].huella)
    expect(leerCartola('fecha,detalle,monto\n2026-10-01,Comisión,-990\n')[0].huella).toBe(r[0].huella)
  })

  it('rechaza archivos sin las columnas necesarias', () => {
    expect(() => leerCartola('a;b\n1;2')).toThrow(/columnas/)
    expect(() => leerCartola('fecha;detalle;monto')).toThrow(/movimientos/)
  })
})

describe('activos fijos', () => {
  it('cuotas lineales y la última absorbe el redondeo', () => {
    const cuotas = [1, 2, 3].map((n) => Number(cuotaDepreciacion(D(1000), D(0), 3, n)))
    expect(cuotas).toEqual([333, 333, 334])
    expect(Number(cuotaDepreciacion(D(1000), D(0), 3, 4))).toBe(0)
  })

  it('parte el mes siguiente a la compra y nunca supera lo depreciable', () => {
    expect(mesesDesde(new Date('2026-01-15'), '2026-01')).toBe(0)
    expect(mesesDesde(new Date('2026-01-15'), '2027-01')).toBe(12)
    expect(Number(depreciacionAcumulada(D(12000000), D(2000000), 60, 100))).toBe(10000000)
    const v = valorLibro({ valorCompra: D(12000000), valorResidual: D(2000000), vidaUtilMeses: 60, fechaCompra: new Date('2026-01-10') }, '2026-07')
    expect([Number(v.acumulada), Number(v.valorLibro)]).toEqual([1000002, 10999998])
  })
})

describe('flujo de caja', () => {
  it('agrupa por semana, lo vencido va a la primera y avisa saldo negativo', () => {
    const r = proyectarFlujo(100000, [
      { fecha: '2026-09-01', monto: 20000, tipo: 'COBRO', detalle: 'atrasado' },
      { fecha: '2026-10-21', monto: -150000, tipo: 'PAGO', detalle: 'proveedor' },
      { fecha: '2026-10-28', monto: 50000, tipo: 'COBRO', detalle: 'cliente' },
      { fecha: '2027-12-01', monto: 1, tipo: 'COBRO', detalle: 'fuera de rango' },
    ], '2026-10-20', 2)
    expect(r.semanas.map((s) => [s.desde, s.entradas, s.salidas, s.saldo])).toEqual([['2026-10-20', 20000, 150000, -30000], ['2026-10-27', 50000, 0, 20000]])
    expect(r.alerta).toMatch(/2026-10-20/)
  })
})
