import { useEffect, useState } from 'react'
import { Bar, BarChart, CartesianGrid, Line, ComposedChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import {
  bajaActivo,
  conciliar,
  crearActivo,
  crearBanco,
  desconciliar,
  getActivos,
  getBancos,
  getCuentasContables,
  getFlujo,
  getMovimientosBanco,
  getSugerencias,
  importarCartola,
} from '@/api'
import type { ActivoFijo, CandidatoConciliacion, CuentaBancaria, CuentaContable, FlujoCaja, MovimientoBancario } from '@/types'
import { mensajeError } from '@/utils/contabilidad'
import { clp } from '@/utils/formato'

type Pestana = 'flujo' | 'bancos' | 'activos'
const input = 'border border-gray-300 rounded-lg px-3 py-2 text-[15px] w-full'
const hoy = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const corta = (f: string) => `${f.slice(8, 10)}/${f.slice(5, 7)}`

export default function FinanzasPage() {
  const [pestana, setPestana] = useState<Pestana>('flujo')
  return (
    <div className="space-y-5 max-w-6xl">
      <h1 className="text-xl font-semibold text-gray-900">Bancos y flujo de caja</h1>
      <div className="flex gap-1 border-b border-gray-200 overflow-x-auto">
        {([['flujo', '¿Me alcanza la plata?'], ['bancos', 'Bancos y conciliación'], ['activos', 'Activos fijos']] as const).map(([id, label]) => (
          <button key={id} onClick={() => setPestana(id)}
            className={`px-4 py-2 text-sm font-medium -mb-px border-b-2 whitespace-nowrap ${pestana === id ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-500'}`}>
            {label}
          </button>
        ))}
      </div>
      {pestana === 'flujo' && <Flujo />}
      {pestana === 'bancos' && <Bancos />}
      {pestana === 'activos' && <Activos />}
    </div>
  )
}

function Flujo() {
  const [semanas, setSemanas] = useState(12)
  const [f, setF] = useState<FlujoCaja | null>(null)
  const [abierta, setAbierta] = useState<number | null>(null)
  const [error, setError] = useState('')
  useEffect(() => { getFlujo(semanas).then((r) => setF(r.data)).catch((e) => setError(mensajeError(e))) }, [semanas])
  if (!f) return <p className="text-sm text-gray-500">{error || 'Calculando...'}</p>
  const datos = f.semanas.map((s) => ({ semana: corta(s.desde), Entradas: s.entradas, Salidas: -s.salidas, Saldo: s.saldo }))
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-xl bg-white border border-gray-200 p-4"><p className="text-sm text-gray-500">Disponible hoy (caja, banco y tarjetas por depositar)</p><p className="text-2xl font-semibold">{clp(f.saldoInicial)}</p></div>
        <div className={`rounded-xl p-4 sm:col-span-2 ${f.alerta ? 'bg-red-50 text-red-900' : 'bg-green-50 text-green-900'}`}>
          <p className="font-medium">{f.alerta ?? `Con lo que se cobra y se paga en las próximas ${semanas} semanas, la plata alcanza.`}</p>
          <p className="text-sm mt-1">Considera cobros a crédito, facturas y gastos por pagar, productores, trabajadores e IVA del F29.</p>
        </div>
      </div>
      <div className="flex justify-end">
        <select value={semanas} onChange={(e) => setSemanas(Number(e.target.value))} className="border border-gray-300 rounded-lg px-3 py-2 text-sm">
          {[4, 8, 12, 26].map((n) => <option key={n} value={n}>Próximas {n} semanas</option>)}
        </select>
      </div>
      <div className="bg-white rounded-xl border border-gray-200 p-4 h-72">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={datos}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="semana" fontSize={12} />
            <YAxis fontSize={12} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
            <Tooltip formatter={(v) => clp(Number(v))} />
            <Bar dataKey="Entradas" fill="#10B981" />
            <Bar dataKey="Salidas" fill="#F97316" />
            <Line dataKey="Saldo" stroke="#2563EB" strokeWidth={2} dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100 text-sm">
        {f.semanas.map((s, i) => (
          <div key={s.desde}>
            <button onClick={() => setAbierta(abierta === i ? null : i)} className="w-full flex justify-between px-4 py-2 hover:bg-gray-50">
              <span>Semana del {corta(s.desde)} al {corta(s.hasta)}{i === 0 ? ' (incluye lo atrasado)' : ''}</span>
              <span className="flex gap-4">
                <span className="text-green-700">{s.entradas ? `+${clp(s.entradas)}` : '—'}</span>
                <span className="text-orange-700">{s.salidas ? `-${clp(s.salidas)}` : '—'}</span>
                <b className={s.saldo < 0 ? 'text-red-700' : ''}>{clp(s.saldo)}</b>
              </span>
            </button>
            {abierta === i && (
              <ul className="px-6 pb-2 text-gray-600">
                {s.detalle.map((d, j) => <li key={j} className="flex justify-between"><span>{corta(d.fecha)} · {d.detalle}</span><span>{clp(d.monto)}</span></li>)}
                {s.detalle.length === 0 && <li className="text-gray-400">Sin movimientos</li>}
              </ul>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function Bancos() {
  const [bancos, setBancos] = useState<CuentaBancaria[]>([])
  const [sel, setSel] = useState('')
  const [movs, setMovs] = useState<MovimientoBancario[]>([])
  const [soloPendientes, setSoloPendientes] = useState(true)
  const [cuentas, setCuentas] = useState<CuentaContable[]>([])
  const [nuevo, setNuevo] = useState({ banco: '', numero: '', saldoInicial: '', fechaSaldoInicial: hoy() })
  const [msg, setMsg] = useState('')
  const cargarBancos = () => getBancos().then((r) => { setBancos(r.data); setSel((s) => s || r.data[0]?.id || '') })
  const cargarMovs = () => sel && getMovimientosBanco(sel, soloPendientes).then((r) => setMovs(r.data))
  useEffect(() => { cargarBancos(); getCuentasContables().then((r) => setCuentas(r.data.filter((c) => c.activa && c.codigo !== '1102'))) }, [])
  useEffect(() => { cargarMovs() }, [sel, soloPendientes])
  const refrescar = () => { cargarBancos(); cargarMovs() }
  const subir = async (archivo: File | undefined) => {
    if (!archivo) return
    setMsg('')
    try {
      const { data } = await importarCartola(sel, await archivo.text())
      setMsg(`Cartola leída: ${data.nuevos} movimientos nuevos${data.repetidos ? `, ${data.repetidos} ya estaban` : ''}.`)
      refrescar()
    } catch (e) {
      setMsg(mensajeError(e))
    }
  }
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        {bancos.map((b) => (
          <button key={b.id} onClick={() => setSel(b.id)} className={`rounded-xl border px-4 py-3 text-left ${sel === b.id ? 'border-blue-600 bg-blue-50' : 'border-gray-200 bg-white'}`}>
            <p className="font-medium">{b.alias || b.banco} <span className="text-gray-500 text-sm">{b.numero}</span></p>
            <p className="text-sm">Saldo según cartola {clp(b.saldoCartola)}</p>
            {b.porConciliar > 0 && <p className="text-sm text-amber-700">{b.porConciliar} por conciliar</p>}
          </button>
        ))}
        <div className="rounded-xl border border-dashed border-gray-300 bg-white p-3 grid grid-cols-2 gap-2 text-sm w-full sm:w-auto">
          <input placeholder="Banco" value={nuevo.banco} onChange={(e) => setNuevo({ ...nuevo, banco: e.target.value })} className={input} />
          <input placeholder="N° cuenta" value={nuevo.numero} onChange={(e) => setNuevo({ ...nuevo, numero: e.target.value })} className={input} />
          <input placeholder="Saldo inicial" inputMode="numeric" value={nuevo.saldoInicial} onChange={(e) => setNuevo({ ...nuevo, saldoInicial: e.target.value.replace(/[^\d-]/g, '') })} className={input} />
          <input type="date" value={nuevo.fechaSaldoInicial} onChange={(e) => setNuevo({ ...nuevo, fechaSaldoInicial: e.target.value })} className={input} />
          <button disabled={nuevo.banco.trim().length < 2 || nuevo.numero.trim().length < 3}
            onClick={() => crearBanco({ ...nuevo, saldoInicial: Number(nuevo.saldoInicial) || 0 }).then(() => { setNuevo({ banco: '', numero: '', saldoInicial: '', fechaSaldoInicial: hoy() }); cargarBancos() }).catch((e) => setMsg(mensajeError(e)))}
            className="col-span-2 px-3 py-2 rounded-lg border border-gray-300 disabled:opacity-50">Agregar cuenta bancaria</button>
        </div>
      </div>
      {sel && (
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <label className="px-4 py-2 rounded-lg bg-blue-600 text-white cursor-pointer">
            Subir cartola (CSV)
            <input type="file" accept=".csv,text/csv,text/plain" className="hidden" onChange={(e) => { subir(e.target.files?.[0]); e.target.value = '' }} />
          </label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={soloPendientes} onChange={(e) => setSoloPendientes(e.target.checked)} /> Solo por conciliar</label>
          <span className="text-gray-500">Columnas: Fecha, Descripción y Monto (o Cargo y Abono).</span>
        </div>
      )}
      {msg && <p className="text-sm text-gray-700">{msg}</p>}
      <div className="space-y-2">
        {movs.map((m) => <FilaMovimiento key={m.id} m={m} cuentas={cuentas} onCambio={refrescar} />)}
        {sel && movs.length === 0 && <p className="text-sm text-gray-400">{soloPendientes ? 'Todo conciliado.' : 'Sin movimientos. Sube la cartola del banco.'}</p>}
      </div>
    </div>
  )
}

function FilaMovimiento({ m, cuentas, onCambio }: { m: MovimientoBancario; cuentas: CuentaContable[]; onCambio: () => void }) {
  const [sugerencias, setSugerencias] = useState<CandidatoConciliacion[] | null>(null)
  const [cuenta, setCuenta] = useState('')
  const [error, setError] = useState('')
  const conciliado = m.conciliadoTipo || m.cuentaCodigo
  const accion = (fn: () => Promise<unknown>) => fn().then(onCambio).catch((e) => setError(mensajeError(e)))
  return (
    <div className="bg-white rounded-xl border border-gray-200 px-4 py-3 text-sm space-y-2">
      <div className="flex flex-wrap justify-between gap-2">
        <span>{m.fecha.slice(0, 10)} · {m.descripcion}</span>
        <span className="flex gap-3 items-center">
          <b className={Number(m.monto) < 0 ? 'text-orange-700' : 'text-green-700'}>{clp(m.monto)}</b>
          {conciliado ? (
            <>
              <span className="text-green-700">✓ {m.cuenta?.nombre ?? m.conciliadoTipo}</span>
              <button onClick={() => accion(() => desconciliar(m.id))} className="text-xs text-gray-500 hover:underline">Deshacer</button>
            </>
          ) : (
            !sugerencias && <button onClick={() => getSugerencias(m.id).then((r) => setSugerencias(r.data))} className="text-blue-700 hover:underline">Conciliar</button>
          )}
        </span>
      </div>
      {!conciliado && sugerencias && (
        <div className="rounded-lg bg-gray-50 p-3 space-y-2">
          {sugerencias.length > 0 ? (
            <>
              <p className="text-gray-600">¿Es alguno de estos?</p>
              {sugerencias.map((s) => (
                <button key={`${s.tipo}${s.id}`} onClick={() => accion(() => conciliar(m.id, { tipo: s.tipo, id: s.id }))} className="block w-full text-left px-3 py-2 rounded bg-white border border-gray-200 hover:border-blue-500">
                  {s.fecha} · {s.detalle}
                </button>
              ))}
            </>
          ) : (
            <p className="text-gray-600">No hay un documento registrado por {clp(m.monto)} en esas fechas.</p>
          )}
          <div className="flex gap-2 items-center">
            <span className="text-gray-600 whitespace-nowrap">O clasificar como:</span>
            <select value={cuenta} onChange={(e) => setCuenta(e.target.value)} className="flex-1 border border-gray-300 rounded-lg px-2 py-1.5">
              <option value="">Elige...</option>
              <option value="1103">Depósito de ventas con tarjeta</option>
              <option value="5114">Comisión o gasto bancario</option>
              <option value="4104">Intereses ganados</option>
              <option value="3101">Aporte o retiro del dueño</option>
              {cuentas.map((c) => <option key={c.codigo} value={c.codigo}>{c.codigo} {c.nombre}</option>)}
            </select>
            <button disabled={!cuenta} onClick={() => accion(() => conciliar(m.id, { cuentaCodigo: cuenta }))} className="px-3 py-1.5 rounded bg-blue-600 text-white disabled:opacity-50">Listo</button>
          </div>
        </div>
      )}
      {error && <p className="text-red-600">{error}</p>}
    </div>
  )
}

function Activos() {
  const [lista, setLista] = useState<ActivoFijo[]>([])
  const [f, setF] = useState({ nombre: '', categoria: 'Maquinaria', fechaCompra: hoy(), valorCompra: '', ivaCredito: '', valorResidual: '', vidaUtilMeses: '60', medioPago: 'Transferencia' })
  const [error, setError] = useState('')
  const cargar = () => getActivos().then((r) => setLista(r.data))
  useEffect(() => { cargar() }, [])
  const guardar = async () => {
    setError('')
    try {
      await crearActivo({
        nombre: f.nombre, categoria: f.categoria, fechaCompra: f.fechaCompra, valorCompra: Number(f.valorCompra), ivaCredito: Number(f.ivaCredito) || 0,
        valorResidual: Number(f.valorResidual) || 0, vidaUtilMeses: Number(f.vidaUtilMeses), medioPago: f.medioPago || undefined,
      })
      setF({ ...f, nombre: '', valorCompra: '', ivaCredito: '', valorResidual: '' })
      cargar()
    } catch (e) {
      setError(mensajeError(e))
    }
  }
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value })
  const datos = lista.filter((a) => a.estado === 'ACTIVO').map((a) => ({ nombre: a.nombre, 'Valor libro': Number(a.valorLibro), Depreciado: Number(a.acumulada) }))
  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-gray-200 p-4 grid grid-cols-1 sm:grid-cols-4 gap-3 text-sm items-end">
        <label className="text-gray-600 sm:col-span-2">Qué compraste<input placeholder="Ej: Tractor John Deere 5075" value={f.nombre} onChange={set('nombre')} className={input} /></label>
        <label className="text-gray-600">Tipo<select value={f.categoria} onChange={set('categoria')} className={input}>{['Maquinaria', 'Vehículos', 'Construcciones', 'Equipos', 'Muebles', 'Plantaciones', 'Otros'].map((c) => <option key={c}>{c}</option>)}</select></label>
        <label className="text-gray-600">Fecha de compra<input type="date" value={f.fechaCompra} onChange={set('fechaCompra')} className={input} /></label>
        <label className="text-gray-600">Valor neto<input inputMode="numeric" value={f.valorCompra} onChange={set('valorCompra')} className={input} /></label>
        <label className="text-gray-600">IVA de la factura<input inputMode="numeric" value={f.ivaCredito} onChange={set('ivaCredito')} className={input} /></label>
        <label className="text-gray-600">Vida útil (meses)<input inputMode="numeric" value={f.vidaUtilMeses} onChange={set('vidaUtilMeses')} className={input} /></label>
        <label className="text-gray-600">Valor al final de su vida<input inputMode="numeric" value={f.valorResidual} onChange={set('valorResidual')} className={input} placeholder="0" /></label>
        <label className="text-gray-600">Cómo se pagó<select value={f.medioPago} onChange={set('medioPago')} className={input}><option value="Transferencia">Transferencia</option><option value="Efectivo">Efectivo</option><option value="">Se debe al proveedor</option></select></label>
        <button onClick={guardar} disabled={f.nombre.trim().length < 2 || !(Number(f.valorCompra) > 0) || !(Number(f.vidaUtilMeses) > 0)} className="px-4 py-2 rounded-lg bg-blue-600 text-white disabled:opacity-50">Registrar activo</button>
        {error && <p className="sm:col-span-4 text-red-600">{error}</p>}
        <p className="sm:col-span-4 text-gray-500">Se deprecia en línea recta desde el mes siguiente a la compra; el asiento mensual se hace solo.</p>
      </div>
      {datos.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={datos} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" fontSize={12} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
              <YAxis type="category" dataKey="nombre" fontSize={12} width={140} />
              <Tooltip formatter={(v) => clp(Number(v))} />
              <Bar dataKey="Valor libro" stackId="a" fill="#2563EB" />
              <Bar dataKey="Depreciado" stackId="a" fill="#CBD5E1" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
            <tr><th className="px-3 py-2 text-left">Activo</th><th className="px-3 py-2 text-left">Compra</th><th className="px-3 py-2 text-right">Valor</th><th className="px-3 py-2 text-right">Cuota mensual</th><th className="px-3 py-2 text-right">Depreciado</th><th className="px-3 py-2 text-right">Valor libro</th><th className="px-3 py-2" /></tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {lista.map((a) => (
              <tr key={a.id} className={a.estado === 'BAJA' ? 'text-gray-400' : ''}>
                <td className="px-3 py-2">{a.nombre} <span className="text-gray-400">{a.categoria}</span></td>
                <td className="px-3 py-2">{a.fechaCompra.slice(0, 10)}</td>
                <td className="px-3 py-2 text-right">{clp(a.valorCompra)}</td>
                <td className="px-3 py-2 text-right">{clp(a.cuotaMensual)}</td>
                <td className="px-3 py-2 text-right">{clp(a.acumulada)}</td>
                <td className="px-3 py-2 text-right">{clp(a.valorLibro)}</td>
                <td className="px-3 py-2 text-right">
                  {a.estado === 'ACTIVO' ? (
                    <button onClick={() => { const fecha = prompt('Fecha de baja (AAAA-MM-DD):', hoy()); if (fecha) bajaActivo(a.id, fecha).then(cargar).catch((e) => setError(mensajeError(e))) }} className="text-xs text-red-600 hover:underline">Dar de baja</button>
                  ) : `Baja ${a.fechaBaja?.slice(0, 10)}`}
                </td>
              </tr>
            ))}
            {lista.length === 0 && <tr><td colSpan={7} className="px-3 py-6 text-center text-gray-400">Sin activos registrados</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}
