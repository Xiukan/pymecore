/** Pesos chilenos enteros: $1.234 y -$1.234 (el signo antes del símbolo). */
export function clp(valor: string | number): string {
  const n = Math.round(Number(valor))
  return `${n < 0 ? '-' : ''}$${Math.abs(n).toLocaleString('es-CL')}`
}
