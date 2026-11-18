import { describe, expect, it } from 'vitest'
import { mensajeError, mesAnterior } from './contabilidad'

describe('contabilidad', () => {
  it('mes anterior, incluido enero', () => {
    expect(mesAnterior(new Date(2026, 9, 20))).toBe('2026-09')
    expect(mesAnterior(new Date(2026, 0, 5))).toBe('2025-12')
  })

  it('mensaje de error del backend, en lista o texto', () => {
    expect(mensajeError({ response: { data: { message: ['a', 'b'] } } })).toBe('a, b')
    expect(mensajeError({ response: { data: { message: 'Mes cerrado' } } })).toBe('Mes cerrado')
    expect(mensajeError(new Error('x'))).toBe('No se pudo completar la operación.')
  })
})
