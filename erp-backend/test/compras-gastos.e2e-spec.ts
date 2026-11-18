import { auth, CASA_MATRIZ, cerrar, Contexto, iniciar, PROVEEDOR_DEMO } from './helpers'
import { dteSintetico } from './fixtures/dte-sintetico'

describe('compras, DTE recibidos y gastos', () => {
  let ctx: Contexto
  let cafe: string
  let agua: string
  const hoy = new Date().toISOString().slice(0, 10)
  const post = (url: string, body: object, token = ctx.admin) => ctx.http().post(url).set(auth(token)).send(body)
  const patch = (url: string, body: object = {}, token = ctx.admin) => ctx.http().patch(url).set(auth(token)).send(body)
  const costo = async (id: string) => Number((await ctx.db.item.findUniqueOrThrow({ where: { id } })).costoPromedio)

  beforeAll(async () => {
    ctx = await iniciar()
    cafe = await ctx.item('ITEM-001')
    agua = await ctx.item('ITEM-003')
    await ctx.db.stockLocal.updateMany({ where: { sucursalId: CASA_MATRIZ }, data: { stockActual: 100 } })
    await ctx.db.stockLocal.deleteMany({ where: { sucursalId: { not: CASA_MATRIZ } } })
    await ctx.db.item.updateMany({ where: { id: cafe }, data: { costoPromedio: 1800 } })
  })
  afterAll(() => cerrar(ctx))

  describe('orden de compra → recepción → factura', () => {
    let oc: any
    const linea = (itemId: string) => oc.detalles.find((d: any) => d.itemId === itemId).id

    it('emite la OC con IVA solo sobre lo afecto', async () => {
      oc = (await post('/compras/ordenes', {
        proveedorId: PROVEEDOR_DEMO, sucursalId: CASA_MATRIZ,
        detalles: [{ itemId: cafe, cantidad: 50, costoUnitario: 2100 }, { itemId: agua, cantidad: 20, costoUnitario: 150 }],
      }).expect(201)).body
      expect([oc.montoNeto, oc.montoIva, oc.montoTotal]).toEqual(['108000', '19950', '127950'])
    })

    it('solo Administrador o Encargado, y solo a proveedores', async () => {
      await post('/compras/ordenes', { proveedorId: PROVEEDOR_DEMO, sucursalId: CASA_MATRIZ, detalles: [{ itemId: cafe, cantidad: 1, costoUnitario: 1 }] }, ctx.vendedor).expect(403)
      await post('/compras/ordenes', { proveedorId: '00000000-0000-0000-0000-000000000002', sucursalId: CASA_MATRIZ, detalles: [{ itemId: cafe, cantidad: 1, costoUnitario: 1 }] }).expect(400)
    })

    it('la recepción suma stock y pondera el costo promedio', async () => {
      await post(`/compras/ordenes/${oc.id}/recepciones`, { guiaDespacho: 'GD-1', detalles: [{ detalleId: linea(cafe), cantidad: 30 }] }).expect(201)
      expect(await ctx.stock(cafe)).toBe(130)
      expect(await costo(cafe)).toBe(1869.23)
    })

    it('recepciones en paralelo no superan lo pendiente', async () => {
      const res = await Promise.all([1, 2, 3].map(() => post(`/compras/ordenes/${oc.id}/recepciones`, { detalles: [{ detalleId: linea(cafe), cantidad: 20 }] })))
      expect(res.filter((r) => r.status === 201)).toHaveLength(1)
      expect(await ctx.stock(cafe)).toBe(150)
    })

    it('la factura no supera lo recibido, respeta el costo pactado y el total impreso', async () => {
      await post(`/compras/ordenes/${oc.id}/facturas`, { folio: 'F-1', fechaEmision: hoy, detalles: [{ detalleId: linea(agua), cantidad: 1, costoUnitario: 150 }] }).expect(400)
      await post(`/compras/ordenes/${oc.id}/facturas`, { folio: 'F-1', fechaEmision: hoy, detalles: [{ detalleId: linea(cafe), cantidad: 30, costoUnitario: 2200 }] }).expect(400)
      await post(`/compras/ordenes/${oc.id}/facturas`, { folio: 'F-1', fechaEmision: hoy, montoTotal: 1, detalles: [{ detalleId: linea(cafe), cantidad: 30, costoUnitario: 2100 }] }).expect(400)
      const { body } = await post(`/compras/ordenes/${oc.id}/facturas`, { folio: 'F-1', fechaEmision: hoy, montoTotal: 74970, detalles: [{ detalleId: linea(cafe), cantidad: 30, costoUnitario: 2100 }] }).expect(201)
      oc.factura = body
      await post(`/compras/ordenes/${oc.id}/facturas`, { folio: 'F-1', fechaEmision: hoy, detalles: [{ detalleId: linea(cafe), cantidad: 1, costoUnitario: 2100 }] }).expect(400)
    })

    it('no anula una recepción facturada; tras anular la factura revierte stock y costo', async () => {
      const det = (await ctx.http().get(`/compras/ordenes/${oc.id}`).set(auth(ctx.admin)).expect(200)).body
      const rec = det.recepciones.find((r: any) => r.guiaDespacho === 'GD-1')
      await patch(`/compras/recepciones/${rec.id}/anular`).expect(400)
      await patch(`/compras/facturas/${oc.factura.id}/anular`).expect(200)
      await patch(`/compras/recepciones/${rec.id}/anular`).expect(200)
      expect(await ctx.stock(cafe)).toBe(120)
      expect(await costo(cafe)).toBe(1850)
    })
  })

  describe('bandeja de DTE recibidos', () => {
    it('rechaza un DTE dirigido a otro receptor', async () => {
      const { body } = await post('/compras/dte', { xml: dteSintetico({ rutReceptor: '11111111-1' }) }).expect(400)
      expect(body.message).toMatch(/dirigido/)
    })

    it('carga, verifica el timbre, crea el proveedor y no admite duplicados', async () => {
      await patch('/empresa', { rut: '77.094.287-K' }).expect(200)
      const { body } = await post('/compras/dte', { xml: dteSintetico({ folio: '501', rutEmisor: '96799250-K', razonSocial: 'Telefonía Demo' }) }).expect(201)
      expect(body).toMatchObject({ folio: '501', timbreValido: true, firmaValida: false, estado: 'PENDIENTE' })
      expect(await ctx.db.entidad.count({ where: { rut: '96799250-K', tipoEntidad: 'PROVEEDOR' } })).toBe(1)
      await post('/compras/dte', { xml: dteSintetico({ folio: '501', rutEmisor: '96799250-K' }) }).expect(409)
      await post('/compras/dte', { xml: '<no-cierra>' }).expect(400)
      await post('/compras/dte', { xml: dteSintetico({ folio: '502' }) }, ctx.vendedor).expect(403)
    })

    it('un servicio se registra como gasto según la categoría y queda con un solo destino', async () => {
      const dte = (await post('/compras/dte', { xml: dteSintetico({ folio: '503', rutEmisor: '96799250-K' }) }).expect(201)).body
      const telefonia = await ctx.db.categoriaGasto.findUniqueOrThrow({ where: { nombre: 'Telefonía e internet' } })
      await post(`/compras/dte/${dte.id}/gasto`, { categoriaId: telefonia.id }).expect(201)
      await post(`/compras/dte/${dte.id}/gasto`, { categoriaId: telefonia.id }).expect(400)
      const gasto = await ctx.db.gastoOperacional.findFirstOrThrow({ where: { numeroDocumento: '503' } })
      expect([Number(gasto.montoNeto), Number(gasto.iva), Number(gasto.monto)]).toEqual([10000, 1900, 10000])
      await patch(`/gastos/${gasto.id}/anular`).expect(200)
      expect((await ctx.db.dteRecibido.findUniqueOrThrow({ where: { id: dte.id } })).estado).toBe('PENDIENTE')
    })

    it('una factura de mercadería se asocia a la OC solo si cuadra con el XML', async () => {
      const proveedor = (await post('/compras/dte', { xml: dteSintetico({ folio: '600', rutEmisor: '81290800-6' }) }).expect(201)).body
      const oc = (await post('/compras/ordenes', { proveedorId: proveedor.proveedor.id, sucursalId: CASA_MATRIZ, detalles: [{ itemId: cafe, cantidad: 10, costoUnitario: 1000 }] }).expect(201)).body
      const linea = oc.detalles[0].id
      await post(`/compras/ordenes/${oc.id}/recepciones`, { detalles: [{ detalleId: linea, cantidad: 10 }] }).expect(201)
      const base = { dteId: proveedor.id, folio: '600', fechaEmision: '2026-08-18' }
      await post(`/compras/ordenes/${oc.id}/facturas`, { ...base, detalles: [{ detalleId: linea, cantidad: 5, costoUnitario: 1000 }] }).expect(400)
      await post(`/compras/ordenes/${oc.id}/facturas`, { ...base, folio: '1', detalles: [{ detalleId: linea, cantidad: 10, costoUnitario: 1000 }] }).expect(400)
      await post(`/compras/ordenes/${oc.id}/facturas`, { ...base, detalles: [{ detalleId: linea, cantidad: 10, costoUnitario: 1000 }] }).expect(201)
      expect((await ctx.db.dteRecibido.findUniqueOrThrow({ where: { id: proveedor.id } })).estado).toBe('ASOCIADO_OC')
    })
  })

  describe('gastos generales', () => {
    const categoria = async (nombre: string) => (await ctx.db.categoriaGasto.findUniqueOrThrow({ where: { nombre } })).id
    const gasto = (body: object, token = ctx.admin) => post('/gastos', { fecha: hoy, descripcion: 'Gasto de prueba', ...body }, token)

    it('factura de arriendo: costo neto e IVA como crédito fiscal', async () => {
      const { body } = await gasto({ categoriaId: await categoria('Arriendo'), tipoDocumento: 'FACTURA', proveedorId: PROVEEDOR_DEMO, numeroDocumento: 'A-1', monto: 500000 }).expect(201)
      expect([body.montoNeto, body.iva, body.total, body.monto, body.estadoPago]).toEqual(['500000', '95000', '595000', '500000', 'POR_PAGAR'])
      await gasto({ categoriaId: await categoria('Arriendo'), tipoDocumento: 'FACTURA', proveedorId: PROVEEDOR_DEMO, numeroDocumento: 'A-1', monto: 500000 }).expect(400)
    })

    it('combustible no recupera IVA: el costo es el total', async () => {
      const { body } = await gasto({ categoriaId: await categoria('Combustible'), tipoDocumento: 'FACTURA', proveedorId: PROVEEDOR_DEMO, numeroDocumento: 'C-1', monto: 40000 }).expect(201)
      expect(body.monto).toBe('47600')
    })

    it('boleta de honorarios retiene según el parámetro de la empresa', async () => {
      const { body } = await gasto({ categoriaId: await categoria('Honorarios'), tipoDocumento: 'BOLETA_HONORARIOS', proveedorId: PROVEEDOR_DEMO, numeroDocumento: 'BH-9', monto: 200000, medioPago: 'Transferencia' }).expect(201)
      expect([body.retencion, body.monto, body.estadoPago]).toEqual(['30500', '200000', 'PAGADO'])
    })

    it('sin documento respeta el tope configurable', async () => {
      const otros = await categoria('Otros')
      await gasto({ categoriaId: otros, tipoDocumento: 'SIN_DOCUMENTO', monto: 60000 }).expect(400)
      await patch('/empresa', { topeGastoSinDocumento: 100000 }).expect(200)
      await gasto({ categoriaId: otros, tipoDocumento: 'SIN_DOCUMENTO', monto: 60000, medioPago: 'Efectivo' }).expect(201)
    })

    it('reglas: factura sin proveedor, fecha futura y vendedor son rechazados', async () => {
      const otros = await categoria('Otros')
      await gasto({ categoriaId: otros, tipoDocumento: 'FACTURA', monto: 1000 }).expect(400)
      await gasto({ categoriaId: otros, tipoDocumento: 'BOLETA', monto: 1000, fecha: '2099-01-01' }).expect(400)
      await gasto({ categoriaId: otros, tipoDocumento: 'BOLETA', monto: 1000 }, ctx.vendedor).expect(403)
    })

    it('pagar una sola vez y resumen por categoría y por pagar', async () => {
      const { body } = await ctx.http().get(`/gastos?desde=${hoy}&hasta=${hoy}&estadoPago=POR_PAGAR`).set(auth(ctx.admin)).expect(200)
      expect(body.gastos.length).toBeGreaterThan(0)
      const primero = body.gastos[0]
      const res = await Promise.all([1, 2].map(() => patch(`/gastos/${primero.id}/pagar`, { medioPago: 'Transferencia' })))
      expect(res.filter((r) => r.status === 200)).toHaveLength(1)
      const todos = (await ctx.http().get(`/gastos?desde=${hoy}&hasta=${hoy}`).set(auth(ctx.admin)).expect(200)).body
      const suma = todos.gastos.reduce((s: number, g: any) => s + Number(g.monto), 0)
      expect(Number(todos.resumen.costo)).toBe(suma)
    })
  })
})
