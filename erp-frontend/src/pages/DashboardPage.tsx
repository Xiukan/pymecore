import { useEffect, useMemo, useState } from 'react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { useAuth } from '@/context/AuthContext'
import { getAlertas, getDashboard, getSucursales } from '@/api'
import type { DashboardReporte, StockLocal, Sucursal } from '@/types'
import { descargarCsv } from '@/utils/csv'
import { clp } from '@/utils/formato'

// Paleta tomada del tema corporativo del portal BI (frontend/charts/theme.py)
const COLORES = ['#2563EB', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899', '#06B6D4', '#6366F1', '#14B8A6', '#F97316', '#64748B']

type Granularidad = 'dia' | 'semana' | 'mes'
type Metrica = 'monto' | 'unidades' | 'margen'

const METRICAS: Record<Metrica, string> = { monto: 'Monto vendido', unidades: 'Unidades', margen: 'Margen bruto' }
const GRANULARIDADES: Record<Granularidad, string> = { dia: 'Día', semana: 'Semana', mes: 'Mes' }

const num = (n: number) => n.toLocaleString('es-CL', { maximumFractionDigits: 1 })
const fmt = (m: Metrica, n: number) => (m === 'unidades' ? num(n) : clp(n))

const pad = (n: number) => String(n).padStart(2, '0')
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

function rango(preset: string): [string, string] {
  const hoy = new Date()
  const desde = new Date(hoy)
  if (preset === '7d') desde.setDate(hoy.getDate() - 6)
  else if (preset === '30d') desde.setDate(hoy.getDate() - 29)
  else if (preset === 'mes') desde.setDate(1)
  else if (preset === 'anio') desde.setMonth(0, 1)
  return [iso(desde), iso(hoy)]
}

const PRESETS = [
  ['7d', 'Últimos 7 días'],
  ['30d', 'Últimos 30 días'],
  ['mes', 'Este mes'],
  ['anio', 'Este año'],
] as const

export default function DashboardPage() {
  const { user } = useAuth()
  const esAdmin = user?.rol === 'Administrador'

  const [preset, setPreset] = useState('anio')
  const [[desde, hasta], setFechas] = useState(() => rango('anio'))
  const [granularidad, setGranularidad] = useState<Granularidad>('mes')
  const [sucursalId, setSucursalId] = useState(user?.sucursalId ?? '')
  const [sucursales, setSucursales] = useState<Sucursal[]>([])

  const [data, setData] = useState<DashboardReporte | null>(null)
  const [alertas, setAlertas] = useState<StockLocal[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [vistaSerie, setVistaSerie] = useState<'periodo' | 'acumulado'>('periodo')
  const [metricaProd, setMetricaProd] = useState<Metrica>('monto')
  const [topN, setTopN] = useState(10)
  const [rankingPor, setRankingPor] = useState<'vendedores' | 'sucursales'>('vendedores')
  const [productoSel, setProductoSel] = useState<string | null>(null)
  const [verDetalle, setVerDetalle] = useState(false)

  useEffect(() => {
    if (esAdmin) getSucursales().then((r) => setSucursales(r.data))
  }, [esAdmin])

  useEffect(() => {
    setLoading(true)
    setError('')
    const suc = sucursalId || undefined
    Promise.all([
      getDashboard({ desde, hasta, granularidad, sucursalId: suc }).then((r) => setData(r.data)),
      getAlertas(suc).then((r) => setAlertas(r.data)),
    ])
      .catch(() => setError('No se pudieron cargar los indicadores.'))
      .finally(() => setLoading(false))
  }, [desde, hasta, granularidad, sucursalId])

  const serie = useMemo(() => {
    if (!data) return []
    let acum = 0
    return data.serie.map((s) => ({ ...s, acumulado: (acum += s.monto) }))
  }, [data])

  const topProductos = useMemo(
    () => (data ? [...data.productos].sort((a, b) => b[metricaProd] - a[metricaProd]).slice(0, topN) : []),
    [data, metricaProd, topN],
  )

  const cambiarPreset = (p: string) => {
    setPreset(p)
    setFechas(rango(p))
  }

  const nombreSucursal = sucursalId
    ? sucursales.find((s) => s.id === sucursalId)?.nombre ?? 'Mi sucursal'
    : 'Todas'

  const k = data?.kpis
  const valorInventario = data?.inventario.reduce((s, i) => s + i.valor, 0) ?? 0
  const productoActivo = data?.productos.find((p) => p.itemId === productoSel)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Dashboard comercial</h1>
        <p className="text-xs text-gray-500 mt-1 flex flex-wrap gap-x-2">
          <span>Sucursal: <b>{nombreSucursal}</b></span>
          <span className="opacity-40">•</span>
          <span>Periodo: <b>{desde} a {hasta}</b></span>
          <span className="opacity-40">•</span>
          <span>Agrupación: <b>{GRANULARIDADES[granularidad]}</b></span>
        </p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 flex flex-wrap items-end gap-3">
        <div className="flex flex-wrap gap-1">
          {PRESETS.map(([id, label]) => (
            <button
              key={id}
              onClick={() => cambiarPreset(id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                preset === id ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <Campo label="Desde">
          <input
            type="date"
            value={desde}
            max={hasta}
            onChange={(e) => { setPreset(''); setFechas([e.target.value, hasta]) }}
            className="border border-gray-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </Campo>
        <Campo label="Hasta">
          <input
            type="date"
            value={hasta}
            min={desde}
            onChange={(e) => { setPreset(''); setFechas([desde, e.target.value]) }}
            className="border border-gray-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </Campo>
        <Campo label="Agrupar por">
          <select value={granularidad} onChange={(e) => setGranularidad(e.target.value as Granularidad)} className="border border-gray-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500">
            {Object.entries(GRANULARIDADES).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </Campo>
        {esAdmin && (
          <Campo label="Sucursal">
            <select value={sucursalId} onChange={(e) => setSucursalId(e.target.value)} className="border border-gray-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">Todas</option>
              {sucursales.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
            </select>
          </Campo>
        )}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {loading && !data && <p className="text-sm text-gray-500">Cargando...</p>}

      {k && data && (
        <div className={`space-y-6 transition-opacity ${loading ? 'opacity-60' : ''}`}>
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
            <StatCard label="Ventas totales" value={clp(k.ventasTotales)} />
            <StatCard label="N° de ventas" value={num(k.numVentas)} />
            <StatCard label="Ticket promedio" value={clp(k.ticketPromedio)} />
            <StatCard label="Unidades vendidas" value={num(k.unidadesVendidas)} />
            <StatCard label="Margen bruto" value={clp(k.margenBruto)} hint={`${k.margenPct}% sobre venta neta`} />
            <StatCard label="Clientes identificados" value={num(k.clientesUnicos)} />
          </div>
          <div className="grid grid-cols-2 xl:grid-cols-6 gap-4">
            <StatCard label="Devoluciones / NC" value={clp(k.devoluciones)} hint={`${k.numDevoluciones} documentos`} tone={k.numDevoluciones ? 'warn' : undefined} />
            <StatCard label="Costo en mermas" value={clp(k.costoMermas)} tone={k.costoMermas ? 'warn' : undefined} />
            <StatCard label="Inventario valorizado" value={clp(valorInventario)} hint="a costo promedio, stock actual" />
            <StatCard label="Gastos del período" value={clp(k.gastos)} hint="neto si el IVA es recuperable" />
            <StatCard label="Resultado" value={clp(k.resultado)} hint="margen − mermas − gastos" tone={k.resultado < 0 ? 'danger' : undefined} />
            <StatCard label="Alertas de stock" value={num(alertas.length)} tone={alertas.length ? 'danger' : undefined} />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
            <Panel
              className="xl:col-span-2"
              titulo="Evolución de ventas"
              acciones={
                <Toggle
                  value={vistaSerie}
                  onChange={setVistaSerie}
                  options={{ periodo: `Por ${GRANULARIDADES[granularidad].toLowerCase()}`, acumulado: 'Acumulado' }}
                />
              }
            >
              {serie.length === 0 ? <Vacio /> : vistaSerie === 'periodo' ? (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={serie} margin={{ left: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                    <XAxis dataKey="periodo" tick={{ fontSize: 11 }} />
                    <YAxis tickFormatter={(v) => clp(v)} tick={{ fontSize: 11 }} width={80} />
                    <Tooltip formatter={(v) => clp(Number(v))} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="monto" name="Ventas" fill={COLORES[0]} radius={[4, 4, 0, 0]} />
                    <Bar dataKey="margen" name="Margen" fill={COLORES[1]} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <AreaChart data={serie} margin={{ left: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                    <XAxis dataKey="periodo" tick={{ fontSize: 11 }} />
                    <YAxis tickFormatter={(v) => clp(v)} tick={{ fontSize: 11 }} width={80} />
                    <Tooltip formatter={(v) => clp(Number(v))} />
                    <Area type="monotone" dataKey="acumulado" name="Ventas acumuladas" stroke={COLORES[0]} fill={COLORES[0]} fillOpacity={0.15} strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </Panel>

            <Panel titulo="Ventas por medio de pago">
              {data.mediosPago.length === 0 ? <Vacio /> : (
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie data={data.mediosPago} dataKey="monto" nameKey="medio" innerRadius={60} outerRadius={95} paddingAngle={2}>
                      {data.mediosPago.map((_, i) => <Cell key={i} fill={COLORES[i % COLORES.length]} />)}
                    </Pie>
                    <Tooltip formatter={(v) => `${clp(Number(v))} (${((Number(v) / k.ventasTotales) * 100).toFixed(1)}%)`} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </Panel>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <Panel
              titulo={`Top ${topN} productos por ${METRICAS[metricaProd].toLowerCase()}`}
              acciones={
                <div className="flex gap-2">
                  <select value={metricaProd} onChange={(e) => setMetricaProd(e.target.value as Metrica)} className="border border-gray-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500">
                    {Object.entries(METRICAS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                  <select value={topN} onChange={(e) => setTopN(Number(e.target.value))} className="border border-gray-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500">
                    {[5, 10, 15, 20].map((n) => <option key={n} value={n}>Top {n}</option>)}
                  </select>
                </div>
              }
            >
              {topProductos.length === 0 ? <Vacio /> : (
                <>
                  <ResponsiveContainer width="100%" height={Math.max(160, topProductos.length * 34)}>
                    <BarChart data={topProductos} layout="vertical" margin={{ left: 10, right: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" horizontal={false} />
                      <XAxis type="number" tickFormatter={(v) => fmt(metricaProd, v)} tick={{ fontSize: 11 }} />
                      <YAxis type="category" dataKey="nombre" width={140} tick={{ fontSize: 11 }} />
                      <Tooltip formatter={(v) => fmt(metricaProd, Number(v))} />
                      <Bar
                        dataKey={metricaProd}
                        name={METRICAS[metricaProd]}
                        radius={[0, 4, 4, 0]}
                        cursor="pointer"
                        onClick={(d) => {
                          const id = (d.payload as { itemId: string }).itemId
                          setProductoSel(productoSel === id ? null : id)
                        }}
                      >
                        {topProductos.map((p) => (
                          <Cell
                            key={p.itemId}
                            fill={productoSel === p.itemId ? COLORES[2] : COLORES[0]}
                            fillOpacity={productoSel && productoSel !== p.itemId ? 0.35 : 1}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                  {productoActivo ? (
                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border-l-4 border-amber-500 bg-amber-50 px-3 py-2 text-xs text-gray-700">
                      <b>{productoActivo.nombre}</b>
                      <span>SKU {productoActivo.sku}</span>
                      <span>{clp(productoActivo.monto)} vendidos</span>
                      <span>{num(productoActivo.unidades)} uds.</span>
                      <span>Margen {clp(productoActivo.margen)}</span>
                      <span>{((productoActivo.monto / k.ventasTotales) * 100).toFixed(1)}% de las ventas</span>
                      <button onClick={() => setProductoSel(null)} className="ml-auto text-amber-700 hover:underline">Quitar selección</button>
                    </div>
                  ) : (
                    <p className="mt-2 text-xs text-gray-400">Haz clic en una barra para ver el detalle del producto.</p>
                  )}
                </>
              )}
            </Panel>

            <Panel
              titulo={rankingPor === 'vendedores' ? 'Ventas por vendedor' : 'Ventas por sucursal'}
              acciones={
                <Toggle
                  value={rankingPor}
                  onChange={setRankingPor}
                  options={esAdmin ? { vendedores: 'Vendedores', sucursales: 'Sucursales' } : { vendedores: 'Vendedores' }}
                />
              }
            >
              {data[rankingPor].length === 0 ? <Vacio /> : (
                <ResponsiveContainer width="100%" height={Math.max(160, data[rankingPor].length * 40)}>
                  <BarChart data={data[rankingPor]} layout="vertical" margin={{ left: 10, right: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" horizontal={false} />
                    <XAxis type="number" tickFormatter={(v) => clp(v)} tick={{ fontSize: 11 }} />
                    <YAxis type="category" dataKey="nombre" width={160} tick={{ fontSize: 11 }} />
                    <Tooltip
                      formatter={(v, name) => [clp(Number(v)), name]}
                      labelFormatter={(l, p) => `${l} · ${p?.[0]?.payload.ventas ?? 0} ventas`}
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="monto" name="Ventas" fill={COLORES[3]} radius={[0, 4, 4, 0]} />
                    <Bar dataKey="margen" name="Margen" fill={COLORES[1]} radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </Panel>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <Panel titulo="Inventario valorizado por sucursal">
              {data.inventario.length === 0 ? <Vacio /> : (
                <ResponsiveContainer width="100%" height={Math.max(160, data.inventario.length * 50)}>
                  <BarChart data={data.inventario} layout="vertical" margin={{ left: 10, right: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" horizontal={false} />
                    <XAxis type="number" tickFormatter={(v) => clp(v)} tick={{ fontSize: 11 }} />
                    <YAxis type="category" dataKey="sucursal" width={160} tick={{ fontSize: 11 }} />
                    <Tooltip
                      formatter={(v) => clp(Number(v))}
                      labelFormatter={(l, p) => `${l} · ${p?.[0]?.payload.productos ?? 0} productos, ${p?.[0]?.payload.alertas ?? 0} en alerta`}
                    />
                    <Bar dataKey="valor" name="Valor a costo" fill={COLORES[5]} radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </Panel>

            <Panel titulo="Productos con stock bajo">
              {alertas.length === 0 ? (
                <p className="py-8 text-center text-sm text-gray-400">Sin alertas de stock</p>
              ) : (
                <div className="max-h-72 overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-gray-500 text-xs uppercase sticky top-0">
                      <tr>
                        <th className="px-3 py-2 text-left">Producto</th>
                        <th className="px-3 py-2 text-right">Stock actual</th>
                        <th className="px-3 py-2 text-right">Stock mínimo</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {alertas.map((a) => (
                        <tr key={a.id}>
                          <td className="px-3 py-2 font-medium">{a.item.nombre}</td>
                          <td className="px-3 py-2 text-right text-red-600">{a.stockActual}</td>
                          <td className="px-3 py-2 text-right">{a.stockMinimo}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>
          </div>

          <Panel
            titulo="Detalle de ventas por producto"
            acciones={
              <div className="flex gap-2">
                <button
                  onClick={() =>
                    descargarCsv(`ventas_productos_${desde}_${hasta}.csv`, [
                      ['SKU', 'Producto', 'Unidades', 'Monto vendido', 'Margen bruto', 'Margen %', 'Líneas de venta'],
                      ...data.productos.map((p) => [
                        p.sku, p.nombre, p.unidades, p.monto, p.margen,
                        p.monto ? ((p.margen / p.monto) * 100).toFixed(1) : '0', p.lineas,
                      ]),
                    ])
                  }
                  disabled={data.productos.length === 0}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-50"
                >
                  Descargar CSV
                </button>
                <button
                  onClick={() => setVerDetalle(!verDetalle)}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-100 text-gray-700 hover:bg-gray-200"
                >
                  {verDetalle ? 'Ocultar' : 'Mostrar'}
                </button>
              </div>
            }
          >
            {verDetalle && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                    <tr>
                      <th className="px-3 py-2 text-left">SKU</th>
                      <th className="px-3 py-2 text-left">Producto</th>
                      <th className="px-3 py-2 text-right">Unidades</th>
                      <th className="px-3 py-2 text-right">Monto</th>
                      <th className="px-3 py-2 text-right">Margen</th>
                      <th className="px-3 py-2 text-right">% del total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {data.productos.map((p) => (
                      <tr key={p.itemId}>
                        <td className="px-3 py-2 text-gray-500">{p.sku}</td>
                        <td className="px-3 py-2 font-medium">{p.nombre}</td>
                        <td className="px-3 py-2 text-right">{num(p.unidades)}</td>
                        <td className="px-3 py-2 text-right">{clp(p.monto)}</td>
                        <td className="px-3 py-2 text-right">{clp(p.margen)}</td>
                        <td className="px-3 py-2 text-right">{k.ventasTotales ? ((p.monto / k.ventasTotales) * 100).toFixed(1) : '0'}%</td>
                      </tr>
                    ))}
                    {data.productos.length > 0 && (
                      <tr className="bg-gray-50 font-semibold">
                        <td className="px-3 py-2" colSpan={2}>Total</td>
                        <td className="px-3 py-2 text-right">{num(k.unidadesVendidas)}</td>
                        <td className="px-3 py-2 text-right">{clp(k.ventasTotales)}</td>
                        <td className="px-3 py-2 text-right">{clp(k.margenBruto)}</td>
                        <td className="px-3 py-2 text-right">100%</td>
                      </tr>
                    )}
                  </tbody>
                </table>
                {data.productos.length === 0 && <Vacio />}
              </div>
            )}
          </Panel>
        </div>
      )}
    </div>
  )
}

function StatCard({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: 'warn' | 'danger' }) {
  const color = tone === 'danger' ? 'text-red-600' : tone === 'warn' ? 'text-amber-600' : 'text-gray-900'
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
      {hint && <p className="text-xs text-gray-400 mt-1">{hint}</p>}
    </div>
  )
}

function Panel({ titulo, acciones, className = '', children }: { titulo: string; acciones?: React.ReactNode; className?: string; children: React.ReactNode }) {
  return (
    <section className={`bg-white rounded-xl shadow-sm border border-gray-200 p-4 ${className}`}>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <h2 className="text-sm font-semibold text-gray-700">{titulo}</h2>
        {acciones}
      </div>
      {children}
    </section>
  )
}

function Toggle<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: Partial<Record<T, string>> }) {
  return (
    <div className="flex rounded-lg bg-gray-100 p-0.5">
      {(Object.entries(options) as [T, string][]).map(([v, l]) => (
        <button
          key={v}
          onClick={() => onChange(v)}
          className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
            value === v ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          {l}
        </button>
      ))}
    </div>
  )
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-xs text-gray-500">
      {label}
      {children}
    </label>
  )
}

function Vacio() {
  return <p className="py-8 text-center text-sm text-gray-400">Sin datos para el periodo seleccionado</p>
}
