import { seccionesPara } from '@/navegacion'
import { clp } from './formato'

export interface Accion {
  to: string
  titulo: string
  detalle: string
  principal?: boolean
}

const ACCIONES: Accion[] = [
  { to: '/ventas', titulo: 'Vender', detalle: 'Cobrar a un cliente', principal: true },
  { to: '/compras', titulo: 'Llegó mercadería', detalle: 'Registrar una compra' },
  { to: '/gastos', titulo: 'Anotar un gasto', detalle: 'Luz, arriendo, combustible...' },
  { to: '/inventario', titulo: '¿Qué me queda?', detalle: 'Ver productos y stock' },
  { to: '/cuentas', titulo: 'Me deben y debo', detalle: 'Fiados y facturas por pagar' },
  { to: '/reportes', titulo: '¿Cómo voy?', detalle: 'Ventas y ganancias' },
]

/** Solo muestra accesos a pantallas que el rol puede abrir. */
export function accionesPara(rol: string | undefined): Accion[] {
  const permitidas = new Set(seccionesPara(rol).flatMap((s) => s.pantallas.map((p) => p.to)))
  return ACCIONES.filter((a) => permitidas.has(a.to))
}

export function saludo(hora: number): string {
  if (hora < 12) return 'Buenos días'
  if (hora < 20) return 'Buenas tardes'
  return 'Buenas noches'
}

export interface Frase {
  texto: string
  tono: 'normal' | 'alerta'
  to?: string
  accion?: string
}

export function frasesDelDia(d: {
  kpis: { numVentas: number; resultado: number } | null
  caja: { montoApertura: string | number } | null | undefined
  alertas: number
  lotesPorVencer?: number
}): Frase[] {
  const frases: Frase[] = []
  if (d.caja === null) frases.push({ texto: 'La caja está cerrada. Ábrela para empezar a vender.', tono: 'alerta', to: '/caja', accion: 'Abrir caja' })
  else if (d.caja) frases.push({ texto: `La caja está abierta (partió con ${clp(Number(d.caja.montoApertura))}).`, tono: 'normal', to: '/caja', accion: 'Ver caja' })
  if (d.alertas > 0)
    frases.push({
      texto: `${d.alertas} producto${d.alertas === 1 ? ' se está' : 's se están'} acabando.`,
      tono: 'alerta',
      to: '/inventario',
      accion: 'Ver cuáles',
    })
  if (d.lotesPorVencer)
    frases.push({
      texto: `${d.lotesPorVencer} lote${d.lotesPorVencer === 1 ? ' vence' : 's vencen'} en los próximos 30 días o ya venci${d.lotesPorVencer === 1 ? 'ó' : 'eron'}.`,
      tono: 'alerta',
      to: '/lotes',
      accion: 'Ver lotes',
    })
  if (d.kpis) {
    if (d.kpis.numVentas === 0) frases.push({ texto: 'Todavía no hay ventas hoy.', tono: 'normal' })
    else if (d.kpis.resultado < 0)
      frases.push({ texto: `Por ahora el día va en pérdida (${clp(d.kpis.resultado)}), contando gastos y mermas.`, tono: 'alerta' })
    else frases.push({ texto: `Después de gastos y mermas, el día va ganando ${clp(d.kpis.resultado)}.`, tono: 'normal' })
  }
  return frases
}
