import { useEffect, useState } from 'react'
import { useAuth } from '@/context/AuthContext'
import { getTransacciones, getAlertas } from '@/api'
import type { StockLocal, Transaccion } from '@/types'

export default function DashboardPage() {
  const { user } = useAuth()
  const [transacciones, setTransacciones] = useState<Transaccion[]>([])
  const [alertas, setAlertas] = useState<StockLocal[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const sucursalId = user?.sucursalId ?? undefined

    Promise.all([
      getTransacciones(sucursalId).then((r) => setTransacciones(r.data)),
      getAlertas(sucursalId).then((r) => setAlertas(r.data)),
    ]).finally(() => setLoading(false))
  }, [user])

  const ventas = transacciones.filter((t) => t.tipoTransaccion === 'VENTA')
  const totalVentas = ventas.reduce((sum, t) => sum + parseFloat(t.montoTotal), 0)

  if (loading) return <p className="text-sm text-gray-500">Cargando...</p>

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-gray-900">Dashboard</h1>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard label="Ventas del periodo" value={ventas.length.toString()} />
        <StatCard
          label="Monto total ventas"
          value={`$${totalVentas.toLocaleString('es-CL')}`}
        />
        <StatCard
          label="Alertas de stock"
          value={alertas.length.toString()}
          danger={alertas.length > 0}
        />
      </div>

      {alertas.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-gray-700 mb-2">
            Productos con stock bajo
          </h2>
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                <tr>
                  <th className="px-4 py-3 text-left">Producto</th>
                  <th className="px-4 py-3 text-right">Stock actual</th>
                  <th className="px-4 py-3 text-right">Stock minimo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {alertas.map((a) => (
                  <tr key={a.id}>
                    <td className="px-4 py-3 font-medium">{a.item.nombre}</td>
                    <td className="px-4 py-3 text-right text-red-600">{a.stockActual}</td>
                    <td className="px-4 py-3 text-right">{a.stockMinimo}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section>
        <h2 className="text-sm font-semibold text-gray-700 mb-2">
          Ultimas transacciones
        </h2>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
              <tr>
                <th className="px-4 py-3 text-left">Fecha</th>
                <th className="px-4 py-3 text-left">Tipo</th>
                <th className="px-4 py-3 text-left">Cliente</th>
                <th className="px-4 py-3 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {transacciones.slice(0, 8).map((t) => (
                <tr key={t.id}>
                  <td className="px-4 py-3 text-gray-500">
                    {new Date(t.fechaRegistro).toLocaleDateString('es-CL')}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`px-2 py-0.5 rounded text-xs font-medium ${
                        t.tipoTransaccion === 'VENTA'
                          ? 'bg-green-100 text-green-700'
                          : t.tipoTransaccion === 'COMPRA'
                          ? 'bg-blue-100 text-blue-700'
                          : 'bg-red-100 text-red-700'
                      }`}
                    >
                      {t.tipoTransaccion}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {t.entidad?.nombreRazonSocial ?? '-'}
                  </td>
                  <td className="px-4 py-3 text-right font-medium">
                    ${parseFloat(t.montoTotal).toLocaleString('es-CL')}
                  </td>
                </tr>
              ))}
              {transacciones.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-gray-400">
                    Sin transacciones
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

function StatCard({
  label,
  value,
  danger = false,
}: {
  label: string
  value: string
  danger?: boolean
}) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className={`text-2xl font-bold ${danger ? 'text-red-600' : 'text-gray-900'}`}>
        {value}
      </p>
    </div>
  )
}
