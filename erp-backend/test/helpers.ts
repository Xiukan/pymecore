import { Test } from '@nestjs/testing'
import { NestExpressApplication } from '@nestjs/platform-express'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@prisma/client'
import request from 'supertest'
import { AppModule } from '../src/app.module'
import { configurarApp } from '../src/app.setup'

export const CASA_MATRIZ = '00000000-0000-0000-0000-000000000001'
export const SUCURSAL_NORTE = '6f1c2a3e-2222-4a1a-8a1a-000000000002'
export const PROVEEDOR_DEMO = '00000000-0000-0000-0000-000000000003'

export interface Contexto {
  app: NestExpressApplication
  db: PrismaClient
  http: () => ReturnType<typeof request>
  admin: string
  vendedor: string
  item: (sku: string) => Promise<string>
  stock: (itemId: string, sucursalId?: string) => Promise<number>
}

/** Levanta la app completa (módulos, guards, pipes y filtros reales) contra la base de pruebas. */
export async function iniciar(): Promise<Contexto> {
  const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile()
  const app = modulo.createNestApplication<NestExpressApplication>()
  configurarApp(app)
  await app.init()
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) })
  const http = () => request(app.getHttpServer())
  const token = async (username: string, password: string) =>
    (await http().post('/auth/login').send({ username, password }).expect(201)).body.accessToken as string
  return {
    app,
    db,
    http,
    admin: await token('admin', 'admin1234'),
    vendedor: await token('vendedor1', 'vend1234'),
    item: async (sku) => (await db.item.findUniqueOrThrow({ where: { codigoSku: sku } })).id,
    stock: async (itemId, sucursalId = CASA_MATRIZ) =>
      Number((await db.stockLocal.findUnique({ where: { sucursalId_itemId: { sucursalId, itemId } } }))?.stockActual ?? 0),
  }
}

export async function cerrar(ctx: Contexto) {
  await ctx.db.$disconnect()
  await ctx.app.close()
}

export const auth = (token: string) => ({ Authorization: `Bearer ${token}` })
