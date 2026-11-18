import { ConfigService } from '@nestjs/config'
import { jwtSecret } from './jwt-secret'

const cfg = (v: Record<string, string>) => new ConfigService(v)

describe('JWT_SECRET', () => {
  it('es obligatorio', () => expect(() => jwtSecret(cfg({}))).toThrow(/Falta/))
  it('en desarrollo acepta cualquier valor', () => expect(jwtSecret(cfg({ JWT_SECRET: 'dev' }))).toBe('dev'))
  it('en producción exige 32 caracteres y no el de ejemplo', () => {
    expect(() => jwtSecret(cfg({ NODE_ENV: 'production', JWT_SECRET: 'corto' }))).toThrow(/32/)
    expect(() => jwtSecret(cfg({ NODE_ENV: 'production', JWT_SECRET: 'cambia_esto_en_produccion' }))).toThrow()
    expect(jwtSecret(cfg({ NODE_ENV: 'production', JWT_SECRET: 'x'.repeat(40) }))).toHaveLength(40)
  })
})
