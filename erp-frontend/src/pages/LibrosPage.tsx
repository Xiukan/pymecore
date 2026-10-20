import { useEffect, useState } from 'react'
import { getLibroCompras, getLibroVentas, getResumenIva } from '@/api'
import { descargarCsv } from '@/utils/csv'
import type { Libro, ResumenIva } from '@/types'

const clp = (v: string | number) => {
  const n = Math.round(Number(v))
  return `${n < 0 ? '-' : ''}$${Math.abs(n).toLocaleString('es-CL')}`
}
const TIPO: Record<number, string> = { 33: 'Factura', 34: 'Factura exenta', 39: 'Boleta', 56: 'Nota de débito', 61: 'Nota de crédito' }
const mesActual = () => new Date().toISOString().slice(0, 7)

export default function LibrosPage() {
  const [mes, setMes] = useState(mesActual())
  const [pestana, setPestana] = useState<'resumen' | 'ventas' | 'compras'>('resumen')
  const [resumen, setResumen] = useState<ResumenIva | null>(null)
  const [ventas, setVentas] = useState<Libro | null>(null)
  const [compras, setCompras] = useState<Libro | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    setError('')
    Promise.all([getResumenIva(mes), getLibroVentas(mes), getLibroCompras(mes)])
      .then(([r, v, c]) => { setResumen(r.data); setVentas(v.data); setCompras(c.data) })
      .catch(() => setError('No se pudieron cargar los libros del mes.'))
  }, [mes])

  const exportar = (libro: Libro, nombre: string, conIva: boolean) =>
    descargarCsv(`${nombre}_${mes}.csv`, [
      ['Fecha', 'Tipo', 'Folio', 'RUT', 'Razón social', 'Neto', 'Exento', 'IVA', 'Otros impuestos', 'Total', ...(conIva ? ['IVA recuperable', 'Origen'] : [])],
      ...libro.filas.map((f) => [f.fecha, TIPO[f.tipoDte] ?? f.tipoDte, f.folio, f.rut, f.razonSocial, f.neto, f.exento, f.iva, f.otros, f.total, ...(conIva ? [f.ivaRecuperable ? 'Sí' : 'No', f.origen] : [])]),
    ])

  const libro = pestana === 'ventas' ? ventas : compras

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-gray-900">Impuestos (IVA)</h1>
        <input type="month" value={mes} onChange={(e) => setMes(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm" />
      </div>
      <div className="flex gap-1 border-b border-gray-200">
        {([['resumen', 'Resumen IVA (F29)'], ['ventas', 'Libro de ventas'], ['compras', 'Libro de compras']] as const).map(([id, label]) => (
          <button key={id} onClick={() => setPestana(id)}
            className={`px-4 py-2 text-sm font-medium -mb-px border-b-2 ${pestana === id ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-500'}`}>
            {label}
          </button>
        ))}
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}

      {pestana === 'resumen' && resumen && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 space-y-2 text-sm">
            <h2 className="font-semibold text-gray-700">IVA del período</h2>
            <Fila label="Débito fiscal (ventas − NC)" valor={resumen.debito} />
            <Fila label="Crédito fiscal (compras recuperables)" valor={resumen.credito} />
            <Fila label="IVA no recuperable (informativo)" valor={resumen.ivaNoRecuperable} tenue />
            <hr />
            <Fila label="IVA a pagar" valor={resumen.ivaAPagar} fuerte />
            {Number(resumen.remanente) > 0 && <Fila label="Remanente de crédito al mes siguiente" valor={resumen.remanente} />}
          </section>
          <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 space-y-2 text-sm">
            <h2 className="font-semibold text-gray-700">Otros conceptos</h2>
            <Fila label="Ventas netas" valor={resumen.ventasNetas} />
            <Fila label="Compras netas" valor={resumen.comprasNetas} />
            <Fila label="Retención boletas de honorarios" valor={resumen.retencionHonorarios} />
            <hr />
            <Fila label="Total a pagar (IVA + retenciones)" valor={resumen.totalAPagar} fuerte />
            <p className="text-xs text-gray-400">No incluye PPM ni impuestos específicos. Verifique con su contador antes de declarar.</p>
          </section>
        </div>
      )}

      {pestana !== 'resumen' && libro && (
        <>
          <div className="flex flex-wrap gap-3 items-center">
            {libro.totales.map((t) => (
              <span key={t.tipoDte} className="text-xs bg-gray-100 rounded px-2 py-1">
                {TIPO[t.tipoDte] ?? t.tipoDte}: {t.documentos} doc. · IVA {clp(t.iva)} · total {clp(t.total)}
              </span>
            ))}
            <button onClick={() => exportar(libro, pestana === 'ventas' ? 'libro_ventas' : 'libro_compras', pestana === 'compras')}
              className="ml-auto text-sm px-4 py-2 rounded-lg bg-gray-100 text-gray-700">Descargar CSV</button>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                <tr>
                  <th className="px-3 py-2 text-left">Fecha</th><th className="px-3 py-2 text-left">Documento</th><th className="px-3 py-2 text-left">RUT</th>
                  <th className="px-3 py-2 text-left">Razón social</th><th className="px-3 py-2 text-right">Neto</th><th className="px-3 py-2 text-right">Exento</th>
                  <th className="px-3 py-2 text-right">IVA</th><th className="px-3 py-2 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {libro.filas.map((f, i) => (
                  <tr key={i} className={f.tipoDte === 61 ? 'text-red-700' : ''}>
                    <td className="px-3 py-2">{f.fecha}</td>
                    <td className="px-3 py-2">{TIPO[f.tipoDte] ?? f.tipoDte} {f.folio && `N° ${f.folio}`}</td>
                    <td className="px-3 py-2 text-gray-500">{f.rut}</td>
                    <td className="px-3 py-2">{f.razonSocial}{f.origen && <span className="block text-xs text-gray-400">{f.origen}</span>}</td>
                    <td className="px-3 py-2 text-right">{clp(f.neto)}</td>
                    <td className="px-3 py-2 text-right">{clp(f.exento)}</td>
                    <td className="px-3 py-2 text-right">{clp(f.iva)}{f.ivaRecuperable === false && <span className="block text-xs text-gray-400">no recuperable</span>}</td>
                    <td className="px-3 py-2 text-right font-medium">{clp(f.total)}</td>
                  </tr>
                ))}
                {libro.filas.length === 0 && <tr><td colSpan={8} className="px-3 py-6 text-center text-gray-400">Sin documentos en el mes</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}

function Fila({ label, valor, fuerte, tenue }: { label: string; valor: string; fuerte?: boolean; tenue?: boolean }) {
  return (
    <p className={`flex justify-between ${fuerte ? 'font-bold text-gray-900' : tenue ? 'text-gray-400' : 'text-gray-700'}`}>
      <span>{label}</span><span>{clp(valor)}</span>
    </p>
  )
}
