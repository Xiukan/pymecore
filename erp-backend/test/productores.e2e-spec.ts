import { abrirCaja, auth, CASA_MATRIZ, cerrar, Contexto, iniciar, PROVEEDOR_DEMO, SUCURSAL_NORTE } from './helpers'

describe('compras a productores, anticipos y lotes', () => {
  let ctx: Contexto
  let cafe: string
  const n = (v: string | number) => Number(v)
  const hoy = (() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })()
  const post = (url: string, body: object, token = ctx.admin) => ctx.http().post(url).set(auth(token)).send(body)
  const recepcion = (extra: object = {}) =>
    post('/productores/recepciones', {
      productorId: PROVEEDOR_DEMO, sucursalId: CASA_MATRIZ, itemId: cafe, pesoBruto: 1050, tara: 50, precioKilo: 500,
      tipoDocumento: 'FACTURA_COMPRA', fechaVencimiento: '2027-01-31', ...extra,
    })
  let rec: any

  beforeAll(async () => {
    ctx = await iniciar()
    cafe = await ctx.item('ITEM-001')
    await abrirCaja(ctx, ctx.admin)
  })
  afterAll(() => cerrar(ctx))

  it('el vendedor no registra compras a productores', async () => {
    await ctx.http().get('/productores/recepciones').set(auth(ctx.vendedor)).expect(403)
  })

  it('anticipo y recepción con factura de compra: stock, lote y retención total del IVA', async () => {
    await post('/productores/anticipos', { productorId: PROVEEDOR_DEMO, monto: 100000, medioPago: 'Transferencia', descripcion: 'Adelanto de cosecha' }).expect(201)
    const antes = await ctx.stock(cafe)
    rec = (await recepcion().expect(201)).body
    expect([n(rec.kilosPagables), n(rec.montoNeto), n(rec.iva), n(rec.retencionIva), n(rec.montoAPagar)]).toEqual([1000, 500000, 95000, 95000, 500000])
    expect(rec.lote.codigo).toBe(`RP-${rec.folio}`)
    expect((await ctx.stock(cafe)) - antes).toBe(1000)
  })

  it('factura del productor exige folio y no se repite', async () => {
    await recepcion({ tipoDocumento: 'FACTURA_PROVEEDOR' }).expect(400)
    await recepcion({ tipoDocumento: 'FACTURA_PROVEEDOR', folioDocumento: 'F-77', pesoBruto: 10, tara: 0 }).expect(201)
    await recepcion({ tipoDocumento: 'FACTURA_PROVEEDOR', folioDocumento: 'F-77', pesoBruto: 10, tara: 0 }).expect(400)
    await recepcion({ tara: 2000 }).expect(400)
  })

  it('la venta sale del lote que vence primero, la devolución vuelve a él y la trazabilidad lo muestra', async () => {
    const lotes = (await ctx.http().get(`/lotes?itemId=${cafe}&sucursalId=${CASA_MATRIZ}&conSaldo=true`).set(auth(ctx.admin)).expect(200)).body
    expect(lotes[0].id).toBe(rec.lote.id)
    const venta = (await post('/transactions', { sucursalId: CASA_MATRIZ, tipoTransaccion: 'VENTA', medioPago: 'Efectivo', detalles: [{ itemId: cafe, cantidad: 3, precioUnitario: 3490 }] }).expect(201)).body
    const saldo = async () => n((await ctx.db.lote.findUniqueOrThrow({ where: { id: rec.lote.id } })).cantidadActual)
    expect(await saldo()).toBe(997)
    await post('/transactions', { sucursalId: CASA_MATRIZ, tipoTransaccion: 'DEVOLUCION', medioPago: 'Efectivo', transaccionOrigenId: venta.id, tipoDevolucion: 'FALLA', detalles: [{ itemId: cafe, cantidad: 1 }] }).expect(201)
    expect(await saldo()).toBe(998)
    const t = (await ctx.http().get(`/lotes/${rec.lote.id}`).set(auth(ctx.admin)).expect(200)).body
    expect(t.productor.rut).toBeTruthy()
    expect(t.movimientos.find((m: any) => m.tipo === 'VENTA').documento.id).toBe(venta.id)
  })

  it('una recepción con parte del lote vendida no se anula', async () => {
    await ctx.http().patch(`/productores/recepciones/${rec.id}/anular`).set(auth(ctx.admin)).expect(400)
  })

  it('el despacho lleva el lote a la otra sucursal con el mismo código', async () => {
    const guia = (await post('/guias-despacho', { sucursalOrigenId: CASA_MATRIZ, sucursalDestinoId: SUCURSAL_NORTE, detalles: [{ itemId: cafe, cantidad: 5 }] }).expect(201)).body
    await ctx.http().patch(`/guias-despacho/${guia.id}/recibir`).set(auth(ctx.admin)).expect(200)
    const norte = await ctx.db.lote.findUnique({ where: { codigo_sucursalId: { codigo: rec.lote.codigo, sucursalId: SUCURSAL_NORTE } } })
    expect(n(norte!.cantidadActual)).toBe(5)
    expect(n((await ctx.db.lote.findUniqueOrThrow({ where: { id: rec.lote.id } })).cantidadActual)).toBe(993)
  })

  it('al pagar se descuentan los anticipos y la cuenta del productor queda al día', async () => {
    const pagada = (await post(`/productores/recepciones/${rec.id}/pagar`, { medioPago: 'Transferencia' }).expect(201)).body
    expect(n(pagada.anticipoAplicado)).toBe(100000)
    await post(`/productores/recepciones/${rec.id}/pagar`, { medioPago: 'Transferencia' }).expect(400)
    const cuenta = (await ctx.http().get(`/productores/${PROVEEDOR_DEMO}/cuenta`).set(auth(ctx.admin)).expect(200)).body
    expect(n(cuenta.anticipado)).toBe(0)
  })

  it('libro de compras, F29 y contabilidad reflejan la factura de compra', async () => {
    const mes = hoy.slice(0, 7)
    const compras = (await ctx.http().get(`/tributario/libro-compras?mes=${mes}`).set(auth(ctx.admin)).expect(200)).body
    expect(compras.filas.some((f: any) => f.tipoDte === 46 && f.folio === String(rec.folio))).toBe(true)
    const iva = (await ctx.http().get(`/tributario/resumen-iva?mes=${mes}`).set(auth(ctx.admin)).expect(200)).body
    expect(n(iva.retencionIva)).toBeGreaterThanOrEqual(95000)
    const { asientos } = (await ctx.http().get(`/contabilidad/diario?mes=${mes}`).set(auth(ctx.admin)).expect(200)).body
    const asiento = (tipo: string) => asientos.find((a: any) => a.origenTipo === tipo && a.glosa.includes(`N° ${rec.folio}`))
    expect(asiento('RECEPCION_PRODUCTOR').lineas.find((l: any) => l.cuenta === '2103').haber).toBe('95000')
    expect(asiento('PAGO_PRODUCTOR').lineas.find((l: any) => l.cuenta === '1107').haber).toBe('100000')
  })

  it('una recepción intacta y sin pagar se anula y devuelve el stock', async () => {
    const otra = (await recepcion({ pesoBruto: 20, tara: 0 }).expect(201)).body
    const antes = await ctx.stock(cafe)
    await ctx.http().patch(`/productores/recepciones/${otra.id}/anular`).set(auth(ctx.admin)).expect(200)
    expect(antes - (await ctx.stock(cafe))).toBe(20)
  })
})
