import SugerenciaCompra from '@/components/SugerenciaCompra'
import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '@/context/AuthContext'
import {
  anularFacturaCompra,
  anularOrdenCompra,
  anularRecepcionCompra,
  cerrarOrdenCompra,
  createEntidad,
  createOrdenCompra,
  facturarOrdenCompra,
  getItems,
  getOrdenCompra,
  getOrdenesCompra,
  getProveedores,
  getSucursales,
  recibirOrdenCompra,
} from '@/api'
import { useEmpresa } from '@/hooks/useEmpresa'
import DteRecibidosPanel from '@/pages/DteRecibidosPanel'
import { validarRut } from '@/utils/rut'
import type { DteRecibido, Entidad, Item, OrdenCompra, SituacionCompra, Sucursal } from '@/types'

const input = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'
const btn = 'text-sm px-4 py-2 rounded-lg disabled:opacity-50'
const clp = (v: string | number) => `$${Math.round(Number(v)).toLocaleString('es-CL')}`
const qty = (v: string | number | undefined) => Number(v ?? 0).toLocaleString('es-CL', { maximumFractionDigits: 3 })
const hoy = () => new Date().toISOString().slice(0, 10)
const mensajeError = (e: any) => {
  const msg = e?.response?.data?.message ?? 'No se pudo completar la operación'
  return Array.isArray(msg) ? msg.join(', ') : msg
}

const ESTADO: Record<string, string> = {
  ABIERTA: 'bg-blue-100 text-blue-700',
  CERRADA: 'bg-gray-200 text-gray-700',
  ANULADA: 'bg-red-100 text-red-700',
}
const SITUACION: Record<SituacionCompra, [string, string]> = {
  SIN_RECEPCION: ['Sin recepción', 'bg-amber-100 text-amber-700'],
  RECEPCION_PARCIAL: ['Recepción parcial', 'bg-yellow-100 text-yellow-700'],
  POR_FACTURAR: ['Por facturar', 'bg-purple-100 text-purple-700'],
  COMPLETA: ['Completa', 'bg-green-100 text-green-700'],
}

type LineaNueva = { itemId: string; cantidad: string; costoUnitario: string }

export default function ComprasPage() {
  const { user } = useAuth()
  const empresa = useEmpresa()
  const esAdmin = user?.rol === 'Administrador'

  const [ordenes, setOrdenes] = useState<OrdenCompra[]>([])
  const [sucursales, setSucursales] = useState<Sucursal[]>([])
  const [proveedores, setProveedores] = useState<Entidad[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [filtroEstado, setFiltroEstado] = useState('ABIERTA')
  const [filtroSucursal, setFiltroSucursal] = useState('')
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')

  const [nueva, setNueva] = useState<null | {
    proveedorId: string
    sucursalId: string
    fechaEntrega: string
    notas: string
    lineas: LineaNueva[]
  }>(null)
  const [nuevoProveedor, setNuevoProveedor] = useState<null | { rut: string; nombre: string; email: string }>(null)
  const [detalle, setDetalle] = useState<OrdenCompra | null>(null)
  const [accion, setAccion] = useState<null | 'recibir' | 'facturar'>(null)
  const [cantidades, setCantidades] = useState<Record<string, string>>({})
  const [vencimientos, setVencimientos] = useState<Record<string, string>>({})
  const [costos, setCostos] = useState<Record<string, string>>({})
  const [doc, setDoc] = useState({ guia: '', folio: '', fechaEmision: hoy(), fechaVencimiento: '', montoTotal: '' })
  const [enviando, setEnviando] = useState(false)
  const [pestana, setPestana] = useState<'ordenes' | 'dte'>('ordenes')
  // DTE de la bandeja que respalda la factura en curso: su folio, fecha y montos mandan.
  const [dteFactura, setDteFactura] = useState<DteRecibido | null>(null)
  const [versionDte, setVersionDte] = useState(0)

  const cargar = () => {
    setCargando(true)
    getOrdenesCompra({ estado: filtroEstado || undefined, sucursalId: filtroSucursal || undefined })
      .then((r) => setOrdenes(r.data))
      .catch((e) => setError(mensajeError(e)))
      .finally(() => setCargando(false))
  }

  useEffect(cargar, [filtroEstado, filtroSucursal])
  useEffect(() => {
    getProveedores().then((r) => setProveedores(r.data))
    getItems().then((r) => setItems(r.data.filter((i) => i.estado === 'Activo')))
    if (esAdmin) getSucursales().then((r) => setSucursales(r.data))
  }, [esAdmin])

  const itemMap = useMemo(() => new Map(items.map((i) => [i.id, i])), [items])

  const previa = useMemo(() => {
    if (!nueva || !empresa) return null
    let neto = 0
    let afecto = 0
    for (const l of nueva.lineas) {
      const sub = Math.round(Number(l.cantidad || 0) * Number(l.costoUnitario || 0))
      neto += sub
      if (itemMap.get(l.itemId)?.afectoIva) afecto += sub
    }
    const iva = Math.round((afecto * Number(empresa.tasaIva)) / 100)
    return { neto, iva, total: neto + iva }
  }, [nueva, empresa, itemMap])

  const abrirNueva = () => {
    setError('')
    setNueva({
      proveedorId: proveedores[0]?.id ?? '',
      sucursalId: esAdmin ? sucursales[0]?.id ?? '' : user?.sucursalId ?? '',
      fechaEntrega: '',
      notas: '',
      lineas: [{ itemId: '', cantidad: '1', costoUnitario: '' }],
    })
  }

  const cambiarLinea = (i: number, cambio: Partial<LineaNueva>) => {
    if (!nueva) return
    const lineas = nueva.lineas.map((l, j) => (j === i ? { ...l, ...cambio } : l))
    if (cambio.itemId) {
      // Sugerencia: el costo promedio vigente; el usuario lo corrige con el precio del proveedor.
      lineas[i].costoUnitario = String(Math.round(Number(itemMap.get(cambio.itemId)?.costoPromedio ?? 0)))
    }
    setNueva({ ...nueva, lineas })
  }

  const guardarProveedor = async () => {
    if (!nuevoProveedor) return
    if (!validarRut(nuevoProveedor.rut)) { setError('RUT del proveedor inválido (formato 12345678-9)'); return }
    try {
      const { data } = await createEntidad({
        tipoEntidad: 'PROVEEDOR',
        rut: nuevoProveedor.rut,
        nombreRazonSocial: nuevoProveedor.nombre.trim(),
        email: nuevoProveedor.email || undefined,
      })
      setProveedores((p) => [...p, data].sort((a, b) => a.nombreRazonSocial.localeCompare(b.nombreRazonSocial)))
      if (nueva) setNueva({ ...nueva, proveedorId: data.id })
      setNuevoProveedor(null)
      setError('')
    } catch (e) {
      setError(mensajeError(e))
    }
  }

  const emitir = async () => {
    if (!nueva) return
    setEnviando(true)
    setError('')
    try {
      const { data } = await createOrdenCompra({
        proveedorId: nueva.proveedorId,
        sucursalId: nueva.sucursalId,
        fechaEntrega: nueva.fechaEntrega || undefined,
        notas: nueva.notas || undefined,
        detalles: nueva.lineas
          .filter((l) => l.itemId)
          .map((l) => ({ itemId: l.itemId, cantidad: Number(l.cantidad), costoUnitario: Number(l.costoUnitario) })),
      })
      setNueva(null)
      cargar()
      verDetalle(data.id)
    } catch (e) {
      setError(mensajeError(e))
    } finally {
      setEnviando(false)
    }
  }

  const verDetalle = async (id: string) => {
    setError('')
    setAccion(null)
    setDteFactura(null)
    try {
      const { data } = await getOrdenCompra(id)
      setDetalle(data)
      return data
    } catch (e) {
      setError(mensajeError(e))
    }
  }

  const asociarDte = async (dte: DteRecibido, ordenId: string) => {
    const orden = await verDetalle(ordenId)
    if (!orden) return
    iniciar('facturar', orden)
    setDteFactura(dte)
    setDoc({ guia: '', folio: dte.folio, fechaEmision: dte.fechaEmision.slice(0, 10), fechaVencimiento: dte.fechaVencimiento?.slice(0, 10) ?? '', montoTotal: '' })
  }

  const iniciar = (tipo: 'recibir' | 'facturar', orden = detalle) => {
    if (!orden) return
    const campo = tipo === 'recibir' ? 'porRecibir' : 'porFacturar'
    setCantidades(Object.fromEntries(orden.detalles.map((d) => [d.id, String(Number(d[campo] ?? 0))])))
    setCostos(Object.fromEntries(orden.detalles.map((d) => [d.id, String(Number(d.costoUnitario))])))
    setDoc({ guia: '', folio: '', fechaEmision: hoy(), fechaVencimiento: '', montoTotal: '' })
    setAccion(tipo)
    setError('')
  }

  const ejecutar = async (fn: () => Promise<unknown>) => {
    if (!detalle) return
    setEnviando(true)
    setError('')
    try {
      await fn()
      await verDetalle(detalle.id)
      cargar()
    } catch (e) {
      setError(mensajeError(e))
    } finally {
      setEnviando(false)
    }
  }

  const confirmarDocumento = () => {
    if (!detalle) return
    const lineas = detalle.detalles
      .map((d) => ({ d, cantidad: Number(cantidades[d.id] || 0) }))
      .filter((l) => l.cantidad > 0)
    if (lineas.length === 0) { setError('Indique al menos una cantidad'); return }
    if (accion === 'recibir') {
      return ejecutar(() =>
        recibirOrdenCompra(detalle.id, {
          guiaDespacho: doc.guia || undefined,
          detalles: lineas.map((l) => ({ detalleId: l.d.id, cantidad: l.cantidad, fechaVencimiento: vencimientos[l.d.id] || undefined })),
        }),
      )
    }
    return ejecutar(async () => {
      await facturarOrdenCompra(detalle.id, {
        dteId: dteFactura?.id,
        folio: doc.folio,
        fechaEmision: doc.fechaEmision,
        fechaVencimiento: doc.fechaVencimiento || undefined,
        montoTotal: doc.montoTotal ? Number(doc.montoTotal) : undefined,
        detalles: lineas.map((l) => ({ detalleId: l.d.id, cantidad: l.cantidad, costoUnitario: Number(costos[l.d.id]) })),
      })
      setDteFactura(null)
      setVersionDte((v) => v + 1)
    })
  }

  const confirmar = (texto: string, fn: () => Promise<unknown>) => {
    if (window.confirm(texto)) ejecutar(fn)
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-gray-900">Compras</h1>
        <button onClick={abrirNueva} className={`${btn} bg-blue-600 hover:bg-blue-700 text-white`}>
          Nueva orden de compra
        </button>
      </div>

      <SugerenciaCompra sucursalId={filtroSucursal || user?.sucursalId || sucursales[0]?.id || ''} />

      <div className="flex gap-1 border-b border-gray-200">
        {([['ordenes', 'Órdenes de compra'], ['dte', 'DTE recibidos']] as const).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setPestana(id)}
            className={`px-4 py-2 text-sm font-medium -mb-px border-b-2 ${pestana === id ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {pestana === 'dte' && <DteRecibidosPanel onAsociar={asociarDte} version={versionDte} />}

      {pestana === 'ordenes' && (<>
      <div className="flex flex-wrap gap-3">
        <select value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm">
          <option value="ABIERTA">Abiertas</option>
          <option value="CERRADA">Cerradas</option>
          <option value="ANULADA">Anuladas</option>
          <option value="">Todas</option>
        </select>
        {esAdmin && (
          <select value={filtroSucursal} onChange={(e) => setFiltroSucursal(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm">
            <option value="">Todas las sucursales</option>
            {sucursales.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
          </select>
        )}
      </div>

      {error && !nueva && !detalle && <p className="text-sm text-red-600">{error}</p>}

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
            <tr>
              <th className="px-4 py-3 text-left">OC</th>
              <th className="px-4 py-3 text-left">Proveedor</th>
              <th className="px-4 py-3 text-left">Sucursal</th>
              <th className="px-4 py-3 text-left">Emisión</th>
              <th className="px-4 py-3 text-right">Total</th>
              <th className="px-4 py-3 text-left">Estado</th>
              <th className="px-4 py-3 text-left">Avance</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {ordenes.map((o) => (
              <tr key={o.id}>
                <td className="px-4 py-3 font-medium">#{o.folio}</td>
                <td className="px-4 py-3">{o.proveedor.nombreRazonSocial}</td>
                <td className="px-4 py-3 text-gray-600">{o.sucursal.nombre}</td>
                <td className="px-4 py-3 text-gray-500">{new Date(o.fechaEmision).toLocaleDateString('es-CL')}</td>
                <td className="px-4 py-3 text-right font-medium">{clp(o.montoTotal)}</td>
                <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded text-xs font-medium ${ESTADO[o.estado]}`}>{o.estado}</span></td>
                <td className="px-4 py-3">
                  {o.estado !== 'ANULADA' && (
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${SITUACION[o.resumen.situacion][1]}`}>
                      {SITUACION[o.resumen.situacion][0]}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  <button onClick={() => verDetalle(o.id)} className="text-xs text-blue-600 hover:underline">Ver</button>
                </td>
              </tr>
            ))}
            {!cargando && ordenes.length === 0 && (
              <tr><td colSpan={8} className="px-4 py-6 text-center text-gray-400">Sin órdenes de compra</td></tr>
            )}
          </tbody>
        </table>
      </div>
      </>)}

      {nueva && (
        <Modal titulo="Nueva orden de compra" onClose={() => setNueva(null)}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="block">
              <span className="block text-xs font-medium text-gray-600 mb-1">Proveedor *</span>
              <div className="flex gap-2">
                <select value={nueva.proveedorId} onChange={(e) => setNueva({ ...nueva, proveedorId: e.target.value })} className={input}>
                  <option value="">Seleccione...</option>
                  {proveedores.map((p) => <option key={p.id} value={p.id}>{p.nombreRazonSocial} ({p.rut})</option>)}
                </select>
                <button onClick={() => setNuevoProveedor({ rut: '', nombre: '', email: '' })} className="text-xs text-blue-600 whitespace-nowrap">+ Nuevo</button>
              </div>
            </label>
            <label className="block">
              <span className="block text-xs font-medium text-gray-600 mb-1">Sucursal que recibe *</span>
              {esAdmin ? (
                <select value={nueva.sucursalId} onChange={(e) => setNueva({ ...nueva, sucursalId: e.target.value })} className={input}>
                  {sucursales.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                </select>
              ) : (
                <input disabled value="Mi sucursal" className={`${input} bg-gray-50`} />
              )}
            </label>
            <label className="block">
              <span className="block text-xs font-medium text-gray-600 mb-1">Fecha de entrega</span>
              <input type="date" value={nueva.fechaEntrega} onChange={(e) => setNueva({ ...nueva, fechaEntrega: e.target.value })} className={input} />
            </label>
            <label className="block">
              <span className="block text-xs font-medium text-gray-600 mb-1">Notas</span>
              <input value={nueva.notas} maxLength={300} onChange={(e) => setNueva({ ...nueva, notas: e.target.value })} className={input} />
            </label>
          </div>

          {nuevoProveedor && (
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 grid grid-cols-1 sm:grid-cols-4 gap-2 items-end">
              <input placeholder="RUT 12345678-9" value={nuevoProveedor.rut} onChange={(e) => setNuevoProveedor({ ...nuevoProveedor, rut: e.target.value })} className={input} />
              <input placeholder="Razón social" value={nuevoProveedor.nombre} onChange={(e) => setNuevoProveedor({ ...nuevoProveedor, nombre: e.target.value })} className={input} />
              <input placeholder="Email (opcional)" value={nuevoProveedor.email} onChange={(e) => setNuevoProveedor({ ...nuevoProveedor, email: e.target.value })} className={input} />
              <div className="flex gap-2">
                <button onClick={guardarProveedor} className={`${btn} bg-blue-600 text-white`}>Guardar</button>
                <button onClick={() => setNuevoProveedor(null)} className={`${btn} text-gray-600`}>Cancelar</button>
              </div>
            </div>
          )}

          <table className="w-full text-sm">
            <thead className="text-gray-500 text-xs uppercase">
              <tr>
                <th className="py-2 text-left">Producto</th>
                <th className="py-2 text-right w-28">Cantidad</th>
                <th className="py-2 text-right w-36">Costo neto unit.</th>
                <th className="py-2 text-right w-28">Subtotal</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {nueva.lineas.map((l, i) => (
                <tr key={i}>
                  <td className="py-1 pr-2">
                    <select value={l.itemId} onChange={(e) => cambiarLinea(i, { itemId: e.target.value })} className={input}>
                      <option value="">Seleccione...</option>
                      {items.map((it) => (
                        <option key={it.id} value={it.id} disabled={nueva.lineas.some((x, j) => j !== i && x.itemId === it.id)}>
                          {it.nombre} ({it.codigoSku})
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="py-1 pr-2"><input type="number" min="0" step="any" value={l.cantidad} onChange={(e) => cambiarLinea(i, { cantidad: e.target.value })} className={`${input} text-right`} /></td>
                  <td className="py-1 pr-2"><input type="number" min="0" value={l.costoUnitario} onChange={(e) => cambiarLinea(i, { costoUnitario: e.target.value })} className={`${input} text-right`} /></td>
                  <td className="py-1 text-right text-gray-600">{clp(Number(l.cantidad || 0) * Number(l.costoUnitario || 0))}</td>
                  <td className="py-1 text-right">
                    {nueva.lineas.length > 1 && (
                      <button onClick={() => setNueva({ ...nueva, lineas: nueva.lineas.filter((_, j) => j !== i) })} className="text-red-500 text-xs">✕</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <button onClick={() => setNueva({ ...nueva, lineas: [...nueva.lineas, { itemId: '', cantidad: '1', costoUnitario: '' }] })} className="text-xs text-blue-600">
            + Agregar producto
          </button>

          {previa && (
            <div className="text-sm text-right space-y-0.5">
              <p className="text-gray-600">Neto {clp(previa.neto)}</p>
              <p className="text-gray-600">IVA ({Number(empresa?.tasaIva)}%) {clp(previa.iva)}</p>
              <p className="font-semibold">Total {clp(previa.total)}</p>
            </div>
          )}
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <button onClick={() => setNueva(null)} className={`${btn} text-gray-600`}>Cancelar</button>
            <button onClick={emitir} disabled={enviando || !nueva.proveedorId || !nueva.sucursalId} className={`${btn} bg-blue-600 hover:bg-blue-700 text-white`}>
              {enviando ? 'Emitiendo...' : 'Emitir orden'}
            </button>
          </div>
        </Modal>
      )}

      {detalle && (
        <Modal titulo={`Orden de compra #${detalle.folio}`} onClose={() => setDetalle(null)} ancho="max-w-4xl">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-600">
            <span className={`px-2 py-0.5 rounded text-xs font-medium ${ESTADO[detalle.estado]}`}>{detalle.estado}</span>
            <span>Proveedor: <b>{detalle.proveedor.nombreRazonSocial}</b> ({detalle.proveedor.rut})</span>
            <span>Sucursal: <b>{detalle.sucursal.nombre}</b></span>
            <span>Emitida por {detalle.usuario.nombreCompleto}</span>
            {detalle.fechaEntrega && <span>Entrega {new Date(detalle.fechaEntrega).toLocaleDateString('es-CL', { timeZone: 'UTC' })}</span>}
          </div>
          {detalle.notas && <p className="text-xs text-gray-500">{detalle.notas}</p>}

          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
              <tr>
                <th className="px-3 py-2 text-left">Producto</th>
                <th className="px-3 py-2 text-right">Pedido</th>
                <th className="px-3 py-2 text-right">Recibido</th>
                <th className="px-3 py-2 text-right">Facturado</th>
                <th className="px-3 py-2 text-right">Costo neto</th>
                <th className="px-3 py-2 text-right">Subtotal</th>
                {accion && <th className="px-3 py-2 text-right">{accion === 'recibir' ? 'Recibir' : 'Facturar'}</th>}
                {accion === 'recibir' && <th className="px-3 py-2 text-left">Vence (si es perecible)</th>}
                {accion === 'facturar' && <th className="px-3 py-2 text-right">Costo factura</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {detalle.detalles.map((d) => (
                <tr key={d.id}>
                  <td className="px-3 py-2">{d.item.nombre} <span className="text-xs text-gray-400">{d.item.codigoSku}</span></td>
                  <td className="px-3 py-2 text-right">{qty(d.cantidad)} {d.item.unidadMedida}</td>
                  <td className="px-3 py-2 text-right">{qty(d.recibido)}</td>
                  <td className="px-3 py-2 text-right">{qty(d.facturado)}</td>
                  <td className="px-3 py-2 text-right">{clp(d.costoUnitario)}</td>
                  <td className="px-3 py-2 text-right">{clp(d.subtotal)}</td>
                  {accion && (
                    <td className="px-3 py-2 w-28">
                      <input type="number" min="0" step="any" value={cantidades[d.id] ?? ''} onChange={(e) => setCantidades({ ...cantidades, [d.id]: e.target.value })} className={`${input} text-right`} />
                    </td>
                  )}
                  {accion === 'recibir' && (
                    <td className="px-3 py-2 w-40">
                      <input type="date" aria-label={`Vencimiento de ${d.item.nombre}`} value={vencimientos[d.id] ?? ''} onChange={(e) => setVencimientos({ ...vencimientos, [d.id]: e.target.value })} className={input} />
                    </td>
                  )}
                  {accion === 'facturar' && (
                    <td className="px-3 py-2 w-32">
                      <input type="number" min="0" value={costos[d.id] ?? ''} onChange={(e) => setCostos({ ...costos, [d.id]: e.target.value })} className={`${input} text-right`} />
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          <div className="text-sm text-right text-gray-600">
            Neto {clp(detalle.montoNeto)} · IVA {clp(detalle.montoIva)} · <b>Total {clp(detalle.montoTotal)}</b>
          </div>

          {accion && (
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
              {accion === 'recibir' ? (
                <label className="block sm:col-span-2">
                  <span className="block text-xs font-medium text-gray-600 mb-1">N° guía de despacho del proveedor</span>
                  <input value={doc.guia} maxLength={50} onChange={(e) => setDoc({ ...doc, guia: e.target.value })} className={input} />
                </label>
              ) : (
                <>
                  <label className="block">
                    <span className="block text-xs font-medium text-gray-600 mb-1">Folio factura *</span>
                    <input value={doc.folio} maxLength={30} disabled={!!dteFactura} onChange={(e) => setDoc({ ...doc, folio: e.target.value })} className={`${input} disabled:bg-gray-100`} />
                  </label>
                  <label className="block">
                    <span className="block text-xs font-medium text-gray-600 mb-1">Emisión *</span>
                    <input type="date" value={doc.fechaEmision} disabled={!!dteFactura} onChange={(e) => setDoc({ ...doc, fechaEmision: e.target.value })} className={`${input} disabled:bg-gray-100`} />
                  </label>
                  <label className="block">
                    <span className="block text-xs font-medium text-gray-600 mb-1">Vencimiento</span>
                    <input type="date" value={doc.fechaVencimiento} onChange={(e) => setDoc({ ...doc, fechaVencimiento: e.target.value })} className={input} />
                  </label>
                  <label className="block">
                    <span className="block text-xs font-medium text-gray-600 mb-1">Total impreso (control)</span>
                    <input type="number" min="0" value={doc.montoTotal} onChange={(e) => setDoc({ ...doc, montoTotal: e.target.value })} className={input} />
                  </label>
                </>
              )}
              {dteFactura && (
                <p className="sm:col-span-4 text-xs text-purple-700">
                  Desde el DTE de {dteFactura.razonSocialEmisor}: neto {clp(Number(dteFactura.montoNeto) + Number(dteFactura.montoExento))}, IVA {clp(dteFactura.iva)}. Las cantidades elegidas deben sumar esos montos.
                </p>
              )}
              <div className="flex gap-2 sm:col-span-4 justify-end">
                <button onClick={() => { setAccion(null); setDteFactura(null) }} className={`${btn} text-gray-600`}>Cancelar</button>
                <button onClick={confirmarDocumento} disabled={enviando || (accion === 'facturar' && !doc.folio.trim())} className={`${btn} bg-blue-600 hover:bg-blue-700 text-white`}>
                  {accion === 'recibir' ? 'Confirmar recepción' : 'Registrar factura'}
                </button>
              </div>
            </div>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}

          {!accion && detalle.estado !== 'ANULADA' && (
            <div className="flex flex-wrap gap-2">
              {detalle.estado === 'ABIERTA' && Number(detalle.resumen.porRecibir) > 0 && (
                <button onClick={() => iniciar('recibir')} className={`${btn} bg-green-600 hover:bg-green-700 text-white`}>Recibir mercadería</button>
              )}
              {Number(detalle.resumen.porFacturar) > 0 && (
                <button onClick={() => iniciar('facturar')} className={`${btn} bg-purple-600 hover:bg-purple-700 text-white`}>Registrar factura</button>
              )}
              {detalle.estado === 'ABIERTA' && (
                <button onClick={() => confirmar('¿Cerrar la orden? No admitirá más recepciones.', () => cerrarOrdenCompra(detalle.id))} className={`${btn} bg-gray-100 text-gray-700`}>Cerrar orden</button>
              )}
              <button onClick={() => confirmar('¿Anular la orden de compra?', () => anularOrdenCompra(detalle.id))} className={`${btn} text-red-600 hover:bg-red-50`}>Anular orden</button>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <section>
              <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">Recepciones</h3>
              {detalle.recepciones?.length ? detalle.recepciones.map((r) => (
                <div key={r.id} className="flex items-center justify-between text-sm border-b border-gray-100 py-2">
                  <span className={r.estado === 'ANULADO' ? 'line-through text-gray-400' : ''}>
                    {new Date(r.fecha).toLocaleDateString('es-CL')} · {r.guiaDespacho ? `Guía ${r.guiaDespacho}` : 'Sin guía'} · {qty(r.detalles.reduce((s, x) => s + Number(x.cantidad), 0))} u · {r.usuario.nombreCompleto}
                  </span>
                  {r.estado === 'VIGENTE' && (
                    <button onClick={() => confirmar('¿Anular la recepción? Se descontará el stock recibido.', () => anularRecepcionCompra(r.id))} className="text-xs text-red-600 hover:underline">Anular</button>
                  )}
                </div>
              )) : <p className="text-xs text-gray-400">Sin recepciones</p>}
            </section>
            <section>
              <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">Facturas del proveedor</h3>
              {detalle.facturas?.length ? detalle.facturas.map((f) => (
                <div key={f.id} className="flex items-center justify-between text-sm border-b border-gray-100 py-2">
                  <span className={f.estado === 'ANULADO' ? 'line-through text-gray-400' : ''}>
                    Folio {f.folio} · {new Date(f.fechaEmision).toLocaleDateString('es-CL', { timeZone: 'UTC' })} · {clp(f.montoTotal)}
                    {f.fechaVencimiento && ` · vence ${new Date(f.fechaVencimiento).toLocaleDateString('es-CL', { timeZone: 'UTC' })}`}
                  </span>
                  {f.estado === 'VIGENTE' && (
                    <button onClick={() => confirmar('¿Anular la factura?', () => anularFacturaCompra(f.id))} className="text-xs text-red-600 hover:underline">Anular</button>
                  )}
                </div>
              )) : <p className="text-xs text-gray-400">Sin facturas</p>}
            </section>
          </div>
        </Modal>
      )}
    </div>
  )
}

function Modal({ titulo, onClose, ancho = 'max-w-3xl', children }: { titulo: string; onClose: () => void; ancho?: string; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-start justify-center p-4 overflow-y-auto z-50">
      <div className={`bg-white rounded-xl shadow-xl w-full ${ancho} p-6 space-y-4 my-8`}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">{titulo}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>
        {children}
      </div>
    </div>
  )
}
