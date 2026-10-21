import { abrirCaja, auth, CASA_MATRIZ, cerrar, Contexto, iniciar, PROVEEDOR_DEMO } from './helpers'

describe('cuentas por cobrar y por pagar', () => {
  let ctx: Contexto
  let cafe: string
  let cliente: { id: string }
  const venta = (medioPago: string, cantidad = 1, entidadId?: string) =>
    ctx.http().post('/transactions').set(auth(ctx.admin))
      .send({ sucursalId: CASA_MATRIZ, tipoTransaccion: 'VENTA', medioPago, entidadId, detalles: [{ itemId: cafe, cantidad, precioUnitario: 3490 }] })
  const abonar = (transaccionId: string, monto: number, medioPago = 'Efectivo') =>
    ctx.http().post('/cuentas/abonos').set(auth(ctx.admin)).send({ transaccionId, monto, medioPago })
  const porCobrar = async () => (await ctx.http().get('/cuentas/por-cobrar').set(auth(ctx.admin)).expect(200)).body

  beforeAll(async () => {
    ctx = await iniciar()
    cafe = await ctx.item('ITEM-001')
    await ctx.db.stockLocal.updateMany({ where: { sucursalId: CASA_MATRIZ }, data: { stockActual: 1000 } })
    await abrirCaja(ctx, ctx.admin, CASA_MATRIZ, 0)
    cliente = (await ctx.http().post('/entidades').set(auth(ctx.admin))
      .send({ tipoEntidad: 'CLIENTE', rut: '11111111-1', nombreRazonSocial: 'Almacén Crédito', cupoCredito: 20000, diasCredito: 30 }).expect(201)).body
  })
  afterAll(() => cerrar(ctx))

  it('la venta a crédito exige cliente con cupo', async () => {
    await venta('Credito').expect(400)
    const sinCupo = (await ctx.http().post('/entidades').set(auth(ctx.admin)).send({ tipoEntidad: 'CLIENTE', rut: '22222222-2', nombreRazonSocial: 'Sin crédito' }).expect(201)).body
    await venta('Credito', 1, sinCupo.id).expect(400)
  })

  it('ventas simultáneas no sobrepasan el cupo', async () => {
    // Cupo 20.000: caben 5 cafés (17.450), no 6.
    const res = await Promise.all(Array.from({ length: 8 }, () => venta('Credito', 1, cliente.id)))
    expect(res.filter((r) => r.status === 201)).toHaveLength(5)
    const { clientes } = await porCobrar()
    expect(Number(clientes.find((c: any) => c.cliente.id === cliente.id).saldo)).toBe(17450)
  })

  it('abonos simultáneos no superan el saldo y el efectivo entra a la caja', async () => {
    const venta1 = await ctx.db.transaccion.findFirstOrThrow({ where: { entidadId: cliente.id, medioPago: 'Credito' } })
    const antes = Number((await ctx.http().get('/caja/actual').set(auth(ctx.admin))).body.resumen.efectivoEsperado)
    const res = await Promise.all([abonar(venta1.id, 2000), abonar(venta1.id, 2000)])
    expect(res.filter((r) => r.status === 201)).toHaveLength(1)
    await abonar(venta1.id, 1490, 'Transferencia').expect(201)
    await abonar(venta1.id, 1).expect(400)
    const caja = (await ctx.http().get('/caja/actual').set(auth(ctx.admin))).body
    expect(Number(caja.resumen.efectivoEsperado) - antes).toBe(2000)
    const { clientes } = await porCobrar()
    expect(Number(clientes.find((c: any) => c.cliente.id === cliente.id).saldo)).toBe(17450 - 3490)
  })

  it('una devolución a crédito rebaja la deuda solo sobre ventas a crédito', async () => {
    const credito = await ctx.db.transaccion.findFirstOrThrow({ where: { entidadId: cliente.id, medioPago: 'Credito', abonos: { none: {} } } })
    const devolver = (origen: string, medioPago: string) =>
      ctx.http().post('/transactions').set(auth(ctx.admin)).send({ sucursalId: CASA_MATRIZ, tipoTransaccion: 'NOTA_CREDITO', medioPago, transaccionOrigenId: origen, detalles: [{ itemId: cafe, cantidad: 1 }] })
    await devolver(credito.id, 'Credito').expect(201)
    const contado = (await venta('Tarjeta').expect(201)).body
    await devolver(contado.id, 'Credito').expect(400)
    const { clientes } = await porCobrar()
    expect(Number(clientes.find((c: any) => c.cliente.id === cliente.id).saldo)).toBe(17450 - 3490 - 3490)
  })

  it('por pagar: facturas de compra y gastos, pago una sola vez', async () => {
    const hoy = new Date().toISOString().slice(0, 10)
    const otros = await ctx.db.categoriaGasto.findUniqueOrThrow({ where: { nombre: 'Otros' } })
    const gasto = (await ctx.http().post('/gastos').set(auth(ctx.admin)).send({ categoriaId: otros.id, tipoDocumento: 'BOLETA', monto: 12000, fecha: hoy, descripcion: 'Por pagar' }).expect(201)).body
    const oc = (await ctx.http().post('/compras/ordenes').set(auth(ctx.admin)).send({ proveedorId: PROVEEDOR_DEMO, sucursalId: CASA_MATRIZ, detalles: [{ itemId: cafe, cantidad: 1, costoUnitario: 1000 }] }).expect(201)).body
    await ctx.http().post(`/compras/ordenes/${oc.id}/recepciones`).set(auth(ctx.admin)).send({ detalles: [{ detalleId: oc.detalles[0].id, cantidad: 1 }] }).expect(201)
    const factura = (await ctx.http().post(`/compras/ordenes/${oc.id}/facturas`).set(auth(ctx.admin)).send({ folio: `PP-${Date.now()}`, fechaEmision: hoy, detalles: [{ detalleId: oc.detalles[0].id, cantidad: 1, costoUnitario: 1000 }] }).expect(201)).body

    const { documentos } = (await ctx.http().get('/cuentas/por-pagar').set(auth(ctx.admin)).expect(200)).body
    expect(documentos.some((d: any) => d.id === gasto.id && Number(d.saldo) === 12000)).toBe(true)
    expect(documentos.some((d: any) => d.id === factura.id && Number(d.saldo) === 1190)).toBe(true)

    const pagos = await Promise.all([1, 2].map(() => ctx.http().patch(`/cuentas/facturas-compra/${factura.id}/pagar`).set(auth(ctx.admin)).send({ medioPago: 'Transferencia' })))
    expect(pagos.filter((p) => p.status === 200)).toHaveLength(1)
    await ctx.http().get('/cuentas/por-pagar').set(auth(ctx.vendedor)).expect(403)
  })
})
