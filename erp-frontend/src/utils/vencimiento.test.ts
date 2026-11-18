import { describe, expect, it } from 'vitest'
import { etiquetaVencimiento } from './vencimiento'

describe('etiqueta de vencimiento (RNF-ACC-01)', () => {
  it('cada estado lleva ícono y texto', () => {
    expect(etiquetaVencimiento('PROXIMO_A_VENCER', 2)).toMatchObject({ icono: '⚠', texto: 'Próximo a vencer (2 días)' })
    expect(etiquetaVencimiento('PROXIMO_A_VENCER', 0).texto).toBe('Próximo a vencer (vence hoy)')
    expect(etiquetaVencimiento('VENCIDO', -1)).toMatchObject({ icono: '⛔', texto: 'Vencido (hace 1 día)' })
    expect(etiquetaVencimiento('OK', 30).texto).toBe('Vigente (30 días)')
    expect(etiquetaVencimiento('SIN_DATO', null)).toMatchObject({ icono: '?', texto: 'Sin dato' })
  })
})
