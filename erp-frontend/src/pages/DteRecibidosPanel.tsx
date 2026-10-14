import { useEffect, useState } from 'react'
import { descartarDte, getDtes, getOrdenesCompra, importarDte, registrarGastoDte } from '@/api'
import type { DteRecibido, EstadoDteRecibido, OrdenCompra } from '@/types'

const clp = (v: string | number) => `$${Math.round(Number(v)).toLocaleString('es-CL')}`
const fecha = (v: string) => new Date(v).toLocaleDateString('es-CL', { timeZone: 'UTC' })
const input = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'
const mensajeError = (e: any) => {
  const msg = e?.response?.data?.message ?? 'No se pudo completar la operación'
  return Array.isArray(msg) ? msg.join(', ') : msg
}
const TIPO: Record<number, string> = { 33: 'Factura', 34: 'Factura exenta', 56: 'Nota de débito', 61: 'Nota de crédito' }
const ESTADO: Record<EstadoDteRecibido, [string, string]> = {
  PENDIENTE: ['Pendiente', 'bg-amber-100 text-amber-700'],
  ASOCIADO_OC: ['Asociado a OC', 'bg-green-100 text-green-700'],
  GASTO: ['Gasto', 'bg-blue-100 text-blue-700'],
  DESCARTADO: ['Descartado', 'bg-gray-200 text-gray-600'],
}

/** El SII publica los XML en ISO-8859-1; se respeta la codificación declarada en el prólogo. */
async function leerXml(archivo: File): Promise<string> {
  const bytes = await archivo.arrayBuffer()
  const prologo = new TextDecoder('ascii').decode(bytes.slice(0, 200))
  const codificacion = /encoding=["']([^"']+)["']/i.exec(prologo)?.[1] ?? 'utf-8'
  return new TextDecoder(codificacion).decode(bytes)
}

export default function DteRecibidosPanel({
  onAsociar,
  version,
}: {
  onAsociar: (dte: DteRecibido, ordenId: string) => void
  version: number
}) {
  const [dtes, setDtes] = useState<DteRecibido[]>([])
  const [estado, setEstado] = useState<string>('PENDIENTE')
  const [resultados, setResultados] = useState<{ archivo: string; ok: boolean; texto: string }[]>([])
  const [cargando, setCargando] = useState(false)
  const [abierto, setAbierto] = useState<DteRecibido | null>(null)
  const [categoria, setCategoria] = useState('')
  const [ordenElegida, setOrdenElegida] = useState('')
  const [error, setError] = useState('')
  const [ordenes, setOrdenes] = useState<OrdenCompra[]>([])

  const cargar = () => getDtes(estado || undefined).then((r) => setDtes(r.data)).catch((e) => setError(mensajeError(e)))
  useEffect(() => { cargar() }, [estado, version])

  const subir = async (archivos: FileList | null) => {
    if (!archivos?.length) return
    setCargando(true)
    const res: typeof resultados = []
    for (const archivo of Array.from(archivos)) {
      try {
        const { data } = await importarDte(await leerXml(archivo))
        res.push({ archivo: archivo.name, ok: true, texto: `${TIPO[data.tipoDte]} N° ${data.folio} de ${data.razonSocialEmisor} — ${clp(data.montoTotal)}` })
      } catch (e) {
        res.push({ archivo: archivo.name, ok: false, texto: mensajeError(e) })
      }
    }
    setResultados(res)
    setCargando(false)
    cargar()
  }

  const abrir = (d: DteRecibido) => {
    setAbierto(d)
    setError('')
    setCategoria('')
    setOrdenElegida('')
    // Todas las OC (abiertas o cerradas) del proveedor con lo recibido aún por facturar.
    if (d.estado === 'PENDIENTE') getOrdenesCompra().then((r) => setOrdenes(r.data)).catch(() => setOrdenes([]))
  }

  const ejecutar = async (fn: () => Promise<unknown>) => {
    setError('')
    try {
      await fn()
      setAbierto(null)
      cargar()
    } catch (e) {
      setError(mensajeError(e))
    }
  }

  const ordenesDelProveedor = abierto
    ? ordenes.filter((o) => o.proveedor.id === abierto.proveedor.id && o.estado !== 'ANULADA' && Number(o.resumen.porFacturar) > 0)
    : []

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <label className={`text-sm px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white cursor-pointer ${cargando ? 'opacity-50' : ''}`}>
          {cargando ? 'Cargando...' : 'Cargar XML de proveedor'}
          <input type="file" accept=".xml,text/xml" multiple className="hidden" disabled={cargando} onChange={(e) => { subir(e.target.files); e.target.value = '' }} />
        </label>
        <select value={estado} onChange={(e) => setEstado(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm">
          <option value="PENDIENTE">Pendientes</option>
          <option value="ASOCIADO_OC">Asociados a OC</option>
          <option value="GASTO">Gastos</option>
          <option value="DESCARTADO">Descartados</option>
          <option value="">Todos</option>
        </select>
      </div>

      {resultados.length > 0 && (
        <ul className="text-sm space-y-1">
          {resultados.map((r, i) => (
            <li key={i} className={r.ok ? 'text-green-700' : 'text-red-600'}>
              {r.ok ? '✓' : '✕'} {r.archivo}: {r.texto}
            </li>
          ))}
        </ul>
      )}
      {error && !abierto && <p className="text-sm text-red-600">{error}</p>}

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
            <tr>
              <th className="px-4 py-3 text-left">Emisión</th>
              <th className="px-4 py-3 text-left">Proveedor</th>
              <th className="px-4 py-3 text-left">Documento</th>
              <th className="px-4 py-3 text-right">Total</th>
              <th className="px-4 py-3 text-left">Verificación</th>
              <th className="px-4 py-3 text-left">Estado</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {dtes.map((d) => (
              <tr key={d.id}>
                <td className="px-4 py-3 text-gray-500">{fecha(d.fechaEmision)}</td>
                <td className="px-4 py-3">{d.razonSocialEmisor}<span className="block text-xs text-gray-400">{d.rutEmisor}</span></td>
                <td className="px-4 py-3">{TIPO[d.tipoDte]} N° {d.folio}</td>
                <td className="px-4 py-3 text-right font-medium">{clp(d.montoTotal)}</td>
                <td className="px-4 py-3 space-x-1 whitespace-nowrap">
                  <Sello ok={d.timbreValido} texto="Timbre" />
                  <Sello ok={d.firmaValida} texto="Firma" />
                  {d.observaciones.length > 0 && <span className="text-xs text-amber-600">{d.observaciones.length} obs.</span>}
                </td>
                <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded text-xs font-medium ${ESTADO[d.estado][1]}`}>{ESTADO[d.estado][0]}</span></td>
                <td className="px-4 py-3 text-right">
                  <button onClick={() => { abrir(d) }} className="text-xs text-blue-600 hover:underline">Ver</button>
                </td>
              </tr>
            ))}
            {dtes.length === 0 && <tr><td colSpan={7} className="px-4 py-6 text-center text-gray-400">Sin documentos</td></tr>}
          </tbody>
        </table>
      </div>

      {abierto && (
        <div className="fixed inset-0 bg-black/40 flex items-start justify-center p-4 overflow-y-auto z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl p-6 space-y-4 my-8">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">{TIPO[abierto.tipoDte]} N° {abierto.folio}</h2>
              <button onClick={() => setAbierto(null)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
            </div>
            <div className="text-sm text-gray-600 space-y-1">
              <p><b>{abierto.razonSocialEmisor}</b> ({abierto.rutEmisor}) · proveedor {abierto.proveedor.nombreRazonSocial}</p>
              <p>
                Emitida {fecha(abierto.fechaEmision)}
                {abierto.fechaVencimiento && ` · vence ${fecha(abierto.fechaVencimiento)}`}
                {abierto.referenciaOc && ` · referencia OC del proveedor N° ${abierto.referenciaOc}`}
              </p>
              <p>
                Neto {clp(abierto.montoNeto)} · Exento {clp(abierto.montoExento)} · IVA {clp(abierto.iva)}
                {Number(abierto.otrosImpuestos) !== 0 && ` · Otros impuestos ${clp(abierto.otrosImpuestos)}`} · <b>Total {clp(abierto.montoTotal)}</b>
              </p>
              <p className="text-xs text-gray-400 break-all">SHA-256 del XML: {abierto.sha256}</p>
            </div>
            <div className="flex gap-2">
              <Sello ok={abierto.timbreValido} texto="Timbre (TED)" />
              <Sello ok={abierto.firmaValida} texto="Firma XMLDSig" />
            </div>
            {abierto.observaciones.length > 0 && (
              <ul className="text-sm text-amber-700 bg-amber-50 rounded-lg p-3 list-disc pl-6 space-y-1">
                {abierto.observaciones.map((o, i) => <li key={i}>{o}</li>)}
              </ul>
            )}
            <table className="w-full text-sm">
              <thead className="text-gray-500 text-xs uppercase">
                <tr><th className="py-1 text-left">Ítem</th><th className="py-1 text-right">Cantidad</th><th className="py-1 text-right">Precio</th><th className="py-1 text-right">Monto</th></tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {abierto.detalle.lineas.map((l) => (
                  <tr key={l.linea}>
                    <td className="py-1">{l.nombre}{l.exento && <span className="text-xs text-gray-400"> (exento)</span>}</td>
                    <td className="py-1 text-right">{l.cantidad ? `${Number(l.cantidad).toLocaleString('es-CL')} ${l.unidad ?? ''}` : '—'}</td>
                    <td className="py-1 text-right">{l.precio ? clp(l.precio) : '—'}</td>
                    <td className="py-1 text-right">{clp(l.monto)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {abierto.estado === 'PENDIENTE' ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-gray-100 pt-4">
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-gray-500 uppercase">Mercadería: asociar a una OC</p>
                  {ordenesDelProveedor.length ? (
                    <div className="flex gap-2">
                      <select value={ordenElegida} onChange={(e) => setOrdenElegida(e.target.value)} className={input}>
                        <option value="">Seleccione la OC...</option>
                        {ordenesDelProveedor.map((o) => <option key={o.id} value={o.id}>OC #{o.folio} · {clp(o.montoTotal)}</option>)}
                      </select>
                      <button disabled={!ordenElegida} onClick={() => { onAsociar(abierto, ordenElegida); setAbierto(null) }} className="text-sm px-3 py-2 rounded-lg bg-purple-600 text-white disabled:opacity-50">Continuar</button>
                    </div>
                  ) : (
                    <p className="text-xs text-gray-400">No hay órdenes de este proveedor con mercadería recibida por facturar.</p>
                  )}
                </div>
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-gray-500 uppercase">Servicio o gasto sin OC</p>
                  <div className="flex gap-2">
                    <input value={categoria} maxLength={50} onChange={(e) => setCategoria(e.target.value)} placeholder="Categoría (ej. Telefonía)" className={input} />
                    <button disabled={!categoria.trim()} onClick={() => ejecutar(() => registrarGastoDte(abierto.id, { categoria }))} className="text-sm px-3 py-2 rounded-lg bg-blue-600 text-white disabled:opacity-50 whitespace-nowrap">Registrar gasto</button>
                  </div>
                  <p className="text-xs text-gray-400">Se registra el neto {clp(Number(abierto.montoNeto) + Number(abierto.montoExento))}; el IVA queda como crédito fiscal.</p>
                </div>
                <div className="md:col-span-2 text-right">
                  <button onClick={() => { const m = window.prompt('Motivo del descarte'); if (m) ejecutar(() => descartarDte(abierto.id, m)) }} className="text-sm text-red-600 hover:underline">Descartar documento</button>
                </div>
              </div>
            ) : (
              <p className="text-sm text-gray-500 border-t border-gray-100 pt-3">
                {ESTADO[abierto.estado][0]}{abierto.motivoDescarte && `: ${abierto.motivoDescarte}`}
              </p>
            )}
            {error && <p className="text-sm text-red-600">{error}</p>}
          </div>
        </div>
      )}
    </div>
  )
}

function Sello({ ok, texto }: { ok: boolean; texto: string }) {
  const valido = texto.startsWith('Firma') ? 'válida' : 'válido'
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium ${ok ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
      {texto} {ok ? valido : 'no verificable'}
    </span>
  )
}
