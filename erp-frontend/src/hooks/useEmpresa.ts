import { useEffect, useState } from 'react'
import { getEmpresa } from '@/api'
import type { Empresa } from '@/types'

// Se pide una vez por sesión de navegador; Configuración la invalida al guardar.
let cache: Promise<Empresa> | null = null

export function cargarEmpresa(): Promise<Empresa> {
  cache ??= getEmpresa()
    .then((r) => r.data)
    .catch((e) => {
      cache = null
      throw e
    })
  return cache
}

export function invalidarEmpresa() {
  cache = null
}

export function useEmpresa(): Empresa | null {
  const [empresa, setEmpresa] = useState<Empresa | null>(null)
  useEffect(() => {
    cargarEmpresa().then(setEmpresa).catch(() => {})
  }, [])
  return empresa
}

/** RUT sin puntos, como lo manejan los formularios (12345678-9). */
export const rutSinPuntos = (rut: string) => rut.replace(/\./g, '')
