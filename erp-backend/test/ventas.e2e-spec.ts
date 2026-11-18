import { randomUUID } from 'crypto'
import { abrirCaja, auth, CASA_MATRIZ, cerrar, Contexto, iniciar } from './helpers'

describe('ventas', () => {
  let ctx: Contexto
  let cafe: string
  let agua: string
  const venta = (token: string, detalles: object[], extra: object = {}, clave?: string) => {
    const req = ctx.http().post('/transactions').set(auth(token))
    if (clave) req.set('Idempotency-Key', clave)
    return req.send({ sucursalId: CASA_MATRIZ, tipoTransaccion: 'VENTA', medioPago: 'Efectivo', detalles, ...extra })
  }

  beforeAll(async () => {
    ctx = await iniciar()
    cafe = await ctx.item('ITEM-001')
    agua = await ctx.item('ITEM-003')
    await ctx.db.stockLocal.updateMany({ where: { sucursalId: CASA_MATRIZ }, data: { stockActual: 1000 } })
    await abrirCaja(ctx, ctx.vendedor)
    await abrirCaja(ctx, ctx.admin)
  })
  afterAll(() => cerrar(ctx))

  it('cobra el precio vigente con IVA incluido y en pesos enteros', async () => {
    const { body } = await venta(ctx.vendedor, [{ itemId: cafe, cantidad: 3, precioUnitario: 3490 }]).expect(201)
    expect(body.montoTotal).toBe('10470')
    expect(body.detalles[0].montoIva).toBe('1672')
    expect(body.sincronizacion).toBe('PENDIENTE')
  })

  it('rechaza un precio distinto al del servidor', async () => {
    const { body } = await venta(ctx.vendedor, [{ itemId: cafe, cantidad: 1, precioUnitario: 1 }]).expect(400)
    expect(body.message).toMatch(/cambió/)
  })

  it('registra al vendedor del token, no el del cuerpo', async () => {
    const admin = await ctx.db.usuario.findUniqueOrThrow({ where: { username: 'admin' } })
    const { body } = await venta(ctx.vendedor, [{ itemId: cafe, cantidad: 1, precioUnitario: 3490 }], { usuarioId: admin.id }).expect(201)
    expect(body.usuarioId).not.toBe(admin.id)
  })

  it('rechaza venta vacía, descuento mayor al total e ítem inválido sin error 500', async () => {
    await venta(ctx.vendedor, []).expect(400)
    await venta(ctx.vendedor, [{ itemId: cafe, cantidad: 1, precioUnitario: 3490 }], { descuentoGlobal: 100000 }).expect(400)
    await venta(ctx.vendedor, [{ itemId: 'abc', cantidad: 1 }]).expect(400)
    await venta(ctx.vendedor, [{ itemId: cafe, cantidad: 1, precioUnitario: 3490 }], { entidadId: randomUUID() }).expect(400)
  })

  it('el producto exento no lleva IVA', async () => {
    const { body } = await venta(ctx.vendedor, [{ itemId: agua, cantidad: 2, precioUnitario: 590 }]).expect(201)
    expect(body.detalles[0].montoIva).toBe('0')
  })

  describe('concurrencia', () => {
    it('ventas simultáneas nunca dejan el stock negativo', async () => {
      await ctx.db.stockLocal.update({ where: { sucursalId_itemId: { sucursalId: CASA_MATRIZ, itemId: agua } }, data: { stockActual: 5 } })
      const res = await Promise.all(Array.from({ length: 15 }, () => venta(ctx.vendedor, [{ itemId: agua, cantidad: 2, precioUnitario: 590 }])))
      const ok = res.filter((r) => r.status === 201).length
      expect(ok).toBe(2)
      expect(await ctx.stock(agua)).toBe(1)
    })

    it('ventas simultáneas reciben folios distintos', async () => {
      const res = await Promise.all(Array.from({ length: 10 }, () => venta(ctx.vendedor, [{ itemId: cafe, cantidad: 1, precioUnitario: 3490 }])))
      const folios = res.map((r) => r.body.numeroFactura).filter(Boolean)
      expect(folios).toHaveLength(10)
      expect(new Set(folios).size).toBe(10)
    })

    it('la misma Idempotency-Key en paralelo crea una sola venta', async () => {
      const clave = randomUUID()
      const antes = await ctx.db.transaccion.count()
      const res = await Promise.all(Array.from({ length: 8 }, () => venta(ctx.vendedor, [{ itemId: cafe, cantidad: 1, precioUnitario: 3490 }], {}, clave)))
      expect(new Set(res.map((r) => r.body.id)).size).toBe(1)
      expect(await ctx.db.transaccion.count()).toBe(antes + 1)
    })

    it('la misma clave con otro carrito responde 409', async () => {
      const clave = randomUUID()
      await venta(ctx.vendedor, [{ itemId: cafe, cantidad: 1, precioUnitario: 3490 }], {}, clave).expect(201)
      await venta(ctx.vendedor, [{ itemId: cafe, cantidad: 2, precioUnitario: 3490 }], {}, clave).expect(409)
    })
  })

  describe('devoluciones y notas de crédito', () => {
    let origen: { id: string }
    const devolver = (token: string, cantidad: number, itemId = cafe) =>
      ctx.http().post('/transactions').set(auth(token)).send({
        sucursalId: CASA_MATRIZ, tipoTransaccion: 'DEVOLUCION', transaccionOrigenId: origen.id, detalles: [{ itemId, cantidad }],
      })

    beforeAll(async () => {
      origen = (await venta(ctx.admin, [{ itemId: cafe, cantidad: 3, precioUnitario: 3490 }]).expect(201)).body
    })

    it('exige la venta de origen', () =>
      ctx.http().post('/transactions').set(auth(ctx.admin))
        .send({ sucursalId: CASA_MATRIZ, tipoTransaccion: 'NOTA_CREDITO', detalles: [{ itemId: cafe, cantidad: 1 }] })
        .expect(400))

    it('no devuelve un ítem que no estaba en la venta', () => devolver(ctx.admin, 1, agua).expect(400))

    it('devoluciones en paralelo no superan lo vendido y suman exactamente el monto', async () => {
      const res = await Promise.all([1, 2, 3, 4].map(() => devolver(ctx.admin, 1)))
      expect(res.filter((r) => r.status === 201)).toHaveLength(3)
      const total = (await ctx.db.transaccion.aggregate({ where: { transaccionOrigenId: origen.id }, _sum: { montoTotal: true } }))._sum.montoTotal
      expect(Number(total)).toBe(10470)
    })

    it('un vendedor no devuelve su propia venta', async () => {
      const propia = (await venta(ctx.vendedor, [{ itemId: cafe, cantidad: 1, precioUnitario: 3490 }]).expect(201)).body
      origen = propia
      await devolver(ctx.vendedor, 1).expect(403)
      await devolver(ctx.admin, 1).expect(201)
    })
  })

  describe('mermas', () => {
    const merma = (token: string, motivo?: string) =>
      ctx.http().post('/transactions').set(auth(token))
        .send({ sucursalId: CASA_MATRIZ, tipoTransaccion: 'MERMA', motivoMerma: motivo, detalles: [{ itemId: cafe, cantidad: 1 }] })

    it('solo Administrador o Encargado, con motivo, valorizada a costo', async () => {
      await merma(ctx.vendedor, 'Vencido').expect(403)
      await merma(ctx.admin).expect(400)
      const { body } = await merma(ctx.admin, 'Vencido').expect(201)
      expect(body.motivoMerma).toBe('Vencido')
      const item = await ctx.db.item.findUniqueOrThrow({ where: { id: cafe } })
      // La merma se registra en pesos enteros sobre el costo promedio vigente.
      expect(body.montoTotal).toBe(String(Math.round(Number(item.costoPromedio))))
    })

    it('las compras se registran en el módulo de Compras', () =>
      ctx.http().post('/transactions').set(auth(ctx.admin))
        .send({ sucursalId: CASA_MATRIZ, tipoTransaccion: 'COMPRA', detalles: [{ itemId: cafe, cantidad: 1, precioUnitario: 1 }] })
        .expect(400))
  })
})
