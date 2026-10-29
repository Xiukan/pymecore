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
  { to: '/lotes', titulo: '¿Qué se vence?', detalle: 'Insumos próximos a vencer' },
  { to: '/cuentas', titulo: 'Me deben y debo', detalle: 'Fiados y facturas por pagar' },
  { to: '/reportes', titulo: '¿Cómo voy?', detalle: 'Ventas y ganancias' },
]

/** Solo muestra accesos a pantallas que el rol puede abrir. */
export function accionesPara(rol: string | undefined, modulos?: string[]): Accion[] {
  const permitidas = new Set(seccionesPara(rol, modulos).flatMap((s) => s.pantallas.map((p) => p.to)))
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
  vencimientos?: { proximos: number; vencidos: number; umbral: number }
  clientesMorosos?: { cantidad: number; monto: number }
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
  if (d.vencimientos?.proximos)
    frases.push({
      texto: `⚠ ${d.vencimientos.proximos} insumo${d.vencimientos.proximos === 1 ? ' está' : 's están'} próximo${d.vencimientos.proximos === 1 ? '' : 's'} a vencer (${d.vencimientos.umbral} días o menos).`,
      tono: 'alerta',
      to: '/lotes',
      accion: 'Ver cuáles',
    })
  if (d.vencimientos?.vencidos)
    frases.push({
      texto: `⛔ ${d.vencimientos.vencidos} lote${d.vencimientos.vencidos === 1 ? ' ya venció' : 's ya vencieron'}: retíralo${d.vencimientos.vencidos === 1 ? '' : 's'} de la venta.`,
      tono: 'alerta',
      to: '/lotes',
      accion: 'Ver cuáles',
    })
  if (d.clientesMorosos?.cantidad)
    frases.push({
      texto: `${d.clientesMorosos.cantidad} cliente${d.clientesMorosos.cantidad === 1 ? ' tiene' : 's tienen'} pagos atrasados por ${clp(d.clientesMorosos.monto)}.`,
      tono: 'alerta',
      to: '/cuentas',
      accion: 'Cobrar',
    })
  if (d.kpis) {
    if (d.kpis.numVentas === 0) frases.push({ texto: 'Todavía no hay ventas hoy.', tono: 'normal' })
    else if (d.kpis.resultado < 0)
      frases.push({ texto: `Por ahora el día va en pérdida (${clp(d.kpis.resultado)}), contando gastos y mermas.`, tono: 'alerta' })
    else frases.push({ texto: `Después de gastos y mermas, el día va ganando ${clp(d.kpis.resultado)}.`, tono: 'normal' })
  }
  return frases
}

/** Clientes con algún documento vencido a la fecha y cuánto suman esos documentos. */
export function morosos(clientes: { documentos: { vencimiento: string; saldo: string }[] }[], dia: string) {
  let cantidad = 0
  let monto = 0
  for (const c of clientes) {
    const vencidos = c.documentos.filter((d) => d.vencimiento.slice(0, 10) < dia)
    if (vencidos.length) cantidad++
    monto += vencidos.reduce((s, d) => s + Number(d.saldo), 0)
  }
  return { cantidad, monto }
}

/** Cuántos lotes están a punto de vencer o ya vencidos (la alerta de Inicio). */
export function contarVencimientos(alertas: { estadoVencimiento: string }[]) {
  return {
    proximos: alertas.filter((a) => a.estadoVencimiento === 'PROXIMO_A_VENCER').length,
    vencidos: alertas.filter((a) => a.estadoVencimiento === 'VENCIDO').length,
  }
}
