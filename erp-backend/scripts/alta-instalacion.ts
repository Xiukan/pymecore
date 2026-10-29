// Da de alta una PYME (tenant) y un local en la nube, e imprime las credenciales que el local
// debe poner en su .env. Uso (contra la base de la nube):
//   DATABASE_URL=... pnpm exec ts-node scripts/alta-instalacion.ts "Agrícola El Roble" "Local Talca"
import 'dotenv/config'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@prisma/client'
import { randomBytes } from 'crypto'
import { hashSecreto } from '../src/nube/tenant.guard'

async function main() {
  const [nombrePyme, nombreLocal = 'Local principal'] = process.argv.slice(2)
  if (!nombrePyme) throw new Error('Indica el nombre de la PYME: alta-instalacion.ts "Nombre PYME" ["Nombre local"]')
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) })
  const tenant = (await db.tenant.findFirst({ where: { nombre: nombrePyme } })) ?? (await db.tenant.create({ data: { nombre: nombrePyme } }))
  const secreto = randomBytes(24).toString('base64url')
  const inst = await db.instalacion.create({ data: { tenantId: tenant.id, nombre: nombreLocal, secretoHash: hashSecreto(secreto) } })
  console.log(`PYME: ${tenant.nombre} (tenant_id ${tenant.id})\n\nAgrega al .env del local:\nMODO="edge"\nINSTALACION_ID="${inst.id}"\nINSTALACION_SECRETO="${secreto}"\n\nEl secreto no se guarda en la nube (solo su hash): cópialo ahora.`)
  await db.$disconnect()
}

main().catch((e) => {
  console.error(e.message)
  process.exit(1)
})
