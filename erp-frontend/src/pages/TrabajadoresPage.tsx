import { useEffect, useState } from 'react'
import {
  actualizarF30,
  crearAnticipoTrabajador,
  crearLabor,
  crearTrabajador,
  eliminarLabor,
  getAlertasContratistas,
  getLabores,
  getLiquidaciones,
  getPredios,
  getProveedores,
  getTemporadas,
  getTrabajadores,
  liquidarTrabajador,
} from '@/api'
import type { Entidad, Labor, LiquidacionTrabajador, Predio, Temporada, Trabajador } from '@/types'
import { montoLabor, temporadaVigente } from '@/utils/campo'
import { mensajeError } from '@/utils/contabilidad'
import { descargarCsv } from '@/utils/csv'
import { clp } from '@/utils/formato'

const input = 'border border-gray-300 rounded-lg px-3 py-2 text-[15px] w-full'
const hoy = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const UNIDADES: Record<string, string> = { DIA: 'día', HORA: 'hora', KG: 'kg', CAJA: 'caja', BIN: 'bin', PLANTA: 'planta', UN: 'unidad' }

export default function TrabajadoresPage() {
  const [trabajadores, setTrabajadores] = useState<Trabajador[]>([])
  const [contratistas, setContratistas] = useState<Entidad[]>([])
  const [alertas, setAlertas] = useState<{ id: string; nombreRazonSocial: string; f30Vigencia: string | null }[]>([])
  const [version, setVersion] = useState(0)
  const recargar = () => setVersion((v) => v + 1)
  useEffect(() => {
    getTrabajadores().then((r) => setTrabajadores(r.data))
    getAlertasContratistas().then((r) => setAlertas(r.data))
  }, [version])
  useEffect(() => { getProveedores().then((r) => setContratistas(r.data)) }, [])

  return (
    <div className="space-y-5 max-w-6xl">
      <h1 className="text-xl font-semibold text-gray-900">Trabajadores de temporada</h1>
      {alertas.length > 0 && (
        <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-amber-900 text-sm space-y-1">
          <p><b>Certificado F30-1 vencido o sin registrar.</b> Si el contratista no paga las cotizaciones, responde tu empresa.</p>
          {alertas.map((a) => <F30 key={a.id} contratista={a} onListo={recargar} />)}
        </div>
      )}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-5">
          <RegistrarLabor trabajadores={trabajadores.filter((t) => t.activo)} onListo={recargar} />
          <Pendientes trabajadores={trabajadores} version={version} onCambio={recargar} />
        </div>
        <aside className="space-y-5">
          <NuevoTrabajador contratistas={contratistas} onListo={recargar} />
          <Liquidaciones version={version} />
        </aside>
      </div>
    </div>
  )
}

function F30({ contratista, onListo }: { contratista: { id: string; nombreRazonSocial: string; f30Vigencia: string | null }; onListo: () => void }) {
  const [fecha, setFecha] = useState('')
  return (
    <p className="flex flex-wrap items-center gap-2">
      {contratista.nombreRazonSocial} {contratista.f30Vigencia ? `(venció el ${contratista.f30Vigencia.slice(0, 10)})` : '(sin certificado)'} · nuevo vence el
      <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="border border-amber-300 rounded px-2 py-1 bg-white" />
      <button disabled={!fecha} onClick={() => actualizarF30(contratista.id, fecha).then(onListo)} className="px-2 py-1 rounded bg-amber-600 text-white disabled:opacity-50">Guardar</button>
    </p>
  )
}

function RegistrarLabor({ trabajadores, onListo }: { trabajadores: Trabajador[]; onListo: () => void }) {
  const [predios, setPredios] = useState<Predio[]>([])
  const [temporadas, setTemporadas] = useState<Temporada[]>([])
  const [f, setF] = useState({ trabajadorId: '', fecha: hoy(), tipo: 'JORNADA', descripcion: '', cantidad: '1', unidad: 'DIA', tarifa: '', cuartelId: '' })
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null)
  useEffect(() => {
    getPredios().then((r) => setPredios(r.data)).catch(() => {})
    getTemporadas().then((r) => setTemporadas(r.data)).catch(() => {})
  }, [])
  const trabajador = trabajadores.find((t) => t.id === f.trabajadorId)
  const tarifa = f.tarifa ? Number(f.tarifa) : f.tipo === 'JORNADA' ? Number(trabajador?.valorJornada ?? 0) : 0
  const temporada = temporadaVigente(temporadas, f.fecha)
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value })
  const guardar = async () => {
    setMsg(null)
    try {
      const { data } = await crearLabor({
        trabajadorId: f.trabajadorId, fecha: f.fecha, tipo: f.tipo, descripcion: f.descripcion, cantidad: Number(f.cantidad), unidad: f.unidad,
        tarifa: f.tarifa ? Number(f.tarifa) : undefined, cuartelId: f.cuartelId || undefined, temporadaId: f.cuartelId ? temporada?.id : undefined,
      })
      setMsg({ ok: !data.advertencia, texto: data.advertencia ?? `Anotado: ${clp(data.monto)} para ${trabajador?.nombre}.` })
      setF({ ...f, trabajadorId: '', cantidad: f.tipo === 'JORNADA' ? '1' : '', tarifa: f.tipo === 'JORNADA' ? '' : f.tarifa })
      onListo()
    } catch (e) {
      setMsg({ ok: false, texto: mensajeError(e) })
    }
  }
  return (
    <section className="bg-white rounded-xl border border-gray-200 p-4 space-y-3 text-sm">
      <h2 className="font-semibold text-base">Anotar trabajo del día</h2>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <label className="text-gray-600">Trabajador<select value={f.trabajadorId} onChange={set('trabajadorId')} className={input}><option value="">Elige...</option>{trabajadores.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}</select></label>
        <label className="text-gray-600">Fecha<input type="date" value={f.fecha} onChange={set('fecha')} className={input} /></label>
        <label className="text-gray-600">Cómo se paga
          <select value={f.tipo} onChange={(e) => setF({ ...f, tipo: e.target.value, unidad: e.target.value === 'JORNADA' ? 'DIA' : 'KG', cantidad: e.target.value === 'JORNADA' ? '1' : '' })} className={input}>
            <option value="JORNADA">Por día (jornada)</option>
            <option value="TRATO">Por lo que produce (trato)</option>
          </select>
        </label>
        <label className="text-gray-600">Labor<input placeholder="Ej: poda, cosecha, riego" value={f.descripcion} onChange={set('descripcion')} className={input} /></label>
        <label className="text-gray-600">Cantidad
          <div className="flex gap-2">
            <input inputMode="decimal" value={f.cantidad} onChange={set('cantidad')} className={input} />
            <select value={f.unidad} onChange={set('unidad')} className="border border-gray-300 rounded-lg px-2">
              {Object.entries(UNIDADES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
        </label>
        <label className="text-gray-600">{f.tipo === 'JORNADA' ? 'Valor día (vacío = el del trabajador)' : `Pago por ${UNIDADES[f.unidad]}`}<input inputMode="numeric" value={f.tarifa} onChange={set('tarifa')} className={input} /></label>
        <label className="text-gray-600 sm:col-span-2">Cuartel (opcional, para el costo por kilo)
          <select value={f.cuartelId} onChange={set('cuartelId')} className={input}>
            <option value="">Sin cuartel</option>
            {predios.flatMap((p) => p.cuarteles.map((c) => <option key={c.id} value={c.id}>{p.nombre} · {c.nombre}</option>))}
          </select>
        </label>
        <div className="self-end text-right">
          <p className="text-gray-600">Total: <b>{clp(montoLabor(Number(f.cantidad) || 0, tarifa))}</b></p>
        </div>
      </div>
      {f.cuartelId && !temporada && <p className="text-amber-700">No hay una temporada que incluya esa fecha; créala en Mi campo.</p>}
      {msg && <p className={msg.ok ? 'text-green-700' : 'text-amber-700'}>{msg.texto}</p>}
      <button onClick={guardar} disabled={!f.trabajadorId || f.descripcion.trim().length < 2 || !(Number(f.cantidad) > 0) || (f.tipo === 'TRATO' && !f.tarifa) || (!!f.cuartelId && !temporada)}
        className="px-4 py-2 rounded-lg bg-blue-600 text-white disabled:opacity-50">Anotar</button>
    </section>
  )
}

function Pendientes({ trabajadores, version, onCambio }: { trabajadores: Trabajador[]; version: number; onCambio: () => void }) {
  const [labores, setLabores] = useState<Labor[]>([])
  const [msg, setMsg] = useState('')
  useEffect(() => { getLabores({ pendientes: true }).then((r) => setLabores(r.data)) }, [version])
  const porTrabajador = new Map<string, Labor[]>()
  for (const l of labores) {
    const t = trabajadores.find((x) => x.rut === l.trabajador.rut)
    if (t) porTrabajador.set(t.id, [...(porTrabajador.get(t.id) ?? []), l])
  }
  const accion = async (fn: () => Promise<unknown>, ok: string) => {
    setMsg('')
    try {
      await fn()
      setMsg(ok)
      onCambio()
    } catch (e) {
      setMsg(mensajeError(e))
    }
  }
  return (
    <section className="bg-white rounded-xl border border-gray-200 p-4 space-y-3 text-sm">
      <h2 className="font-semibold text-base">Por pagar</h2>
      {msg && <p className="text-gray-700">{msg}</p>}
      {[...porTrabajador.entries()].map(([id, ls]) => {
        const t = trabajadores.find((x) => x.id === id)!
        const total = ls.reduce((s, l) => s + Number(l.monto), 0)
        return (
          <details key={id} className="rounded-lg bg-gray-50 px-3 py-2">
            <summary className="flex flex-wrap justify-between gap-2 cursor-pointer">
              <span className="font-medium">{t.nombre} {t.contratista && <span className="text-gray-500 font-normal">({t.contratista.nombreRazonSocial})</span>}</span>
              <span className="flex gap-3 items-center">
                <b>{clp(total)}</b>
                <button onClick={(e) => { e.preventDefault(); const m = prompt(`Anticipo en efectivo para ${t.nombre}:`); if (m && Number(m) > 0) accion(() => crearAnticipoTrabajador({ trabajadorId: id, monto: Number(m), medioPago: 'Efectivo' }), 'Anticipo registrado.') }}
                  className="text-blue-700 hover:underline">Anticipo</button>
                <button onClick={(e) => { e.preventDefault(); if (confirm(`¿Pagar a ${t.nombre} lo pendiente hasta hoy por transferencia? Se descuentan sus anticipos.`)) accion(() => liquidarTrabajador({ trabajadorId: id, hasta: hoy(), medioPago: 'Transferencia' }), `Pago a ${t.nombre} registrado.`) }}
                  className="px-3 py-1 rounded bg-blue-600 text-white">Pagar</button>
              </span>
            </summary>
            <ul className="mt-2 space-y-1">
              {ls.map((l) => (
                <li key={l.id} className="flex justify-between text-gray-600">
                  <span>{l.fecha.slice(0, 10)} · {l.descripcion} · {Number(l.cantidad).toLocaleString('es-CL')} {UNIDADES[l.unidad] ?? l.unidad}{l.cuartel ? ` · ${l.cuartel.nombre}` : ''}</span>
                  <span className="flex gap-2">{clp(l.monto)}<button onClick={() => accion(() => eliminarLabor(l.id), 'Labor eliminada.')} className="text-red-600 text-xs hover:underline">Quitar</button></span>
                </li>
              ))}
            </ul>
          </details>
        )
      })}
      {porTrabajador.size === 0 && <p className="text-gray-400">Nada pendiente de pago.</p>}
    </section>
  )
}

function NuevoTrabajador({ contratistas, onListo }: { contratistas: Entidad[]; onListo: () => void }) {
  const [f, setF] = useState({ rut: '', nombre: '', tipo: 'PROPIO', contratistaId: '', valorJornada: '' })
  const [error, setError] = useState('')
  const guardar = async () => {
    setError('')
    try {
      await crearTrabajador({ rut: f.rut.trim(), nombre: f.nombre.trim(), tipo: f.tipo, contratistaId: f.tipo === 'CONTRATISTA' ? f.contratistaId : undefined, valorJornada: Number(f.valorJornada) || 0 })
      setF({ rut: '', nombre: '', tipo: f.tipo, contratistaId: f.contratistaId, valorJornada: f.valorJornada })
      onListo()
    } catch (e) {
      setError(mensajeError(e))
    }
  }
  return (
    <section className="bg-white rounded-xl border border-gray-200 p-4 space-y-2 text-sm">
      <h2 className="font-semibold text-base">Nuevo trabajador</h2>
      <input placeholder="RUT (12345678-5)" value={f.rut} onChange={(e) => setF({ ...f, rut: e.target.value })} className={input} />
      <input placeholder="Nombre completo" value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} className={input} />
      <select value={f.tipo} onChange={(e) => setF({ ...f, tipo: e.target.value })} className={input}>
        <option value="PROPIO">Contratado por mí</option>
        <option value="CONTRATISTA">Viene de un contratista</option>
      </select>
      {f.tipo === 'CONTRATISTA' && (
        <select value={f.contratistaId} onChange={(e) => setF({ ...f, contratistaId: e.target.value })} className={input}>
          <option value="">Empresa contratista...</option>
          {contratistas.map((c) => <option key={c.id} value={c.id}>{c.nombreRazonSocial}</option>)}
        </select>
      )}
      <input placeholder="Valor del día (opcional)" inputMode="numeric" value={f.valorJornada} onChange={(e) => setF({ ...f, valorJornada: e.target.value.replace(/\D/g, '') })} className={input} />
      {error && <p className="text-red-600">{error}</p>}
      <button onClick={guardar} disabled={!f.rut.trim() || f.nombre.trim().length < 3 || (f.tipo === 'CONTRATISTA' && !f.contratistaId)} className="w-full px-3 py-2 rounded-lg bg-blue-600 text-white disabled:opacity-50">Agregar</button>
    </section>
  )
}

function Liquidaciones({ version }: { version: number }) {
  const [lista, setLista] = useState<LiquidacionTrabajador[]>([])
  useEffect(() => { getLiquidaciones().then((r) => setLista(r.data)) }, [version])
  const exportar = () =>
    descargarCsv('pagos_trabajadores.csv', [
      ['Fecha pago', 'RUT', 'Nombre', 'Contratista', 'Hasta', 'Total ganado', 'Anticipos', 'Pagado', 'Medio'],
      ...lista.map((l) => [l.fechaPago.slice(0, 10), l.trabajador.rut, l.trabajador.nombre, l.trabajador.contratista?.nombreRazonSocial ?? '', l.hasta.slice(0, 10), l.totalLabores, l.anticipos, l.aPagar, l.medioPago]),
    ])
  return (
    <section className="bg-white rounded-xl border border-gray-200 p-4 space-y-2 text-sm">
      <div className="flex justify-between items-center">
        <h2 className="font-semibold text-base">Pagos hechos</h2>
        <button onClick={exportar} disabled={!lista.length} className="text-blue-700 hover:underline disabled:opacity-50">CSV para remuneraciones</button>
      </div>
      {lista.slice(0, 15).map((l) => (
        <p key={l.id} className="flex justify-between text-gray-600"><span>{l.fechaPago.slice(0, 10)} · {l.trabajador.nombre}</span><span>{clp(l.aPagar)}</span></p>
      ))}
      {lista.length === 0 && <p className="text-gray-400">Todavía no hay pagos.</p>}
      <p className="text-xs text-gray-500">Este registro no calcula cotizaciones ni impuestos: entrégalo a tu contador o súbelo a tu sistema de remuneraciones.</p>
    </section>
  )
}
