import { describe, expect, it } from 'vitest'
import { calcularDv, formatRut, rutConDv, validarRut } from './rut'

describe('RUT', () => {
  it('calcula el dígito verificador, incluido K y 0', () => {
    expect(calcularDv('76543210')).toBe('3')
    expect(calcularDv('77094287')).toBe('k')
    expect(rutConDv('66.666.666')).toBe('66666666-6')
  })

  it('valida con o sin puntos y con k minúscula', () => {
    expect(validarRut('77.094.287-K')).toBe(true)
    expect(validarRut('77094287-k')).toBe(true)
    expect(validarRut('77094287-1')).toBe(false)
    expect(validarRut('1')).toBe(false)
  })

  it('formatea con puntos y guion', () => {
    expect(formatRut('770942870')).toBe('77.094.287-0')
  })
})
