import { useEffect, useState } from 'react'
import { getItems, updateItem, getOfertas, createOferta, updateOferta, deleteOferta } from '@/api'
import type { Item, Oferta } from '@/types'

type TabType = 'precios' | 'ofertas'

export default function PreciosPage() {
  const [tab, setTab] = useState<TabType>('precios')
  const [items, setItems] = useState<Item[]>([])
  const [ofertas, setOfertas] = useState<Oferta[]>([])
  const [busqueda, setBusqueda] = useState('')
  const [editandoPrecio, setEditandoPrecio] = useState<{ id: string; precioVenta: string } | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  const [modalOferta, setModalOferta] = useState<{
    itemId: string; precioOferta: string; descripcion: string; fechaInicio: string; fechaFin: string
  } | null>(null)

  const today = new Date().toISOString().split('T')[0]

  useEffect(() => {
    getItems().then((r) => setItems(r.data))
    getOfertas().then((r) => setOfertas(r.data))
  }, [])

  const filtradoItems = items.filter(
    (i) =>
      i.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
      i.codigoSku.toLowerCase().includes(busqueda.toLowerCase()),
  )

  const actualizarPrecio = async () => {
    if (!editandoPrecio) return
    const precio = parseFloat(editandoPrecio.precioVenta)
    if (isNaN(precio) || precio < 0) { setError('Precio inválido'); return }
    setGuardando(true)
    setError('')
    try {
      const r = await updateItem(editandoPrecio.id, { precioVenta: precio })
      setItems(items.map((i) => (i.id === editandoPrecio.id ? r.data : i)))
      setEditandoPrecio(null)
    } catch {
      setError('Error al actualizar precio')
    } finally {
      setGuardando(false)
    }
  }

  const guardarOferta = async () => {
    if (!modalOferta) return
    const { itemId, precioOferta, descripcion, fechaInicio, fechaFin } = modalOferta
    if (!itemId || !precioOferta || !fechaInicio || !fechaFin) {
      setError('Todos los campos son obligatorios')
      return
    }
    if (fechaFin < fechaInicio) { setError('La fecha fin debe ser posterior a la de inicio'); return }
    setGuardando(true)
    setError('')
    try {
      const r = await createOferta({
        itemId,
        precioOferta: parseFloat(precioOferta),
        descripcion: descripcion || undefined,
        fechaInicio,
        fechaFin,
      })
      setOfertas([r.data, ...ofertas])
      setModalOferta(null)
    } catch (e: any) {
      setError(e?.response?.data?.message ?? 'Error al crear oferta')
    } finally {
      setGuardando(false)
    }
  }

  const toggleOferta = async (o: Oferta) => {
    try {
      const r = await updateOferta(o.id, { activo: !o.activo })
      setOfertas(ofertas.map((of) => (of.id === o.id ? r.data : of)))
    } catch {
      setError('Error al actualizar oferta')
    }
  }

  const eliminarOferta = async (id: string) => {
    try {
      await deleteOferta(id)
      setOfertas(ofertas.filter((o) => o.id !== id))
    } catch {
      setError('Error al eliminar oferta')
    }
  }

  const vigente = (o: Oferta) => {
    const now = today
    return o.activo && o.fechaInicio.split('T')[0] <= now && o.fechaFin.split('T')[0] >= now
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">Precios y ofertas</h1>
        {tab === 'ofertas' && (
          <button
            onClick={() => {
              setError('')
              setModalOferta({ itemId: '', precioOferta: '', descripcion: '', fechaInicio: today, fechaFin: today })
            }}
            className="bg-blue-600 hover:bg-blue-700 text-white text-sm px-4 py-2 rounded-lg font-medium"
          >
            + Nueva oferta
          </button>
        )}
      </div>

      <div className="flex gap-2 border-b border-gray-200">
        {(['precios', 'ofertas'] as TabType[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t === 'precios' ? 'Lista de precios' : 'Ofertas'}
          </button>
        ))}
      </div>

      {tab === 'precios' && (
        <div className="space-y-3">
          <input
            type="text"
            placeholder="Buscar producto..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-full max-w-sm"
          />
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                <tr>
                  <th className="px-4 py-3 text-left">SKU</th>
                  <th className="px-4 py-3 text-left">Producto</th>
                  <th className="px-4 py-3 text-right">Costo compra</th>
                  <th className="px-4 py-3 text-right">Costo promedio</th>
                  <th className="px-4 py-3 text-right">Precio venta</th>
                  <th className="px-4 py-3 text-right">Margen</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtradoItems.map((item) => {
                  const pv = Number(item.precioVenta)
                  const cp = Number(item.costoPromedio)
                  const margen = cp > 0 ? (((pv - cp) / cp) * 100).toFixed(1) : '—'
                  const isEditing = editandoPrecio?.id === item.id
                  return (
                    <tr key={item.id}>
                      <td className="px-4 py-3 font-mono text-xs text-gray-500">{item.codigoSku}</td>
                      <td className="px-4 py-3 font-medium">{item.nombre}</td>
                      <td className="px-4 py-3 text-right text-gray-500">
                        ${Number((item as any).precioCompra ?? 0).toLocaleString('es-CL')}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-500">
                        ${cp.toLocaleString('es-CL')}
                      </td>
                      <td className="px-4 py-3 text-right font-medium">
                        {isEditing ? (
                          <input
                            type="number"
                            value={editandoPrecio.precioVenta}
                            onChange={(e) => setEditandoPrecio({ ...editandoPrecio, precioVenta: e.target.value })}
                            onKeyDown={(e) => e.key === 'Enter' && actualizarPrecio()}
                            className="w-24 border border-blue-300 rounded px-2 py-1 text-right text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            autoFocus
                          />
                        ) : (
                          <span>${pv.toLocaleString('es-CL')}</span>
                        )}
                      </td>
                      <td className={`px-4 py-3 text-right text-sm ${cp > 0 && pv < cp ? 'text-red-600' : 'text-gray-500'}`}>
                        {margen !== '—' ? `${margen}%` : '—'}
                      </td>
                      <td className="px-4 py-3 flex gap-2 justify-end">
                        {isEditing ? (
                          <>
                            <button onClick={actualizarPrecio} disabled={guardando} className="text-xs text-green-600 hover:underline">
                              Guardar
                            </button>
                            <button onClick={() => setEditandoPrecio(null)} className="text-xs text-gray-400 hover:underline">
                              Cancelar
                            </button>
                          </>
                        ) : (
                          <button
                            onClick={() => { setError(''); setEditandoPrecio({ id: item.id, precioVenta: String(pv) }) }}
                            className="text-xs text-blue-600 hover:underline"
                          >
                            Editar precio
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
      )}

      {tab === 'ofertas' && (
        <div className="space-y-3">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                <tr>
                  <th className="px-4 py-3 text-left">Producto</th>
                  <th className="px-4 py-3 text-right">Precio normal</th>
                  <th className="px-4 py-3 text-right">Precio oferta</th>
                  <th className="px-4 py-3 text-left">Descripcion</th>
                  <th className="px-4 py-3 text-left">Vigencia</th>
                  <th className="px-4 py-3 text-left">Estado</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {ofertas.map((o) => (
                  <tr key={o.id}>
                    <td className="px-4 py-3 font-medium">{o.item.nombre}</td>
                    <td className="px-4 py-3 text-right text-gray-500">
                      ${Number(o.item.precioVenta).toLocaleString('es-CL')}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-green-700">
                      ${Number(o.precioOferta).toLocaleString('es-CL')}
                    </td>
                    <td className="px-4 py-3 text-gray-500">{o.descripcion ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      {o.fechaInicio.split('T')[0]} → {o.fechaFin.split('T')[0]}
                    </td>
                    <td className="px-4 py-3">
                      {vigente(o) ? (
                        <span className="px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700">Vigente</span>
                      ) : o.activo ? (
                        <span className="px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-700">Programada</span>
                      ) : (
                        <span className="px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-500">Inactiva</span>
                      )}
                    </td>
                    <td className="px-4 py-3 flex gap-2">
                      <button onClick={() => toggleOferta(o)} className="text-xs text-blue-600 hover:underline">
                        {o.activo ? 'Pausar' : 'Activar'}
                      </button>
                      <button onClick={() => eliminarOferta(o.id)} className="text-xs text-red-400 hover:underline">
                        Eliminar
                      </button>
                    </td>
                  </tr>
                ))}
                {ofertas.length === 0 && (
                  <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">Sin ofertas</td></tr>
                )}
              </tbody>
            </table>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
      )}

      {modalOferta && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="font-semibold text-gray-800">Nueva oferta</h2>
            </div>
            <div className="px-6 py-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Producto *</label>
                <select
                  value={modalOferta.itemId}
                  onChange={(e) => setModalOferta({ ...modalOferta, itemId: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Seleccionar...</option>
                  {items.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.nombre} (actual: ${Number(i.precioVenta).toLocaleString('es-CL')})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Precio de oferta *</label>
                <input
                  type="number" min="0"
                  value={modalOferta.precioOferta}
                  onChange={(e) => setModalOferta({ ...modalOferta, precioOferta: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Descripción</label>
                <input
                  type="text"
                  value={modalOferta.descripcion}
                  onChange={(e) => setModalOferta({ ...modalOferta, descripcion: e.target.value })}
                  placeholder="ej. Oferta verano"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Desde *</label>
                  <input
                    type="date"
                    value={modalOferta.fechaInicio}
                    onChange={(e) => setModalOferta({ ...modalOferta, fechaInicio: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Hasta *</label>
                  <input
                    type="date"
                    value={modalOferta.fechaFin}
                    onChange={(e) => setModalOferta({ ...modalOferta, fechaFin: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
              {error && <p className="text-sm text-red-600">{error}</p>}
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
              <button onClick={() => setModalOferta(null)} className="text-sm text-gray-600 px-4 py-2">Cancelar</button>
              <button
                onClick={guardarOferta}
                disabled={guardando}
                className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm px-5 py-2 rounded-lg font-medium"
              >
                {guardando ? 'Guardando...' : 'Crear oferta'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
