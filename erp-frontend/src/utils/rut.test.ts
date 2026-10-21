import { describe, expect, it } from 'vitest'
import { calcularDv, formatRut, interpretarRut, rutConDv, validarRut } from './rut'

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

  it('interpreta lo que escribe el cajero', () => {
    // Con guion se respeta el dígito ingresado (antes se tomaba como parte del número).
    expect(interpretarRut('12345678-5')).toEqual({ rut: '12345678-5', valido: true, dvEsperado: '5' })
    expect(interpretarRut('12.345.678-9')).toEqual({ rut: '12345678-9', valido: false, dvEsperado: '5' })
    expect(interpretarRut('77094287-k')).toMatchObject({ rut: '77094287-K', valido: true })
    // Sin guion el número es el cuerpo y el dígito se calcula.
    expect(interpretarRut('12345678')).toEqual({ rut: '12345678-5', valido: true, dvEsperado: '5' })
    expect(interpretarRut('')).toMatchObject({ rut: '', valido: false })
  })
})
