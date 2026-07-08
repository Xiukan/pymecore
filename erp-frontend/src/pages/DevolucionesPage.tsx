import { useEffect, useState } from 'react'
import { useAuth } from '@/context/AuthContext'
import { getTransaccionByFolio, getSucursales, createTransaccion } from '@/api'
import { generarPdfBoleta } from '@/utils/pdfBoleta'
import type { Sucursal, Transaccion } from '@/types'

const MAX_DIAS_CAMBIO = 30

export default function DevolucionesPage() {
  const { user } = useAuth()
  const [sucursales, setSucursales] = useState<Sucursal[]>([])
  const [sucursalId, setSucursalId] = useState(user?.sucursalId ?? '')
  const [folioInput, setFolioInput] = useState('')
  const [transaccion, setTransaccion] = useState<Transaccion | null>(null)
  const [buscando, setBuscando] = useState(false)
  const [errorBusqueda, setErrorBusqueda] = useState('')
  const [tipo, setTipo] = useState<'CAMBIO_PRODUCTO' | 'FALLA'>('CAMBIO_PRODUCTO')
  const [observaciones, setObservaciones] = useState('')
  const [itemsSeleccionados, setItemsSeleccionados] = useState<Record<string, boolean>>({})
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const [exito, setExito] = useState('')

  useEffect(() => {
    if (user?.rol === 'Administrador') {
      getSucursales().then((r) => {
        setSucursales(r.data)
        if (!sucursalId && r.data.length > 0) setSucursalId(r.data[0].id)
      })
    }
  }, [user])

  const buscarBoleta = async () => {
    if (!folioInput.trim()) { setErrorBusqueda('Ingresa el número de boleta'); return }
    setBuscando(true)
    setErrorBusqueda('')
    setTransaccion(null)
    setExito('')
    setError('')
    try {
      const { data } = await getTransaccionByFolio(folioInput.trim())
      if (data.tipoTransaccion !== 'VENTA') {
        setErrorBusqueda('El documento encontrado no es una venta')
        return
      }
      const fechaVenta = new Date(data.fechaRegistro)
      const diasDesde = Math.floor((Date.now() - fechaVenta.getTime()) / 86400000)
      if (diasDesde > MAX_DIAS_CAMBIO) {
        setErrorBusqueda(`Plazo de cambio vencido. Han pasado ${diasDesde} días (máximo ${MAX_DIAS_CAMBIO})`)
        return
      }
      setTransaccion(data)
      const sel: Record<string, boolean> = {}
      data.detalles?.forEach((d) => { sel[d.id] = false })
      setItemsSeleccionados(sel)
    } catch {
      setErrorBusqueda('Documento no encontrado. Verifica el número de boleta.')
    } finally {
      setBuscando(false)
    }
  }

  const procesarDevolucion = async () => {
    if (!transaccion) return
    const detallesDevolver = transaccion.detalles?.filter((d) => itemsSeleccionados[d.id]) ?? []
    if (detallesDevolver.length === 0) { setError('Selecciona al menos un producto a devolver'); return }
    if (!observaciones.trim()) { setError('Indica la razón del cambio/devolución'); return }
    setGuardando(true)
    setError('')
    try {
      await createTransaccion({
        sucursalId: sucursalId || transaccion.sucursalId,
        usuarioId: user!.id,
        tipoTransaccion: tipo === 'FALLA' ? 'NOTA_CREDITO' : 'DEVOLUCION',
        medioPago: tipo === 'FALLA' ? transaccion.medioPago : 'NoAplica',
        transaccionOrigenId: transaccion.id,
        tipoDevolucion: tipo,
        observaciones,
        detalles: detallesDevolver.map((d) => ({
          itemId: d.itemId,
          cantidad: Number(d.cantidad),
          precioUnitario: Number(d.precioUnitario),
        })),
      })
      setExito('Devolución registrada correctamente. El stock fue repuesto.')
      setTransaccion(null)
      setFolioInput('')
      setItemsSeleccionados({})
      setObservaciones('')
    } catch (e: any) {
      setError(e?.response?.data?.message ?? 'Error al registrar')
    } finally {
      setGuardando(false)
    }
  }

  const descargarOriginal = () => {
    if (!transaccion?.detalles?.length) return
    const meta = transaccion.metadatosSii as any
    generarPdfBoleta({
      folio: meta?.folio ?? parseInt(transaccion.numeroFactura ?? '0'),
      tipoDoc: meta?.tipoDoc ?? 39,
      fecha: new Date(transaccion.fechaRegistro).toLocaleDateString('es-CL'),
      rutEmisor: '76.000.000-1',
      razonSocialEmisor: 'PYMECORE SPA',
      rutReceptor: transaccion.entidad?.rut ?? '66.666.666-6',
      razonSocialReceptor: transaccion.entidad?.nombreRazonSocial ?? 'Cliente Final',
      medioPago: transaccion.medioPago,
      sucursal: '',
      detalles: transaccion.detalles.map((d) => ({
        nombre: d.item?.nombre ?? d.itemId,
        cantidad: Number(d.cantidad),
        precio: Number(d.precioUnitario),
        subtotal: Number(d.subtotal),
      })),
      montoTotal: Number(transaccion.montoTotal),
    })
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-xl font-semibold text-gray-900">Devoluciones y cambios</h1>

      {user?.rol === 'Administrador' && sucursales.length > 0 && (
        <select
          value={sucursalId}
          onChange={(e) => setSucursalId(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
        >
          {sucursales.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
        </select>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 space-y-4">
        <p className="text-sm text-gray-500">
          Plazo máximo para cambios: <strong>{MAX_DIAS_CAMBIO} días</strong> desde la emisión de la boleta.
        </p>

        <div className="flex gap-2">
          <input
            type="text"
            value={folioInput}
            onChange={(e) => setFolioInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && buscarBoleta()}
            placeholder="N° de folio impreso en la boleta (ej: 1001)"
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={buscarBoleta}
            disabled={buscando}
            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm px-4 py-2 rounded-lg"
          >
            {buscando ? 'Buscando...' : 'Buscar'}
          </button>
        </div>

        {errorBusqueda && <p className="text-sm text-red-600">{errorBusqueda}</p>}
        {exito && <p className="text-sm text-green-600">{exito}</p>}

        {transaccion && (
          <div className="space-y-4 border-t border-gray-100 pt-4">
            <div className="flex justify-between items-start">
              <div>
                <p className="font-medium">Boleta N° {transaccion.numeroFactura}</p>
                <p className="text-sm text-gray-500">
                  {new Date(transaccion.fechaRegistro).toLocaleDateString('es-CL')} —{' '}
                  {transaccion.entidad?.nombreRazonSocial ?? 'Cliente final'}
                </p>
                <p className="text-sm font-medium text-gray-700">
                  Total: ${Number(transaccion.montoTotal).toLocaleString('es-CL')}
                </p>
              </div>
              <button
                onClick={descargarOriginal}
                className="text-xs text-blue-600 hover:underline"
              >
                Ver PDF original
              </button>
            </div>

            <div>
              <p className="text-xs font-medium text-gray-600 mb-2">Productos a devolver:</p>
              <div className="space-y-2">
                {transaccion.detalles?.map((d) => (
                  <label key={d.id} className="flex items-center gap-3 p-2 rounded-lg border border-gray-100 hover:bg-gray-50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={itemsSeleccionados[d.id] ?? false}
                      onChange={(e) => setItemsSeleccionados({ ...itemsSeleccionados, [d.id]: e.target.checked })}
                      className="rounded border-gray-300 text-blue-600"
                    />
                    <span className="flex-1 text-sm">{d.item?.nombre ?? d.itemId}</span>
                    <span className="text-sm text-gray-500">x{d.cantidad}</span>
                    <span className="text-sm font-medium">${Number(d.subtotal).toLocaleString('es-CL')}</span>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <p className="text-xs font-medium text-gray-600 mb-2">Tipo de devolución:</p>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="radio"
                    name="tipoDev"
                    checked={tipo === 'CAMBIO_PRODUCTO'}
                    onChange={() => setTipo('CAMBIO_PRODUCTO')}
                  />
                  Cambio de producto (stock repuesto)
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="radio"
                    name="tipoDev"
                    checked={tipo === 'FALLA'}
                    onChange={() => setTipo('FALLA')}
                  />
                  Falla / Nota de crédito
                </label>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Razón *</label>
              <input
                type="text"
                value={observaciones}
                onChange={(e) => setObservaciones(e.target.value)}
                placeholder="Describe la razón del cambio..."
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <button
              onClick={procesarDevolucion}
              disabled={guardando}
              className="bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-sm px-6 py-2 rounded-lg font-medium"
            >
              {guardando ? 'Procesando...' : 'Procesar devolución'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
