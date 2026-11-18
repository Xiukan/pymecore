import { auth, CASA_MATRIZ, cerrar, Contexto, iniciar, PROVEEDOR_DEMO } from './helpers'

describe('campo: cuarteles, cuaderno de campo, cosecha, costos y trabajadores', () => {
  let ctx: Contexto
  const n = (v: unknown) => Number(v)
  const hoy = (() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })()
  const post = (url: string, body: object) => ctx.http().post(url).set(auth(ctx.admin)).send(body)
  const get = (url: string) => ctx.http().get(url).set(auth(ctx.admin))
  let insumo: string
  let fruta: string
  let tratado: any
  let limpio: any
  let temporada: any

  beforeAll(async () => {
    ctx = await iniciar()
    insumo = await ctx.item('ITEM-002')
    fruta = await ctx.item('ITEM-003')
    await ctx.db.item.update({ where: { id: insumo }, data: { costoPromedio: 1000 } })
    await ctx.db.stockLocal.updateMany({ where: { sucursalId: CASA_MATRIZ, itemId: insumo }, data: { stockActual: 100 } })
    const predio = (await post('/campo/predios', { nombre: `Fundo ${Date.now()}`, hectareas: 10 }).expect(201)).body
    tratado = (await post('/campo/cuarteles', { predioId: predio.id, nombre: 'Cuartel 1', cultivo: 'Manzano', hectareas: 2 }).expect(201)).body
    limpio = (await post('/campo/cuarteles', { predioId: predio.id, nombre: 'Cuartel 2', cultivo: 'Cerezo', hectareas: 4 }).expect(201)).body
    const anio = Number(hoy.slice(0, 4))
    temporada = (await post('/campo/temporadas', { nombre: `T-${Date.now()}`, fechaInicio: `${anio - 1}-07-01`, fechaFin: `${anio + 1}-06-30` }).expect(201)).body
  })
  afterAll(() => cerrar(ctx))

  it('el vendedor no entra al campo', async () => {
    await ctx.http().get('/campo/predios').set(auth(ctx.vendedor)).expect(403)
  })

  it('la aplicación descuenta el producto según dosis por hectárea y deja el cuartel en carencia', async () => {
    const a = (await post('/campo/aplicaciones', {
      cuartelId: tratado.id, temporadaId: temporada.id, itemId: insumo, sucursalId: CASA_MATRIZ, fecha: hoy,
      objetivo: 'Polilla de la manzana', dosisPorHa: 1.5, carenciaDias: 10, aplicador: 'Juan Pérez',
    }).expect(201)).body
    expect([n(a.cantidad), n(a.costo)]).toEqual([3, 3000])
    expect(await ctx.stock(insumo)).toBe(97)
    const carencias = (await get('/campo/carencias').expect(200)).body
    expect(carencias.some((c: any) => c.cuartel.id === tratado.id)).toBe(true)
    const r = await post('/campo/cosechas', { cuartelId: tratado.id, temporadaId: temporada.id, itemId: fruta, sucursalId: CASA_MATRIZ, kilos: 100 }).expect(409)
    expect(r.body.message).toMatch(/carencia/)
  })

  it('la cosecha se lleva el costo acumulado del cuartel y entra como lote', async () => {
    const t = (await post('/campo/trabajadores', { rut: '11111111-1', nombre: 'Pedro Soto', valorJornada: 25000 }).expect(201)).body
    await post('/campo/labores', { trabajadorId: t.id, cuartelId: limpio.id, temporadaId: temporada.id, fecha: hoy, tipo: 'TRATO', descripcion: 'Cosecha', cantidad: 100, unidad: 'KG', tarifa: 50 }).expect(201)
    const maquinaria = await ctx.db.categoriaGasto.findUniqueOrThrow({ where: { nombre: 'Mantención y reparaciones' } })
    await post('/gastos', {
      categoriaId: maquinaria.id, tipoDocumento: 'FACTURA', proveedorId: PROVEEDOR_DEMO, numeroDocumento: `TR-${Date.now()}`, monto: 10000, fecha: hoy,
      descripcion: 'Arriendo tractor', cuartelId: limpio.id, temporadaId: temporada.id, categoriaCosto: 'MAQUINARIA',
    }).expect(201)

    const antes = await ctx.stock(fruta)
    const c1 = (await post('/campo/cosechas', { cuartelId: limpio.id, temporadaId: temporada.id, itemId: fruta, sucursalId: CASA_MATRIZ, kilos: 500 }).expect(201)).body
    expect([n(c1.costoTotal), n(c1.costoKilo)]).toEqual([15000, 30])
    expect(c1.lote.codigo).toMatch(/^CO-/)
    expect((await ctx.stock(fruta)) - antes).toBe(500)
    const c2 = (await post('/campo/cosechas', { cuartelId: limpio.id, temporadaId: temporada.id, itemId: fruta, sucursalId: CASA_MATRIZ, kilos: 500 }).expect(201)).body
    expect(n(c2.costoTotal)).toBe(0)
  })

  it('informe de costos: real vs presupuesto, por kilo y por hectárea', async () => {
    await ctx.http().put(`/campo/presupuestos/${temporada.id}`).set(auth(ctx.admin))
      .send({ lineas: [{ cuartelId: limpio.id, categoria: 'MANO_OBRA', monto: 20000 }] }).expect(200)
    const { cuarteles } = (await get(`/campo/costos/${temporada.id}`).expect(200)).body
    const c = cuarteles.find((x: any) => x.id === limpio.id)
    expect([n(c.real), n(c.presupuesto), n(c.desviacion), n(c.kilos), n(c.costoKilo), n(c.costoHa)]).toEqual([15000, 20000, -5000, 1000, 15, 3750])
    expect(n(cuarteles.find((x: any) => x.id === tratado.id).categorias.find((k: any) => k.categoria === 'INSUMOS').real)).toBe(3000)
  })

  it('contratista sin F30-1 vigente genera advertencia; al registrarlo deja de avisar', async () => {
    const t = (await post('/campo/trabajadores', { rut: '22222222-2', nombre: 'Ana Rojas', tipo: 'CONTRATISTA', contratistaId: PROVEEDOR_DEMO }).expect(201)).body
    const labor = () => post('/campo/labores', { trabajadorId: t.id, fecha: hoy, tipo: 'JORNADA', descripcion: 'Poda', cantidad: 1, unidad: 'DIA', tarifa: 30000 }).expect(201)
    expect((await labor()).body.advertencia).toMatch(/F30-1/)
    expect((await get('/campo/contratistas/alertas').expect(200)).body.some((c: any) => c.id === PROVEEDOR_DEMO)).toBe(true)
    await ctx.http().patch(`/campo/contratistas/${PROVEEDOR_DEMO}/f30`).set(auth(ctx.admin)).send({ f30Vigencia: '2099-12-31' }).expect(200)
    expect((await labor()).body.advertencia).toBeNull()
  })

  it('jornada sin tarifa usa el valor del trabajador; trato sin tarifa se rechaza', async () => {
    const t = (await post('/campo/trabajadores', { rut: '33333333-3', nombre: 'Luis Díaz', valorJornada: 28000 }).expect(201)).body
    expect(n((await post('/campo/labores', { trabajadorId: t.id, fecha: hoy, tipo: 'JORNADA', descripcion: 'Riego', cantidad: 2, unidad: 'DIA' }).expect(201)).body.monto)).toBe(56000)
    await post('/campo/labores', { trabajadorId: t.id, fecha: hoy, tipo: 'TRATO', descripcion: 'Cosecha', cantidad: 2, unidad: 'KG' }).expect(400)
    await post('/campo/trabajadores', { rut: '12345678-9', nombre: 'RUT malo' }).expect(400)
  })

  it('liquidación paga lo pendiente descontando anticipos y no se repite', async () => {
    const t = (await ctx.db.trabajador.findUniqueOrThrow({ where: { rut: '33333333-3' } }))
    await post('/campo/anticipos', { trabajadorId: t.id, monto: 6000, medioPago: 'Efectivo' }).expect(201)
    const liq = (await post('/campo/liquidaciones', { trabajadorId: t.id, hasta: hoy, medioPago: 'Transferencia' }).expect(201)).body
    expect([n(liq.totalLabores), n(liq.anticipos), n(liq.aPagar)]).toEqual([56000, 6000, 50000])
    await post('/campo/liquidaciones', { trabajadorId: t.id, hasta: hoy, medioPago: 'Transferencia' }).expect(400)
  })

  it('la contabilidad registra aplicación, cosecha, mano de obra y pago', async () => {
    const { asientos } = (await get(`/contabilidad/diario?mes=${hoy.slice(0, 7)}`).expect(200)).body
    const tipos = new Set(asientos.map((a: any) => a.origenTipo))
    for (const t of ['APLICACION', 'COSECHA', 'LABORES', 'ANTICIPO_TRABAJADOR', 'LIQUIDACION_TRABAJADOR']) expect(tipos.has(t)).toBe(true)
    const total = (lado: string) => asientos.flatMap((a: any) => a.lineas).reduce((s: number, l: any) => s + n(l[lado]), 0)
    expect(total('debe')).toBe(total('haber'))
  })
})
