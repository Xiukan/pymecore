import { execSync } from 'child_process'
import { readFileSync } from 'fs'
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

  // Base separada que hace de nube en la prueba de sincronización (AC-SYNC-01).
  const urlNube = url.replace(/\/([^/?]+)(\?|$)/, `/$1_nube$2`)
  const admin = new Client({ connectionString: url })
  await admin.connect()
  await admin.query(`DROP DATABASE IF EXISTS "${nombre}_nube" WITH (FORCE)`)
  await admin.query(`CREATE DATABASE "${nombre}_nube"`)
  await admin.end()
  execSync('pnpm exec prisma migrate deploy', { ...opciones, env: { ...process.env, DATABASE_URL: urlNube } })
  process.env.DATABASE_URL_NUBE = urlNube

  const datos = new Client({ connectionString: url })
  await datos.connect()
  await datos.query(readFileSync(`${__dirname}/../scripts/datos-e2e.sql`, 'utf8'))
  await datos.end()
}
