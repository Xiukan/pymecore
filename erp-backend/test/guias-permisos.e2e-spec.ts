import { randomUUID } from 'crypto'
import { auth, CASA_MATRIZ, cerrar, Contexto, iniciar, SUCURSAL_NORTE } from './helpers'

describe('guías de despacho, alcance por sucursal y errores', () => {
  let ctx: Contexto
  let cafe: string
  const guia = (cantidad = 10) =>
    ctx.http().post('/guias-despacho').set(auth(ctx.admin))
      .send({ sucursalOrigenId: CASA_MATRIZ, sucursalDestinoId: SUCURSAL_NORTE, detalles: [{ itemId: cafe, cantidad }] })

  beforeAll(async () => {
    ctx = await iniciar()
    cafe = await ctx.item('ITEM-001')
    await ctx.db.stockLocal.updateMany({ where: { sucursalId: CASA_MATRIZ }, data: { stockActual: 1000 } })
  })
  afterAll(() => cerrar(ctx))

  it('crea guías desde la casa matriz con folios correlativos únicos aun en paralelo', async () => {
    const res = await Promise.all(Array.from({ length: 6 }, () => guia(1)))
    expect(res.every((r) => r.status === 201)).toBe(true)
    const folios = res.map((r) => r.body.folio)
    expect(new Set(folios).size).toBe(6)
  })

  it('recibir 5 veces en paralelo suma el stock una sola vez', async () => {
    const { body } = await guia(10).expect(201)
    const antes = await ctx.stock(cafe, SUCURSAL_NORTE)
    const res = await Promise.all([1, 2, 3, 4, 5].map(() => ctx.http().patch(`/guias-despacho/${body.id}/recibir`).set(auth(ctx.admin))))
    expect(res.filter((r) => r.status === 200)).toHaveLength(1)
    expect((await ctx.stock(cafe, SUCURSAL_NORTE)) - antes).toBe(10)
  })

  it('recibir y anular en paralelo no crea mercadería', async () => {
    const { body } = await guia(10).expect(201)
    const total = async () => (await ctx.stock(cafe)) + (await ctx.stock(cafe, SUCURSAL_NORTE))
    const antes = await total()
    const res = await Promise.all([
      ctx.http().patch(`/guias-despacho/${body.id}/recibir`).set(auth(ctx.admin)),
      ctx.http().patch(`/guias-despacho/${body.id}/anular`).set(auth(ctx.admin)),
    ])
    expect(res.filter((r) => r.status === 200)).toHaveLength(1)
    expect((await total()) - antes).toBe(10)
  })

  it('un vendedor no lee documentos de otra sucursal', async () => {
    const admin = await ctx.db.usuario.findUniqueOrThrow({ where: { username: 'admin' } })
    const ajena = await ctx.db.transaccion.create({
      data: { sucursalId: SUCURSAL_NORTE, usuarioId: admin.id, tipoTransaccion: 'VENTA', montoTotal: 1000, numeroFactura: '987654' },
    })
    await ctx.http().get('/transactions/folio/987654').set(auth(ctx.vendedor)).expect(404)
    await ctx.http().get('/transactions/folio/987654').set(auth(ctx.admin)).expect(200)
    await ctx.http().get(`/transactions/${ajena.id}`).set(auth(ctx.admin)).expect(200)
  })

  it('el vendedor ve solo pendientes SII de su sucursal aunque pida otra', async () => {
    const { body } = await ctx.http().get(`/sync/pendientes?sucursalId=${SUCURSAL_NORTE}`).set(auth(ctx.vendedor)).expect(200)
    const propios = await ctx.db.transaccion.count({ where: { sincronizacion: 'PENDIENTE', sucursalId: CASA_MATRIZ } })
    expect(body.pendientes).toBe(propios)
  })

  it('identificadores inválidos o inexistentes responden 4xx, no 500', async () => {
    await ctx.http().get('/transactions/abc').set(auth(ctx.admin)).expect(400)
    await ctx.http().get(`/transactions/${randomUUID()}`).set(auth(ctx.admin)).expect(404)
    await ctx.http().patch('/guias-despacho/abc/recibir').set(auth(ctx.admin)).expect(400)
    await ctx.http().get(`/guias-despacho/${randomUUID()}`).set(auth(ctx.admin)).expect(404)
    await ctx.http().patch(`/items/${randomUUID()}`).set(auth(ctx.admin)).send({ nombre: 'x' }).expect(404)
  })

  it('ajustar stock queda registrado con usuario, valores y motivo', async () => {
    const fila = await ctx.db.stockLocal.findUniqueOrThrow({ where: { sucursalId_itemId: { sucursalId: CASA_MATRIZ, itemId: cafe } } })
    await ctx.http().patch(`/stock/${fila.id}`).set(auth(ctx.admin)).send({ stockActual: 77, motivo: 'Conteo físico' }).expect(200)
    const ajuste = await ctx.db.ajusteStock.findFirstOrThrow({ where: { stockLocalId: fila.id }, orderBy: { creadoEn: 'desc' } })
    expect([Number(ajuste.anterior), Number(ajuste.nuevo), ajuste.motivo]).toEqual([Number(fila.stockActual), 77, 'Conteo físico'])
  })

  it('la base rechaza stock negativo aunque falle la aplicación', async () => {
    await expect(ctx.db.stockLocal.updateMany({ where: { itemId: cafe }, data: { stockActual: -1 } })).rejects.toThrow()
  })
})
