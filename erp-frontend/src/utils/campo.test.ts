import { describe, expect, it } from 'vitest'
import { montoLabor, temporadaVigente } from './campo'

describe('campo', () => {
  const temporadas = [
    { id: 'a', fechaInicio: '2025-07-01T00:00:00.000Z', fechaFin: '2026-06-30T00:00:00.000Z' },
    { id: 'b', fechaInicio: '2026-07-01T00:00:00.000Z', fechaFin: '2027-06-30T00:00:00.000Z' },
  ]

  it('elige la temporada que contiene el día, bordes incluidos', () => {
    expect(temporadaVigente(temporadas, '2026-10-20')?.id).toBe('b')
    expect(temporadaVigente(temporadas, '2026-06-30')?.id).toBe('a')
    expect(temporadaVigente(temporadas, '2030-01-01')).toBeUndefined()
  })

  it('monto de la labor redondeado al peso', () => {
    expect(montoLabor(312.5, 85)).toBe(26563)
  })
})
