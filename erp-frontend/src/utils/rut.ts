export function calcularDv(rutSinDv: string): string {
  const digits = rutSinDv.replace(/[.\-]/g, '').split('').reverse()
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

export function formatRut(valor: string): string {
  const limpio = valor.replace(/[^0-9kK]/g, '').toUpperCase()
  if (limpio.length < 2) return limpio
  const cuerpo = limpio.slice(0, -1)
  const dv = limpio.slice(-1)
  return cuerpo.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + '-' + dv
}

export function validarRut(rut: string): boolean {
  const limpio = rut.replace(/[^0-9kK]/g, '').toUpperCase()
  if (limpio.length < 2) return false
  const cuerpo = limpio.slice(0, -1)
  const dvIngresado = limpio.slice(-1)
  return calcularDv(cuerpo).toUpperCase() === dvIngresado
}

export function rutConDv(cuerpo: string): string {
  const limpio = cuerpo.replace(/[^0-9]/g, '')
  if (!limpio) return ''
  return `${limpio}-${calcularDv(limpio)}`
}


/**
 * RUT tal como lo escribe el cajero: con guion se respeta el dígito verificador ingresado
 * (y se valida); sin guion el número es el cuerpo y el dígito se calcula.
 */
export function interpretarRut(entrada: string): { rut: string; valido: boolean; dvEsperado: string } {
  const texto = entrada.replace(/[.\s]/g, '').toUpperCase()
  const [cuerpoBruto, dvIngresado] = texto.includes('-') ? texto.split('-', 2) : [texto, undefined]
  const cuerpo = cuerpoBruto.replace(/\D/g, '')
  const dvEsperado = cuerpo ? calcularDv(cuerpo).toUpperCase() : ''
  const dv = dvIngresado === undefined ? dvEsperado : dvIngresado
  const rut = cuerpo ? `${cuerpo}-${dv}` : ''
  return { rut, valido: !!cuerpo && dv === dvEsperado, dvEsperado }
}
