import { useEffect, useState } from 'react'
import { useAuth } from '@/context/AuthContext'
import { getItems, getStock, getSucursales, createTransaccion } from '@/api'
import type { Item, StockLocal, Sucursal } from '@/types'

type LineaMerma = { itemId: string; nombre: string; cantidad: string; stockDisponible: number }

export default function MermasPage() {
  const { user } = useAuth()
  const [sucursales, setSucursales] = useState<Sucursal[]>([])
  const [sucursalId, setSucursalId] = useState(user?.sucursalId ?? '')
  const [items, setItems] = useState<Item[]>([])
  const [stockMap, setStockMap] = useState<Record<string, number>>({})
  const [lineas, setLineas] = useState<LineaMerma[]>([])
  const [motivo, setMotivo] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')

  useEffect(() => {
    getItems().then((r) => setItems(r.data))
    if (user?.rol === 'Administrador') {
      getSucursales().then((r) => {
        setSucursales(r.data)
        if (!sucursalId && r.data.length > 0) setSucursalId(r.data[0].id)
      })
    }
  }, [user])

  useEffect(() => {
    if (!sucursalId) return
    getStock(sucursalId).then((r) => {
      const map: Record<string, number> = {}
      r.data.forEach((s: StockLocal) => { map[s.itemId] = Number(s.stockActual) })
      setStockMap(map)
    })
  }, [sucursalId])

  const agregarLinea = () => {
    setLineas([...lineas, { itemId: '', nombre: '', cantidad: '1', stockDisponible: 0 }])
  }

  const actualizarLinea = (i: number, campo: keyof LineaMerma, valor: string) => {
    const nuevas = [...lineas]
    if (campo === 'itemId') {
      const item = items.find((it) => it.id === valor)
      nuevas[i] = {
        ...nuevas[i],
        itemId: valor,
        nombre: item?.nombre ?? '',
        stockDisponible: stockMap[valor] ?? 0,
      }
    } else {
      nuevas[i] = { ...nuevas[i], [campo]: valor }
    }
    setLineas(nuevas)
  }

  const quitarLinea = (i: number) => setLineas(lineas.filter((_, j) => j !== i))

  const registrar = async () => {
    if (!sucursalId) { setError('Selecciona una sucursal'); return }
    if (lineas.length === 0) { setError('Agrega al menos un producto'); return }
    if (!motivo.trim()) { setError('El motivo es obligatorio'); return }
    for (const l of lineas) {
      if (!l.itemId) { setError('Selecciona el producto en cada línea'); return }
      const cant = parseFloat(l.cantidad)
      if (!cant || cant <= 0) { setError('Cantidad inválida'); return }
      if (cant > l.stockDisponible) { setError(`Stock insuficiente para "${l.nombre}"`); return }
    }
    setGuardando(true)
    setError('')
    try {
      await createTransaccion({
        sucursalId,
        usuarioId: user!.id,
        tipoTransaccion: 'MERMA',
        medioPago: 'NoAplica',
        motivoMerma: motivo,
        detalles: lineas.map((l) => ({
          itemId: l.itemId,
          cantidad: parseFloat(l.cantidad),
          precioUnitario: 0,
        })),
      })
      setOk('Merma registrada correctamente')
      setLineas([])
      setMotivo('')
      getStock(sucursalId).then((r) => {
        const map: Record<string, number> = {}
        r.data.forEach((s: StockLocal) => { map[s.itemId] = Number(s.stockActual) })
        setStockMap(map)
      })
    } catch (e: any) {
      setError(e?.response?.data?.message ?? 'Error al registrar')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-xl font-semibold text-gray-900">Registro de mermas</h1>

      {user?.rol === 'Administrador' && sucursales.length > 0 && (
        <select
          value={sucursalId}
          onChange={(e) => setSucursalId(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {sucursales.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
        </select>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 space-y-4">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Motivo de la merma *</label>
          <input
            type="text"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="ej. Vencimiento, rotura, deterioro..."
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="space-y-2">
          {lineas.map((l, i) => (
            <div key={i} className="flex gap-2 items-center">
              <select
                value={l.itemId}
                onChange={(e) => actualizarLinea(i, 'itemId', e.target.value)}
                className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Seleccionar producto...</option>
                {items.map((it) => (
                  <option key={it.id} value={it.id}>
                    {it.nombre} (Stock: {stockMap[it.id] ?? 0})
                  </option>
                ))}
              </select>
              <input
                type="number"
                min="0.001"
                value={l.cantidad}
                onChange={(e) => actualizarLinea(i, 'cantidad', e.target.value)}
                className="w-24 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                onClick={() => quitarLinea(i)}
                className="text-red-400 hover:text-red-600 text-lg leading-none"
              >
                &times;
              </button>
            </div>
          ))}
        </div>

        <button
          onClick={agregarLinea}
          className="text-sm text-blue-600 hover:underline"
        >
          + Agregar producto
        </button>

        {error && <p className="text-sm text-red-600">{error}</p>}
        {ok && <p className="text-sm text-green-600">{ok}</p>}

        <button
          onClick={registrar}
          disabled={guardando}
          className="bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white text-sm px-6 py-2 rounded-lg font-medium"
        >
          {guardando ? 'Registrando...' : 'Registrar merma'}
        </button>
      </div>
    </div>
  )
}
