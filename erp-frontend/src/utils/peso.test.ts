import { describe, expect, it } from 'vitest'
import { esPorPeso, leerPeso } from './peso'

describe('venta por peso', () => {
  it('reconoce productos en kilos o gramos', () => {
    expect([esPorPeso('KG'), esPorPeso('kg'), esPorPeso('UN')]).toEqual([true, true, false])
  })

  it('lee pesos con coma o punto, hasta el gramo', () => {
    expect([leerPeso('1,250'), leerPeso('0.3337'), leerPeso('0'), leerPeso('abc')]).toEqual([1.25, 0.334, null, null])
  })
})
