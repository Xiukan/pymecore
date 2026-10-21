import { afterEach, describe, expect, it, vi } from 'vitest'
import { nuevoUuid } from './uuid'

const V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

describe('clave de idempotencia', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('genera UUID v4 distintos', () => {
    const a = nuevoUuid()
    expect(a).toMatch(V4)
    expect(nuevoUuid()).not.toBe(a)
  })

  it('funciona sin crypto.randomUUID (POS abierto por IP de la red local)', () => {
    vi.stubGlobal('crypto', { getRandomValues: crypto.getRandomValues.bind(crypto) })
    expect(nuevoUuid()).toMatch(V4)
  })
})
