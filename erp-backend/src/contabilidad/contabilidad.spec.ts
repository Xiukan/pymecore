import { Prisma } from '@prisma/client'
import {
  asientoAbono,
  asientoCierreCaja,
  asientoFacturaCompra,
  asientoGasto,
  asientoManual,
  asientoPagoProveedor,
  asientoRecepcion,
  asientoVenta,
  Borrador,
  cuadra,
  CUENTA,
  debe,
  haber,
} from './asientos'
import { balanceOchoColumnas, estadoResultados, mayor, mesesEntre, SumaCuenta } from './informes'

const D = (v: number) => new Prisma.Decimal(v)
const ver = (b: Borrador | null) => Object.fromEntries(b!.lineas.map((l) => [l.cuenta, l.debe.isZero() ? -Number(l.haber) : Number(l.debe)]))

describe('asientos automáticos', () => {
  it('venta en efectivo: caja, ventas netas, IVA débito y costo de lo vendido', () => {
    const a = asientoVenta({ id: 'v', fecha: '2026-10-01', tipo: 'VENTA', folio: '10', medioPago: 'Efectivo', total: D(11900), iva: D(1900), costo: D(6000) })
    expect(ver(a)).toEqual({ [CUENTA.CAJA]: 11900, [CUENTA.VENTAS]: -10000, [CUENTA.IVA_DEBITO]: -1900, [CUENTA.COSTO_VENTAS]: 6000, [CUENTA.MERCADERIAS]: -6000 })
    expect(a!.glosa).toBe('Venta N° 10')
    expect(cuadra(a!.lineas)).toBe(true)
  })

  it('venta con pago mixto reparte el cobro entre las cuentas de cada medio', () => {
    const a = asientoVenta({
      id: 'v', fecha: '2026-10-01', tipo: 'VENTA', folio: null, medioPago: 'Efectivo', total: D(11900), iva: D(1900), costo: D(0),
      pagos: [{ medio: 'Efectivo', monto: D(5000) }, { medio: 'Tarjeta', monto: D(6900) }],
    })
    expect(ver(a)).toMatchObject({ [CUENTA.CAJA]: 5000, [CUENTA.TARJETAS]: 6900 })
  })

  it('venta a crédito queda en clientes y el abono la descarga', () => {
    expect(ver(asientoVenta({ id: 'v', fecha: '2026-10-01', tipo: 'VENTA', folio: null, medioPago: 'Credito', total: D(1190), iva: D(190), costo: D(0) }))).toMatchObject({ [CUENTA.CLIENTES]: 1190 })
    expect(ver(asientoAbono({ id: 'a', fecha: '2026-10-02', monto: D(500), medio: 'Transferencia' }))).toEqual({ [CUENTA.BANCO]: 500, [CUENTA.CLIENTES]: -500 })
  })

  it('devolución revierte venta, IVA y costo', () => {
    const a = asientoVenta({ id: 'd', fecha: '2026-10-03', tipo: 'DEVOLUCION', folio: null, medioPago: 'Efectivo', total: D(1190), iva: D(190), costo: D(600) })
    expect(ver(a)).toEqual({ [CUENTA.DEVOLUCIONES]: 1000, [CUENTA.IVA_DEBITO]: 190, [CUENTA.CAJA]: -1190, [CUENTA.MERCADERIAS]: 600, [CUENTA.COSTO_VENTAS]: -600 })
  })

  it('merma sin costo no genera asiento', () => {
    expect(asientoVenta({ id: 'm', fecha: '2026-10-03', tipo: 'MERMA', folio: null, medioPago: 'NoAplica', total: D(0), iva: D(0), costo: D(0) })).toBeNull()
  })

  it('compra: recepción a puente, factura contra proveedor, pago desde banco', () => {
    expect(ver(asientoRecepcion({ id: 'r', fecha: '2026-10-01', folioOc: 1, valor: D(10000) }))).toEqual({ [CUENTA.MERCADERIAS]: 10000, [CUENTA.RECIBIDO_POR_FACTURAR]: -10000 })
    expect(ver(asientoFacturaCompra({ id: 'f', fecha: '2026-10-02', folio: '5', neto: D(10000), iva: D(1900), total: D(11900) }))).toEqual({
      [CUENTA.RECIBIDO_POR_FACTURAR]: 10000, [CUENTA.IVA_CREDITO]: 1900, [CUENTA.PROVEEDORES]: -11900,
    })
    expect(ver(asientoPagoProveedor({ origenTipo: 'PAGO_FACTURA', id: 'f', fecha: '2026-10-05', glosa: 'x', monto: D(11900), medio: 'Transferencia' }))).toEqual({
      [CUENTA.PROVEEDORES]: 11900, [CUENTA.BANCO]: -11900,
    })
  })

  it('gasto con factura recupera IVA; honorarios separan la retención', () => {
    expect(ver(asientoGasto({ id: 'g', fecha: '2026-10-01', descripcion: 'Luz', cuenta: '5110', monto: D(10000), total: D(11900), retencion: D(0) }))).toEqual({
      '5110': 10000, [CUENTA.IVA_CREDITO]: 1900, [CUENTA.PROVEEDORES]: -11900,
    })
    expect(ver(asientoGasto({ id: 'h', fecha: '2026-10-01', descripcion: 'Contador', cuenta: '5109', monto: D(100000), total: D(100000), retencion: D(15250) }))).toEqual({
      '5109': 100000, [CUENTA.PROVEEDORES]: -84750, [CUENTA.RETENCIONES]: -15250,
    })
  })

  it('cierre de caja: faltante es gasto, sobrante es ingreso', () => {
    expect(ver(asientoCierreCaja({ id: 'c', fecha: '2026-10-01', diferencia: D(-490) }))).toEqual({ [CUENTA.DIFERENCIAS_CAJA]: 490, [CUENTA.CAJA]: -490 })
    expect(ver(asientoCierreCaja({ id: 'c', fecha: '2026-10-01', diferencia: D(200) }))).toEqual({ [CUENTA.CAJA]: 200, [CUENTA.OTROS_INGRESOS]: -200 })
  })

  it('asiento manual debe cuadrar', () => {
    expect(() => asientoManual({ fecha: '2026-10-01', glosa: 'x', lineas: [debe('1101', D(100)), haber('3101', D(90))] })).toThrow(/no suman/)
    expect(asientoManual({ fecha: '2026-10-01', glosa: 'Aporte', lineas: [debe('1102', D(100)), haber('3101', D(100))] })).toHaveLength(2)
  })
})

describe('informes', () => {
  const c = (codigo: string, tipo: SumaCuenta['tipo'], d: number, h: number): SumaCuenta => ({ codigo, nombre: codigo, tipo, debe: D(d), haber: D(h) })
  const cuentas = [
    c('1101', 'ACTIVO', 11900, 0),
    c('1106', 'ACTIVO', 10000, 6000),
    c('2101', 'PASIVO', 0, 10000),
    c('2102', 'PASIVO', 0, 1900),
    c('4101', 'INGRESO', 0, 10000),
    c('5101', 'GASTO', 6000, 0),
    c('5110', 'GASTO', 0, 0),
  ]

  it('balance de 8 columnas cuadra y el resultado iguala inventario', () => {
    const b = balanceOchoColumnas(cuentas)
    expect(b.filas.map((f) => f.codigo)).not.toContain('5110')
    expect(b.totales.debe.eq(b.totales.haber)).toBe(true)
    expect(b.totales.deudor.eq(b.totales.acreedor)).toBe(true)
    expect(Number(b.resultado)).toBe(4000)
    expect(Number(b.totales.activo.sub(b.totales.pasivo))).toBe(4000)
  })

  it('estado de resultados separa costo de lo vendido y gastos', () => {
    const e = estadoResultados([...cuentas, c('5110', 'GASTO', 1500, 0)])
    expect([Number(e.totalIngresos), Number(e.totalCostos), Number(e.margen), Number(e.totalGastos), Number(e.resultado)]).toEqual([10000, 6000, 4000, 1500, 2500])
  })

  it('libro mayor con saldo corrido desde el saldo inicial', () => {
    const m = mayor(D(100), [
      { fecha: '2026-10-01', glosa: 'a', debe: D(50), haber: D(0) },
      { fecha: '2026-10-02', glosa: 'b', debe: D(0), haber: D(30) },
    ])
    expect(m.filas.map((f) => Number(f.saldo))).toEqual([150, 120])
    expect(Number(m.saldoFinal)).toBe(120)
  })

  it('meses entre fechas, cruzando el año', () => {
    expect(mesesEntre('2025-11-15', '2026-02-01')).toEqual(['2025-11', '2025-12', '2026-01', '2026-02'])
  })
})
