import { useEffect, useState } from 'react'
import { useAuth } from '@/context/AuthContext'
import { getStock, getSucursales, createItem, createStock, adjustStock } from '@/api'
import type { StockLocal, Sucursal } from '@/types'

const UNIDADES = ['UN', 'KG', 'LT', 'CJ', 'PAQ', 'M2', 'MT']

type ModalProducto = {
  codigoSku: string
  nombre: string
  unidadMedida: string
  precioVenta: string
  costoPromedio: string
  afectoIva: boolean
  stockInicial: string
  stockMinimo: string
}

type ModalAjuste = {
  stockId: string
  nombre: string
  stockActual: string
  stockMinimo: string
}

export default function InventarioPage() {
  const { user } = useAuth()
  const canEdit = user?.rol === 'Administrador' || user?.rol === 'Encargado'

  const [sucursales, setSucursales] = useState<Sucursal[]>([])
  const [sucursalId, setSucursalId] = useState(user?.sucursalId ?? '')
  const [stock, setStock] = useState<StockLocal[]>([])
  const [loading, setLoading] = useState(false)
  const [busqueda, setBusqueda] = useState('')

  const [modalProducto, setModalProducto] = useState<ModalProducto | null>(null)
  const [modalAjuste, setModalAjuste] = useState<ModalAjuste | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (user?.rol === 'Administrador') {
      getSucursales().then((r) => {
        setSucursales(r.data)
        if (!sucursalId && r.data.length > 0) setSucursalId(r.data[0].id)
      })
    }
  }, [user])

  useEffect(() => {
    if (!sucursalId) return
    cargarStock()
  }, [sucursalId])

  const cargarStock = () => {
    if (!sucursalId) return
    setLoading(true)
    getStock(sucursalId)
      .then((r) => setStock(r.data))
      .finally(() => setLoading(false))
  }

  const filtrado = stock.filter(
    (s) =>
      s.item.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
      s.item.codigoSku.toLowerCase().includes(busqueda.toLowerCase()),
  )

  const abrirNuevoProducto = () => {
    setError('')
    setModalProducto({
      codigoSku: '',
      nombre: '',
      unidadMedida: 'UN',
      precioVenta: '',
      costoPromedio: '',
      afectoIva: false,
      stockInicial: '0',
      stockMinimo: '0',
    })
  }

  const guardarProducto = async () => {
    if (!modalProducto || !sucursalId) return
    const { codigoSku, nombre, unidadMedida, precioVenta, costoPromedio, afectoIva, stockInicial, stockMinimo } = modalProducto
    if (!codigoSku.trim() || !nombre.trim() || !precioVenta) {
      setError('SKU, nombre y precio son obligatorios')
      return
    }
    setGuardando(true)
    setError('')
    try {
      const item = await createItem({
        codigoSku: codigoSku.trim(),
        nombre: nombre.trim(),
        unidadMedida,
        precioVenta: parseFloat(precioVenta),
        costoPromedio: costoPromedio ? parseFloat(costoPromedio) : undefined,
        afectoIva,
      })
      await createStock({
        sucursalId,
        itemId: item.data.id,
        stockActual: parseFloat(stockInicial) || 0,
        stockMinimo: parseFloat(stockMinimo) || 0,
      })
      setModalProducto(null)
      cargarStock()
    } catch (e: any) {
      setError(e?.response?.data?.message ?? 'Error al guardar')
    } finally {
      setGuardando(false)
    }
  }

  const abrirAjuste = (s: StockLocal) => {
    setError('')
    setModalAjuste({
      stockId: s.id,
      nombre: s.item.nombre,
      stockActual: s.stockActual,
      stockMinimo: s.stockMinimo,
    })
  }

  const guardarAjuste = async () => {
    if (!modalAjuste) return
    setGuardando(true)
    setError('')
    try {
      await adjustStock(modalAjuste.stockId, {
        stockActual: parseFloat(modalAjuste.stockActual) || 0,
        stockMinimo: parseFloat(modalAjuste.stockMinimo) || 0,
      })
      setModalAjuste(null)
      cargarStock()
    } catch (e: any) {
      setError(e?.response?.data?.message ?? 'Error al ajustar')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h1 className="text-xl font-semibold text-gray-900">Inventario</h1>

        <div className="flex items-center gap-3">
          {user?.rol === 'Administrador' && sucursales.length > 0 && (
            <select
              value={sucursalId}
              onChange={(e) => setSucursalId(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {sucursales.map((s) => (
                <option key={s.id} value={s.id}>{s.nombre}</option>
              ))}
            </select>
          )}

          {canEdit && sucursalId && (
            <button
              onClick={abrirNuevoProducto}
              className="bg-blue-600 hover:bg-blue-700 text-white text-sm px-4 py-2 rounded-lg font-medium"
            >
              + Nuevo producto
            </button>
          )}
        </div>
      </div>

      <input
        type="text"
        placeholder="Buscar por nombre o SKU..."
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
                <th className="px-4 py-3 text-left">SKU</th>
                <th className="px-4 py-3 text-left">Producto</th>
                <th className="px-4 py-3 text-left">Unidad</th>
                <th className="px-4 py-3 text-right">Stock actual</th>
                <th className="px-4 py-3 text-right">Stock minimo</th>
                <th className="px-4 py-3 text-left">Estado</th>
                {canEdit && <th className="px-4 py-3 text-left">Acciones</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtrado.map((s) => {
                const bajo = parseFloat(s.stockActual) <= parseFloat(s.stockMinimo)
                return (
                  <tr key={s.id}>
                    <td className="px-4 py-3 font-mono text-xs text-gray-500">{s.item.codigoSku}</td>
                    <td className="px-4 py-3 font-medium">{s.item.nombre}</td>
                    <td className="px-4 py-3 text-gray-500">{s.item.unidadMedida}</td>
                    <td className={`px-4 py-3 text-right font-medium ${bajo ? 'text-red-600' : 'text-gray-900'}`}>
                      {s.stockActual}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-500">{s.stockMinimo}</td>
                    <td className="px-4 py-3">
                      {bajo ? (
                        <span className="px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700">Bajo</span>
                      ) : (
                        <span className="px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700">OK</span>
                      )}
                    </td>
                    {canEdit && (
                      <td className="px-4 py-3">
                        <button
                          onClick={() => abrirAjuste(s)}
                          className="text-xs text-blue-600 hover:underline"
                        >
                          Ajustar stock
                        </button>
                      </td>
                    )}
                  </tr>
                )
              })}
              {filtrado.length === 0 && (
                <tr>
                  <td colSpan={canEdit ? 7 : 6} className="px-4 py-6 text-center text-gray-400">
                    Sin registros
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal nuevo producto */}
      {modalProducto && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-base font-semibold text-gray-800">Nuevo producto</h2>
            </div>
            <div className="px-6 py-4 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">SKU *</label>
                  <input
                    type="text"
                    value={modalProducto.codigoSku}
                    onChange={(e) => setModalProducto({ ...modalProducto, codigoSku: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="ej. PRD-001"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Unidad</label>
                  <select
                    value={modalProducto.unidadMedida}
                    onChange={(e) => setModalProducto({ ...modalProducto, unidadMedida: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {UNIDADES.map((u) => <option key={u}>{u}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Nombre *</label>
                <input
                  type="text"
                  value={modalProducto.nombre}
                  onChange={(e) => setModalProducto({ ...modalProducto, nombre: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Nombre del producto"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Precio venta *</label>
                  <input
                    type="number"
                    min="0"
                    value={modalProducto.precioVenta}
                    onChange={(e) => setModalProducto({ ...modalProducto, precioVenta: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Costo promedio</label>
                  <input
                    type="number"
                    min="0"
                    value={modalProducto.costoPromedio}
                    onChange={(e) => setModalProducto({ ...modalProducto, costoPromedio: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2">
                <input
                  id="afectoIva"
                  type="checkbox"
                  checked={modalProducto.afectoIva}
                  onChange={(e) => setModalProducto({ ...modalProducto, afectoIva: e.target.checked })}
                  className="rounded border-gray-300 text-blue-600"
                />
                <label htmlFor="afectoIva" className="text-sm text-gray-700">Afecto a IVA (19%)</label>
              </div>

              <hr className="border-gray-100" />

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Stock inicial</label>
                  <input
                    type="number"
                    min="0"
                    value={modalProducto.stockInicial}
                    onChange={(e) => setModalProducto({ ...modalProducto, stockInicial: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Stock minimo</label>
                  <input
                    type="number"
                    min="0"
                    value={modalProducto.stockMinimo}
                    onChange={(e) => setModalProducto({ ...modalProducto, stockMinimo: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {error && <p className="text-sm text-red-600">{error}</p>}
            </div>

            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
              <button
                onClick={() => setModalProducto(null)}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
              >
                Cancelar
              </button>
              <button
                onClick={guardarProducto}
                disabled={guardando}
                className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm px-5 py-2 rounded-lg font-medium"
              >
                {guardando ? 'Guardando...' : 'Guardar producto'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal ajuste de stock */}
      {modalAjuste && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-base font-semibold text-gray-800">Ajustar stock</h2>
              <p className="text-sm text-gray-500 mt-0.5">{modalAjuste.nombre}</p>
            </div>
            <div className="px-6 py-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Stock actual</label>
                <input
                  type="number"
                  min="0"
                  value={modalAjuste.stockActual}
                  onChange={(e) => setModalAjuste({ ...modalAjuste, stockActual: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Stock minimo</label>
                <input
                  type="number"
                  min="0"
                  value={modalAjuste.stockMinimo}
                  onChange={(e) => setModalAjuste({ ...modalAjuste, stockMinimo: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              {error && <p className="text-sm text-red-600">{error}</p>}
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
              <button
                onClick={() => setModalAjuste(null)}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
              >
                Cancelar
              </button>
              <button
                onClick={guardarAjuste}
                disabled={guardando}
                className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm px-5 py-2 rounded-lg font-medium"
              >
                {guardando ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
