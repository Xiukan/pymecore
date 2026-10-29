import { auth, CASA_MATRIZ, cerrar, Contexto, iniciar, PROVEEDOR_DEMO } from './helpers'

// PBI-03: fecha de vencimiento real y alerta a 3 días (AC-05) o "Sin dato" (AC-06 · AUTO-0006).
describe('alertas de vencimiento del inventario', () => {
  let ctx: Contexto
  let semilla: string
  let fertilizante: string
  let herramienta: string
  const hoy = (() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })()
  const enDias = (n: number) => new Date(Date.parse(`${hoy}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)
  const post = (url: string, body: object, token = ctx.admin) => ctx.http().post(url).set(auth(token)).send(body)
  const alertas = async () => (await ctx.http().get(`/inventario/alertas?sucursalId=${CASA_MATRIZ}`).set(auth(ctx.vendedor)).expect(200)).body as any[]
  const de = (lista: any[], itemId: string) => lista.filter((a) => a.productoId === itemId)

  beforeAll(async () => {
    ctx = await iniciar()
    ;[semilla, fertilizante, herramienta] = await Promise.all(['ITEM-001', 'ITEM-002', 'ITEM-003'].map((s) => ctx.item(s)))
    await ctx.db.lote.updateMany({ where: { sucursalId: CASA_MATRIZ }, data: { cantidadActual: 0 } })
    await ctx.db.stockLocal.updateMany({ where: { sucursalId: CASA_MATRIZ }, data: { stockActual: 10 } })
    await ctx.http().patch('/empresa').set(auth(ctx.admin)).send({ diasAlertaVencimiento: 3 }).expect(200)
  })
  afterAll(() => cerrar(ctx))

  it('AC-05: un lote a 3 días o menos aparece "Próximo a vencer"; uno lejano, OK; uno pasado, Vencido', async () => {
    await post('/lotes', { itemId: semilla, sucursalId: CASA_MATRIZ, cantidad: 4, fechaVencimiento: enDias(2) }).expect(201)
    await post('/lotes', { itemId: semilla, sucursalId: CASA_MATRIZ, cantidad: 3, fechaVencimiento: enDias(-1) }).expect(201)
    await post('/lotes', { itemId: fertilizante, sucursalId: CASA_MATRIZ, cantidad: 10, fechaVencimiento: enDias(30) }).expect(201)
    const a = await alertas()
    expect(de(a, semilla).map((x) => [x.estadoVencimiento, x.diasRestantes, Number(x.cantidad)])).toEqual(
      expect.arrayContaining([['PROXIMO_A_VENCER', 2, 4], ['VENCIDO', -1, 3], ['SIN_DATO', null, 3]]),
    )
    expect(de(a, fertilizante).map((x) => x.estadoVencimiento)).toEqual(['OK'])
    expect(a[0].estadoVencimiento).toBe('VENCIDO')
  })

  it('AUTO-0006 · AC-06: un insumo sin fecha muestra "Sin dato" y no genera alerta', async () => {
    const h = de(await alertas(), herramienta)
    expect(h).toHaveLength(1)
    expect(h[0]).toMatchObject({ estadoVencimiento: 'SIN_DATO', diasRestantes: null })
    const porVencer = (await ctx.http().get('/lotes/por-vencer?dias=3').set(auth(ctx.admin)).expect(200)).body
    expect(porVencer.some((l: any) => l.itemId === herramienta)).toBe(false)
  })

  it('no se puede asignar fecha a más stock del que no tiene lote', async () => {
    const r = await post('/lotes', { itemId: fertilizante, sucursalId: CASA_MATRIZ, cantidad: 1, fechaVencimiento: enDias(5) }).expect(400)
    expect(r.body.message).toMatch(/Solo hay 0/)
    await post('/lotes', { itemId: semilla, sucursalId: CASA_MATRIZ, cantidad: 1, fechaVencimiento: enDias(5) }, ctx.vendedor).expect(403)
  })

  it('al recibir una compra con fecha de vencimiento, el insumo queda como lote', async () => {
    const oc = (await post('/compras/ordenes', { proveedorId: PROVEEDOR_DEMO, sucursalId: CASA_MATRIZ, detalles: [{ itemId: herramienta, cantidad: 6, costoUnitario: 500 }] }).expect(201)).body
    await post(`/compras/ordenes/${oc.id}/recepciones`, { detalles: [{ detalleId: oc.detalles[0].id, cantidad: 6, fechaVencimiento: enDias(1) }] }).expect(201)
    const h = de(await alertas(), herramienta)
    expect(h.map((x) => [x.estadoVencimiento, Number(x.cantidad)])).toEqual(expect.arrayContaining([['PROXIMO_A_VENCER', 6], ['SIN_DATO', 10]]))
  })

  it('RNF-MAN-01: el umbral se cambia por configuración, sin tocar la pantalla', async () => {
    await ctx.http().patch('/empresa').set(auth(ctx.admin)).send({ diasAlertaVencimiento: 45 }).expect(200)
    expect(de(await alertas(), fertilizante)[0].estadoVencimiento).toBe('PROXIMO_A_VENCER')
    await ctx.http().patch('/empresa').set(auth(ctx.admin)).send({ diasAlertaVencimiento: 3 }).expect(200)
  })
})
