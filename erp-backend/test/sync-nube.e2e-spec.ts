import { Test } from '@nestjs/testing'
import { NestExpressApplication } from '@nestjs/platform-express'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@prisma/client'
import { randomUUID } from 'crypto'
import { AppModule } from '../src/app.module'
import { configurarApp } from '../src/app.setup'
import { firmarLease } from '../src/lease/lease'
import { hashSecreto } from '../src/nube/tenant.guard'
import { PrismaService } from '../src/prisma/prisma.service'
import { abrirCaja, auth, CASA_MATRIZ, cerrar, Contexto, iniciar } from './helpers'

// Local (Edge) y nube (Cloud) como dos aplicaciones con bases separadas que hablan por HTTP.
// Verifica AC-SYNC-01, RNF-CON-01 (0 pérdidas, 0 duplicados), AC-04 (AUTO-0005) y AC-07 (AUTO-0007).
describe('sincronización real local → nube, SII y licencia', () => {
  const ENV = { ...process.env }
  const URL_NUBE = process.env.DATABASE_URL!.replace(/\/([^/?]+)(\?|$)/, '/$1_nube$2')
  const LEASE_SECRET = 'secreto-de-licencia-compartido-pruebas'
  const INSTALACION = randomUUID()
  const SECRETO = 'secreto-de-la-instalacion'
  let nube: NestExpressApplication
  let dbNube: PrismaClient
  let urlNube: string
  let edge: Contexto
  let cafe: string
  let tenantId: string

  const ejecutar = async () => (await edge.http().post('/sync/ejecutar').set(auth(edge.admin)).expect(201)).body
  const vender = (extra: object = {}) =>
    edge.http().post('/transactions').set(auth(edge.admin))
      .send({ sucursalId: CASA_MATRIZ, tipoTransaccion: 'VENTA', medioPago: 'Efectivo', detalles: [{ itemId: cafe, cantidad: 1, precioUnitario: 3490 }], ...extra })
  const ventasNube = () => dbNube.ventaNube.findMany({ where: { tenantId } })

  beforeAll(async () => {
    // Nube: misma aplicación en MODO=cloud, con su propia base.
    process.env.LEASE_SECRET = LEASE_SECRET
    process.env.SYNC_INTERVALO_MS = '0'
    const modNube = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(Object.assign(new PrismaClient({ adapter: new PrismaPg({ connectionString: URL_NUBE }) }), { onModuleInit() {}, onModuleDestroy() {} }))
      .compile()
    nube = modNube.createNestApplication<NestExpressApplication>()
    configurarApp(nube)
    await nube.listen(0, '127.0.0.1')
    urlNube = await nube.getUrl()
    dbNube = new PrismaClient({ adapter: new PrismaPg({ connectionString: URL_NUBE }) })
    const tenant = await dbNube.tenant.create({ data: { nombre: 'Agrícola Demo' } })
    tenantId = tenant.id
    await dbNube.instalacion.create({ data: { id: INSTALACION, tenantId, nombre: 'Local Talca', secretoHash: hashSecreto(SECRETO) } })

    // Local: MODO=edge apuntando a la nube.
    Object.assign(process.env, { MODO: 'edge', CLOUD_URL: urlNube, INSTALACION_ID: INSTALACION, INSTALACION_SECRETO: SECRETO })
    edge = await iniciar()
    cafe = await edge.item('ITEM-001')
    await edge.db.stockLocal.updateMany({ where: { sucursalId: CASA_MATRIZ }, data: { stockActual: 1000 } })
    await edge.db.outboxSync.updateMany({ data: { enviadoEn: new Date() } })
    await abrirCaja(edge, edge.admin)
  })

  afterAll(async () => {
    process.env = ENV
    await cerrar(edge)
    await dbNube.$disconnect()
    await nube.close()
  })

  it('sin licencia (local recién instalado) no se vende; al conectarse la obtiene', async () => {
    await edge.db.leaseToken.deleteMany()
    expect((await vender().expect(403)).body.codigo).toBe('LEASE_VENCIDO')
    await ejecutar()
    const estado = (await edge.http().get('/sync/estado').set(auth(edge.vendedor)).expect(200)).body
    expect(estado).toMatchObject({ modo: 'edge', conectividad: 'EN_LINEA', licencia: { vigente: true } })
  })

  it('AC-SYNC-01: 20 ventas durante un corte llegan 20 de 20 a la nube al reconectar', async () => {
    process.env.CLOUD_URL = 'http://127.0.0.1:1' // corte de internet
    const ids: string[] = []
    for (let i = 0; i < 20; i++) ids.push((await vender().expect(201)).body.id)
    const fallo = await ejecutar()
    expect(fallo.error).toBeTruthy()
    expect((await edge.http().get('/sync/estado').set(auth(edge.admin))).body).toMatchObject({ pendientes: 20, conectividad: 'SIN_CONEXION' })
    expect(await ventasNube()).toHaveLength(0)

    process.env.CLOUD_URL = urlNube // vuelve internet
    const inicio = Date.now()
    expect((await ejecutar()).enviadas).toBe(20)
    expect(Date.now() - inicio).toBeLessThan(5 * 60_000)
    const enNube = await ventasNube()
    expect(enNube.map((v) => v.id).sort()).toEqual([...ids].sort())
    expect(enNube.map((v) => v.secuencia)).toEqual([...enNube.map((v) => v.secuencia)].sort((a, b) => a - b))
    expect((await edge.http().get('/sync/estado').set(auth(edge.admin))).body.pendientes).toBe(0)
  })

  it('RNF-CON-01: si se pierde la confirmación y el lote se reenvía, la nube no duplica', async () => {
    const reenviar = await edge.db.outboxSync.findMany({ orderBy: { secuencia: 'desc' }, take: 5 })
    await edge.db.outboxSync.updateMany({ where: { id: { in: reenviar.map((r) => r.id) } }, data: { enviadoEn: null } })
    expect((await ejecutar()).enviadas).toBe(5)
    expect(await ventasNube()).toHaveLength(20)
    const directo = await fetch(`${urlNube}/sync/lotes`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-instalacion-id': INSTALACION, 'x-instalacion-secreto': SECRETO },
      body: JSON.stringify({ lote: [{ ...(await ventasNube())[0].payload as object }] }),
    }).then((r) => r.json())
    expect(directo.duplicadas).toHaveLength(1)
    expect(directo.aceptadas).toHaveLength(0)
  })

  it('AUTO-0005 · AC-04: si el SII rechaza, el DTE queda "Rechazado" y la venta sigue vigente', async () => {
    const venta = (await vender({ rutReceptor: '12345678-9', razonSocialReceptor: 'RUT mal digitado' }).expect(201)).body
    expect(venta.estadoDte).toBe('PENDIENTE_ENVIO_SII')
    await ejecutar()
    const local = await edge.db.transaccion.findUniqueOrThrow({ where: { id: venta.id } })
    expect([local.estadoDte, local.estado, local.glosaSii]).toEqual(['RECHAZADO', 'Activa', 'RUT receptor inválido (12345678-9)'])
    expect((await dbNube.ventaNube.findUniqueOrThrow({ where: { id: venta.id } })).estadoDte).toBe('RECHAZADO')
    const aceptada = (await vender().expect(201)).body
    await ejecutar()
    expect((await edge.db.transaccion.findUniqueOrThrow({ where: { id: aceptada.id } })).estadoDte).toBe('ACEPTADO')
  })

  it('AUTO-0007 · AC-07: con la licencia vencida (> 24 h + gracia) se bloquea vender y lo vendido queda intacto', async () => {
    const iat = Math.floor(Date.now() / 1000) - 30 * 3600
    await edge.db.leaseToken.update({
      where: { instalacionId: INSTALACION },
      data: { jwt: firmarLease({ instalacionId: INSTALACION, tenantId, iat, exp: iat + 24 * 3600 }, LEASE_SECRET), venceEn: new Date((iat + 24 * 3600) * 1000) },
    })
    process.env.CLOUD_URL = 'http://127.0.0.1:1'
    const antes = { ventas: await edge.db.transaccion.count({ where: { tipoTransaccion: 'VENTA' } }), cola: await edge.db.outboxSync.count() }
    const r = await vender().expect(403)
    expect(r.body.codigo).toBe('LEASE_VENCIDO')
    expect(r.body.message).toMatch(/no se pierden/)
    expect({ ventas: await edge.db.transaccion.count({ where: { tipoTransaccion: 'VENTA' } }), cola: await edge.db.outboxSync.count() }).toEqual(antes)
    process.env.CLOUD_URL = urlNube
    await ejecutar()
    await vender().expect(201)
  })

  it('la nube exige credenciales de la instalación, suscripción activa y lotes válidos (DA-04)', async () => {
    const post = (headers: Record<string, string>, body: unknown) =>
      fetch(`${urlNube}/sync/lotes`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) })
    const credenciales = { 'x-instalacion-id': INSTALACION, 'x-instalacion-secreto': SECRETO }
    expect((await post({}, { lote: [] })).status).toBe(401)
    expect((await post({ ...credenciales, 'x-instalacion-secreto': 'malo' }, { lote: [] })).status).toBe(401)
    const invalido = await post(credenciales, { lote: [{ ventaId: 'no-es-uuid' }] })
    expect([invalido.status, (await invalido.json()).codigo]).toEqual([422, 'LOTE_INVALIDO'])
    await dbNube.tenant.update({ where: { id: tenantId }, data: { estadoSuscripcion: 'SUSPENDIDA' } })
    expect((await post(credenciales, { lote: [] })).status).toBe(403)
    await dbNube.tenant.update({ where: { id: tenantId }, data: { estadoSuscripcion: 'ACTIVA' } })
  })
})
