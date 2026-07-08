import { useEffect, useState } from 'react'
import { useAuth } from '@/context/AuthContext'
import { getTransacciones, getSucursales, getGuias } from '@/api'
import { generarPdfBoleta } from '@/utils/pdfBoleta'
import jsPDF from 'jspdf'
import type { GuiaDespacho, Sucursal, Transaccion } from '@/types'

type TipoDoc = 'BOLETA' | 'FACTURA' | 'NOTA_CREDITO' | 'DEVOLUCION' | 'GUIA_DESPACHO'

const TIPO_OPCIONES: { value: TipoDoc | ''; label: string }[] = [
  { value: '', label: 'Todos los documentos' },
  { value: 'BOLETA', label: 'Boleta electrónica' },
  { value: 'FACTURA', label: 'Factura electrónica' },
  { value: 'NOTA_CREDITO', label: 'Nota de crédito' },
  { value: 'DEVOLUCION', label: 'Devolución' },
  { value: 'GUIA_DESPACHO', label: 'Guía de despacho' },
]

function generarPdfGuia(guia: GuiaDespacho) {
  const doc = new jsPDF({ unit: 'mm', format: 'a5' })
  const W = 148
  let y = 10
  doc.setFontSize(12); doc.setFont('helvetica', 'bold')
  doc.text('PYMECORE — GUÍA DE DESPACHO', W / 2, y, { align: 'center' }); y += 7
  doc.setFontSize(8); doc.setFont('helvetica', 'normal')
  doc.text(`Folio: GD-${String(guia.folio).padStart(4, '0')}`, 10, y)
  doc.text(`Fecha: ${new Date(guia.fechaEmision).toLocaleDateString('es-CL')}`, W - 10, y, { align: 'right' }); y += 5
  doc.text(`Origen: ${guia.sucursalOrigen.nombre} → Destino: ${guia.sucursalDestino.nombre}`, 10, y); y += 5
  doc.line(10, y, W - 10, y); y += 4
  for (const d of guia.detalles) {
    doc.text(`${d.item.nombre}`, 10, y)
    doc.text(`${d.cantidad} ${d.item.unidadMedida}`, W - 10, y, { align: 'right' }); y += 5
  }
  doc.save(`Guia_${guia.folio}.pdf`)
}

export default function DocumentosPage() {
  const { user } = useAuth()
  const [sucursales, setSucursales] = useState<Sucursal[]>([])
  const [sucursalId, setSucursalId] = useState(user?.sucursalId ?? '')
  const [transacciones, setTransacciones] = useState<Transaccion[]>([])
  const [guias, setGuias] = useState<GuiaDespacho[]>([])
  const [loading, setLoading] = useState(false)
  const [tipoFiltro, setTipoFiltro] = useState<TipoDoc | ''>('')
  const [fechaDesde, setFechaDesde] = useState('')
  const [fechaHasta, setFechaHasta] = useState('')
  const [busqueda, setBusqueda] = useState('')

  useEffect(() => {
    if (user?.rol === 'Administrador') {
      getSucursales().then((r) => {
        setSucursales(r.data)
        if (!sucursalId && r.data.length > 0) setSucursalId(r.data[0].id)
      })
    }
  }, [user])

  useEffect(() => {
    setLoading(true)
    Promise.all([
      getTransacciones(sucursalId || undefined),
      getGuias(sucursalId || undefined),
    ]).then(([t, g]) => {
      setTransacciones(t.data)
      setGuias(g.data)
    }).finally(() => setLoading(false))
  }, [sucursalId])

  type Documento = {
    id: string; tipo: TipoDoc; numero: string; fecha: string;
    receptor: string; rut: string; total: string; raw: Transaccion | GuiaDespacho
  }

  const todos: Documento[] = [
    ...transacciones.map((t): Documento => {
      const meta = t.metadatosSii as any
      let tipo: TipoDoc = 'BOLETA'
      if (t.tipoTransaccion === 'NOTA_CREDITO') tipo = 'NOTA_CREDITO'
      else if (t.tipoTransaccion === 'DEVOLUCION') tipo = 'DEVOLUCION'
      else if (meta?.tipoDoc === 33) tipo = 'FACTURA'
      return {
        id: t.id, tipo,
        numero: t.numeroFactura ?? '—',
        fecha: t.fechaRegistro,
        receptor: t.entidad?.nombreRazonSocial ?? 'Cliente final',
        rut: t.entidad?.rut ?? '—',
        total: `$${Number(t.montoTotal).toLocaleString('es-CL')}`,
        raw: t,
      }
    }),
    ...guias.map((g): Documento => ({
      id: g.id, tipo: 'GUIA_DESPACHO',
      numero: `GD-${String(g.folio).padStart(4, '0')}`,
      fecha: g.fechaEmision,
      receptor: g.sucursalDestino.nombre,
      rut: '—',
      total: '—',
      raw: g,
    })),
  ].sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime())

  const filtrados = todos.filter((d) => {
    if (tipoFiltro && d.tipo !== tipoFiltro) return false
    if (fechaDesde && d.fecha.split('T')[0] < fechaDesde) return false
    if (fechaHasta && d.fecha.split('T')[0] > fechaHasta) return false
    if (busqueda) {
      const b = busqueda.toLowerCase()
      return d.numero.toLowerCase().includes(b) || d.receptor.toLowerCase().includes(b) || d.rut.includes(b)
    }
    return true
  })

  const descargarPdf = (doc: Documento) => {
    if (doc.tipo === 'GUIA_DESPACHO') {
      generarPdfGuia(doc.raw as GuiaDespacho)
      return
    }
    const t = doc.raw as Transaccion
    if (!t.detalles?.length) return
    const meta = t.metadatosSii as any
    generarPdfBoleta({
      folio: meta?.folio ?? parseInt(t.numeroFactura ?? '0'),
      tipoDoc: doc.tipo === 'NOTA_CREDITO' ? 61 : doc.tipo === 'FACTURA' ? 33 : 39,
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
    })
  }

  const TIPO_LABEL: Record<TipoDoc, string> = {
    BOLETA: 'Boleta', FACTURA: 'Factura', NOTA_CREDITO: 'Nota crédito',
    DEVOLUCION: 'Devolución', GUIA_DESPACHO: 'Guía despacho',
  }
  const TIPO_COLOR: Record<TipoDoc, string> = {
    BOLETA: 'bg-green-100 text-green-700', FACTURA: 'bg-blue-100 text-blue-700',
    NOTA_CREDITO: 'bg-pink-100 text-pink-700', DEVOLUCION: 'bg-purple-100 text-purple-700',
    GUIA_DESPACHO: 'bg-orange-100 text-orange-700',
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-gray-900">Consulta de documentos</h1>

      <div className="flex flex-wrap gap-3">
        {user?.rol === 'Administrador' && sucursales.length > 0 && (
          <select value={sucursalId} onChange={(e) => setSucursalId(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">Todas las sucursales</option>
            {sucursales.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
          </select>
        )}
        <select value={tipoFiltro} onChange={(e) => setTipoFiltro(e.target.value as any)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
          {TIPO_OPCIONES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <input type="date" value={fechaDesde} onChange={(e) => setFechaDesde(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none" placeholder="Desde" />
        <input type="date" value={fechaHasta} onChange={(e) => setFechaHasta(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none" placeholder="Hasta" />
        <input type="text" placeholder="N° documento, cliente, RUT..." value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 flex-1 min-w-48" />
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        {loading ? (
          <p className="text-center py-8 text-sm text-gray-400">Cargando...</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
              <tr>
                <th className="px-4 py-3 text-left">N°</th>
                <th className="px-4 py-3 text-left">Tipo</th>
                <th className="px-4 py-3 text-left">Receptor</th>
                <th className="px-4 py-3 text-left">RUT</th>
                <th className="px-4 py-3 text-left">Fecha</th>
                <th className="px-4 py-3 text-right">Total</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtrados.map((d) => (
                <tr key={`${d.tipo}-${d.id}`} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono text-xs">{d.numero}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${TIPO_COLOR[d.tipo]}`}>
                      {TIPO_LABEL[d.tipo]}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-medium">{d.receptor}</td>
                  <td className="px-4 py-3 text-gray-500">{d.rut}</td>
                  <td className="px-4 py-3 text-gray-500">
                    {new Date(d.fecha).toLocaleDateString('es-CL')}
                  </td>
                  <td className="px-4 py-3 text-right">{d.total}</td>
                  <td className="px-4 py-3">
                    <button onClick={() => descargarPdf(d)} className="text-xs text-blue-600 hover:underline">
                      PDF
                    </button>
                  </td>
                </tr>
              ))}
              {filtrados.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">Sin documentos</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
