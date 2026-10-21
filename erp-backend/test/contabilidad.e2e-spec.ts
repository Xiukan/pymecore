import { abrirCaja, auth, CASA_MATRIZ, cerrar, Contexto, iniciar, PROVEEDOR_DEMO } from './helpers'

describe('contabilidad automática, informes y cierre de mes', () => {
  let ctx: Contexto
  const n = (v: string | number) => Number(v)
  const hoy = (() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })()
  const mes = hoy.slice(0, 7)
  // Un mes pasado y sin otros movimientos aísla los montos de esta prueba.
  const MES_PASADO = '2025-03'
  const get = (url: string) => ctx.http().get(url).set(auth(ctx.admin))
  const sumar = (asientos: any[], lado: 'debe' | 'haber') => asientos.flatMap((a) => a.lineas).reduce((s, l) => s + n(l[lado]), 0)
  let luz: string

  beforeAll(async () => {
    ctx = await iniciar()
    await ctx.db.stockLocal.updateMany({ where: { sucursalId: CASA_MATRIZ }, data: { stockActual: 1000 } })
    luz = (await ctx.db.categoriaGasto.findUniqueOrThrow({ where: { nombre: 'Servicios básicos' } })).id
    await abrirCaja(ctx, ctx.admin)
  })
  afterAll(() => cerrar(ctx))

  const gasto = (fecha: string, extra: object = {}) =>
    ctx.http().post('/gastos').set(auth(ctx.admin)).send({
      categoriaId: luz, tipoDocumento: 'FACTURA', proveedorId: PROVEEDOR_DEMO, numeroDocumento: `LUZ-${Date.now()}${Math.floor(Math.random() * 1000)}`,
      monto: 10000, fecha, descripcion: 'Cuenta de luz', ...extra,
    })

  it('solo el administrador ve la contabilidad', async () => {
    await ctx.http().get('/contabilidad/resultados').set(auth(ctx.vendedor)).expect(403)
    await get('/contabilidad/diario?mes=2025-13').expect(400)
  })

  it('una venta genera su asiento y el diario del mes cuadra', async () => {
    const cafe = await ctx.item('ITEM-001')
    const venta = (await ctx.http().post('/transactions').set(auth(ctx.admin))
      .send({ sucursalId: CASA_MATRIZ, tipoTransaccion: 'VENTA', medioPago: 'Efectivo', detalles: [{ itemId: cafe, cantidad: 1, precioUnitario: 3490 }] })
      .expect(201)).body
    const { asientos } = (await get(`/contabilidad/diario?mes=${mes}`).expect(200)).body
    const propio = asientos.find((a: any) => a.origenTipo === 'VENTA' && a.glosa.includes(venta.numeroFactura ?? ''))
    expect(propio.lineas.find((l: any) => l.cuenta === '1101').debe).toBe('3490')
    expect(propio.lineas.find((l: any) => l.cuenta === '2102').haber).toBe('557')
    expect(sumar(asientos, 'debe')).toBe(sumar(asientos, 'haber'))
  })

  it('un gasto con factura va a su cuenta con IVA crédito y aparece en el estado de resultados', async () => {
    await gasto(`${MES_PASADO}-10`).expect(201)
    const { asientos } = (await get(`/contabilidad/diario?mes=${MES_PASADO}`).expect(200)).body
    expect(asientos).toHaveLength(1)
    expect(asientos[0].lineas.map((l: any) => [l.cuenta, n(l.debe), n(l.haber)])).toEqual(
      expect.arrayContaining([['5110', 10000, 0], ['1105', 1900, 0], ['2101', 0, 11900]]),
    )
    const r = (await get(`/contabilidad/resultados?desde=${MES_PASADO}-01&hasta=${MES_PASADO}-31`).expect(200)).body
    expect(n(r.totalGastos)).toBe(10000)
    expect(n(r.resultado)).toBe(-10000)
  })

  it('el balance de 8 columnas cuadra', async () => {
    const b = (await get(`/contabilidad/balance?desde=2025-01-01&hasta=${hoy}`).expect(200)).body
    expect(n(b.totales.debe)).toBe(n(b.totales.haber))
    expect(n(b.totales.deudor)).toBe(n(b.totales.acreedor))
    expect(n(b.totales.activo) - n(b.totales.pasivo)).toBe(n(b.resultado))
  })

  it('libro mayor de proveedores lleva saldo corrido', async () => {
    const m = (await get(`/contabilidad/mayor/2101?desde=${MES_PASADO}-01&hasta=${MES_PASADO}-31`).expect(200)).body
    expect(n(m.saldoFinal)).toBe(-11900)
    await get('/contabilidad/mayor/9999').expect(404)
  })

  it('asientos manuales: deben cuadrar y se pueden eliminar', async () => {
    await ctx.http().post('/contabilidad/asientos').set(auth(ctx.admin))
      .send({ fecha: `${MES_PASADO}-01`, glosa: 'Mal', lineas: [{ cuenta: '1102', debe: 100 }, { cuenta: '3101', haber: 90 }] }).expect(400)
    const a = (await ctx.http().post('/contabilidad/asientos').set(auth(ctx.admin))
      .send({ fecha: `${MES_PASADO}-01`, glosa: 'Aporte de capital', lineas: [{ cuenta: '1102', debe: 500000 }, { cuenta: '3101', haber: 500000 }] }).expect(201)).body
    // Regenerar el mes conserva el asiento manual.
    expect((await get(`/contabilidad/diario?mes=${MES_PASADO}`).expect(200)).body.asientos.some((x: any) => x.id === a.id)).toBe(true)
    await ctx.http().delete(`/contabilidad/asientos/${a.id}`).set(auth(ctx.admin)).expect(200)
  })

  it('un mes cerrado bloquea documentos y anulaciones con esa fecha hasta reabrirlo', async () => {
    const g = (await gasto(`${MES_PASADO}-12`).expect(201)).body
    await ctx.http().post(`/contabilidad/periodos/${MES_PASADO}/cerrar`).set(auth(ctx.admin)).expect(201)
    await ctx.http().post(`/contabilidad/periodos/${MES_PASADO}/cerrar`).set(auth(ctx.admin)).expect(400)
    await ctx.http().post(`/contabilidad/periodos/${mes}/cerrar`).set(auth(ctx.admin)).expect(400)

    const congelado = (await get(`/contabilidad/diario?mes=${MES_PASADO}`).expect(200)).body.asientos.length
    await gasto(`${MES_PASADO}-15`).expect(400)
    await ctx.http().patch(`/gastos/${g.id}/anular`).set(auth(ctx.admin)).expect(400)
    expect((await get(`/contabilidad/diario?mes=${MES_PASADO}`).expect(200)).body.asientos).toHaveLength(congelado)

    await ctx.http().delete(`/contabilidad/periodos/${MES_PASADO}`).set(auth(ctx.admin)).expect(200)
    await ctx.http().patch(`/gastos/${g.id}/anular`).set(auth(ctx.admin)).expect(200)
    expect((await get(`/contabilidad/diario?mes=${MES_PASADO}`).expect(200)).body.asientos).toHaveLength(congelado - 1)
  })
})
