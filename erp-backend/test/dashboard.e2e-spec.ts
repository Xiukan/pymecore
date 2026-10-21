import { auth, cerrar, Contexto, iniciar } from './helpers'

describe('dashboard: gastos y resultado del período', () => {
  let ctx: Contexto
  const hoy = new Date().toISOString().slice(0, 10)
  const dashboard = async () =>
    (await ctx.http().get(`/reportes/dashboard?desde=${hoy}&hasta=${hoy}&granularidad=dia`).set(auth(ctx.admin)).expect(200)).body.kpis

  beforeAll(async () => { ctx = await iniciar() })
  afterAll(() => cerrar(ctx))

  it('un gasto del período suma a gastos y resta del resultado', async () => {
    const antes = await dashboard()
    const arriendo = await ctx.db.categoriaGasto.findUniqueOrThrow({ where: { nombre: 'Útiles y oficina' } })
    await ctx.http().post('/gastos').set(auth(ctx.admin))
      .send({ categoriaId: arriendo.id, tipoDocumento: 'BOLETA', monto: 15000, fecha: hoy, descripcion: 'Papel', medioPago: 'Efectivo' }).expect(201)
    const despues = await dashboard()
    expect(despues.gastos - antes.gastos).toBe(15000)
    expect(antes.resultado - despues.resultado).toBe(15000)
    expect(despues.resultado).toBeCloseTo(despues.margenBruto - despues.costoMermas - despues.gastos, 2)
  })
})
