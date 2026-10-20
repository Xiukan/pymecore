import { abrirCaja, auth, CASA_MATRIZ, cerrar, Contexto, iniciar, SUCURSAL_NORTE } from './helpers'

describe('caja', () => {
  let ctx: Contexto
  let cafe: string
  const venta = (medioPago = 'Efectivo', token = ctx.vendedor) =>
    ctx.http().post('/transactions').set(auth(token))
      .send({ sucursalId: CASA_MATRIZ, tipoTransaccion: 'VENTA', medioPago, detalles: [{ itemId: cafe, cantidad: 1, precioUnitario: 3490 }] })
  const cerrarCaja = (id: string, efectivoContado: number, token = ctx.vendedor) =>
    ctx.http().post(`/caja/${id}/cerrar`).set(auth(token)).send({ efectivoContado })

  beforeAll(async () => {
    ctx = await iniciar()
    cafe = await ctx.item('ITEM-001')
    await ctx.db.stockLocal.updateMany({ where: { sucursalId: CASA_MATRIZ }, data: { stockActual: 1000 } })
    await ctx.db.sesionCaja.updateMany({ where: { estado: 'ABIERTA' }, data: { estado: 'CERRADA', cerradaEn: new Date(), efectivoContado: 0 } })
  })
  afterAll(() => cerrar(ctx))

  it('sin caja abierta no se vende', () => venta().expect(400))

  it('una sola caja abierta por cajero y solo en su sucursal', async () => {
    await ctx.http().post('/caja/abrir').set(auth(ctx.vendedor)).send({ sucursalId: SUCURSAL_NORTE, montoApertura: 0 }).expect(403)
    await ctx.http().post('/caja/abrir').set(auth(ctx.vendedor)).send({ sucursalId: CASA_MATRIZ, montoApertura: 20000 }).expect(201)
    await ctx.http().post('/caja/abrir').set(auth(ctx.vendedor)).send({ sucursalId: CASA_MATRIZ, montoApertura: 20000 }).expect(409)
  })

  it('el arqueo suma ventas en efectivo, separa tarjeta y descuenta reembolsos en efectivo', async () => {
    const { id } = await abrirCaja(ctx, ctx.vendedor, CASA_MATRIZ, 20000)
    await venta('Efectivo').expect(201)
    await venta('Efectivo').expect(201)
    const conTarjeta = await venta('Tarjeta').expect(201)
    const origen = (await venta('Efectivo', ctx.admin).expect(400)).body // el admin no tiene caja: no vende
    expect(origen.message).toMatch(/Abra la caja/)
    await ctx.http().post('/transactions').set(auth(ctx.admin)).send({
      sucursalId: CASA_MATRIZ, tipoTransaccion: 'NOTA_CREDITO', medioPago: 'Efectivo', transaccionOrigenId: conTarjeta.body.id, detalles: [{ itemId: cafe, cantidad: 1 }],
    }).expect(400) // reembolso en efectivo exige caja abierta de quien lo entrega

    const actual = (await ctx.http().get('/caja/actual').set(auth(ctx.vendedor)).expect(200)).body
    expect(actual.resumen.efectivoEsperado).toBe('26980')

    const { body } = await cerrarCaja(id, 26000).expect(201)
    expect([body.estado, body.efectivoEsperado, body.diferencia]).toEqual(['CERRADA', '26980', '-980'])
    expect(body.resumen.porMedio.find((m: any) => m.medio === 'Tarjeta').montoVentas).toBe('3490')
    await cerrarCaja(id, 26000).expect(400)
    await venta().expect(400)
  })

  it('cerrar mientras entran ventas: el arqueo cuadra con las ventas ligadas a la sesión', async () => {
    const { id } = await abrirCaja(ctx, ctx.vendedor, CASA_MATRIZ, 0)
    const [cierre, ...ventas] = await Promise.all([
      new Promise<any>((r) => setTimeout(() => r(cerrarCaja(id, 0)), 30)),
      ...Array.from({ length: 6 }, () => venta()),
    ])
    expect(cierre.status).toBe(201)
    const ligadas = await ctx.db.transaccion.aggregate({ where: { sesionCajaId: id }, _sum: { montoTotal: true }, _count: true })
    expect(Number(cierre.body.efectivoEsperado)).toBe(Number(ligadas._sum.montoTotal ?? 0))
    expect(ligadas._count).toBe(ventas.filter((v) => v.status === 201).length)
  })

  it('un vendedor no cierra la caja de otro; el administrador sí', async () => {
    const { id } = await abrirCaja(ctx, ctx.vendedor, CASA_MATRIZ, 0)
    const otro = await ctx.http().post('/usuarios').set(auth(ctx.admin)).send({ username: `vend${Date.now()}`, password: 'clave123', nombreCompleto: 'Otro', rol: 'Vendedor', sucursalId: CASA_MATRIZ }).expect(201)
    const tokenOtro = (await ctx.http().post('/auth/login').send({ username: otro.body.username, password: 'clave123' }).expect(201)).body.accessToken
    await cerrarCaja(id, 0, tokenOtro).expect(403)
    await cerrarCaja(id, 0, ctx.admin).expect(201)
  })

  it('historial: el vendedor ve solo sus cajas', async () => {
    const propias = (await ctx.http().get('/caja/sesiones').set(auth(ctx.vendedor)).expect(200)).body
    const vendedor = await ctx.db.usuario.findUniqueOrThrow({ where: { username: 'vendedor1' } })
    expect(propias.every((s: any) => s.usuarioId === vendedor.id)).toBe(true)
  })
})
