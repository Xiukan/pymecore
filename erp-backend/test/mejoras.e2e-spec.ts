import { abrirCaja, auth, CASA_MATRIZ, cerrar, Contexto, iniciar } from './helpers'

const CLIENTE = '00000000-0000-0000-0000-000000000002'

describe('conteo físico, sugerencia de compra, estado de cuenta, RCV, SII y módulos', () => {
  let ctx: Contexto
  let cafe: string
  let agua: string
  const n = (v: unknown) => Number(v)
  const post = (url: string, body: object, token = ctx.admin) => ctx.http().post(url).set(auth(token)).send(body)
  const get = (url: string, token = ctx.admin) => ctx.http().get(url).set(auth(token))
  const hoy = (() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })()

  beforeAll(async () => {
    ctx = await iniciar()
    cafe = await ctx.item('ITEM-001')
    agua = await ctx.item('ITEM-002')
    await ctx.db.stockLocal.updateMany({ where: { sucursalId: CASA_MATRIZ }, data: { stockActual: 50, stockMinimo: 0 } })
    await ctx.db.item.update({ where: { id: cafe }, data: { costoPromedio: 2000 } })
    await ctx.db.item.update({ where: { id: agua }, data: { costoPromedio: 300 } })
    await ctx.db.oferta.updateMany({ data: { activo: false } })
    await ctx.db.entidad.update({ where: { id: CLIENTE }, data: { cupoCredito: 1_000_000, diasCredito: 30, listaPrecioId: null } })
    await abrirCaja(ctx, ctx.admin)
  })
  afterAll(() => cerrar(ctx))

  it('conteo físico: vista previa sin cambios y aplicación con asiento de faltante', async () => {
    const conteo = { sucursalId: CASA_MATRIZ, lineas: [{ itemId: cafe, contado: 47 }, { itemId: agua, contado: 52 }], observaciones: 'Bodega' }
    const previa = (await post('/stock/conteo/previa', conteo).expect(201)).body
    expect([n(previa.faltante), n(previa.sobrante)]).toEqual([6000, 600])
    expect(await ctx.stock(cafe)).toBe(50)
    await post('/stock/conteo', conteo, ctx.vendedor).expect(403)
    await post('/stock/conteo', conteo).expect(201)
    expect([await ctx.stock(cafe), await ctx.stock(agua)]).toEqual([47, 52])
    const { asientos } = (await get(`/contabilidad/diario?mes=${hoy.slice(0, 7)}`).expect(200)).body
    const ajustes = asientos.filter((a: any) => a.origenTipo === 'AJUSTE_STOCK' && a.glosa.includes('Bodega'))
    expect(ajustes.flatMap((a: any) => a.lineas).filter((l: any) => l.cuenta === '5102').reduce((s: number, l: any) => s + n(l.debe), 0)).toBe(6000)
  })

  it('sugerencia de compra según lo vendido', async () => {
    await ctx.db.stockLocal.updateMany({ where: { sucursalId: CASA_MATRIZ, itemId: cafe }, data: { stockMinimo: 100 } })
    const s = (await get(`/stock/sugerencia-compra?sucursalId=${CASA_MATRIZ}&dias=30`).expect(200)).body
    const fila = s.find((x: any) => x.itemId === cafe)
    expect(n(fila.sugerido)).toBeGreaterThanOrEqual(53)
    await get(`/stock/sugerencia-compra?sucursalId=${CASA_MATRIZ}`, ctx.vendedor).expect(403)
  })

  it('estado de cuenta del cliente con saldo corrido y cupo disponible', async () => {
    const venta = (await post('/transactions', { sucursalId: CASA_MATRIZ, entidadId: CLIENTE, tipoTransaccion: 'VENTA', medioPago: 'Credito', tipoDocumento: 33, detalles: [{ itemId: cafe, cantidad: 2, precioUnitario: 3490 }] }).expect(201)).body
    await post('/cuentas/abonos', { transaccionId: venta.id, monto: 1000, medioPago: 'Transferencia' }).expect(201)
    const e = (await get(`/cuentas/clientes/${CLIENTE}/estado`).expect(200)).body
    const ultimas = e.movimientos.slice(-2)
    expect(ultimas.map((m: any) => [n(m.cargo), n(m.abono)])).toEqual([[6980, 0], [0, 1000]])
    expect(n(ultimas[1].saldo)).toBe(n(e.saldo))
    expect(n(e.cupoDisponible)).toBe(1_000_000 - n(e.saldo))
    await get(`/cuentas/clientes/00000000-0000-0000-0000-000000000003/estado`).expect(404)
  })

  it('cuadra el RCV del SII con el libro de compras', async () => {
    const csv = `Nro;Tipo Doc;Tipo Compra;RUT Proveedor;Razon Social;Folio;Fecha Docto;Fecha Recepcion;Fecha Acuse;Monto Exento;Monto Neto;Monto IVA Recuperable;Monto Iva No Recuperable;Codigo IVA No Rec.;Monto Total\n1;33;Del Giro;99999999-9;Desconocido;777;01/${hoy.slice(5, 7)}/${hoy.slice(0, 4)};;;0;100;19;0;;119`
    const r = (await post('/tributario/rcv/cuadrar', { mes: hoy.slice(0, 7), contenido: csv }).expect(201)).body
    expect(r.soloEnSii.map((d: any) => d.folio)).toEqual(['777'])
    await post('/tributario/rcv/cuadrar', { mes: hoy.slice(0, 7), contenido: 'x;y\n1;2' }).expect(400)
  })

  it('una venta atascada "enviando" vuelve a la cola al sincronizar', async () => {
    const t = await ctx.db.transaccion.findFirstOrThrow({ where: { tipoTransaccion: 'VENTA' }, orderBy: { fechaRegistro: 'desc' } })
    await ctx.db.transaccion.update({ where: { id: t.id }, data: { sincronizacion: 'ENVIANDO', enviandoDesde: new Date(Date.now() - 3_600_000) } })
    await post('/sync/ejecutar', {}).expect(201)
    const despues = await ctx.db.transaccion.findUniqueOrThrow({ where: { id: t.id } })
    expect(despues.sincronizacion).not.toBe('ENVIANDO')
  })

  it('la empresa elige qué módulos ver', async () => {
    await ctx.http().patch('/empresa').set(auth(ctx.admin)).send({ modulos: ['campo', 'inventado'] }).expect(400)
    const e = (await ctx.http().patch('/empresa').set(auth(ctx.admin)).send({ modulos: ['campo', 'contabilidad'] }).expect(200)).body
    expect(e.modulos).toEqual(['campo', 'contabilidad'])
    expect((await get('/empresa', ctx.vendedor).expect(200)).body.modulos).toEqual(['campo', 'contabilidad'])
  })
})
