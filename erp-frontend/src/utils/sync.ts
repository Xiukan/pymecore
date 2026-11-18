import type { EstadoSync } from '@/api'

/** Textos del estado de conexión: en el local (edge) vienen del servidor, no del navegador. */
export function textoEstadoSync(e: EstadoSync | null, navegadorEnLinea: boolean) {
  const enLinea = e?.modo === 'edge' ? e.conectividad === 'EN_LINEA' : navegadorEnLinea
  const destino = e?.modo === 'edge' ? 'la nube' : 'el SII'
  const conexion = e?.modo === 'edge'
    ? e.conectividad === 'EN_LINEA' ? 'Conectado a la nube' : e.conectividad === 'SIN_CONEXION' ? 'Sin conexión con la nube: las ventas quedan guardadas aquí' : 'Nube no configurada'
    : navegadorEnLinea ? 'Conectado a internet' : 'Sin internet: puedes seguir vendiendo'
  const pendientes = e && e.pendientes > 0 ? `${e.pendientes} venta${e.pendientes === 1 ? '' : 's'} por enviar ${destino === 'el SII' ? 'al SII' : 'a la nube'}` : null
  const licencia = e?.licencia && !e.licencia.vigente ? e.licencia.motivo : null
  const gracia = e?.licencia?.vigente && e.licencia.enGracia ? 'La licencia venció: conéctate pronto para renovarla.' : null
  return { enLinea, conexion, pendientes, licencia, gracia }
}
