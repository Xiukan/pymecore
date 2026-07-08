import { useEffect, useState } from 'react'
import { useAuth } from '@/context/AuthContext'
import { getTransacciones, getSucursales } from '@/api'
import { generarPdfBoleta } from '@/utils/pdfBoleta'
import { useOnlineStatus } from '@/hooks/useOnlineStatus'
import type { Sucursal, Transaccion } from '@/types'

const TIPO_LABEL: Record<string, string> = {
  VENTA: 'Venta',
  COMPRA: 'Compra',
  MERMA: 'Merma',
  DEVOLUCION: 'Devolución',
  NOTA_CREDITO: 'Nota crédito',
}

function SiiBadge({ sincronizacion }: { sincronizacion?: string }) {
  if (!sincronizacion || sincronizacion === 'SINCRONIZADO') return null
  if (sincronizacion === 'PENDIENTE') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-700">
        <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
        Pendiente SII
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700">
      <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
      Error envío
    </span>
  )
}

const TIPO_COLOR: Record<string, string> = {
  VENTA: 'bg-green-100 text-green-700',
  COMPRA: 'bg-blue-100 text-blue-700',
  MERMA: 'bg-orange-100 text-orange-700',
  DEVOLUCION: 'bg-purple-100 text-purple-700',
  NOTA_CREDITO: 'bg-pink-100 text-pink-700',
}

export default function HistorialPage() {
  const { user } = useAuth()
  const online = useOnlineStatus()
  const [sucursales, setSucursales] = useState<Sucursal[]>([])
  const [sucursalId, setSucursalId] = useState(user?.sucursalId ?? '')
  const [transacciones, setTransacciones] = useState<Transaccion[]>([])
  const [loading, setLoading] = useState(false)
  const [seleccionada, setSeleccionada] = useState<Transaccion | null>(null)
  const [filtroTipo, setFiltroTipo] = useState('')
  const [filtroFecha, setFiltroFecha] = useState('')
  const [busqueda, setBusqueda] = useState('')

  useEffect(() => {
    if (user?.rol === 'Administrador') {
      getSucursales().then((r) => {
        setSucursales(r.data)
        if (!sucursalId && r.data.length > 0) setSucursalId(r.data[0].id)
      })
    }
  }, [user])

  const cargar = () => {
    setLoading(true)
    getTransacciones(sucursalId || undefined)
      .then((r) => setTransacciones(r.data))
      .finally(() => setLoading(false))
  }

  useEffect(() => { cargar() }, [sucursalId])

  // Refresca al cambiar estado de conexión para reflejar PENDIENTE ↔ SINCRONIZADO
  useEffect(() => { cargar() }, [online])

  const filtradas = transacciones.filter((t) => {
    if (filtroTipo && t.tipoTransaccion !== filtroTipo) return false
    if (filtroFecha && !t.fechaRegistro.startsWith(filtroFecha)) return false
    if (busqueda) {
      const b = busqueda.toLowerCase()
      return (
        t.numeroFactura?.toLowerCase().includes(b) ||
        t.entidad?.nombreRazonSocial?.toLowerCase().includes(b) ||
        t.entidad?.rut?.includes(b) ||
        false
      )
    }
    return true
  })

  const descargarPdf = (t: Transaccion) => {
    if (!t.detalles?.length) return
    const meta = t.metadatosSii as any
    generarPdfBoleta({
      folio: meta?.folio ?? parseInt(t.numeroFactura ?? '0'),
      tipoDoc: meta?.tipoDoc ?? 39,
      fecha: new Date(t.fechaRegistro).toLocaleDateString('es-CL'),
      rutEmisor: '76.000.000-1',
      razonSocialEmisor: 'PYMECORE SPA',
      rutReceptor: t.entidad?.rut ?? '66.666.666-6',
      razonSocialReceptor: t.entidad?.nombreRazonSocial ?? 'Cliente Final',
      medioPago: t.medioPago,
      sucursal: '',
      detalles: t.detalles.map((d) => ({
        nombre: d.item?.nombre ?? d.itemId,
        cantidad: Number(d.cantidad),
        precio: Number(d.precioUnitario),
        subtotal: Number(d.subtotal),
      })),
      montoTotal: Number(t.montoTotal),
      metadatosSii: t.metadatosSii,
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-xl font-semibold text-gray-900">Historial de ventas</h1>
        {user?.rol === 'Administrador' && sucursales.length > 0 && (
          <select
            value={sucursalId}
            onChange={(e) => setSucursalId(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Todas las sucursales</option>
            {sucursales.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
          </select>
        )}
      </div>

      <div className="flex flex-wrap gap-3">
        <input
          type="text"
          placeholder="Buscar por N° folio, cliente, RUT..."
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 flex-1 min-w-48"
        />
        <select
          value={filtroTipo}
          onChange={(e) => setFiltroTipo(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">Todos los tipos</option>
          {Object.entries(TIPO_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <input
          type="date"
          value={filtroFecha}
          onChange={(e) => setFiltroFecha(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        {loading ? (
          <p className="text-center text-gray-400 py-8 text-sm">Cargando...</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
              <tr>
                <th className="px-4 py-3 text-left">Folio</th>
                <th className="px-4 py-3 text-left">Tipo</th>
                <th className="px-4 py-3 text-left">Cliente</th>
                <th className="px-4 py-3 text-left">Fecha</th>
                <th className="px-4 py-3 text-left">Medio pago</th>
                <th className="px-4 py-3 text-right">Total</th>
                <th className="px-4 py-3 text-left">Estado</th>
                <th className="px-4 py-3 text-left">SII</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtradas.map((t) => (
                <tr key={t.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono text-xs text-gray-500">{t.numeroFactura ?? '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${TIPO_COLOR[t.tipoTransaccion] ?? 'bg-gray-100 text-gray-600'}`}>
                      {TIPO_LABEL[t.tipoTransaccion] ?? t.tipoTransaccion}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium">{t.entidad?.nombreRazonSocial ?? 'Cliente final'}</div>
                    {t.entidad?.rut && <div className="text-xs text-gray-400">{t.entidad.rut}</div>}
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {new Date(t.fechaRegistro).toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' })}
                  </td>
                  <td className="px-4 py-3 text-gray-500">{t.medioPago}</td>
                  <td className="px-4 py-3 text-right font-medium">
                    ${Number(t.montoTotal).toLocaleString('es-CL')}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded text-xs ${t.estado === 'Activa' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                      {t.estado}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {t.tipoTransaccion === 'VENTA' && (
                      <SiiBadge sincronizacion={t.sincronizacion} />
                    )}
                  </td>
                  <td className="px-4 py-3 flex gap-2">
                    <button
                      onClick={() => setSeleccionada(t)}
                      className="text-xs text-blue-600 hover:underline"
                    >
                      Ver
                    </button>
                    {t.tipoTransaccion === 'VENTA' && t.numeroFactura && (
                      <button
                        onClick={() => descargarPdf(t)}
                        className="text-xs text-gray-500 hover:underline"
                      >
                        PDF
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {filtradas.length === 0 && (
                <tr><td colSpan={9} className="px-4 py-8 text-center text-gray-400">Sin registros</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {seleccionada && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-xl max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-gray-200 flex justify-between">
              <div>
                <h2 className="font-semibold text-gray-800">
                  {TIPO_LABEL[seleccionada.tipoTransaccion]} — Folio {seleccionada.numeroFactura ?? 'S/N'}
                </h2>
                <p className="text-xs text-gray-400">
                  {new Date(seleccionada.fechaRegistro).toLocaleString('es-CL')}
                </p>
              </div>
              <button onClick={() => setSeleccionada(null)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
            </div>
            <div className="px-6 py-4 space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-500">Cliente:</span>{' '}
                  {seleccionada.entidad?.nombreRazonSocial ?? 'Cliente final'}
                </div>
                <div>
                  <span className="text-gray-500">RUT:</span>{' '}
                  {seleccionada.entidad?.rut ?? '—'}
                </div>
                <div>
                  <span className="text-gray-500">Medio pago:</span>{' '}
                  {seleccionada.medioPago}
                </div>
                <div>
                  <span className="text-gray-500">Estado:</span>{' '}
                  {seleccionada.estado}
                </div>
                {seleccionada.tipoTransaccion === 'VENTA' && (
                  <div className="flex items-center gap-2">
                    <span className="text-gray-500">SII:</span>{' '}
                    {seleccionada.sincronizacion === 'SINCRONIZADO'
                      ? <span className="text-green-600 text-xs font-medium">Enviado</span>
                      : <SiiBadge sincronizacion={seleccionada.sincronizacion} />
                    }
                  </div>
                )}
                {seleccionada.observaciones && (
                  <div className="col-span-2">
                    <span className="text-gray-500">Observaciones:</span>{' '}
                    {seleccionada.observaciones}
                  </div>
                )}
                {seleccionada.motivoMerma && (
                  <div className="col-span-2">
                    <span className="text-gray-500">Motivo merma:</span>{' '}
                    {seleccionada.motivoMerma}
                  </div>
                )}
              </div>

              {seleccionada.detalles && seleccionada.detalles.length > 0 && (
                <table className="w-full text-sm border-t border-gray-100 pt-4">
                  <thead className="text-xs text-gray-500">
                    <tr>
                      <th className="py-2 text-left">Producto</th>
                      <th className="py-2 text-right">Cant</th>
                      <th className="py-2 text-right">Precio</th>
                      <th className="py-2 text-right">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {seleccionada.detalles.map((d) => (
                      <tr key={d.id}>
                        <td className="py-2">{d.item?.nombre ?? d.itemId}</td>
                        <td className="py-2 text-right">{d.cantidad}</td>
                        <td className="py-2 text-right">${Number(d.precioUnitario).toLocaleString('es-CL')}</td>
                        <td className="py-2 text-right font-medium">${Number(d.subtotal).toLocaleString('es-CL')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              <div className="flex justify-between font-semibold text-base pt-2 border-t border-gray-100">
                <span>Total</span>
                <span>${Number(seleccionada.montoTotal).toLocaleString('es-CL')}</span>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
              {seleccionada.tipoTransaccion === 'VENTA' && seleccionada.numeroFactura && (
                <button
                  onClick={() => descargarPdf(seleccionada)}
                  className="bg-blue-600 hover:bg-blue-700 text-white text-sm px-4 py-2 rounded-lg"
                >
                  Descargar PDF
                </button>
              )}
              <button
                onClick={() => setSeleccionada(null)}
                className="text-sm text-gray-600 hover:text-gray-800 px-4 py-2"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
