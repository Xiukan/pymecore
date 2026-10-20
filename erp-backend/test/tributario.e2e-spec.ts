import { abrirCaja, auth, CASA_MATRIZ, cerrar, Contexto, iniciar, PROVEEDOR_DEMO } from './helpers'
import { dteSintetico } from './fixtures/dte-sintetico'

describe('libros de compra/venta y resumen de IVA', () => {
  let ctx: Contexto
  const hoy = new Date().toISOString().slice(0, 10)
  const mes = hoy.slice(0, 7)
  const resumen = async () => (await ctx.http().get(`/tributario/resumen-iva?mes=${mes}`).set(auth(ctx.admin)).expect(200)).body
  const n = (v: string) => Number(v)

  beforeAll(async () => {
    ctx = await iniciar()
    await ctx.db.stockLocal.updateMany({ where: { sucursalId: CASA_MATRIZ }, data: { stockActual: 1000 } })
    await ctx.http().patch('/empresa').set(auth(ctx.admin)).send({ rut: '77.094.287-K' }).expect(200)
    await abrirCaja(ctx, ctx.admin)
  })
  afterAll(() => cerrar(ctx))

  it('solo el administrador y con mes válido', async () => {
    await ctx.http().get(`/tributario/resumen-iva?mes=${mes}`).set(auth(ctx.vendedor)).expect(403)
    await ctx.http().get('/tributario/resumen-iva?mes=2026-13').set(auth(ctx.admin)).expect(400)
  })

  it('cada documento del mes mueve el débito, el crédito y las retenciones que corresponde', async () => {
    const antes = await resumen()
    const cafe = await ctx.item('ITEM-001')

    // Venta: IVA débito 557 (3.490 con IVA incluido).
    await ctx.http().post('/transactions').set(auth(ctx.admin))
      .send({ sucursalId: CASA_MATRIZ, tipoTransaccion: 'VENTA', medioPago: 'Efectivo', detalles: [{ itemId: cafe, cantidad: 1, precioUnitario: 3490 }] }).expect(201)
    // DTE de compra del mes: IVA crédito 1.900.
    await ctx.http().post('/compras/dte').set(auth(ctx.admin)).send({ xml: dteSintetico({ folio: '9001', rutEmisor: '76111111-6', fecha: hoy }) }).expect(201)
    // Factura de combustible: IVA 7.600 no recuperable.
    const combustible = await ctx.db.categoriaGasto.findUniqueOrThrow({ where: { nombre: 'Combustible' } })
    await ctx.http().post('/gastos').set(auth(ctx.admin)).send({ categoriaId: combustible.id, tipoDocumento: 'FACTURA', proveedorId: PROVEEDOR_DEMO, numeroDocumento: `COMB-${Date.now()}`, monto: 40000, fecha: hoy, descripcion: 'Combustible camioneta' }).expect(201)
    // Boleta de honorarios: retención 30.500 (15,25 %).
    const honorarios = await ctx.db.categoriaGasto.findUniqueOrThrow({ where: { nombre: 'Honorarios' } })
    await ctx.http().post('/gastos').set(auth(ctx.admin)).send({ categoriaId: honorarios.id, tipoDocumento: 'BOLETA_HONORARIOS', proveedorId: PROVEEDOR_DEMO, numeroDocumento: `BH-${Date.now()}`, monto: 200000, fecha: hoy, descripcion: 'Contador' }).expect(201)

    const despues = await resumen()
    expect(n(despues.debito) - n(antes.debito)).toBe(557)
    expect(n(despues.credito) - n(antes.credito)).toBe(1900)
    expect(n(despues.ivaNoRecuperable) - n(antes.ivaNoRecuperable)).toBe(7600)
    expect(n(despues.retencionHonorarios) - n(antes.retencionHonorarios)).toBe(30500)
    expect(n(despues.totalAPagar)).toBe(n(despues.ivaAPagar) + n(despues.retencionHonorarios))
  })

  it('los libros detallan cada documento y sus totales cuadran con el resumen', async () => {
    const ventas = (await ctx.http().get(`/tributario/libro-ventas?mes=${mes}`).set(auth(ctx.admin)).expect(200)).body
    const compras = (await ctx.http().get(`/tributario/libro-compras?mes=${mes}`).set(auth(ctx.admin)).expect(200)).body
    const r = await resumen()
    const iva = (totales: any[], tipo: number) => n(totales.find((t) => t.tipoDte === tipo)?.iva ?? '0')
    expect(iva(ventas.totales, 39) + iva(ventas.totales, 33) - iva(ventas.totales, 61)).toBe(n(r.debito))
    expect(compras.filas.some((f: any) => f.folio === '9001' && f.origen === 'DTE recibido')).toBe(true)
    expect(compras.filas.find((f: any) => f.origen === 'Gasto: Combustible')?.ivaRecuperable).toBe(false)
  })
})
