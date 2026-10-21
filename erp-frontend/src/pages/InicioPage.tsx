import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { getAlertas, getCajaActual, getDashboard, getLotesPorVencer } from '@/api'
import type { DashboardReporte, SesionCaja, StockLocal } from '@/types'
import { clp } from '@/utils/formato'
import { accionesPara, frasesDelDia, saludo } from '@/utils/inicio'

const hoy = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function InicioPage() {
  const { user } = useAuth()
  const [kpis, setKpis] = useState<DashboardReporte['kpis'] | null>(null)
  const [caja, setCaja] = useState<SesionCaja | null | undefined>(undefined)
  const [alertas, setAlertas] = useState<StockLocal[]>([])
  const [lotesPorVencer, setLotesPorVencer] = useState(0)

  useEffect(() => {
    const dia = hoy()
    getDashboard({ desde: dia, hasta: dia, granularidad: 'dia', sucursalId: user?.sucursalId ?? undefined })
      .then((r) => setKpis(r.data.kpis))
      .catch(() => setKpis(null))
    getCajaActual().then((r) => setCaja(r.data || null)).catch(() => setCaja(null))
    getAlertas(user?.sucursalId ?? undefined).then((r) => setAlertas(r.data)).catch(() => setAlertas([]))
    getLotesPorVencer(30, user?.sucursalId ?? undefined).then((r) => setLotesPorVencer(r.data.length)).catch(() => setLotesPorVencer(0))
  }, [user?.sucursalId])

  const acciones = accionesPara(user?.rol)
  const frases = frasesDelDia({ kpis, caja, alertas: alertas.length, lotesPorVencer })

  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">
          {saludo(new Date().getHours())}, {user?.nombreCompleto?.split(' ')[0]}
        </h1>
        <p className="text-gray-600 mt-1">¿Qué quieres hacer?</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {acciones.map((a) => (
          <Link
            key={a.to}
            to={a.to}
            className={`rounded-2xl p-5 min-h-28 flex flex-col justify-between shadow-sm border transition-transform hover:-translate-y-0.5 ${
              a.principal ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-gray-200 text-gray-900'
            }`}
          >
            <span className="text-lg font-semibold">{a.titulo}</span>
            <span className={`text-sm ${a.principal ? 'text-blue-100' : 'text-gray-500'}`}>{a.detalle}</span>
          </Link>
        ))}
      </div>

      <section className="bg-white rounded-2xl border border-gray-200 p-5">
        <h2 className="text-lg font-semibold text-gray-900 mb-3">Hoy</h2>
        {kpis && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
            <Cifra titulo="Vendiste" valor={clp(kpis.ventasTotales)} detalle={`${kpis.numVentas} venta${kpis.numVentas === 1 ? '' : 's'}`} />
            <Cifra titulo="Ganaste (antes de gastos)" valor={clp(kpis.margenBruto)} />
            <Cifra titulo="Gastaste" valor={clp(kpis.gastos)} />
          </div>
        )}
        <ul className="space-y-2">
          {frases.map((f) => (
            <li
              key={f.texto}
              className={`flex items-center justify-between gap-3 rounded-lg px-3 py-2 text-[15px] ${
                f.tono === 'alerta' ? 'bg-amber-50 text-amber-900' : 'bg-gray-50 text-gray-700'
              }`}
            >
              <span>{f.texto}</span>
              {f.to && (
                <Link to={f.to} className="shrink-0 text-sm font-medium text-blue-700 hover:underline">
                  {f.accion}
                </Link>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}

function Cifra({ titulo, valor, detalle }: { titulo: string; valor: string; detalle?: string }) {
  return (
    <div className="rounded-xl bg-gray-50 px-4 py-3">
      <p className="text-sm text-gray-500">{titulo}</p>
      <p className="text-2xl font-semibold text-gray-900">{valor}</p>
      {detalle && <p className="text-sm text-gray-500">{detalle}</p>}
    </div>
  )
}
