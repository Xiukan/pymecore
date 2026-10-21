import { useEffect, useState } from 'react'
import {
  anularPedido,
  confirmarPedido,
  crearPedido,
  getClientes,
  getItems,
  getPedidos,
  getPreciosVigentes,
  getSucursales,
  venderPedido,
} from '@/api'
import { useAuth } from '@/context/AuthContext'
import { useEmpresa } from '@/hooks/useEmpresa'
import type { Entidad, Item, Pedido } from '@/types'
import { mensajeError } from '@/utils/contabilidad'
import { clp } from '@/utils/formato'

const input = 'border border-gray-300 rounded-lg px-3 py-2 text-[15px] w-full'
const ESTADOS: Record<Pedido['estado'], { texto: string; color: string }> = {
  COTIZACION: { texto: 'Cotización', color: 'bg-gray-100 text-gray-700' },
  PEDIDO: { texto: 'Pedido aceptado', color: 'bg-blue-100 text-blue-800' },
  VENDIDO: { texto: 'Vendido', color: 'bg-green-100 text-green-800' },
  ANULADO: { texto: 'Anulado', color: 'bg-red-100 text-red-700' },
}

export default function PedidosPage() {
  const [pedidos, setPedidos] = useState<Pedido[]>([])
  const [filtro, setFiltro] = useState('')
  const [nuevo, setNuevo] = useState(false)
  const [imprimir, setImprimir] = useState<Pedido | null>(null)
  const [msg, setMsg] = useState('')
  const cargar = () => getPedidos(filtro || undefined).then((r) => setPedidos(r.data))
  useEffect(() => { cargar() }, [filtro])
  const accion = async (fn: () => Promise<unknown>, ok: string) => {
    setMsg('')
    try {
      await fn()
      setMsg(ok)
      cargar()
    } catch (e) {
      setMsg(mensajeError(e))
    }
  }

  if (imprimir) return <Imprimible pedido={imprimir} onVolver={() => setImprimir(null)} />

  return (
    <div className="space-y-4 max-w-6xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-gray-900">Cotizaciones y pedidos</h1>
        <div className="flex gap-2">
          <select value={filtro} onChange={(e) => setFiltro(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm">
            <option value="">Todos</option>
            {Object.entries(ESTADOS).map(([k, v]) => <option key={k} value={k}>{v.texto}</option>)}
          </select>
          <button onClick={() => setNuevo(true)} className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm">Nueva cotización</button>
        </div>
      </div>
      {msg && <p className="text-sm text-gray-700">{msg}</p>}
      {nuevo && <NuevoPedido onCerrar={() => setNuevo(false)} onCreado={(p) => { setNuevo(false); cargar(); setImprimir(p) }} />}
      <div className="space-y-2">
        {pedidos.map((p) => (
          <div key={p.id} className="bg-white rounded-xl border border-gray-200 px-4 py-3 text-sm flex flex-wrap justify-between gap-3 items-center">
            <div>
              <p className="font-medium">N° {p.folio} · {p.entidad.nombreRazonSocial} <span className={`ml-2 text-xs px-2 py-0.5 rounded-full ${ESTADOS[p.estado].color}`}>{ESTADOS[p.estado].texto}</span></p>
              <p className="text-gray-500">{new Date(p.fecha).toLocaleDateString('es-CL')} · {p.detalles.length} producto(s){p.fechaEntrega ? ` · entrega ${p.fechaEntrega.slice(0, 10)}` : ''}{p.transaccion ? ` · venta N° ${p.transaccion.numeroFactura ?? ''}` : ''}</p>
            </div>
            <div className="flex gap-3 items-center">
              <b>{clp(p.total)}</b>
              <button onClick={() => setImprimir(p)} className="text-blue-700 hover:underline">Ver / imprimir</button>
              {p.estado === 'COTIZACION' && <button onClick={() => accion(() => confirmarPedido(p.id), `Cotización ${p.folio} aceptada.`)} className="text-blue-700 hover:underline">El cliente aceptó</button>}
              {(p.estado === 'COTIZACION' || p.estado === 'PEDIDO') && (
                <>
                  <button onClick={() => { const m = prompt('¿Cómo paga? (Efectivo, Tarjeta, Transferencia o Credito)', 'Transferencia'); if (m) accion(() => venderPedido(p.id, m), `Pedido ${p.folio} vendido.`) }}
                    className="px-3 py-1.5 rounded bg-green-600 text-white">Vender</button>
                  <button onClick={() => confirm('¿Anular?') && accion(() => anularPedido(p.id), 'Anulado.')} className="text-red-600 hover:underline">Anular</button>
                </>
              )}
            </div>
          </div>
        ))}
        {pedidos.length === 0 && <p className="text-sm text-gray-400">Sin cotizaciones.</p>}
      </div>
    </div>
  )
}

function NuevoPedido({ onCerrar, onCreado }: { onCerrar: () => void; onCreado: (p: Pedido) => void }) {
  const { user } = useAuth()
  const [clientes, setClientes] = useState<Entidad[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [precios, setPrecios] = useState<Record<string, string>>({})
  const [sucursalId, setSucursalId] = useState(user?.sucursalId ?? '')
  const [f, setF] = useState({ entidadId: '', validoHasta: '', fechaEntrega: '', observaciones: '', confirmado: false })
  const [lineas, setLineas] = useState<{ itemId: string; cantidad: string }[]>([{ itemId: '', cantidad: '1' }])
  const [error, setError] = useState('')
  useEffect(() => {
    getClientes().then((r) => setClientes(r.data))
    getItems().then((r) => setItems(r.data.filter((i) => i.estado === 'Activo')))
    if (!user?.sucursalId) getSucursales().then((r) => r.data[0] && setSucursalId(r.data[0].id))
  }, [])
  useEffect(() => { getPreciosVigentes(f.entidadId || undefined).then((r) => setPrecios(r.data)) }, [f.entidadId])
  const validas = lineas.filter((l) => l.itemId && Number(l.cantidad) > 0)
  const total = validas.reduce((s, l) => s + Math.round(Number(precios[l.itemId] ?? 0) * Number(l.cantidad)), 0)
  const guardar = async () => {
    setError('')
    try {
      const { data } = await crearPedido({
        entidadId: f.entidadId, sucursalId, confirmado: f.confirmado, validoHasta: f.validoHasta || undefined, fechaEntrega: f.fechaEntrega || undefined,
        observaciones: f.observaciones || undefined, detalles: validas.map((l) => ({ itemId: l.itemId, cantidad: Number(l.cantidad) })),
      })
      onCreado(data)
    } catch (e) {
      setError(mensajeError(e))
    }
  }
  return (
    <div className="bg-white rounded-xl border border-blue-200 p-4 space-y-3 text-sm">
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        <label className="text-gray-600 sm:col-span-2">Cliente
          <select value={f.entidadId} onChange={(e) => setF({ ...f, entidadId: e.target.value })} className={input}>
            <option value="">Elige...</option>
            {clientes.map((c) => <option key={c.id} value={c.id}>{c.nombreRazonSocial} ({c.rut})</option>)}
          </select>
        </label>
        <label className="text-gray-600">Válida hasta<input type="date" value={f.validoHasta} onChange={(e) => setF({ ...f, validoHasta: e.target.value })} className={input} /></label>
        <label className="text-gray-600">Entrega<input type="date" value={f.fechaEntrega} onChange={(e) => setF({ ...f, fechaEntrega: e.target.value })} className={input} /></label>
      </div>
      {lineas.map((l, i) => (
        <div key={i} className="flex gap-2 items-center">
          <select value={l.itemId} onChange={(e) => setLineas(lineas.map((x, j) => (j === i ? { ...x, itemId: e.target.value } : x)))} className={input}>
            <option value="">Producto...</option>
            {items.map((it) => <option key={it.id} value={it.id}>{it.nombre}</option>)}
          </select>
          <input inputMode="decimal" value={l.cantidad} onChange={(e) => setLineas(lineas.map((x, j) => (j === i ? { ...x, cantidad: e.target.value } : x)))} className="w-28 border border-gray-300 rounded-lg px-3 py-2" />
          <span className="w-28 text-right text-gray-600">{l.itemId ? clp(Math.round(Number(precios[l.itemId] ?? 0) * Number(l.cantidad || 0))) : ''}</span>
          <button onClick={() => setLineas(lineas.filter((_, j) => j !== i))} className="text-red-500 px-2">✕</button>
        </div>
      ))}
      <button onClick={() => setLineas([...lineas, { itemId: '', cantidad: '1' }])} className="text-blue-700 hover:underline">+ Agregar producto</button>
      <input placeholder="Observaciones (condiciones, despacho...)" value={f.observaciones} onChange={(e) => setF({ ...f, observaciones: e.target.value })} className={input} />
      <div className="flex flex-wrap justify-between items-center gap-3">
        <label className="flex items-center gap-2"><input type="checkbox" checked={f.confirmado} onChange={(e) => setF({ ...f, confirmado: e.target.checked })} /> El cliente ya lo aceptó (pedido)</label>
        <span>Total (IVA incluido): <b>{clp(total)}</b></span>
      </div>
      {error && <p className="text-red-600">{error}</p>}
      <div className="flex justify-end gap-2">
        <button onClick={onCerrar} className="px-4 py-2 rounded-lg border border-gray-300">Cancelar</button>
        <button onClick={guardar} disabled={!f.entidadId || !validas.length || !sucursalId} className="px-4 py-2 rounded-lg bg-blue-600 text-white disabled:opacity-50">Guardar</button>
      </div>
    </div>
  )
}

function Imprimible({ pedido: p, onVolver }: { pedido: Pedido; onVolver: () => void }) {
  const empresa = useEmpresa()
  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <div className="flex gap-2 print:hidden">
        <button onClick={onVolver} className="px-4 py-2 rounded-lg border border-gray-300">Volver</button>
        <button onClick={() => window.print()} className="px-4 py-2 rounded-lg bg-blue-600 text-white">Imprimir o guardar PDF</button>
      </div>
      <div className="bg-white p-8 rounded-xl border border-gray-200 print:border-0 text-sm space-y-4">
        <div className="flex justify-between">
          <div>
            <p className="text-lg font-semibold">{empresa?.razonSocial ?? ''}</p>
            <p className="text-gray-600">{empresa?.rut} · {empresa?.giro}</p>
            <p className="text-gray-600">{empresa?.direccion}, {empresa?.comuna}</p>
          </div>
          <div className="text-right">
            <p className="text-lg font-semibold">{p.estado === 'COTIZACION' ? 'COTIZACIÓN' : 'NOTA DE PEDIDO'} N° {p.folio}</p>
            <p>{new Date(p.fecha).toLocaleDateString('es-CL')}</p>
            {p.validoHasta && <p className="text-gray-600">Válida hasta {p.validoHasta.slice(0, 10)}</p>}
          </div>
        </div>
        <div className="border-t border-b border-gray-200 py-2">
          <p><b>Cliente:</b> {p.entidad.nombreRazonSocial} · RUT {p.entidad.rut}</p>
          {p.entidad.direccion && <p className="text-gray-600">{p.entidad.direccion}</p>}
          {p.fechaEntrega && <p className="text-gray-600">Entrega: {p.fechaEntrega.slice(0, 10)}</p>}
        </div>
        <table className="w-full">
          <thead className="text-gray-500 text-xs uppercase"><tr><th className="text-left py-1">Producto</th><th className="text-right">Cantidad</th><th className="text-right">Precio</th><th className="text-right">Total</th></tr></thead>
          <tbody>
            {p.detalles.map((d) => (
              <tr key={d.id} className="border-t border-gray-100">
                <td className="py-1">{d.item.nombre}</td>
                <td className="text-right">{Number(d.cantidad).toLocaleString('es-CL')} {d.item.unidadMedida.toLowerCase()}</td>
                <td className="text-right">{clp(d.precioUnitario)}</td>
                <td className="text-right">{clp(d.subtotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-right text-lg">Total (IVA incluido): <b>{clp(p.total)}</b></p>
        {p.observaciones && <p className="text-gray-600">{p.observaciones}</p>}
        <p className="text-xs text-gray-500">Precios sujetos a cambio después de la fecha de validez. Atendido por {p.usuario.nombreCompleto}.</p>
      </div>
    </div>
  )
}
