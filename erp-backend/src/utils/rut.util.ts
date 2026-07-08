export function calcularDv(cuerpo: string): string {
  const digits = cuerpo.replace(/\D/g, '').split('').reverse()
  if (!digits.length) return ''
  let sum = 0
  let mult = 2
  for (const d of digits) {
    sum += parseInt(d) * mult
    mult = mult === 7 ? 2 : mult + 1
  }
  const rem = sum % 11
  if (rem === 0) return '0'
  if (rem === 1) return 'k'
  return String(11 - rem)
}

export function validarRut(rut: string): boolean {
  if (!rut) return false
  const limpio = rut.replace(/[^0-9kK]/g, '').toUpperCase()
  if (limpio.length < 2) return false
  const cuerpo = limpio.slice(0, -1)
  const dvIngresado = limpio.slice(-1)
  return calcularDv(cuerpo).toUpperCase() === dvIngresado
}
