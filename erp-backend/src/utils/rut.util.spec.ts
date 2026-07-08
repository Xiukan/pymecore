import { validarRut, calcularDv } from './rut.util'

// AUTO-0001: Validación matemática del RUT chileno
// RUTs válidos verificados con el algoritmo módulo 11:
//   12345678 → dv=5   (sum=138, rem=6, 11-6=5)
//   7775735  → dv=k   (sum=177, rem=1 → k)
//   66666666 → dv=6   (sum=192, rem=5, 11-5=6) — RUT_DEFAULT del sistema
//   11111111 → dv=1   (sum=32,  rem=10, 11-10=1)
describe('validarRut', () => {
  describe('RUTs válidos', () => {
    it('acepta RUT con dígito verificador numérico', () => {
      expect(validarRut('12345678-5')).toBe(true)
    })

    it('acepta RUT con dígito verificador K', () => {
      expect(validarRut('7775735-k')).toBe(true)
    })

    it('acepta RUT con puntos y guión', () => {
      expect(validarRut('12.345.678-5')).toBe(true)
    })

    it('acepta RUT sin formato (solo dígitos + dv)', () => {
      expect(validarRut('123456785')).toBe(true)
    })

    it('acepta RUT del cliente por defecto del sistema', () => {
      expect(validarRut('66666666-6')).toBe(true)
    })

    it('acepta RUT donde todos los dígitos son iguales y el dv es correcto', () => {
      expect(validarRut('11111111-1')).toBe(true)
    })
  })

  describe('RUTs inválidos', () => {
    it('rechaza RUT con dígito verificador incorrecto', () => {
      expect(validarRut('12345678-9')).toBe(false)
    })

    it('rechaza string vacío', () => {
      expect(validarRut('')).toBe(false)
    })

    it('rechaza RUT de un solo carácter', () => {
      expect(validarRut('5')).toBe(false)
    })

    it('rechaza RUT con dv numérico donde corresponde K', () => {
      expect(validarRut('7775735-3')).toBe(false)
    })
  })

  describe('calcularDv', () => {
    it('calcula correctamente el dígito verificador numérico', () => {
      expect(calcularDv('12345678')).toBe('5')
    })

    it('calcula correctamente el dígito verificador K', () => {
      expect(calcularDv('7775735')).toBe('k')
    })

    it('retorna string vacío para cuerpo vacío', () => {
      expect(calcularDv('')).toBe('')
    })
  })
})
