import { useEffect, useState } from 'react'
import { useAuth } from '@/context/AuthContext'
import { getPorCobrar, getPorPagar, pagarFacturaCompra, pagarGasto, registrarAbono } from '@/api'
import type { PorCobrar, PorPagar, Tramos } from '@/types'

const clp = (v: string | number) => {
  const n = Math.round(Number(v))
  return `${n < 0 ? '-' : ''}$${Math.abs(n).toLocaleString('es-CL')}`
}
const fecha = (v: string) => new Date(v).toLocaleDateString('es-CL', { timeZone: 'UTC' })
const TRAMOS: [keyof Tramos, string][] = [['porVencer', 'Por vencer'], ['d1a30', '1–30 días'], ['d31a60', '31–60'], ['d61a90', '61–90'], ['mas90', 'Más de 90']]
const MEDIOS = ['Efectivo', 'Tarjeta', 'Transferencia']
const mensajeError = (e: any) => {
  const msg = e?.response?.data?.message ?? 'No se pudo completar la operación'
  return Array.isArray(msg) ? msg.join(', ') : msg
}

function BarraTramos({ tramos }: { tramos: Tramos }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
      {TRAMOS.map(([k, label]) => (
        <div key={k} className="bg-white rounded-xl shadow-sm border border-gray-200 p-3">
          <p className="text-xs text-gray-500">{label}</p>
          <p className={`text-lg font-bold ${k !== 'porVencer' && Number(tramos[k]) > 0 ? 'text-red-600' : 'text-gray-900'}`}>{clp(tramos[k])}</p>
        </div>
      ))}
    </div>
  )
}

export default function CuentasPage() {
  const { user } = useAuth()
  const gestiona = user?.rol === 'Administrador' || user?.rol === 'Encargado'
  const [pestana, setPestana] = useState<'cobrar' | 'pagar'>('cobrar')
  const [cobrar, setCobrar] = useState<PorCobrar | null>(null)
  const [pagar, setPagar] = useState<PorPagar | null>(null)
  const [abono, setAbono] = useState<{ transaccionId: string; monto: string; medioPago: string } | null>(null)
  const [error, setError] = useState('')

  const cargar = () => {
    getPorCobrar().then((r) => setCobrar(r.data)).catch((e) => setError(mensajeError(e)))
    if (gestiona) getPorPagar().then((r) => setPagar(r.data)).catch(() => {})
  }
  useEffect(cargar, [gestiona])

  const accion = async (fn: () => Promise<unknown>) => {
    setError('')
    try {
      await fn()
      setAbono(null)
      cargar()
    } catch (e) {
      setError(mensajeError(e))
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-gray-900">Me deben y debo</h1>
      <div className="flex gap-1 border-b border-gray-200">
        <button onClick={() => setPestana('cobrar')} className={`px-4 py-2 text-sm font-medium -mb-px border-b-2 ${pestana === 'cobrar' ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-500'}`}>Por cobrar</button>
        {gestiona && <button onClick={() => setPestana('pagar')} className={`px-4 py-2 text-sm font-medium -mb-px border-b-2 ${pestana === 'pagar' ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-500'}`}>Por pagar</button>}
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}

      {pestana === 'cobrar' && cobrar && (
        <>
          <BarraTramos tramos={cobrar.porTramo} />
          {cobrar.clientes.length === 0 && <p className="text-sm text-gray-400">No hay ventas a crédito con saldo.</p>}
          {cobrar.clientes.map((c) => (
            <section key={c.cliente.id} className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 space-y-2">
              <div className="flex justify-between">
                <h2 className="font-semibold text-sm">{c.cliente.nombre} <span className="text-gray-400 font-normal">{c.cliente.rut}</span></h2>
                <span className="font-bold">{clp(c.saldo)}</span>
              </div>
              <table className="w-full text-sm">
                <thead className="text-xs text-gray-500 uppercase"><tr><th className="text-left py-1">Venta</th><th className="text-left">Vence</th><th className="text-right">Total</th><th className="text-right">Saldo</th><th /></tr></thead>
                <tbody className="divide-y divide-gray-100">
                  {c.documentos.map((d) => {
                    const vencida = d.vencimiento.slice(0, 10) < new Date().toISOString().slice(0, 10)
                    return (
                      <tr key={d.transaccionId}>
                        <td className="py-2">{d.folio ? `Boleta/Factura N° ${d.folio}` : 'Venta'} · {fecha(d.fecha)}</td>
                        <td className={vencida ? 'text-red-600 font-medium' : ''}>{fecha(d.vencimiento)}</td>
                        <td className="text-right">{clp(d.total)}</td>
                        <td className="text-right font-medium">{clp(d.saldo)}</td>
                        <td className="text-right">
                          {abono?.transaccionId === d.transaccionId ? (
                            <span className="inline-flex gap-1">
                              <input type="number" min="1" max={Number(d.saldo)} value={abono.monto} onChange={(e) => setAbono({ ...abono, monto: e.target.value })} className="w-24 border border-gray-300 rounded px-2 py-1 text-xs" />
                              <select value={abono.medioPago} onChange={(e) => setAbono({ ...abono, medioPago: e.target.value })} className="border border-gray-300 rounded text-xs">
                                {MEDIOS.map((m) => <option key={m}>{m}</option>)}
                              </select>
                              <button onClick={() => accion(() => registrarAbono({ transaccionId: d.transaccionId, monto: Number(abono.monto), medioPago: abono.medioPago }))} className="text-xs text-blue-600">Registrar</button>
                            </span>
                          ) : (
                            <button onClick={() => setAbono({ transaccionId: d.transaccionId, monto: String(Math.round(Number(d.saldo))), medioPago: 'Efectivo' })} className="text-xs text-blue-600">Abonar</button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </section>
          ))}
        </>
      )}

      {pestana === 'pagar' && pagar && (
        <>
          <BarraTramos tramos={pagar.porTramo} />
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-xs uppercase"><tr><th className="px-4 py-3 text-left">Vence</th><th className="px-4 py-3 text-left">Proveedor</th><th className="px-4 py-3 text-left">Documento</th><th className="px-4 py-3 text-right">A pagar</th><th className="px-4 py-3" /></tr></thead>
              <tbody className="divide-y divide-gray-100">
                {pagar.documentos.map((d) => {
                  const vencida = d.vencimiento.slice(0, 10) < new Date().toISOString().slice(0, 10)
                  return (
                    <tr key={d.id}>
                      <td className={`px-4 py-3 ${vencida ? 'text-red-600 font-medium' : ''}`}>{fecha(d.vencimiento)}</td>
                      <td className="px-4 py-3">{d.proveedor}<span className="block text-xs text-gray-400">{d.rut}</span></td>
                      <td className="px-4 py-3">{d.documento}</td>
                      <td className="px-4 py-3 text-right font-medium">{clp(d.saldo)}</td>
                      <td className="px-4 py-3 text-right">
                        <select defaultValue="" onChange={(e) => e.target.value && accion(() => d.tipo === 'GASTO' ? pagarGasto(d.id, { medioPago: e.target.value }) : pagarFacturaCompra(d.id, e.target.value))} className="text-xs border border-gray-200 rounded">
                          <option value="">Pagar con…</option>
                          {MEDIOS.map((m) => <option key={m} value={m}>{m}</option>)}
                        </select>
                      </td>
                    </tr>
                  )
                })}
                {pagar.documentos.length === 0 && <tr><td colSpan={5} className="px-4 py-6 text-center text-gray-400">Nada por pagar</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
