import { useEffect, useState } from 'react'
import { getSugerenciaCompra } from '@/api'
import { descargarCsv } from '@/utils/csv'
import { clp } from '@/utils/formato'

type Fila = Awaited<ReturnType<typeof getSugerenciaCompra>>['data'][number]

/** Qué conviene pedir según lo que se vendió en 30 días, el mínimo y lo que ya viene en camino. */
export default function SugerenciaCompra({ sucursalId }: { sucursalId: string }) {
  const [dias, setDias] = useState(30)
  const [filas, setFilas] = useState<Fila[] | null>(null)
  useEffect(() => { if (sucursalId) getSugerenciaCompra(sucursalId, dias).then((r) => setFilas(r.data)).catch(() => setFilas([])) }, [sucursalId, dias])
  if (!filas) return null
  const total = filas.reduce((s, f) => s + Number(f.costoEstimado), 0)
  return (
    <details className="bg-white rounded-xl border border-gray-200 p-4 text-sm" open={filas.length > 0}>
      <summary className="cursor-pointer font-semibold text-gray-900">
        ¿Qué debería comprar? {filas.length > 0 ? `${filas.length} producto(s), aprox. ${clp(total)}` : '— nada por ahora'}
      </summary>
      <div className="flex flex-wrap justify-between items-center gap-2 mt-3">
        <label className="text-gray-600">Que me alcance para
          <select value={dias} onChange={(e) => setDias(Number(e.target.value))} className="ml-2 border border-gray-300 rounded-lg px-2 py-1">
            {[7, 15, 30, 60].map((d) => <option key={d} value={d}>{d} días</option>)}
          </select>
        </label>
        <button disabled={!filas.length} onClick={() => descargarCsv('sugerencia_compra.csv', [['Producto', 'Stock', 'Mínimo', 'Vendido 30 días', 'En camino', 'Días que alcanza', 'Comprar', 'Costo aprox.'], ...filas.map((f) => [f.nombre, f.stock, f.minimo, f.vendido30, f.porRecibir, f.diasCobertura ?? '', f.sugerido, f.costoEstimado])])}
          className="text-blue-700 hover:underline disabled:opacity-50">Descargar lista</button>
      </div>
      <table className="w-full mt-2">
        <thead className="text-gray-500 text-xs uppercase"><tr><th className="text-left py-1">Producto</th><th className="text-right">Hay</th><th className="text-right">Te alcanza</th><th className="text-right">Comprar</th><th className="text-right">Costo aprox.</th></tr></thead>
        <tbody>
          {filas.map((f) => (
            <tr key={f.itemId} className="border-t border-gray-100">
              <td className="py-1">{f.nombre}</td>
              <td className="text-right">{Number(f.stock).toLocaleString('es-CL')}</td>
              <td className={`text-right ${f.diasCobertura !== null && Number(f.diasCobertura) < 7 ? 'text-red-700 font-medium' : ''}`}>{f.diasCobertura === null ? '—' : `${f.diasCobertura} días`}</td>
              <td className="text-right font-medium">{Number(f.sugerido).toLocaleString('es-CL')} {f.unidad.toLowerCase()}</td>
              <td className="text-right">{clp(f.costoEstimado)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  )
}
