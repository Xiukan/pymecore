import { validateSync } from 'class-validator'
import { EsRut } from './es-rut.decorator'

class Dto {
  @EsRut()
  rut: string
}
const errores = (rut: unknown) => validateSync(Object.assign(new Dto(), { rut })).length

describe('@EsRut', () => {
  it('acepta RUT con dígito verificador correcto, incluido K', () => {
    expect(errores('12345678-5')).toBe(0)
    expect(errores('77094287-K')).toBe(0)
  })

  it('rechaza dígito incorrecto, formato con puntos y valores no texto', () => {
    expect(errores('12345678-9')).toBe(1)
    expect(errores('12.345.678-5')).toBe(1)
    expect(errores(12345678)).toBe(1)
  })
})
