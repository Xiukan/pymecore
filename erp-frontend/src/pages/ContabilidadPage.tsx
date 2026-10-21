import { useEffect, useState } from 'react'
import {
  cerrarPeriodo,
  crearAsientoManual,
  eliminarAsientoManual,
  getBalance,
  getCuentasContables,
  getDiario,
  getMayor,
  getPeriodosCerrados,
  getResultados,
  reabrirPeriodo,
} from '@/api'
import type { AsientoContable, Balance, CuentaContable, EstadoResultados, LibroMayor } from '@/types'
import { descargarCsv } from '@/utils/csv'
import { clp } from '@/utils/formato'
import { mensajeError, mesAnterior } from '@/utils/contabilidad'

const pad = (n: number) => String(n).padStart(2, '0')
const hoy = () => {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

type Pestana = 'resultados' | 'balance' | 'diario' | 'mayor' | 'cierre'
const PESTANAS: [Pestana, string][] = [
  ['resultados', 'Ganancias y pérdidas'],
  ['balance', 'Balance'],
  ['diario', 'Libro diario'],
  ['mayor', 'Libro mayor'],
  ['cierre', 'Cierre de mes'],
]

export default function ContabilidadPage() {
  const [pestana, setPestana] = useState<Pestana>('resultados')
  const [desde, setDesde] = useState(`${hoy().slice(0, 4)}-01-01`)
  const [hasta, setHasta] = useState(hoy())
  const conPeriodo = pestana === 'resultados' || pestana === 'balance' || pestana === 'mayor'

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-xl font-semibold text-gray-900">Contabilidad</h1>
        {conPeriodo && (
          <div className="flex items-end gap-2 text-sm">
            <label className="flex flex-col text-gray-600">Desde
              <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2" />
            </label>
            <label className="flex flex-col text-gray-600">Hasta
              <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2" />
            </label>
          </div>
        )}
      </div>
      <div className="flex gap-1 border-b border-gray-200 overflow-x-auto">
        {PESTANAS.map(([id, label]) => (
          <button key={id} onClick={() => setPestana(id)}
            className={`px-4 py-2 text-sm font-medium -mb-px border-b-2 whitespace-nowrap ${pestana === id ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-500'}`}>
            {label}
          </button>
        ))}
      </div>
      {pestana === 'resultados' && <Resultados desde={desde} hasta={hasta} />}
      {pestana === 'balance' && <BalanceTabla desde={desde} hasta={hasta} />}
      {pestana === 'diario' && <Diario />}
      {pestana === 'mayor' && <Mayor desde={desde} hasta={hasta} />}
      {pestana === 'cierre' && <Cierre />}
    </div>
  )
}

function useCarga<T>(cargar: () => Promise<{ data: T }>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState('')
  const [version, setVersion] = useState(0)
  useEffect(() => {
    setError('')
    cargar().then((r) => setData(r.data)).catch((e) => setError(mensajeError(e)))
  }, [...deps, version])
  return { data, error, recargar: () => setVersion((v) => v + 1) }
}

function Resultados({ desde, hasta }: { desde: string; hasta: string }) {
  const { data: r, error } = useCarga<EstadoResultados>(() => getResultados({ desde, hasta }), [desde, hasta])
  if (error) return <p className="text-sm text-red-600">{error}</p>
  if (!r) return <p className="text-sm text-gray-500">Calculando...</p>
  const gano = Number(r.resultado) >= 0
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <section className={`rounded-2xl p-5 ${gano ? 'bg-green-50 text-green-900' : 'bg-red-50 text-red-900'}`}>
        <p className="text-sm">{gano ? 'En este período ganaste' : 'En este período perdiste'}</p>
        <p className="text-3xl font-semibold mt-1">{clp(Math.abs(Number(r.resultado)))}</p>
        <p className="text-sm mt-3">Vendiste {clp(r.totalIngresos)} (sin IVA), te costó {clp(r.totalCostos)} lo que vendiste y gastaste {clp(r.totalGastos)} en el negocio.</p>
      </section>
      <section className="lg:col-span-2 bg-white rounded-xl border border-gray-200 p-5 text-sm space-y-1">
        <Grupo titulo="Ingresos" lineas={r.ingresos} total={r.totalIngresos} />
        <Grupo titulo="Costo de lo vendido" lineas={r.costos} total={r.totalCostos} restar />
        <Fila label="Margen" valor={r.margen} fuerte />
        <Grupo titulo="Gastos del negocio" lineas={r.gastos} total={r.totalGastos} restar />
        <hr className="my-2" />
        <Fila label="Resultado" valor={r.resultado} fuerte />
      </section>
    </div>
  )
}

function Grupo({ titulo, lineas, total, restar }: { titulo: string; lineas: { codigo: string; nombre: string; monto: string }[]; total: string; restar?: boolean }) {
  return (
    <div className="pb-2">
      <p className="font-semibold text-gray-700 pt-2">{titulo}</p>
      {lineas.map((l) => <Fila key={l.codigo} label={l.nombre} valor={l.monto} tenue />)}
      {lineas.length === 0 && <p className="text-gray-400">Sin movimientos</p>}
      <Fila label={`Total ${titulo.toLowerCase()}`} valor={restar ? -Number(total) : total} />
    </div>
  )
}

function Fila({ label, valor, fuerte, tenue }: { label: string; valor: string | number; fuerte?: boolean; tenue?: boolean }) {
  return (
    <div className={`flex justify-between ${fuerte ? 'font-semibold text-gray-900' : tenue ? 'text-gray-500 pl-3' : 'text-gray-700'}`}>
      <span>{label}</span>
      <span>{clp(valor)}</span>
    </div>
  )
}

const COLUMNAS = ['debe', 'haber', 'deudor', 'acreedor', 'activo', 'pasivo', 'perdida', 'ganancia'] as const
const TITULOS = ['Debe', 'Haber', 'Deudor', 'Acreedor', 'Activo', 'Pasivo', 'Pérdida', 'Ganancia']

function BalanceTabla({ desde, hasta }: { desde: string; hasta: string }) {
  const { data: b, error } = useCarga<Balance>(() => getBalance({ desde, hasta }), [desde, hasta])
  if (error) return <p className="text-sm text-red-600">{error}</p>
  if (!b) return <p className="text-sm text-gray-500">Calculando...</p>
  const exportar = () =>
    descargarCsv(`balance_${desde}_${hasta}.csv`, [
      ['Código', 'Cuenta', ...TITULOS],
      ...b.filas.map((f) => [f.codigo, f.nombre, ...COLUMNAS.map((c) => f[c])]),
      ['', 'Totales', ...COLUMNAS.map((c) => b.totales[c])],
    ])
  const r = Number(b.resultado)
  return (
    <div className="space-y-2">
      <div className="flex justify-between items-center">
        <p className="text-sm text-gray-600">Balance de 8 columnas. El resultado del período es {clp(r)}.</p>
        <button onClick={exportar} className="text-sm text-blue-700 hover:underline">Descargar Excel (CSV)</button>
      </div>
      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
            <tr>
              <th className="px-3 py-2 text-left">Cuenta</th>
              {TITULOS.map((t) => <th key={t} className="px-3 py-2 text-right">{t}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {b.filas.map((f) => (
              <tr key={f.codigo}>
                <td className="px-3 py-2 whitespace-nowrap"><span className="text-gray-400">{f.codigo}</span> {f.nombre}</td>
                {COLUMNAS.map((c) => <td key={c} className="px-3 py-2 text-right">{Number(f[c]) ? clp(f[c]) : ''}</td>)}
              </tr>
            ))}
            <tr className="font-semibold bg-gray-50">
              <td className="px-3 py-2">Sumas</td>
              {COLUMNAS.map((c) => <td key={c} className="px-3 py-2 text-right">{clp(b.totales[c])}</td>)}
            </tr>
            <tr className="text-gray-600">
              <td className="px-3 py-2">{r >= 0 ? 'Utilidad' : 'Pérdida'} del período</td>
              <td colSpan={4} />
              <td className="px-3 py-2 text-right">{r < 0 ? clp(-r) : ''}</td>
              <td className="px-3 py-2 text-right">{r >= 0 ? clp(r) : ''}</td>
              <td className="px-3 py-2 text-right">{r >= 0 ? clp(r) : ''}</td>
              <td className="px-3 py-2 text-right">{r < 0 ? clp(-r) : ''}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Diario() {
  const [mes, setMes] = useState(hoy().slice(0, 7))
  const [manual, setManual] = useState(false)
  const { data, error, recargar } = useCarga<{ mes: string; asientos: AsientoContable[] }>(() => getDiario(mes), [mes])
  const eliminar = async (id: string) => {
    if (!confirm('¿Eliminar este asiento manual?')) return
    try {
      await eliminarAsientoManual(id)
      recargar()
    } catch (e) {
      alert(mensajeError(e))
    }
  }
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-gray-600">Cada venta, compra, gasto y pago genera su asiento automáticamente.</p>
        <div className="flex gap-2">
          <input type="month" value={mes} onChange={(e) => setMes(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          <button onClick={() => setManual(true)} className="px-3 py-2 text-sm rounded-lg border border-gray-300">Asiento manual</button>
        </div>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {data && data.asientos.length === 0 && <p className="text-sm text-gray-400">Sin asientos en el mes.</p>}
      <div className="space-y-2">
        {data?.asientos.map((a) => (
          <div key={a.id} className="bg-white rounded-xl border border-gray-200 px-4 py-3 text-sm">
            <div className="flex justify-between">
              <p className="font-medium">{a.fecha} · {a.glosa}</p>
              {a.manual && <button onClick={() => eliminar(a.id)} className="text-xs text-red-600 hover:underline">Eliminar</button>}
            </div>
            <table className="w-full mt-1">
              <tbody>
                {a.lineas.map((l, i) => (
                  <tr key={i} className="text-gray-700">
                    <td className={Number(l.haber) ? 'pl-8' : ''}><span className="text-gray-400">{l.cuenta}</span> {l.nombre}</td>
                    <td className="text-right w-28">{Number(l.debe) ? clp(l.debe) : ''}</td>
                    <td className="text-right w-28">{Number(l.haber) ? clp(l.haber) : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
      {manual && <AsientoManual onCerrar={() => setManual(false)} onGuardado={() => { setManual(false); recargar() }} />}
    </div>
  )
}

function AsientoManual({ onCerrar, onGuardado }: { onCerrar: () => void; onGuardado: () => void }) {
  const [cuentas, setCuentas] = useState<CuentaContable[]>([])
  const [fecha, setFecha] = useState(hoy())
  const [glosa, setGlosa] = useState('')
  const [lineas, setLineas] = useState([{ cuenta: '', debe: '', haber: '' }, { cuenta: '', debe: '', haber: '' }])
  const [error, setError] = useState('')
  useEffect(() => { getCuentasContables().then((r) => setCuentas(r.data.filter((c) => c.activa))) }, [])
  const totalDebe = lineas.reduce((s, l) => s + Number(l.debe || 0), 0)
  const totalHaber = lineas.reduce((s, l) => s + Number(l.haber || 0), 0)
  const cambiar = (i: number, campo: 'cuenta' | 'debe' | 'haber', valor: string) =>
    setLineas(lineas.map((l, j) => (j === i ? { ...l, [campo]: valor, ...(campo === 'debe' && valor ? { haber: '' } : {}), ...(campo === 'haber' && valor ? { debe: '' } : {}) } : l)))
  const guardar = async () => {
    setError('')
    try {
      await crearAsientoManual({
        fecha,
        glosa,
        lineas: lineas.filter((l) => l.cuenta && (l.debe || l.haber)).map((l) => (l.debe ? { cuenta: l.cuenta, debe: Number(l.debe) } : { cuenta: l.cuenta, haber: Number(l.haber) })),
      })
      onGuardado()
    } catch (e) {
      setError(mensajeError(e))
    }
  }
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onCerrar}>
      <div className="bg-white rounded-xl p-5 w-full max-w-2xl text-sm space-y-3" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-semibold">Asiento manual</h2>
        <p className="text-gray-500">Para ajustes del contador (aportes de capital, saldos iniciales, correcciones). Lo de todos los días se registra solo.</p>
        <div className="flex gap-2">
          <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2" />
          <input placeholder="Descripción" value={glosa} onChange={(e) => setGlosa(e.target.value)} className="flex-1 border border-gray-300 rounded-lg px-3 py-2" />
        </div>
        {lineas.map((l, i) => (
          <div key={i} className="flex gap-2">
            <select value={l.cuenta} onChange={(e) => cambiar(i, 'cuenta', e.target.value)} className="flex-1 border border-gray-300 rounded-lg px-2 py-2">
              <option value="">Cuenta...</option>
              {cuentas.map((c) => <option key={c.codigo} value={c.codigo}>{c.codigo} {c.nombre}</option>)}
            </select>
            <input placeholder="Debe" inputMode="numeric" value={l.debe} onChange={(e) => cambiar(i, 'debe', e.target.value.replace(/\D/g, ''))} className="w-28 border border-gray-300 rounded-lg px-2 py-2 text-right" />
            <input placeholder="Haber" inputMode="numeric" value={l.haber} onChange={(e) => cambiar(i, 'haber', e.target.value.replace(/\D/g, ''))} className="w-28 border border-gray-300 rounded-lg px-2 py-2 text-right" />
          </div>
        ))}
        <div className="flex justify-between items-center">
          <button onClick={() => setLineas([...lineas, { cuenta: '', debe: '', haber: '' }])} className="text-blue-700 hover:underline">+ Agregar línea</button>
          <span className={totalDebe === totalHaber && totalDebe > 0 ? 'text-green-700' : 'text-amber-700'}>
            Debe {clp(totalDebe)} · Haber {clp(totalHaber)}
          </span>
        </div>
        {error && <p className="text-red-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <button onClick={onCerrar} className="px-4 py-2 rounded-lg border border-gray-300">Cancelar</button>
          <button onClick={guardar} disabled={totalDebe !== totalHaber || totalDebe === 0 || glosa.trim().length < 3} className="px-4 py-2 rounded-lg bg-blue-600 text-white disabled:opacity-50">Guardar</button>
        </div>
      </div>
    </div>
  )
}

function Mayor({ desde, hasta }: { desde: string; hasta: string }) {
  const [cuentas, setCuentas] = useState<CuentaContable[]>([])
  const [cuenta, setCuenta] = useState('1101')
  useEffect(() => { getCuentasContables().then((r) => setCuentas(r.data)) }, [])
  const { data: m, error } = useCarga<LibroMayor>(() => getMayor(cuenta, { desde, hasta }), [cuenta, desde, hasta])
  return (
    <div className="space-y-3">
      <select value={cuenta} onChange={(e) => setCuenta(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm">
        {cuentas.map((c) => <option key={c.codigo} value={c.codigo}>{c.codigo} {c.nombre}</option>)}
      </select>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {m && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
              <tr>
                <th className="px-3 py-2 text-left">Fecha</th>
                <th className="px-3 py-2 text-left">Detalle</th>
                <th className="px-3 py-2 text-right">Debe</th>
                <th className="px-3 py-2 text-right">Haber</th>
                <th className="px-3 py-2 text-right">Saldo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              <tr className="text-gray-500"><td className="px-3 py-2" colSpan={4}>Saldo inicial</td><td className="px-3 py-2 text-right">{clp(m.saldoInicial)}</td></tr>
              {m.filas.map((f, i) => (
                <tr key={i}>
                  <td className="px-3 py-2 whitespace-nowrap">{f.fecha}</td>
                  <td className="px-3 py-2">{f.glosa}</td>
                  <td className="px-3 py-2 text-right">{Number(f.debe) ? clp(f.debe) : ''}</td>
                  <td className="px-3 py-2 text-right">{Number(f.haber) ? clp(f.haber) : ''}</td>
                  <td className="px-3 py-2 text-right">{clp(f.saldo)}</td>
                </tr>
              ))}
              <tr className="font-semibold bg-gray-50"><td className="px-3 py-2" colSpan={4}>Saldo final</td><td className="px-3 py-2 text-right">{clp(m.saldoFinal)}</td></tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function Cierre() {
  const { data: cerrados, error, recargar } = useCarga(() => getPeriodosCerrados(), [])
  const [mes, setMes] = useState(mesAnterior(new Date()))
  const [msg, setMsg] = useState('')
  const accion = async (fn: () => Promise<unknown>, ok: string) => {
    setMsg('')
    try {
      await fn()
      setMsg(ok)
      recargar()
    } catch (e) {
      setMsg(mensajeError(e))
    }
  }
  return (
    <div className="space-y-4 max-w-2xl">
      <div className="bg-white rounded-xl border border-gray-200 p-5 text-sm space-y-3">
        <p className="text-gray-700">
          Cierra un mes cuando ya lo declaraste al SII. Desde ese momento nadie puede registrar ni anular documentos con fecha de ese mes, y sus números quedan fijos.
        </p>
        <div className="flex gap-2">
          <input type="month" value={mes} onChange={(e) => setMes(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2" />
          <button onClick={() => accion(() => cerrarPeriodo(mes), `Mes ${mes} cerrado.`)} className="px-4 py-2 rounded-lg bg-blue-600 text-white">Cerrar mes</button>
        </div>
        {msg && <p className="text-gray-700">{msg}</p>}
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100 text-sm">
        {(cerrados ?? []).map((p) => (
          <div key={p.mes} className="flex justify-between items-center px-4 py-2">
            <span>{p.mes} · cerrado el {new Date(p.cerradoEn).toLocaleDateString('es-CL')}</span>
            <button onClick={() => confirm(`¿Reabrir ${p.mes}? Se podrán modificar sus documentos.`) && accion(() => reabrirPeriodo(p.mes), `Mes ${p.mes} reabierto.`)}
              className="text-xs text-red-600 hover:underline">Reabrir</button>
          </div>
        ))}
        {cerrados?.length === 0 && <p className="px-4 py-3 text-gray-400">Ningún mes cerrado todavía.</p>}
      </div>
    </div>
  )
}
