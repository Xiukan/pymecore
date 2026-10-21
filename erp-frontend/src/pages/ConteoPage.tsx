import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { aplicarConteo, getStock, getSucursales, previaConteo, type ResultadoConteo } from '@/api'
import { useAuth } from '@/context/AuthContext'
import type { StockLocal } from '@/types'
import { mensajeError } from '@/utils/contabilidad'
import { clp } from '@/utils/formato'
import { leerPeso } from '@/utils/peso'

export default function ConteoPage() {
  const { user } = useAuth()
  const [sucursalId, setSucursalId] = useState(user?.sucursalId ?? '')
  const [stock, setStock] = useState<StockLocal[]>([])
  const [contado, setContado] = useState<Record<string, string>>({})
  const [busqueda, setBusqueda] = useState('')
  const [previa, setPrevia] = useState<ResultadoConteo | null>(null)
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null)
  useEffect(() => { if (!user?.sucursalId) getSucursales().then((r) => r.data[0] && setSucursalId(r.data[0].id)) }, [])
  useEffect(() => { if (sucursalId) getStock(sucursalId).then((r) => setStock(r.data)) }, [sucursalId])
  const lineas = Object.entries(contado)
    .map(([itemId, v]) => ({ itemId, contado: v.trim() === '0' ? 0 : leerPeso(v) }))
    .filter((l): l is { itemId: string; contado: number } => l.contado !== null)
  const revisar = async () => {
    setMsg(null)
    try {
      setPrevia((await previaConteo({ sucursalId, lineas })).data)
    } catch (e) {
      setMsg({ ok: false, texto: mensajeError(e) })
    }
  }
  const aplicar = async () => {
    try {
      const r = (await aplicarConteo({ sucursalId, lineas })).data
      setMsg({ ok: true, texto: `Listo: ${r.diferencias.length} producto(s) corregidos. Faltante ${clp(r.faltante)}, sobrante ${clp(r.sobrante)}.` })
      setPrevia(null)
      setContado({})
      getStock(sucursalId).then((x) => setStock(x.data))
    } catch (e) {
      setMsg({ ok: false, texto: mensajeError(e) })
    }
  }
  const q = busqueda.trim().toLowerCase()
  return (
    <div className="space-y-4 max-w-4xl">
      <div className="flex flex-wrap justify-between items-center gap-3">
        <h1 className="text-xl font-semibold text-gray-900">Conteo físico</h1>
        <Link to="/inventario" className="text-sm text-blue-700 hover:underline">Volver a productos</Link>
      </div>
      <input placeholder="Buscar producto" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 w-full sm:w-80" />
      <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
        {stock.filter((s) => !q || s.item?.nombre.toLowerCase().includes(q)).map((s) => (
          <label key={s.id} className="flex items-center justify-between gap-3 px-4 py-2 text-[15px]">
            <span>{s.item?.nombre} <span className="text-sm text-gray-400">sistema: {Number(s.stockActual).toLocaleString('es-CL')}</span></span>
            <input inputMode="decimal" placeholder="Contado" value={contado[s.itemId] ?? ''} onChange={(e) => { setContado({ ...contado, [s.itemId]: e.target.value }); setPrevia(null) }}
              className="w-28 border border-gray-300 rounded-lg px-3 py-1.5 text-right" />
          </label>
        ))}
      </div>
      <div className="flex gap-2">
        <button onClick={revisar} disabled={!lineas.length} className="px-4 py-2 rounded-lg border border-gray-300 disabled:opacity-50">Revisar diferencias ({lineas.length})</button>
        {previa && previa.diferencias.length > 0 && <button onClick={() => confirm('¿Corregir el stock con lo contado?') && aplicar()} className="px-4 py-2 rounded-lg bg-blue-600 text-white">Aplicar conteo</button>}
      </div>
      {previa && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 text-sm space-y-2">
          <p>{previa.cuadran} de {previa.contados} productos cuadran. {previa.diferencias.length > 0 && <>Faltan {clp(previa.faltante)} y sobran {clp(previa.sobrante)} (a costo).</>}</p>
          {previa.diferencias.map((d) => (
            <p key={d.itemId} className="flex justify-between">
              <span>{d.nombre}: sistema {Number(d.sistema)}, contado {Number(d.contado)}</span>
              <span className={Number(d.diferencia) < 0 ? 'text-red-700' : 'text-green-700'}>{Number(d.diferencia) > 0 ? '+' : ''}{Number(d.diferencia)} ({clp(d.valor)})</span>
            </p>
          ))}
        </div>
      )}
      {msg && <p className={msg.ok ? 'text-green-700' : 'text-red-600'}>{msg.texto}</p>}
    </div>
  )
}
