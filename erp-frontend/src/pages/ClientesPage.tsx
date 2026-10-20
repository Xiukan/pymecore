import { useEffect, useState } from 'react'
import { api } from '@/api/client'
import { updateEntidad } from '@/api'
import { useAuth } from '@/context/AuthContext'
import type { Entidad } from '@/types'

export default function ClientesPage() {
  const [clientes, setClientes] = useState<Entidad[]>([])
  const [loading, setLoading] = useState(true)
  const [busqueda, setBusqueda] = useState('')
  const { user } = useAuth()
  const gestiona = user?.rol === 'Administrador' || user?.rol === 'Encargado'
  const [editando, setEditando] = useState<{ id: string; cupo: string; dias: string } | null>(null)
  const [error, setError] = useState('')

  const guardarCredito = async () => {
    if (!editando) return
    setError('')
    try {
      await updateEntidad(editando.id, { cupoCredito: Number(editando.cupo || 0), diasCredito: Number(editando.dias || 0) })
      setEditando(null)
      cargar()
    } catch (e: any) {
      const msg = e?.response?.data?.message ?? 'No se pudo guardar'
      setError(Array.isArray(msg) ? msg.join(', ') : msg)
    }
  }

  const cargar = () => {
    setLoading(true)
    api
      .get<Entidad[]>('/entidades?tipo=CLIENTE')
      .then((r) => setClientes(r.data))
      .finally(() => setLoading(false))
  }

  useEffect(() => { cargar() }, [])

  const filtrado = clientes.filter(
    (c) =>
      c.nombreRazonSocial.toLowerCase().includes(busqueda.toLowerCase()) ||
      c.rut.includes(busqueda),
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">Clientes</h1>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      <input
        type="text"
        placeholder="Buscar por nombre o RUT..."
        value={busqueda}
        onChange={(e) => setBusqueda(e.target.value)}
        className="w-full max-w-sm border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        {loading ? (
          <p className="text-sm text-gray-400 px-4 py-6 text-center">Cargando...</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
              <tr>
                <th className="px-4 py-3 text-left">RUT</th>
                <th className="px-4 py-3 text-left">Nombre / Razon social</th>
                <th className="px-4 py-3 text-left">Email</th>
                <th className="px-4 py-3 text-left">Telefono</th>
                <th className="px-4 py-3 text-left">Estado</th>
                <th className="px-4 py-3 text-right">Crédito</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtrado.map((c) => (
                <tr key={c.id}>
                  <td className="px-4 py-3 font-mono text-xs text-gray-600">{c.rut}</td>
                  <td className="px-4 py-3 font-medium">{c.nombreRazonSocial}</td>
                  <td className="px-4 py-3 text-gray-500">{c.email ?? '-'}</td>
                  <td className="px-4 py-3 text-gray-500">{c.telefono ?? '-'}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`px-2 py-0.5 rounded text-xs font-medium ${
                        c.estado === 'Activo'
                          ? 'bg-green-100 text-green-700'
                          : 'bg-gray-100 text-gray-500'
                      }`}
                    >
                      {c.estado}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    {editando?.id === c.id ? (
                      <span className="inline-flex gap-1 items-center">
                        <input type="number" min="0" placeholder="Cupo" value={editando.cupo} onChange={(e) => setEditando({ ...editando, cupo: e.target.value })} className="w-24 border border-gray-300 rounded px-2 py-1 text-xs" />
                        <input type="number" min="0" placeholder="Días" value={editando.dias} onChange={(e) => setEditando({ ...editando, dias: e.target.value })} className="w-16 border border-gray-300 rounded px-2 py-1 text-xs" />
                        <button onClick={guardarCredito} className="text-xs text-blue-600">Guardar</button>
                      </span>
                    ) : (
                      <>
                        <span className="text-xs text-gray-600">
                          {Number(c.cupoCredito ?? 0) > 0 ? `$${Math.round(Number(c.cupoCredito)).toLocaleString('es-CL')} · ${c.diasCredito} días` : 'Sin crédito'}
                        </span>
                        {gestiona && (
                          <button onClick={() => setEditando({ id: c.id, cupo: String(Math.round(Number(c.cupoCredito ?? 0))), dias: String(c.diasCredito ?? 30) })} className="ml-2 text-xs text-blue-600">
                            Editar
                          </button>
                        )}
                      </>
                    )}
                  </td>
                </tr>
              ))}
              {filtrado.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-gray-400">
                    Sin registros
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
