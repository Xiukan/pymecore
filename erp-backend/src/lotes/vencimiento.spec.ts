import { estadoVencimiento } from './vencimiento'

const d = (s: string) => new Date(`${s}T00:00:00Z`)

describe('alerta de vencimiento (AC-05, AC-06 · AUTO-0006)', () => {
  it('a 3 días o menos: Próximo a vencer', () => {
    expect(estadoVencimiento(d('2026-11-01'), '2026-10-29', 3)).toEqual({ estado: 'PROXIMO_A_VENCER', diasRestantes: 3 })
    expect(estadoVencimiento(d('2026-10-29'), '2026-10-29', 3)).toEqual({ estado: 'PROXIMO_A_VENCER', diasRestantes: 0 })
  })

  it('a más de 3 días: OK; ya pasado: Vencido', () => {
    expect(estadoVencimiento(d('2026-11-02'), '2026-10-29', 3).estado).toBe('OK')
    expect(estadoVencimiento(d('2026-10-27'), '2026-10-29', 3)).toEqual({ estado: 'VENCIDO', diasRestantes: -2 })
  })

  it('sin fecha: Sin dato y ninguna alerta', () => {
    expect(estadoVencimiento(null, '2026-10-29', 3)).toEqual({ estado: 'SIN_DATO', diasRestantes: null })
  })

  it('el umbral es configurable (RNF-MAN-01)', () => {
    expect(estadoVencimiento(d('2026-11-05'), '2026-10-29', 7).estado).toBe('PROXIMO_A_VENCER')
  })
})
