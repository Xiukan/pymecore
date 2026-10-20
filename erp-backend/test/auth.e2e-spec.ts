import { auth, cerrar, Contexto, iniciar } from './helpers'

describe('autenticación y salud', () => {
  let ctx: Contexto
  beforeAll(async () => { ctx = await iniciar() })
  afterAll(() => cerrar(ctx))

  it('/health es público y confirma la base', () =>
    ctx.http().get('/health').expect(200, { status: 'ok' }))

  it('las rutas protegidas exigen token', () => ctx.http().get('/transactions').expect(401))

  it('rechaza un token firmado con otro algoritmo o secreto', () =>
    ctx.http().get('/auth/me').set(auth('eyJhbGciOiJub25lIn0.eyJzdWIiOiJ4In0.')).expect(401))

  it('el login se frena tras 5 intentos por minuto para la misma cuenta', async () => {
    // iniciar() ya usó 1 login válido de admin en esta instancia
    const intentos: number[] = []
    for (let i = 0; i < 5; i++) intentos.push((await ctx.http().post('/auth/login').send({ username: 'admin', password: 'mala' })).status)
    expect(intentos).toEqual([401, 401, 401, 401, 429])
  })

  it('el bloqueo de una cuenta no afecta a otro usuario desde la misma IP', () =>
    ctx.http().post('/auth/login').send({ username: 'vendedor1', password: 'vend1234' }).expect(201))
})
