/** Mensaje legible del backend (string o lista de validaciones). */
export function mensajeError(e: unknown): string {
  const msg = (e as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message
  if (Array.isArray(msg)) return msg.join(', ')
  return msg ?? 'No se pudo completar la operación.'
}

/** AAAA-MM del mes anterior a la fecha: el candidato natural a cerrar. */
export function mesAnterior(d: Date): string {
  const a = d.getMonth() === 0 ? d.getFullYear() - 1 : d.getFullYear()
  const m = d.getMonth() === 0 ? 12 : d.getMonth()
  return `${a}-${String(m).padStart(2, '0')}`
}
