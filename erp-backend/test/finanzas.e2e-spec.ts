import { auth, cerrar, Contexto, iniciar, PROVEEDOR_DEMO } from './helpers'

describe('bancos, conciliación, flujo de caja y activos fijos', () => {
  let ctx: Contexto
  const n = (v: unknown) => Number(v)
  const hoy = (() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })()
  const enDias = (d: number) => new Date(Date.parse(`${hoy}T00:00:00Z`) + d * 86_400_000).toISOString().slice(0, 10)
  const post = (url: string, body: object) => ctx.http().post(url).set(auth(ctx.admin)).send(body)
  const get = (url: string) => ctx.http().get(url).set(auth(ctx.admin))
  let banco: any
  let luz: string

  beforeAll(async () => {
    ctx = await iniciar()
    luz = (await ctx.db.categoriaGasto.findUniqueOrThrow({ where: { nombre: 'Servicios básicos' } })).id
    banco = (await post('/finanzas/bancos', { banco: 'Banco Estado', numero: `${Date.now()}`, fechaSaldoInicial: hoy, saldoInicial: 100000 }).expect(201)).body
  })
  afterAll(() => cerrar(ctx))

  const gasto = (extra: object) =>
    post('/gastos', { categoriaId: luz, tipoDocumento: 'FACTURA', proveedorId: PROVEEDOR_DEMO, numeroDocumento: `F-${Date.now()}${Math.floor(Math.random() * 1000)}`, monto: 10000, fecha: hoy, descripcion: 'Luz', ...extra })

  it('solo el administrador', async () => {
    await ctx.http().get('/finanzas/bancos').set(auth(ctx.vendedor)).expect(403)
  })

  it('importa la cartola sin duplicar movimientos ya cargados', async () => {
    await gasto({ medioPago: 'Transferencia' }).expect(201)
    const cartola = `Fecha;Descripción;Cargo;Abono\n${hoy.split('-').reverse().join('/')};Transferencia CGE;11.900;\n${hoy};Comisión mantención;990;\n${hoy};Abono Transbank;;5.000\n`
    expect((await post(`/finanzas/bancos/${banco.id}/cartola`, { contenido: cartola }).expect(201)).body).toEqual({ leidos: 3, nuevos: 3, repetidos: 0 })
    expect((await post(`/finanzas/bancos/${banco.id}/cartola`, { contenido: cartola }).expect(201)).body).toEqual({ leidos: 3, nuevos: 0, repetidos: 3 })
    await post(`/finanzas/bancos/${banco.id}/cartola`, { contenido: 'columna;otra\n1;2\n' }).expect(400)
    const [cuenta] = (await get('/finanzas/bancos').expect(200)).body.filter((c: any) => c.id === banco.id)
    expect([n(cuenta.saldoCartola), cuenta.porConciliar]).toEqual([100000 - 11900 - 990 + 5000, 3])
  })

  it('concilia con el documento que calza y no lo deja usar dos veces', async () => {
    const movs = (await get(`/finanzas/bancos/${banco.id}/movimientos?pendientes=true`).expect(200)).body
    const pago = movs.find((m: any) => n(m.monto) === -11900)
    const sugerencias = (await get(`/finanzas/movimientos/${pago.id}/sugerencias`).expect(200)).body
    const doc = sugerencias.find((s: any) => s.tipo === 'PAGO_GASTO')
    expect(doc).toBeTruthy()
    await post(`/finanzas/movimientos/${pago.id}/conciliar`, { tipo: doc.tipo, id: doc.id }).expect(201)
    await post(`/finanzas/movimientos/${pago.id}/conciliar`, { tipo: doc.tipo, id: doc.id }).expect(400)
    const comision = movs.find((m: any) => n(m.monto) === -990)
    await post(`/finanzas/movimientos/${comision.id}/conciliar`, { tipo: doc.tipo, id: doc.id }).expect(400)
  })

  it('lo que no tiene documento se clasifica en una cuenta y genera su asiento', async () => {
    const movs = (await get(`/finanzas/bancos/${banco.id}/movimientos?pendientes=true`).expect(200)).body
    const comision = movs.find((m: any) => n(m.monto) === -990)
    const tarjetas = movs.find((m: any) => n(m.monto) === 5000)
    await post(`/finanzas/movimientos/${comision.id}/conciliar`, { cuentaCodigo: '1102' }).expect(400)
    await post(`/finanzas/movimientos/${comision.id}/conciliar`, { cuentaCodigo: '5114' }).expect(201)
    await post(`/finanzas/movimientos/${tarjetas.id}/conciliar`, { cuentaCodigo: '1103' }).expect(201)
    const { asientos } = (await get(`/contabilidad/diario?mes=${hoy.slice(0, 7)}`).expect(200)).body
    const banco1 = asientos.find((a: any) => a.origenTipo === 'BANCO' && a.glosa.includes('Comisión'))
    expect(banco1.lineas.map((l: any) => [l.cuenta, n(l.debe), n(l.haber)])).toEqual(expect.arrayContaining([['5114', 990, 0], ['1102', 0, 990]]))
    expect((await get(`/finanzas/bancos/${banco.id}/movimientos?pendientes=true`).expect(200)).body).toHaveLength(0)
  })

  it('flujo proyectado: incluye lo por pagar en su semana y parte del saldo disponible', async () => {
    await gasto({ fechaVencimiento: enDias(10), monto: 50000 }).expect(201)
    const f = (await get('/finanzas/flujo?semanas=4').expect(200)).body
    expect(f.semanas).toHaveLength(4)
    expect(typeof f.saldoInicial).toBe('number')
    const semana = f.semanas.find((s: any) => s.detalle.some((d: any) => d.monto === -59500))
    expect(semana.desde <= enDias(10) && enDias(10) <= semana.hasta).toBe(true)
    await get('/finanzas/flujo?semanas=99').expect(400)
  })

  it('activo fijo: compra, depreciación mensual y baja', async () => {
    const a = (await post('/finanzas/activos', { nombre: 'Tractor', categoria: 'Maquinaria', fechaCompra: '2025-01-15', valorCompra: 1200000, vidaUtilMeses: 12, medioPago: 'Transferencia' }).expect(201)).body
    await post('/finanzas/activos', { nombre: 'X', categoria: 'Y', fechaCompra: '2025-01-15', valorCompra: 100, valorResidual: 100, vidaUtilMeses: 12 }).expect(400)
    const feb = (await get('/contabilidad/diario?mes=2025-02').expect(200)).body.asientos
    expect(feb.find((x: any) => x.origenTipo === 'DEPRECIACION').lineas.find((l: any) => l.cuenta === '5104').debe).toBe('100000')
    await ctx.http().patch(`/finanzas/activos/${a.id}/baja`).set(auth(ctx.admin)).send({ fecha: '2025-06-30' }).expect(200)
    const jun = (await get('/contabilidad/diario?mes=2025-06').expect(200)).body.asientos
    expect(jun.find((x: any) => x.origenTipo === 'ACTIVO_BAJA').lineas.find((l: any) => l.cuenta === '5117').debe).toBe('700000')
    expect((await get('/contabilidad/diario?mes=2025-07').expect(200)).body.asientos.some((x: any) => x.origenTipo === 'DEPRECIACION')).toBe(false)
    const lista = (await get('/finanzas/activos').expect(200)).body
    expect(n(lista.find((x: any) => x.id === a.id).valorLibro)).toBe(700000)
  })
})
