import { useEffect, useState } from 'react'
import { getAlertasVencimiento, getLotes, getSucursales, getTrazabilidadLote, registrarLote, type AlertaVencimiento } from '@/api'
import { useAuth } from '@/context/AuthContext'
import { etiquetaVencimiento } from '@/utils/vencimiento'
import type { Lote, TrazabilidadLote } from '@/types'
import { mensajeError } from '@/utils/contabilidad'
import { diasParaVencer } from '@/utils/productores'

const cantidad = (v: string, unidad: string) => `${Number(v).toLocaleString('es-CL')} ${unidad.toLowerCase()}`
const TIPOS: Record<string, string> = {
  VENTA: 'Venta',
  MERMA: 'Pérdida',
  DEVOLUCION: 'Devolución',
  DESPACHO: 'Enviado a otro local',
  RECEPCION_GUIA: 'Llegó desde otro local',
  ANULACION_GUIA: 'Envío anulado',
  ANULACION: 'Recepción anulada',
}

function Vencimiento({ fecha }: { fecha: string | null }) {
  const dias = diasParaVencer(fecha)
  if (dias === null) return <span className="text-gray-400">—</span>
  const texto = dias < 0 ? `Venció hace ${-dias} día(s)` : dias === 0 ? 'Vence hoy' : `En ${dias} día(s)`
  const color = dias < 0 ? 'text-red-700 font-medium' : dias <= 30 ? 'text-amber-700 font-medium' : 'text-gray-600'
  return <span className={color}>{fecha!.slice(0, 10)} · {texto}</span>
}

export default function LotesPage() {
  const [vista, setVista] = useState<'vencimientos' | 'lotes'>('vencimientos')
  return (
    <div className="space-y-4 max-w-6xl">
      <div className="flex gap-1 border-b border-gray-200">
        {([['vencimientos', 'Vencimientos'], ['lotes', 'Lotes y trazabilidad']] as const).map(([id, label]) => (
          <button key={id} onClick={() => setVista(id)}
            className={`px-4 py-2 text-sm font-medium -mb-px border-b-2 ${vista === id ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-500'}`}>
            {label}
          </button>
        ))}
      </div>
      {vista === 'vencimientos' ? <Vencimientos /> : <Lotes />}
    </div>
  )
}

function Vencimientos() {
  const { user } = useAuth()
  const [filas, setFilas] = useState<AlertaVencimiento[]>([])
  const [filtro, setFiltro] = useState<'alertas' | 'todos'>('alertas')
  const [registrar, setRegistrar] = useState<AlertaVencimiento | null>(null)
  const [error, setError] = useState('')
  const cargar = () => getAlertasVencimiento().then((r) => setFilas(r.data)).catch((e) => setError(mensajeError(e)))
  useEffect(() => { cargar() }, [])
  const visibles = filas.filter((f) => filtro === 'todos' || f.estadoVencimiento !== 'OK')
  const gestiona = user?.rol !== 'Vendedor'
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-gray-900">Vencimientos</h1>
        <select value={filtro} onChange={(e) => setFiltro(e.target.value as 'alertas' | 'todos')} className="border border-gray-300 rounded-lg px-3 py-2 text-sm">
          <option value="alertas">Por vencer, vencidos y sin dato</option>
          <option value="todos">Todo el inventario</option>
        </select>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <ul className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
        {visibles.map((f, i) => {
          const e = etiquetaVencimiento(f.estadoVencimiento, f.diasRestantes)
          return (
            <li key={`${f.productoId}${f.loteId ?? i}`} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <div>
                <p className="font-medium text-[15px]">{f.nombre}</p>
                <p className="text-sm text-gray-500">
                  {Number(f.cantidad).toLocaleString('es-CL')} {f.unidad.toLowerCase()} · {f.sucursal}
                  {f.lote && <> · lote {f.lote}</>}
                  {f.fechaVencimiento && <> · vence {f.fechaVencimiento.slice(0, 10)}</>}
                </p>
              </div>
              <span className="flex items-center gap-3">
                <span role="status" className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-medium ${e.clase}`}>
                  <span aria-hidden="true">{e.icono}</span>{e.texto}
                </span>
                {gestiona && f.estadoVencimiento === 'SIN_DATO' && (
                  <button onClick={() => setRegistrar(f)} className="text-sm text-blue-700 hover:underline">Registrar vencimiento</button>
                )}
              </span>
            </li>
          )
        })}
        {visibles.length === 0 && <li className="px-4 py-6 text-center text-gray-400">Nada por vencer.</li>}
      </ul>
      {registrar && <RegistrarVencimiento fila={registrar} onCerrar={() => setRegistrar(null)} onListo={() => { setRegistrar(null); cargar() }} />}
    </div>
  )
}

function RegistrarVencimiento({ fila, onCerrar, onListo }: { fila: AlertaVencimiento; onCerrar: () => void; onListo: () => void }) {
  const { user } = useAuth()
  const [cantidad, setCantidad] = useState(String(Number(fila.cantidad)))
  const [fecha, setFecha] = useState('')
  const [error, setError] = useState('')
  const [sucursalId, setSucursalId] = useState(user?.sucursalId ?? '')
  useEffect(() => {
    if (!user?.sucursalId) getSucursales().then((r) => setSucursalId(r.data.find((x) => x.nombre === fila.sucursal)?.id ?? r.data[0]?.id ?? ''))
  }, [])
  const guardar = async () => {
    setError('')
    try {
      await registrarLote({ itemId: fila.productoId, sucursalId, cantidad: Number(cantidad.replace(',', '.')), fechaVencimiento: fecha })
      onListo()
    } catch (e) {
      setError(mensajeError(e))
    }
  }
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onCerrar}>
      <div className="bg-white rounded-xl p-5 w-full max-w-md space-y-3 text-sm" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-semibold">Registrar vencimiento: {fila.nombre}</h2>
        <label className="block text-gray-600">Cantidad con esa fecha
          <input inputMode="decimal" value={cantidad} onChange={(e) => setCantidad(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2" />
        </label>
        <label className="block text-gray-600">Fecha de vencimiento
          <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2" />
        </label>
        {error && <p className="text-red-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <button onClick={onCerrar} className="px-4 py-2 rounded-lg border border-gray-300">Cancelar</button>
          <button onClick={guardar} disabled={!fecha || !(Number(cantidad.replace(',', '.')) > 0)} className="px-4 py-2 rounded-lg bg-blue-600 text-white disabled:opacity-50">Guardar</button>
        </div>
      </div>
    </div>
  )
}

function Lotes() {
  const [lotes, setLotes] = useState<Lote[]>([])
  const [conSaldo, setConSaldo] = useState(true)
  const [busqueda, setBusqueda] = useState('')
  const [abierto, setAbierto] = useState<TrazabilidadLote | null>(null)
  const [error, setError] = useState('')
  useEffect(() => { getLotes({ conSaldo }).then((r) => setLotes(r.data)).catch((e) => setError(mensajeError(e))) }, [conSaldo])
  const abrir = (id: string) => getTrazabilidadLote(id).then((r) => setAbierto(r.data)).catch((e) => setError(mensajeError(e)))
  const q = busqueda.trim().toLowerCase()
  const visibles = lotes.filter((l) => !q || l.codigo.toLowerCase().includes(q) || l.item.nombre.toLowerCase().includes(q))

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-gray-900">Lotes y trazabilidad</h2>
        <div className="flex gap-3 items-center text-sm">
          <input placeholder="Buscar lote o producto" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2" />
          <label className="flex items-center gap-2"><input type="checkbox" checked={conSaldo} onChange={(e) => setConSaldo(e.target.checked)} /> Solo con saldo</label>
        </div>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
            <tr>
              <th className="px-3 py-2 text-left">Lote</th>
              <th className="px-3 py-2 text-left">Producto</th>
              <th className="px-3 py-2 text-left">Local</th>
              <th className="px-3 py-2 text-left">Origen</th>
              <th className="px-3 py-2 text-right">Queda</th>
              <th className="px-3 py-2 text-left">Vencimiento</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {visibles.map((l) => (
              <tr key={l.id} onClick={() => abrir(l.id)} className="cursor-pointer hover:bg-blue-50">
                <td className="px-3 py-2 font-medium text-blue-700">{l.codigo}</td>
                <td className="px-3 py-2">{l.item.nombre}</td>
                <td className="px-3 py-2">{l.sucursal.nombre}</td>
                <td className="px-3 py-2 text-gray-600">{l.productor?.nombreRazonSocial ?? l.origen}</td>
                <td className="px-3 py-2 text-right">{cantidad(l.cantidadActual, l.item.unidadMedida)} <span className="text-gray-400">de {Number(l.cantidadInicial).toLocaleString('es-CL')}</span></td>
                <td className="px-3 py-2"><Vencimiento fecha={l.fechaVencimiento} /></td>
              </tr>
            ))}
            {visibles.length === 0 && <tr><td colSpan={6} className="px-3 py-6 text-center text-gray-400">Sin lotes. Se crean al recibir compras con fecha de vencimiento o al registrarla en Vencimientos.</td></tr>}
          </tbody>
        </table>
      </div>
      {abierto && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setAbierto(null)}>
          <div className="bg-white rounded-xl p-5 w-full max-w-2xl text-sm space-y-3 max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold">Lote {abierto.codigo} · {abierto.item.nombre}</h2>
            <p className="text-gray-600">
              Entró el {new Date(abierto.fechaIngreso).toLocaleDateString('es-CL')} a {abierto.sucursal.nombre}
              {abierto.productor && <> desde <b>{abierto.productor.nombreRazonSocial}</b> ({abierto.productor.rut})</>}
              {abierto.recepcion && <>, recepción N° {abierto.recepcion.folio}</>}.
            </p>
            <p>Vencimiento: <Vencimiento fecha={abierto.fechaVencimiento} /></p>
            <h3 className="font-semibold pt-2">¿A dónde se fue?</h3>
            <ul className="divide-y divide-gray-100">
              {abierto.movimientos.map((m) => (
                <li key={m.id} className="flex justify-between py-1.5">
                  <span>
                    {new Date(m.fecha).toLocaleDateString('es-CL')} · {TIPOS[m.tipo] ?? m.tipo}
                    {m.documento?.numeroFactura && <> N° {m.documento.numeroFactura}</>}
                    {m.documento?.entidad && <> · {m.documento.entidad.nombreRazonSocial} ({m.documento.entidad.rut})</>}
                    {m.guia && <> · guía {m.guia.folio} a {m.guia.sucursalDestino.nombre}</>}
                  </span>
                  <span className={Number(m.cantidad) < 0 ? 'text-red-700' : 'text-green-700'}>{Number(m.cantidad) > 0 ? '+' : ''}{Number(m.cantidad).toLocaleString('es-CL')}</span>
                </li>
              ))}
              {abierto.movimientos.length === 0 && <li className="py-2 text-gray-400">Todavía no ha salido nada de este lote.</li>}
            </ul>
            <button onClick={() => setAbierto(null)} className="px-4 py-2 rounded-lg bg-blue-600 text-white">Cerrar</button>
          </div>
        </div>
      )}
    </div>
  )
}
