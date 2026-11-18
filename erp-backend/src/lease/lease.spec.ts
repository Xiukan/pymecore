import { firmarLease, validarLease } from './lease'

const SECRETO = 'secreto-compartido-de-prueba'
const ahora = new Date('2026-10-29T12:00:00Z')
const lease = (horasDesdeEmision: number, instalacionId = 'inst-1', secreto = SECRETO) => {
  const iat = Math.floor(ahora.getTime() / 1000) - horasDesdeEmision * 3600
  return firmarLease({ instalacionId, tenantId: 't-1', iat, exp: iat + 24 * 3600 }, secreto)
}

describe('Lease Token (AC-07)', () => {
  beforeEach(() => { process.env.LEASE_GRACIA_MIN = '60' })

  it('vigente: permite vender', () => {
    expect(validarLease(lease(1), 'inst-1', SECRETO, ahora)).toMatchObject({ permitido: true, enGracia: false })
  })

  it('vencido hace menos que el margen de gracia: permite, avisando que está en gracia', () => {
    expect(validarLease(lease(24.5), 'inst-1', SECRETO, ahora)).toMatchObject({ permitido: true, enGracia: true })
  })

  it('más de 24 h + gracia sin renovar: bloquea con un mensaje claro', () => {
    const r = validarLease(lease(26), 'inst-1', SECRETO, ahora)
    expect(r.permitido).toBe(false)
    expect(!r.permitido && r.motivo).toMatch(/venció/)
  })

  it('rechaza licencias falsificadas, de otro local o inexistentes', () => {
    expect(validarLease(lease(1, 'inst-1', 'otro-secreto'), 'inst-1', SECRETO, ahora).permitido).toBe(false)
    expect(validarLease(lease(1, 'inst-2'), 'inst-1', SECRETO, ahora).permitido).toBe(false)
    expect(validarLease(null, 'inst-1', SECRETO, ahora).permitido).toBe(false)
    expect(validarLease('a.b', 'inst-1', SECRETO, ahora).permitido).toBe(false)
  })
})
