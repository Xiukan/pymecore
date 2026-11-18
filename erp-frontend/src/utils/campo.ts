import type { CategoriaCosto } from '@/types'

export const CATEGORIAS_COSTO: CategoriaCosto[] = ['INSUMOS', 'MANO_OBRA', 'MAQUINARIA', 'SERVICIOS', 'OTROS']

/** Temporada que contiene la fecha (AAAA-MM-DD), si hay una. */
export function temporadaVigente<T extends { fechaInicio: string; fechaFin: string }>(temporadas: T[], dia: string): T | undefined {
  return temporadas.find((t) => t.fechaInicio.slice(0, 10) <= dia && dia <= t.fechaFin.slice(0, 10))
}

/** Monto de una labor como lo calcula el servidor: cantidad × tarifa en pesos enteros. */
export const montoLabor = (cantidad: number, tarifa: number) => Math.round(cantidad * tarifa)
