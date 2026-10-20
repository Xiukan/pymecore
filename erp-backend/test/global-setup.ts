import { execSync } from 'child_process'
import { Client } from 'pg'

/**
 * Deja la base de pruebas en un estado conocido: esquema vacío, migraciones, seed y datos
 * fijos para las pruebas. Por seguridad solo opera sobre una base cuyo nombre contenga
 * "test": jamás puede borrar la base de desarrollo.
 */
export default async function globalSetup() {
  const url = process.env.DATABASE_URL ?? ''
  const nombre = url.split('/').pop()?.split('?')[0] ?? ''
  if (!/test/i.test(nombre)) {
    throw new Error(`Las pruebas de integración requieren una base cuyo nombre contenga "test" (DATABASE_URL apunta a "${nombre}").`)
  }
  const db = new Client({ connectionString: url })
  await db.connect()
  await db.query('DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;')
  await db.end()

  const opciones = { cwd: `${__dirname}/..`, env: process.env, stdio: 'pipe' as const }
  execSync('pnpm exec prisma migrate deploy', opciones)
  execSync('pnpm exec ts-node -r tsconfig-paths/register prisma/seed.ts', opciones)

  const datos = new Client({ connectionString: url })
  await datos.connect()
  await datos.query(`
    INSERT INTO sucursales (id, nombre) VALUES ('6f1c2a3e-2222-4a1a-8a1a-000000000002', 'Sucursal Norte');
    INSERT INTO folios_disponibles (id, tipo_doc, numero) SELECT gen_random_uuid(), 39, g FROM generate_series(1, 500) g;
  `)
  await datos.end()
}
