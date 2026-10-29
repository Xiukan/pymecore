import type { EstadoVencimiento } from '@/api'

/** Ícono y texto de cada estado: se entiende sin depender del color (RNF-ACC-01). */
export function etiquetaVencimiento(estado: EstadoVencimiento, dias: number | null) {
  switch (estado) {
    case 'VENCIDO':
      return { icono: '⛔', texto: `Vencido (hace ${Math.abs(dias ?? 0)} día${Math.abs(dias ?? 0) === 1 ? '' : 's'})`, clase: 'bg-red-50 text-red-800 border-red-200' }
    case 'PROXIMO_A_VENCER':
      return { icono: '⚠', texto: dias === 0 ? 'Próximo a vencer (vence hoy)' : `Próximo a vencer (${dias} día${dias === 1 ? '' : 's'})`, clase: 'bg-amber-50 text-amber-900 border-amber-200' }
    case 'OK':
      return { icono: '✓', texto: `Vigente (${dias} días)`, clase: 'bg-green-50 text-green-800 border-green-200' }
    default:
      return { icono: '?', texto: 'Sin dato', clase: 'bg-gray-100 text-gray-700 border-gray-200' }
  }
}
