import { abrirCaja, auth, CASA_MATRIZ, cerrar, Contexto, iniciar, SUCURSAL_NORTE } from './helpers'

const CLIENTE = '00000000-0000-0000-0000-000000000002'

describe('listas de precios, cotizaciones y pedidos', () => {
  let ctx: Contexto
  let cafe: string
  const post = (url: string, body: object, token = ctx.admin) => ctx.http().post(url).set(auth(token)).send(body)
  const vigente = async (entidadId?: string) =>
    (await ctx.http().get(`/precios/vigentes${entidadId ? `?entidadId=${entidadId}` : ''}`).set(auth(ctx.vendedor)).expect(200)).body[cafe]

  beforeAll(async () => {
    ctx = await iniciar()
    cafe = await ctx.item('ITEM-001')
    await ctx.db.stockLocal.updateMany({ where: { sucursalId: CASA_MATRIZ }, data: { stockActual: 1000 } })
    await ctx.db.oferta.updateMany({ data: { activo: false } })
    await ctx.db.sesionCaja.updateMany({ where: { estado: 'ABIERTA' }, data: { estado: 'CERRADA', cerradaEn: new Date(), efectivoContado: 0 } })
  })
  afterAll(() => cerrar(ctx))

  it('el cliente con lista mayorista paga su precio y la venta lo exige', async () => {
    const lista = (await post('/precios/listas', { nombre: `Mayorista ${Date.now()}` }).expect(201)).body
    await ctx.http().put(`/precios/listas/${lista.id}/precios`).set(auth(ctx.admin)).send({ precios: [{ itemId: cafe, precio: 3000 }] }).expect(200)
    await ctx.http().patch(`/precios/clientes/${CLIENTE}/lista`).set(auth(ctx.vendedor)).send({ listaPrecioId: lista.id }).expect(403)
    await ctx.http().patch(`/precios/clientes/${CLIENTE}/lista`).set(auth(ctx.admin)).send({ listaPrecioId: lista.id }).expect(200)
    expect([await vigente(), await vigente(CLIENTE)]).toEqual(['3490', '3000'])

    await abrirCaja(ctx, ctx.admin)
    const venta = (precioUnitario: number) =>
      post('/transactions', { sucursalId: CASA_MATRIZ, entidadId: CLIENTE, tipoTransaccion: 'VENTA', medioPago: 'Efectivo', detalles: [{ itemId: cafe, cantidad: 1, precioUnitario }] })
    expect((await venta(3490).expect(400)).body.message).toMatch(/cambió a \$3000/)
    await venta(3000).expect(201)
  })

  it('una oferta más baja que la lista gana', async () => {
    const o = await ctx.db.oferta.create({ data: { itemId: cafe, precioOferta: 2500, fechaInicio: new Date(Date.now() - 86_400_000), fechaFin: new Date(Date.now() + 86_400_000) } })
    expect(await vigente(CLIENTE)).toBe('2500')
    await ctx.db.oferta.update({ where: { id: o.id }, data: { activo: false } })
  })

  it('cotización → pedido → venta, sin vender dos veces', async () => {
    const cot = (await post('/pedidos', { entidadId: CLIENTE, sucursalId: CASA_MATRIZ, detalles: [{ itemId: cafe, cantidad: 2 }], validoHasta: '2099-01-01' }).expect(201)).body
    expect([cot.estado, cot.total, cot.detalles[0].precioUnitario]).toEqual(['COTIZACION', '6000', '3000'])
    await ctx.http().patch(`/pedidos/${cot.id}/confirmar`).set(auth(ctx.admin)).expect(200)
    await ctx.http().patch(`/pedidos/${cot.id}/confirmar`).set(auth(ctx.admin)).expect(400)

    const ventas = await Promise.all([1, 2].map(() => post(`/pedidos/${cot.id}/vender`, { medioPago: 'Transferencia' })))
    expect(ventas.map((r) => r.status).sort()).toEqual([201, 400])
    const ok = ventas.find((r) => r.status === 201)!.body
    expect(ok.pedido.estado).toBe('VENDIDO')
    expect(ok.pedido.transaccion.id).toBe(ok.venta.id)
    expect(ok.venta.montoTotal).toBe('6000')
    await ctx.http().patch(`/pedidos/${cot.id}/anular`).set(auth(ctx.admin)).expect(400)
  })

  it('si la venta falla, el pedido vuelve a su estado', async () => {
    const p = (await post('/pedidos', { entidadId: CLIENTE, sucursalId: CASA_MATRIZ, confirmado: true, detalles: [{ itemId: cafe, cantidad: 1 }] }).expect(201)).body
    await post(`/pedidos/${p.id}/vender`, { medioPago: 'Efectivo' }, ctx.vendedor).expect(400) // el vendedor no tiene caja abierta
    expect((await ctx.http().get(`/pedidos/${p.id}`).set(auth(ctx.admin)).expect(200)).body.estado).toBe('PEDIDO')
  })

  it('un vendedor no cotiza ni ve pedidos de otra sucursal', async () => {
    await post('/pedidos', { entidadId: CLIENTE, sucursalId: SUCURSAL_NORTE, detalles: [{ itemId: cafe, cantidad: 1 }] }, ctx.vendedor).expect(403)
    const ajeno = (await post('/pedidos', { entidadId: CLIENTE, sucursalId: SUCURSAL_NORTE, detalles: [{ itemId: cafe, cantidad: 1 }] }).expect(201)).body
    await ctx.http().get(`/pedidos/${ajeno.id}`).set(auth(ctx.vendedor)).expect(404)
  })
})
