import { describe, expect, it } from 'vitest'
import { clp } from './formato'

describe('formato CLP', () => {
  it('redondea, separa miles y pone el signo antes del símbolo', () => {
    expect(clp(1234567.4)).toBe('$1.234.567')
    expect(clp('-490')).toBe('-$490')
    expect(clp(0)).toBe('$0')
  })
})
