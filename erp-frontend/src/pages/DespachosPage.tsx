import { useEffect, useState } from 'react'
import { useAuth } from '@/context/AuthContext'
import { getGuias, getGuia, createGuia, recibirGuia, anularGuia, getSucursales, getItems, getStock } from '@/api'
import { generarPdfBoleta } from '@/utils/pdfBoleta'
import jsPDF from 'jspdf'
import type { GuiaDespacho, Item, Sucursal } from '@/types'

type LineaGuia = { itemId: string; cantidad: string; stockDisponible: number; nombre: string }

const ESTADO_COLOR: Record<string, string> = {
  PENDIENTE: 'bg-yellow-100 text-yellow-700',
  EN_TRANSITO: 'bg-blue-100 text-blue-700',
  RECIBIDO: 'bg-green-100 text-green-700',
  ANULADO: 'bg-red-100 text-red-700',
}

function generarPdfGuia(guia: GuiaDespacho) {
  const doc = new jsPDF({ unit: 'mm', format: 'a5' })
  const W = 148
  let y = 10

  doc.setFontSize(14)
  doc.setFont('helvetica', 'bold')
  doc.text('PYMECORE', W / 2, y, { align: 'center' })
  y += 6
  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.text('GUÍA DE DESPACHO ELECTRÓNICA', W / 2, y, { align: 'center' })
  y += 8

  doc.setFontSize(8)
  doc.text(`Folio: ${guia.folio}`, 10, y)
  doc.text(`Fecha: ${new Date(guia.fechaEmision).toLocaleDateString('es-CL')}`, W - 10, y, { align: 'right' })
  y += 5
  doc.text(`Origen: ${guia.sucursalOrigen.nombre}`, 10, y)
  y += 4
  doc.text(`Destino: ${guia.sucursalDestino.nombre}`, 10, y)
  y += 4
  doc.text(`Responsable: ${guia.usuario.nombreCompleto}`, 10, y)
  if (guia.notas) { y += 4; doc.text(`Notas: ${guia.notas}`, 10, y) }
  y += 6

  doc.line(10, y, W - 10, y); y += 4
  doc.setFont('helvetica', 'bold')
  doc.text('Producto', 10, y)
  doc.text('SKU', 90, y)
  doc.text('Cantidad', W - 10, y, { align: 'right' })
  y += 3
  doc.line(10, y, W - 10, y); y += 4
  doc.setFont('helvetica', 'normal')

  for (const d of guia.detalles) {
    doc.text(d.item.nombre.slice(0, 40), 10, y)
    doc.text(d.item.codigoSku, 90, y)
    doc.text(`${d.cantidad} ${d.item.unidadMedida}`, W - 10, y, { align: 'right' })
    y += 5
  }

  y += 4
  doc.line(10, y, W - 10, y); y += 4
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7)
  doc.text(`Estado: ${guia.estado}`, 10, y)
  if (guia.fechaRecepcion) {
    doc.text(`Recibido: ${new Date(guia.fechaRecepcion).toLocaleDateString('es-CL')}`, W - 10, y, { align: 'right' })
  }

  doc.save(`Guia_Despacho_${guia.folio}.pdf`)
}

export default function DespachosPage() {
  const { user } = useAuth()
  const [sucursales, setSucursales] = useState<Sucursal[]>([])
  const [guias, setGuias] = useState<GuiaDespacho[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [loading, setLoading] = useState(false)
  const [sucursalId, setSucursalId] = useState(user?.sucursalId ?? '')
  const [verModal, setVerModal] = useState<GuiaDespacho | null>(null)

  const [modalNueva, setModalNueva] = useState(false)
  const [origenId, setOrigenId] = useState(user?.sucursalId ?? '')
  const [destinoId, setDestinoId] = useState('')
  const [notas, setNotas] = useState('')
  const [lineas, setLineas] = useState<LineaGuia[]>([])
  const [stockMap, setStockMap] = useState<Record<string, number>>({})
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    getSucursales().then((r) => {
      setSucursales(r.data)
      if (!sucursalId && r.data.length > 0) setSucursalId(r.data[0].id)
      if (!origenId && r.data.length > 0) setOrigenId(r.data[0].id)
    })
    getItems().then((r) => setItems(r.data))
  }, [])

  useEffect(() => {
    if (!origenId) return
    getStock(origenId).then((r) => {
      const map: Record<string, number> = {}
      r.data.forEach((s) => { map[s.itemId] = Number(s.stockActual) })
      setStockMap(map)
    })
  }, [origenId])

  useEffect(() => {
    cargarGuias()
  }, [sucursalId])

  const cargarGuias = () => {
    setLoading(true)
    getGuias(sucursalId || undefined)
      .then((r) => setGuias(r.data))
      .finally(() => setLoading(false))
  }

  const agregarLinea = () => {
    setLineas([...lineas, { itemId: '', nombre: '', cantidad: '1', stockDisponible: 0 }])
  }

  const actualizarLinea = (i: number, campo: keyof LineaGuia, valor: string) => {
    const nuevas = [...lineas]
    if (campo === 'itemId') {
      const item = items.find((it) => it.id === valor)
      nuevas[i] = { ...nuevas[i], itemId: valor, nombre: item?.nombre ?? '', stockDisponible: stockMap[valor] ?? 0 }
    } else {
      nuevas[i] = { ...nuevas[i], [campo]: valor }
    }
    setLineas(nuevas)
  }

  const crearGuia = async () => {
    if (!origenId || !destinoId) { setError('Selecciona sucursal de origen y destino'); return }
    if (origenId === destinoId) { setError('Origen y destino no pueden ser iguales'); return }
    if (lineas.length === 0) { setError('Agrega al menos un producto'); return }
    for (const l of lineas) {
      if (!l.itemId) { setError('Selecciona el producto'); return }
      const c = parseFloat(l.cantidad)
      if (!c || c <= 0) { setError('Cantidad inválida'); return }
      if (c > l.stockDisponible) { setError(`Stock insuficiente para "${l.nombre}"`); return }
    }
    setGuardando(true)
    setError('')
    try {
      await createGuia({
        sucursalOrigenId: origenId,
        sucursalDestinoId: destinoId,
        notas: notas || undefined,
        detalles: lineas.map((l) => ({ itemId: l.itemId, cantidad: parseFloat(l.cantidad) })),
      })
      setModalNueva(false)
      setLineas([])
      setNotas('')
      cargarGuias()
    } catch (e: any) {
      setError(e?.response?.data?.message ?? 'Error al crear guía')
    } finally {
      setGuardando(false)
    }
  }

  const accionGuia = async (id: string, accion: 'recibir' | 'anular') => {
    try {
      if (accion === 'recibir') await recibirGuia(id)
      else await anularGuia(id)
      cargarGuias()
    } catch (e: any) {
      alert(e?.response?.data?.message ?? 'Error')
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-xl font-semibold text-gray-900">Despacho entre sucursales</h1>
        <div className="flex gap-3 items-center">
          {sucursales.length > 0 && (
            <select
              value={sucursalId}
              onChange={(e) => setSucursalId(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
            >
              <option value="">Todas las sucursales</option>
              {sucursales.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
            </select>
          )}
          <button
            onClick={() => { setError(''); setModalNueva(true) }}
            className="bg-blue-600 hover:bg-blue-700 text-white text-sm px-4 py-2 rounded-lg font-medium"
          >
            + Nueva guía
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        {loading ? (
          <p className="text-center py-8 text-sm text-gray-400">Cargando...</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
              <tr>
                <th className="px-4 py-3 text-left">Folio</th>
                <th className="px-4 py-3 text-left">Origen</th>
                <th className="px-4 py-3 text-left">Destino</th>
                <th className="px-4 py-3 text-left">Fecha</th>
                <th className="px-4 py-3 text-left">Estado</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {guias.map((g) => (
                <tr key={g.id}>
                  <td className="px-4 py-3 font-mono font-medium">GD-{String(g.folio).padStart(4, '0')}</td>
                  <td className="px-4 py-3">{g.sucursalOrigen.nombre}</td>
                  <td className="px-4 py-3">{g.sucursalDestino.nombre}</td>
                  <td className="px-4 py-3 text-gray-500">
                    {new Date(g.fechaEmision).toLocaleDateString('es-CL')}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${ESTADO_COLOR[g.estado]}`}>
                      {g.estado}
                    </span>
                  </td>
                  <td className="px-4 py-3 flex gap-2">
                    <button onClick={() => setVerModal(g)} className="text-xs text-blue-600 hover:underline">Ver</button>
                    <button onClick={() => generarPdfGuia(g)} className="text-xs text-gray-500 hover:underline">PDF</button>
                    {g.estado === 'PENDIENTE' && (
                      <button onClick={() => accionGuia(g.id, 'recibir')} className="text-xs text-green-600 hover:underline">Recibir</button>
                    )}
                    {(g.estado === 'PENDIENTE' || g.estado === 'EN_TRANSITO') && (
                      <button onClick={() => accionGuia(g.id, 'anular')} className="text-xs text-red-400 hover:underline">Anular</button>
                    )}
                  </td>
                </tr>
              ))}
              {guias.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">Sin guías</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal ver guía */}
      {verModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg">
            <div className="px-6 py-4 border-b border-gray-200 flex justify-between">
              <h2 className="font-semibold">Guía GD-{String(verModal.folio).padStart(4, '0')}</h2>
              <button onClick={() => setVerModal(null)} className="text-gray-400 text-xl leading-none">&times;</button>
            </div>
            <div className="px-6 py-4 space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-2">
                <div><span className="text-gray-500">Origen:</span> {verModal.sucursalOrigen.nombre}</div>
                <div><span className="text-gray-500">Destino:</span> {verModal.sucursalDestino.nombre}</div>
                <div><span className="text-gray-500">Emisión:</span> {new Date(verModal.fechaEmision).toLocaleDateString('es-CL')}</div>
                <div><span className="text-gray-500">Estado:</span> <span className={`px-2 py-0.5 rounded text-xs font-medium ${ESTADO_COLOR[verModal.estado]}`}>{verModal.estado}</span></div>
                {verModal.notas && <div className="col-span-2"><span className="text-gray-500">Notas:</span> {verModal.notas}</div>}
              </div>
              <table className="w-full text-sm border-t border-gray-100 pt-2 mt-2">
                <thead className="text-xs text-gray-500"><tr>
                  <th className="py-2 text-left">Producto</th>
                  <th className="py-2 text-right">Cantidad</th>
                </tr></thead>
                <tbody className="divide-y divide-gray-50">
                  {verModal.detalles.map((d) => (
                    <tr key={d.id}>
                      <td className="py-2">{d.item.nombre}</td>
                      <td className="py-2 text-right">{d.cantidad} {d.item.unidadMedida}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-6 py-4 border-t flex justify-end gap-3">
              <button onClick={() => generarPdfGuia(verModal)} className="bg-blue-600 hover:bg-blue-700 text-white text-sm px-4 py-2 rounded-lg">Descargar PDF</button>
              <button onClick={() => setVerModal(null)} className="text-sm text-gray-600 px-4 py-2">Cerrar</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal nueva guía */}
      {modalNueva && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="font-semibold">Nueva guía de despacho</h2>
            </div>
            <div className="px-6 py-4 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Sucursal origen *</label>
                  <select
                    value={origenId}
                    onChange={(e) => setOrigenId(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Seleccionar...</option>
                    {sucursales.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Sucursal destino *</label>
                  <select
                    value={destinoId}
                    onChange={(e) => setDestinoId(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Seleccionar...</option>
                    {sucursales.filter((s) => s.id !== origenId).map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Notas</label>
                <input
                  type="text"
                  value={notas}
                  onChange={(e) => setNotas(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="space-y-2">
                {lineas.map((l, i) => (
                  <div key={i} className="flex gap-2 items-center">
                    <select
                      value={l.itemId}
                      onChange={(e) => actualizarLinea(i, 'itemId', e.target.value)}
                      className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    >
                      <option value="">Producto...</option>
                      {items.map((it) => (
                        <option key={it.id} value={it.id}>
                          {it.nombre} (disp: {stockMap[it.id] ?? 0})
                        </option>
                      ))}
                    </select>
                    <input
                      type="number" min="0.001"
                      value={l.cantidad}
                      onChange={(e) => actualizarLinea(i, 'cantidad', e.target.value)}
                      className="w-20 border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    />
                    <button onClick={() => setLineas(lineas.filter((_, j) => j !== i))} className="text-red-400 text-lg leading-none">&times;</button>
                  </div>
                ))}
                <button onClick={agregarLinea} className="text-sm text-blue-600 hover:underline">+ Agregar producto</button>
              </div>
              {error && <p className="text-sm text-red-600">{error}</p>}
            </div>
            <div className="px-6 py-4 border-t flex justify-end gap-3">
              <button onClick={() => setModalNueva(false)} className="text-sm text-gray-600 px-4 py-2">Cancelar</button>
              <button
                onClick={crearGuia}
                disabled={guardando}
                className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm px-5 py-2 rounded-lg font-medium"
              >
                {guardando ? 'Creando...' : 'Crear guía'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
