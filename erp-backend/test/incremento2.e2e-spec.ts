import { abrirCaja, auth, CASA_MATRIZ, cerrar, Contexto, iniciar } from './helpers'

// Incremento 2: baja de lotes vencidos (PBI-06), indicador perdido vs salvado (H-01) y
// umbral de alerta por producto (PBI-07). AC-09 a AC-14.
describe('Incremento 2: mermas por vencimiento y umbral por producto', () => {
  let ctx: Contexto
  let semilla: string
  let fertilizante: string
  const hoy = (() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })()
  const enDias = (n: number) => new Date(Date.parse(`${hoy}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)
  const post = (url: string, body: object, token = ctx.admin) => ctx.http().post(url).set(auth(token)).send(body)
  const alertas = async () => (await ctx.http().get(`/inventario/alertas?sucursalId=${CASA_MATRIZ}`).set(auth(ctx.admin)).expect(200)).body as any[]
  const lote = async (itemId: string, cantidad: number, dias: number) =>
    (await post('/lotes', { itemId, sucursalId: CASA_MATRIZ, cantidad, fechaVencimiento: enDias(dias) }).expect(201)).body
  const mermas = async () => (await ctx.http().get(`/lotes/mermas?desde=${hoy}&hasta=${hoy}`).set(auth(ctx.admin)).expect(200)).body

  beforeAll(async () => {
    ctx = await iniciar()
    ;[semilla, fertilizante] = await Promise.all(['ITEM-001', 'ITEM-002'].map((s) => ctx.item(s)))
    await ctx.db.lote.updateMany({ where: { sucursalId: CASA_MATRIZ }, data: { cantidadActual: 0 } })
    await ctx.db.stockLocal.updateMany({ where: { sucursalId: CASA_MATRIZ }, data: { stockActual: 50 } })
    await ctx.db.item.update({ where: { id: semilla }, data: { costoPromedio: 1000, diasAlertaVencimiento: null } })
    await ctx.db.oferta.updateMany({ data: { activo: false } })
    await ctx.http().patch('/empresa').set(auth(ctx.admin)).send({ diasAlertaVencimiento: 3 }).expect(200)
    await abrirCaja(ctx, ctx.admin)
  })
  afterAll(async () => {
    await ctx.db.lote.updateMany({ where: { sucursalId: CASA_MATRIZ, itemId: { in: [semilla, fertilizante] } }, data: { cantidadActual: 0 } })
    await cerrar(ctx)
  })

  it('AC-09: dar de baja un lote vencido descuenta lote y stock y registra la merma a costo', async () => {
    const l = await lote(semilla, 4, -1)
    const stock = await ctx.stock(semilla)
    const r = (await post(`/lotes/${l.id}/baja`, { motivo: 'VENCIDO' }).expect(201)).body
    expect([Number(r.cantidad), Number(r.valor), Number(r.saldo)]).toEqual([4, 4000, 0])
    expect(await ctx.stock(semilla)).toBe(stock - 4)
    const merma = await ctx.db.transaccion.findUniqueOrThrow({ where: { id: r.mermaId }, include: { detalles: true } })
    expect([merma.tipoTransaccion, Number(merma.montoTotal), merma.motivoMerma]).toEqual(['MERMA', 4000, `Vencido: lote ${l.codigo}`])
    const traza = (await ctx.http().get(`/lotes/${l.id}`).set(auth(ctx.admin)).expect(200)).body
    expect(traza.movimientos.at(-1).tipo).toBe('BAJA_VENCIDO')
  })

  it('AC-10: no se da de baja dos veces ni más de lo que queda (repetición e inválidos)', async () => {
    const l = await lote(semilla, 2, -2)
    const dobles = await Promise.all([post(`/lotes/${l.id}/baja`, { motivo: 'VENCIDO' }), post(`/lotes/${l.id}/baja`, { motivo: 'VENCIDO' })])
    expect(dobles.map((r) => r.status).sort()).toEqual([201, 400])
    const otro = await lote(semilla, 2, -2)
    expect((await post(`/lotes/${otro.id}/baja`, { motivo: 'VENCIDO', cantidad: 3 }).expect(400)).body.message).toMatch(/solo le quedan 2/)
    await post(`/lotes/${otro.id}/baja`, { motivo: 'PERDIDO' }).expect(400)
    await post('/lotes/00000000-0000-0000-0000-00000000dead/baja', { motivo: 'VENCIDO' }).expect(404)
  })

  it('AC-11: un lote que aún no vence solo se retira como "dañado"', async () => {
    const l = await lote(semilla, 3, 10)
    expect((await post(`/lotes/${l.id}/baja`, { motivo: 'VENCIDO' }).expect(400)).body.message).toMatch(/aún no vence/)
    const r = (await post(`/lotes/${l.id}/baja`, { motivo: 'DANADO', cantidad: 1, observacion: 'saco roto' }).expect(201)).body
    expect(Number(r.saldo)).toBe(2)
  })

  it('AC-12: el vendedor no da de baja lotes (permisos)', async () => {
    const l = await lote(semilla, 1, -1)
    await post(`/lotes/${l.id}/baja`, { motivo: 'VENCIDO' }, ctx.vendedor).expect(403)
    await ctx.http().get('/lotes/mermas').set(auth(ctx.vendedor)).expect(403)
  })

  it('AC-13 (H-01): el indicador separa lo perdido de lo salvado por la alerta', async () => {
    const antes = await mermas()
    const l = await lote(fertilizante, 5, 2)
    await ctx.db.item.update({ where: { id: fertilizante }, data: { costoPromedio: 800 } })
    await post('/transactions', { sucursalId: CASA_MATRIZ, tipoTransaccion: 'VENTA', medioPago: 'Efectivo', detalles: [{ itemId: fertilizante, cantidad: 3 }] }).expect(201)
    const despues = await mermas()
    expect(despues.salvado - antes.salvado).toBe(2400)
    expect(despues.perdido).toBeGreaterThanOrEqual(5000)
    expect(despues.tasaPerdida).toBeGreaterThan(0)
    expect(despues.porProducto.find((p: any) => p.itemId === fertilizante).unidadesSalvadas).toBeGreaterThanOrEqual(3)
    expect(l.codigo).toBeTruthy()
  })

  it('AC-14 (PBI-07): un producto con umbral propio avisa antes que el resto', async () => {
    await ctx.db.lote.updateMany({ where: { sucursalId: CASA_MATRIZ }, data: { cantidadActual: 0 } })
    await lote(semilla, 1, 10)
    await lote(fertilizante, 1, 10)
    await ctx.http().patch(`/items/${semilla}`).set(auth(ctx.admin)).send({ diasAlertaVencimiento: 15 }).expect(200)
    await ctx.http().patch(`/items/${semilla}`).set(auth(ctx.admin)).send({ diasAlertaVencimiento: 999 }).expect(400)
    const a = await alertas()
    const de = (id: string) => a.find((x) => x.productoId === id && x.loteId)
    expect([de(semilla).estadoVencimiento, de(semilla).umbralDias]).toEqual(['PROXIMO_A_VENCER', 15])
    expect([de(fertilizante).estadoVencimiento, de(fertilizante).umbralDias]).toEqual(['OK', 3])
    await ctx.http().patch(`/items/${semilla}`).set(auth(ctx.admin)).send({ diasAlertaVencimiento: null }).expect(200)
    expect((await alertas()).find((x) => x.productoId === semilla && x.loteId).umbralDias).toBe(3)
  })

  it('regresión: la contabilidad registra la baja como merma', async () => {
    const { asientos } = (await ctx.http().get(`/contabilidad/diario?mes=${hoy.slice(0, 7)}`).set(auth(ctx.admin)).expect(200)).body
    expect(asientos.some((a: any) => a.origenTipo === 'MERMA' && a.lineas.some((l: any) => l.cuenta === '5102'))).toBe(true)
  })
})
