/** CSV con separador ; y BOM, como lo abre Excel en configuración regional chilena. */
export function aCsv(filas: (string | number | boolean | null | undefined)[][]): string {
  const celda = (v: string | number | boolean | null | undefined) => `"${String(v ?? '').replace(/"/g, '""')}"`
  return '﻿' + filas.map((f) => f.map(celda).join(';')).join('\r\n')
}

export function descargarCsv(nombre: string, filas: Parameters<typeof aCsv>[0]) {
  const url = URL.createObjectURL(new Blob([aCsv(filas)], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = nombre
  a.click()
  URL.revokeObjectURL(url)
}
