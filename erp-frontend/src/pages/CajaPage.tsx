import { useEffect, useState } from 'react'
import { getSesionesCaja, getSucursales } from '@/api'
import CajaPos, { ResumenTabla } from '@/components/CajaPos'
import { useAuth } from '@/context/AuthContext'
import type { SesionCaja } from '@/types'

const clp = (v: string | number | null) => {
  if (v === null) return '—'
  const n = Math.round(Number(v))
  return `${n < 0 ? '-' : ''}$${Math.abs(n).toLocaleString('es-CL')}`
}
const fechaHora = (v: string | null) => (v ? new Date(v).toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' }) : '—')

export default function CajaPage() {
  const [sesiones, setSesiones] = useState<SesionCaja[]>([])
  const [abierta, setAbierta] = useState<SesionCaja | null>(null)
  const [error, setError] = useState('')
  const { user } = useAuth()
  const [sucursalId, setSucursalId] = useState(user?.sucursalId ?? '')

  const cargarSesiones = () =>
    getSesionesCaja().then((r) => setSesiones(r.data)).catch(() => setError('No se pudo cargar el historial de cajas.'))

  useEffect(() => {
    cargarSesiones()
    if (!user?.sucursalId) getSucursales().then((r) => r.data[0] && setSucursalId(r.data[0].id))
  }, [user?.sucursalId])

  const descuadres = sesiones.filter((s) => s.estado === 'CERRADA' && Number(s.diferencia) !== 0)

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-gray-900">Caja</h1>
      {sucursalId && <CajaPos sucursalId={sucursalId} version={0} onCambio={() => cargarSesiones()} />}
      {error && <p className="text-sm text-red-600">{error}</p>}
      <h2 className="text-base font-semibold text-gray-800">Cajas anteriores</h2>
      {descuadres.length > 0 && (
        <p className="text-sm bg-amber-50 text-amber-800 rounded-lg px-3 py-2">
          {descuadres.length} cierre(s) con diferencia en el período mostrado, por un neto de {clp(descuadres.reduce((s, c) => s + Number(c.diferencia), 0))}.
        </p>
      )}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
            <tr>
              <th className="px-4 py-3 text-left">Apertura</th>
              <th className="px-4 py-3 text-left">Cierre</th>
              <th className="px-4 py-3 text-left">Cajero</th>
              <th className="px-4 py-3 text-left">Sucursal</th>
              <th className="px-4 py-3 text-right">Fondo</th>
              <th className="px-4 py-3 text-right">Esperado</th>
              <th className="px-4 py-3 text-right">Contado</th>
              <th className="px-4 py-3 text-right">Diferencia</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {sesiones.map((s) => (
              <tr key={s.id}>
                <td className="px-4 py-3">{fechaHora(s.abiertaEn)}</td>
                <td className="px-4 py-3">{s.estado === 'ABIERTA' ? <span className="text-green-700 font-medium">Abierta</span> : fechaHora(s.cerradaEn)}</td>
                <td className="px-4 py-3">{s.usuario?.nombreCompleto}</td>
                <td className="px-4 py-3 text-gray-600">{s.sucursal?.nombre}</td>
                <td className="px-4 py-3 text-right">{clp(s.montoApertura)}</td>
                <td className="px-4 py-3 text-right">{clp(s.efectivoEsperado)}</td>
                <td className="px-4 py-3 text-right">{clp(s.efectivoContado)}</td>
                <td className={`px-4 py-3 text-right font-medium ${s.diferencia === null || Number(s.diferencia) === 0 ? '' : 'text-red-600'}`}>{clp(s.diferencia)}</td>
                <td className="px-4 py-3 text-right">
                  {s.resumen && <button onClick={() => setAbierta(s)} className="text-xs text-blue-600 hover:underline">Informe Z</button>}
                </td>
              </tr>
            ))}
            {sesiones.length === 0 && <tr><td colSpan={9} className="px-4 py-6 text-center text-gray-400">Sin cajas registradas</td></tr>}
          </tbody>
        </table>
      </div>
      {abierta && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setAbierta(null)}>
          <div className="bg-white rounded-xl p-6 w-96 text-sm" onClick={(e) => e.stopPropagation()}>
            <h2 className="font-semibold mb-2">Informe Z · {fechaHora(abierta.cerradaEn)}</h2>
            <ResumenTabla sesion={abierta} />
            {abierta.observaciones && <p className="text-gray-600">{abierta.observaciones}</p>}
            <button onClick={() => setAbierta(null)} className="mt-3 text-sm px-4 py-2 rounded-lg bg-blue-600 text-white">Cerrar</button>
          </div>
        </div>
      )}
    </div>
  )
}
