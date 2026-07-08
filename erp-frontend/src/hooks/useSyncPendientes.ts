import { useCallback, useEffect, useRef, useState } from 'react'
import { ejecutarSync, getSyncPendientes } from '@/api'
import { useOnlineStatus } from './useOnlineStatus'

export function useSyncPendientes(sucursalId?: string) {
  const online = useOnlineStatus()
  const prevOnline = useRef(online)
  const [pendientes, setPendientes] = useState(0)
  const [sincronizando, setSincronizando] = useState(false)

  const refrescar = useCallback(async () => {
    try {
      const res = await getSyncPendientes(sucursalId)
      setPendientes(res.data.pendientes)
    } catch {
      // sin conexión o sin auth, ignorar
    }
  }, [sucursalId])

  const sincronizar = useCallback(async () => {
    if (!online || sincronizando) return
    setSincronizando(true)
    try {
      await ejecutarSync(sucursalId)
      await refrescar()
    } catch {
      // ignorar
    } finally {
      setSincronizando(false)
    }
  }, [online, sincronizando, sucursalId, refrescar])

  // Auto-sync al recuperar conexión
  useEffect(() => {
    if (online && !prevOnline.current) {
      sincronizar()
    }
    prevOnline.current = online
  }, [online, sincronizar])

  // Refrescar conteo al montar
  useEffect(() => {
    refrescar()
    const interval = setInterval(refrescar, 30000)
    return () => clearInterval(interval)
  }, [refrescar])

  return { pendientes, sincronizando, sincronizar }
}
