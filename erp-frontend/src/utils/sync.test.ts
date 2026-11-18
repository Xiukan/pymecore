import { describe, expect, it } from 'vitest'
import { textoEstadoSync } from './sync'

describe('estado de sincronización', () => {
  it('en el local, la conexión la informa el servidor (no navigator.onLine)', () => {
    const t = textoEstadoSync({ modo: 'edge', pendientes: 3, ultimoSyncExitoso: null, conectividad: 'SIN_CONEXION', licencia: { vigente: true, venceEn: '', enGracia: false } }, true)
    expect(t).toMatchObject({ enLinea: false, pendientes: '3 ventas por enviar a la nube', licencia: null })
    expect(t.conexion).toMatch(/quedan guardadas/)
  })

  it('licencia vencida y en gracia se avisan', () => {
    expect(textoEstadoSync({ modo: 'edge', pendientes: 0, ultimoSyncExitoso: null, conectividad: 'EN_LINEA', licencia: { vigente: false, motivo: 'La licencia venció' } }, true).licencia).toBe('La licencia venció')
    expect(textoEstadoSync({ modo: 'edge', pendientes: 0, ultimoSyncExitoso: null, conectividad: 'EN_LINEA', licencia: { vigente: true, venceEn: '', enGracia: true } }, true).gracia).toMatch(/renovarla/)
  })

  it('en modo local usa la conexión del navegador y el SII como destino', () => {
    expect(textoEstadoSync({ modo: 'local', pendientes: 1, ultimoSyncExitoso: null, conectividad: 'NO_CONFIGURADA', licencia: null }, false)).toMatchObject({
      enLinea: false, conexion: 'Sin internet: puedes seguir vendiendo', pendientes: '1 venta por enviar al SII',
    })
  })
})
