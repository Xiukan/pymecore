import { useEffect, useState } from 'react'
import {
  anularAplicacion,
  anularCosecha,
  crearAplicacion,
  crearCosecha,
  crearCuartel,
  crearPredio,
  crearTemporada,
  getAplicaciones,
  getCarencias,
  getCosechas,
  getCostosCampo,
  getItems,
  getPredios,
  getSucursales,
  getTemporadas,
  guardarPresupuesto,
} from '@/api'
import { useAuth } from '@/context/AuthContext'
import type { AplicacionFitosanitaria, Carencia, CategoriaCosto, Cosecha, InformeCostosCampo, Item, Predio, Sucursal, Temporada } from '@/types'
import { descargarCsv } from '@/utils/csv'
import { mensajeError } from '@/utils/contabilidad'
import { clp } from '@/utils/formato'
import { CATEGORIAS_COSTO, temporadaVigente } from '@/utils/campo'

type Pestana = 'campos' | 'cuaderno' | 'cosecha' | 'costos'
const input = 'border border-gray-300 rounded-lg px-3 py-2 text-[15px] w-full'
const hoy = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function CampoPage() {
  const { user } = useAuth()
  const [pestana, setPestana] = useState<Pestana>('campos')
  const [predios, setPredios] = useState<Predio[]>([])
  const [temporadas, setTemporadas] = useState<Temporada[]>([])
  const [temporadaId, setTemporadaId] = useState('')
  const [items, setItems] = useState<Item[]>([])
  const [sucursalId, setSucursalId] = useState(user?.sucursalId ?? '')
  const [carencias, setCarencias] = useState<Carencia[]>([])

  const cargar = () => {
    getPredios().then((r) => setPredios(r.data))
    getCarencias().then((r) => setCarencias(r.data))
    getTemporadas().then((r) => {
      setTemporadas(r.data)
      setTemporadaId((actual) => actual || temporadaVigente(r.data, hoy())?.id || r.data[0]?.id || '')
    })
  }
  useEffect(() => {
    cargar()
    getItems().then((r) => setItems(r.data.filter((i) => i.estado === 'Activo')))
    if (!user?.sucursalId) getSucursales().then((r: { data: Sucursal[] }) => r.data[0] && setSucursalId(r.data[0].id))
  }, [])
  const cuarteles = predios.flatMap((p) => p.cuarteles.filter((c) => c.activo).map((c) => ({ ...c, predio: p.nombre })))

  return (
    <div className="space-y-5 max-w-6xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-gray-900">Mi campo</h1>
        {temporadas.length > 0 && (
          <label className="text-sm text-gray-600 flex items-center gap-2">Temporada
            <select value={temporadaId} onChange={(e) => setTemporadaId(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2">
              {temporadas.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
            </select>
          </label>
        )}
      </div>
      {carencias.length > 0 && (
        <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-amber-900 text-sm">
          <b>No cosechar todavía:</b>{' '}
          {carencias.map((c) => `${c.cuartel.nombre} (${c.cuartel.predio.nombre}) hasta el ${c.cosecharDesde}`).join(' · ')}
        </div>
      )}
      <div className="flex gap-1 border-b border-gray-200 overflow-x-auto">
        {([['campos', 'Predios y cuarteles'], ['cuaderno', 'Cuaderno de campo'], ['cosecha', 'Cosecha'], ['costos', 'Costos y presupuesto']] as const).map(([id, label]) => (
          <button key={id} onClick={() => setPestana(id)}
            className={`px-4 py-2 text-sm font-medium -mb-px border-b-2 whitespace-nowrap ${pestana === id ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-500'}`}>
            {label}
          </button>
        ))}
      </div>
      {pestana === 'campos' && <Campos predios={predios} temporadas={temporadas} carencias={carencias} onCambio={cargar} />}
      {pestana !== 'campos' && !temporadaId && <p className="text-sm text-gray-500">Primero crea una temporada en "Predios y cuarteles".</p>}
      {pestana === 'cuaderno' && temporadaId && <Cuaderno cuarteles={cuarteles} items={items} temporadaId={temporadaId} sucursalId={sucursalId} onCambio={cargar} />}
      {pestana === 'cosecha' && temporadaId && <CosechaTab cuarteles={cuarteles} items={items} temporadaId={temporadaId} sucursalId={sucursalId} carencias={carencias} />}
      {pestana === 'costos' && temporadaId && <Costos temporadaId={temporadaId} esAdmin={user?.rol === 'Administrador'} />}
    </div>
  )
}

function Campos({ predios, temporadas, carencias, onCambio }: { predios: Predio[]; temporadas: Temporada[]; carencias: Carencia[]; onCambio: () => void }) {
  const [predio, setPredio] = useState({ nombre: '', comuna: '', hectareas: '' })
  const [cuartel, setCuartel] = useState({ predioId: '', nombre: '', cultivo: '', variedad: '', hectareas: '' })
  const anio = new Date().getFullYear()
  const [temporada, setTemporada] = useState({ nombre: `${anio}-${anio + 1}`, fechaInicio: `${anio}-07-01`, fechaFin: `${anio + 1}-06-30` })
  const [error, setError] = useState('')
  const accion = async (fn: () => Promise<unknown>, limpiar: () => void) => {
    setError('')
    try {
      await fn()
      limpiar()
      onCambio()
    } catch (e) {
      setError(mensajeError(e))
    }
  }
  const enCarencia = new Map(carencias.map((c) => [c.cuartel.id, c.cosecharDesde]))
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
      <div className="lg:col-span-2 space-y-3">
        {predios.length === 0 && <p className="text-gray-500 text-sm">Todavía no tienes predios. Crea el primero a la derecha.</p>}
        {predios.map((p) => (
          <section key={p.id} className="bg-white rounded-xl border border-gray-200 p-4">
            <h2 className="font-semibold text-gray-900">{p.nombre} <span className="text-sm font-normal text-gray-500">{p.comuna} · {Number(p.hectareas)} ha</span></h2>
            <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
              {p.cuarteles.map((c) => (
                <div key={c.id} className="rounded-lg bg-gray-50 px-3 py-2 text-sm">
                  <p className="font-medium">{c.nombre}</p>
                  <p className="text-gray-600">{c.cultivo}{c.variedad ? ` ${c.variedad}` : ''} · {Number(c.hectareas)} ha</p>
                  {enCarencia.has(c.id) ? (
                    <p className="text-amber-700">En carencia hasta el {enCarencia.get(c.id)}</p>
                  ) : (
                    <p className="text-green-700">Se puede cosechar</p>
                  )}
                </div>
              ))}
              {p.cuarteles.length === 0 && <p className="text-sm text-gray-400">Sin cuarteles</p>}
            </div>
          </section>
        ))}
        <section className="bg-white rounded-xl border border-gray-200 p-4 text-sm">
          <h2 className="font-semibold mb-2">Temporadas</h2>
          {temporadas.map((t) => <p key={t.id} className="text-gray-600">{t.nombre}: {t.fechaInicio.slice(0, 10)} al {t.fechaFin.slice(0, 10)}</p>)}
          <div className="grid grid-cols-3 gap-2 mt-2">
            <input value={temporada.nombre} onChange={(e) => setTemporada({ ...temporada, nombre: e.target.value })} className={input} />
            <input type="date" value={temporada.fechaInicio} onChange={(e) => setTemporada({ ...temporada, fechaInicio: e.target.value })} className={input} />
            <input type="date" value={temporada.fechaFin} onChange={(e) => setTemporada({ ...temporada, fechaFin: e.target.value })} className={input} />
          </div>
          <button onClick={() => accion(() => crearTemporada(temporada), () => {})} className="mt-2 px-3 py-2 rounded-lg border border-gray-300">Crear temporada</button>
        </section>
      </div>
      <aside className="space-y-4">
        <section className="bg-white rounded-xl border border-gray-200 p-4 space-y-2 text-sm">
          <h2 className="font-semibold">Nuevo predio</h2>
          <input placeholder="Nombre (ej: Fundo El Roble)" value={predio.nombre} onChange={(e) => setPredio({ ...predio, nombre: e.target.value })} className={input} />
          <div className="grid grid-cols-2 gap-2">
            <input placeholder="Comuna" value={predio.comuna} onChange={(e) => setPredio({ ...predio, comuna: e.target.value })} className={input} />
            <input placeholder="Hectáreas" inputMode="decimal" value={predio.hectareas} onChange={(e) => setPredio({ ...predio, hectareas: e.target.value })} className={input} />
          </div>
          <button disabled={predio.nombre.trim().length < 2}
            onClick={() => accion(() => crearPredio({ nombre: predio.nombre, comuna: predio.comuna || undefined, hectareas: Number(predio.hectareas) || 0 }), () => setPredio({ nombre: '', comuna: '', hectareas: '' }))}
            className="w-full px-3 py-2 rounded-lg bg-blue-600 text-white disabled:opacity-50">Crear predio</button>
        </section>
        <section className="bg-white rounded-xl border border-gray-200 p-4 space-y-2 text-sm">
          <h2 className="font-semibold">Nuevo cuartel</h2>
          <select value={cuartel.predioId} onChange={(e) => setCuartel({ ...cuartel, predioId: e.target.value })} className={input}>
            <option value="">Predio...</option>
            {predios.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
          <input placeholder="Nombre (ej: Cuartel 3)" value={cuartel.nombre} onChange={(e) => setCuartel({ ...cuartel, nombre: e.target.value })} className={input} />
          <div className="grid grid-cols-2 gap-2">
            <input placeholder="Cultivo" value={cuartel.cultivo} onChange={(e) => setCuartel({ ...cuartel, cultivo: e.target.value })} className={input} />
            <input placeholder="Variedad" value={cuartel.variedad} onChange={(e) => setCuartel({ ...cuartel, variedad: e.target.value })} className={input} />
          </div>
          <input placeholder="Hectáreas" inputMode="decimal" value={cuartel.hectareas} onChange={(e) => setCuartel({ ...cuartel, hectareas: e.target.value })} className={input} />
          <button disabled={!cuartel.predioId || !cuartel.nombre.trim() || cuartel.cultivo.trim().length < 2 || !(Number(cuartel.hectareas) > 0)}
            onClick={() => accion(() => crearCuartel({ ...cuartel, variedad: cuartel.variedad || undefined, hectareas: Number(cuartel.hectareas) }), () => setCuartel({ ...cuartel, nombre: '', variedad: '', hectareas: '' }))}
            className="w-full px-3 py-2 rounded-lg bg-blue-600 text-white disabled:opacity-50">Crear cuartel</button>
        </section>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </aside>
    </div>
  )
}

type CuartelOpcion = { id: string; nombre: string; predio: string; hectareas: string }

function Cuaderno({ cuarteles, items, temporadaId, sucursalId, onCambio }: { cuarteles: CuartelOpcion[]; items: Item[]; temporadaId: string; sucursalId: string; onCambio: () => void }) {
  const [lista, setLista] = useState<AplicacionFitosanitaria[]>([])
  const [f, setF] = useState({ cuartelId: '', itemId: '', fecha: hoy(), objetivo: '', dosisPorHa: '', carenciaDias: '', reingresoHoras: '', aplicador: '', metodo: '' })
  const [error, setError] = useState('')
  const cargar = () => getAplicaciones({ temporadaId }).then((r) => setLista(r.data))
  useEffect(() => { cargar() }, [temporadaId])
  const cuartel = cuarteles.find((c) => c.id === f.cuartelId)
  const total = cuartel && Number(f.dosisPorHa) ? Number(f.dosisPorHa) * Number(cuartel.hectareas) : 0
  const item = items.find((i) => i.id === f.itemId)
  const guardar = async () => {
    setError('')
    try {
      await crearAplicacion({
        cuartelId: f.cuartelId, temporadaId, itemId: f.itemId, sucursalId, fecha: f.fecha, objetivo: f.objetivo,
        dosisPorHa: Number(f.dosisPorHa), carenciaDias: Number(f.carenciaDias), reingresoHoras: Number(f.reingresoHoras) || 0,
        aplicador: f.aplicador, metodo: f.metodo || undefined,
      })
      setF({ ...f, objetivo: '', dosisPorHa: '', carenciaDias: '', reingresoHoras: '' })
      cargar()
      onCambio()
    } catch (e) {
      setError(mensajeError(e))
    }
  }
  const exportar = () =>
    descargarCsv(`cuaderno_campo.csv`, [
      ['Fecha', 'Predio', 'Cuartel', 'Producto', 'Objetivo', 'Dosis/ha', 'Cantidad', 'Carencia (días)', 'Reingreso (h)', 'Aplicador', 'Método', 'Estado'],
      ...lista.map((a) => [a.fecha.slice(0, 10), a.cuartel.predio.nombre, a.cuartel.nombre, a.item.nombre, a.objetivo, a.dosisPorHa, a.cantidad, a.carenciaDias, a.reingresoHoras, a.aplicador, a.metodo ?? '', a.estado]),
    ])
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value })
  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-gray-200 p-4 grid grid-cols-1 sm:grid-cols-4 gap-3 text-sm">
        <label className="text-gray-600">Cuartel<select value={f.cuartelId} onChange={set('cuartelId')} className={input}><option value="">Elige...</option>{cuarteles.map((c) => <option key={c.id} value={c.id}>{c.predio} · {c.nombre}</option>)}</select></label>
        <label className="text-gray-600">Producto aplicado<select value={f.itemId} onChange={set('itemId')} className={input}><option value="">Elige...</option>{items.map((i) => <option key={i.id} value={i.id}>{i.nombre}</option>)}</select></label>
        <label className="text-gray-600">Fecha<input type="date" value={f.fecha} onChange={set('fecha')} className={input} /></label>
        <label className="text-gray-600">¿Para qué? (plaga o enfermedad)<input value={f.objetivo} onChange={set('objetivo')} className={input} /></label>
        <label className="text-gray-600">Dosis por hectárea<input inputMode="decimal" value={f.dosisPorHa} onChange={set('dosisPorHa')} className={input} /></label>
        <label className="text-gray-600">Carencia (días, ver etiqueta)<input inputMode="numeric" value={f.carenciaDias} onChange={set('carenciaDias')} className={input} /></label>
        <label className="text-gray-600">Reingreso (horas)<input inputMode="numeric" value={f.reingresoHoras} onChange={set('reingresoHoras')} className={input} /></label>
        <label className="text-gray-600">Quién aplicó<input value={f.aplicador} onChange={set('aplicador')} className={input} /></label>
        <p className="sm:col-span-3 text-gray-600 self-center">
          {total > 0 && item ? `Se descontarán ${total.toLocaleString('es-CL')} ${item.unidadMedida.toLowerCase()} de bodega.` : 'La cantidad total se calcula con la dosis por hectárea.'}
        </p>
        <button onClick={guardar} disabled={!f.cuartelId || !f.itemId || f.objetivo.trim().length < 2 || !(Number(f.dosisPorHa) > 0) || f.carenciaDias === '' || f.aplicador.trim().length < 2}
          className="px-4 py-2 rounded-lg bg-blue-600 text-white disabled:opacity-50">Anotar aplicación</button>
        {error && <p className="sm:col-span-4 text-red-600">{error}</p>}
      </div>
      <div className="flex justify-end"><button onClick={exportar} className="text-sm text-blue-700 hover:underline">Descargar cuaderno (CSV para SAG / certificadora)</button></div>
      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
            <tr><th className="px-3 py-2 text-left">Fecha</th><th className="px-3 py-2 text-left">Cuartel</th><th className="px-3 py-2 text-left">Producto</th><th className="px-3 py-2 text-left">Objetivo</th><th className="px-3 py-2 text-right">Cantidad</th><th className="px-3 py-2 text-left">Carencia</th><th className="px-3 py-2" /></tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {lista.map((a) => (
              <tr key={a.id} className={a.estado === 'ANULADO' ? 'text-gray-400 line-through' : ''}>
                <td className="px-3 py-2">{a.fecha.slice(0, 10)}</td>
                <td className="px-3 py-2">{a.cuartel.nombre}</td>
                <td className="px-3 py-2">{a.item.nombre}</td>
                <td className="px-3 py-2">{a.objetivo}</td>
                <td className="px-3 py-2 text-right">{Number(a.cantidad).toLocaleString('es-CL')} {a.item.unidadMedida.toLowerCase()}</td>
                <td className="px-3 py-2">{a.carenciaDias} días</td>
                <td className="px-3 py-2 text-right">{a.estado === 'VIGENTE' && <button onClick={() => confirm('¿Anular la aplicación? El producto vuelve a bodega.') && anularAplicacion(a.id).then(() => { cargar(); onCambio() }).catch((e) => setError(mensajeError(e)))} className="text-xs text-red-600 hover:underline">Anular</button>}</td>
              </tr>
            ))}
            {lista.length === 0 && <tr><td colSpan={7} className="px-3 py-6 text-center text-gray-400">Sin aplicaciones en la temporada</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function CosechaTab({ cuarteles, items, temporadaId, sucursalId, carencias }: { cuarteles: CuartelOpcion[]; items: Item[]; temporadaId: string; sucursalId: string; carencias: Carencia[] }) {
  const [lista, setLista] = useState<Cosecha[]>([])
  const [f, setF] = useState({ cuartelId: '', itemId: '', kilos: '', fechaVencimiento: '' })
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null)
  const cargar = () => getCosechas(temporadaId).then((r) => setLista(r.data))
  useEffect(() => { cargar() }, [temporadaId])
  const carencia = carencias.find((c) => c.cuartel.id === f.cuartelId)
  const guardar = async () => {
    setMsg(null)
    try {
      const { data } = await crearCosecha({ cuartelId: f.cuartelId, itemId: f.itemId, temporadaId, sucursalId, kilos: Number(f.kilos), fechaVencimiento: f.fechaVencimiento || undefined })
      setMsg({ ok: true, texto: `Cosecha registrada como lote ${data.lote?.codigo}: ${Number(data.kilos).toLocaleString('es-CL')} kg a ${clp(data.costoKilo)}/kg.` })
      setF({ ...f, kilos: '' })
      cargar()
    } catch (e) {
      setMsg({ ok: false, texto: mensajeError(e) })
    }
  }
  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-gray-200 p-4 grid grid-cols-1 sm:grid-cols-5 gap-3 text-sm items-end">
        <label className="text-gray-600">Cuartel<select value={f.cuartelId} onChange={(e) => setF({ ...f, cuartelId: e.target.value })} className={input}><option value="">Elige...</option>{cuarteles.map((c) => <option key={c.id} value={c.id}>{c.predio} · {c.nombre}</option>)}</select></label>
        <label className="text-gray-600">Producto<select value={f.itemId} onChange={(e) => setF({ ...f, itemId: e.target.value })} className={input}><option value="">Elige...</option>{items.map((i) => <option key={i.id} value={i.id}>{i.nombre}</option>)}</select></label>
        <label className="text-gray-600">Kilos cosechados<input inputMode="decimal" value={f.kilos} onChange={(e) => setF({ ...f, kilos: e.target.value })} className={input} /></label>
        <label className="text-gray-600">Vence (opcional)<input type="date" value={f.fechaVencimiento} onChange={(e) => setF({ ...f, fechaVencimiento: e.target.value })} className={input} /></label>
        <button onClick={guardar} disabled={!f.cuartelId || !f.itemId || !(Number(f.kilos) > 0) || !!carencia} className="px-4 py-2 rounded-lg bg-blue-600 text-white disabled:opacity-50">Registrar cosecha</button>
        {carencia && <p className="sm:col-span-5 text-amber-700">Este cuartel está en carencia por "{carencia.objetivo}": se puede cosechar desde el {carencia.cosecharDesde}.</p>}
        {msg && <p className={`sm:col-span-5 ${msg.ok ? 'text-green-700' : 'text-red-600'}`}>{msg.texto}</p>}
        <p className="sm:col-span-5 text-gray-500">La cosecha entra a bodega como lote y se lleva el costo acumulado del cuartel (insumos, mano de obra y gastos imputados).</p>
      </div>
      <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100 text-sm">
        {lista.map((c) => (
          <div key={c.id} className={`flex justify-between items-center px-4 py-2 ${c.estado === 'ANULADO' ? 'text-gray-400 line-through' : ''}`}>
            <span>{new Date(c.fecha).toLocaleDateString('es-CL')} · {c.cuartel.nombre} · {c.item?.nombre} · lote {c.lote?.codigo}</span>
            <span className="flex gap-3 items-center">
              {Number(c.kilos).toLocaleString('es-CL')} kg · {clp(c.costoKilo)}/kg
              {c.estado === 'VIGENTE' && <button onClick={() => confirm('¿Anular la cosecha?') && anularCosecha(c.id).then(cargar).catch((e) => setMsg({ ok: false, texto: mensajeError(e) }))} className="text-xs text-red-600 hover:underline">Anular</button>}
            </span>
          </div>
        ))}
        {lista.length === 0 && <p className="px-4 py-3 text-gray-400">Sin cosechas en la temporada</p>}
      </div>
    </div>
  )
}

const NOMBRE_CATEGORIA: Record<CategoriaCosto, string> = { INSUMOS: 'Insumos', MANO_OBRA: 'Mano de obra', MAQUINARIA: 'Maquinaria', SERVICIOS: 'Servicios', OTROS: 'Otros' }

function Costos({ temporadaId, esAdmin }: { temporadaId: string; esAdmin: boolean }) {
  const [data, setData] = useState<InformeCostosCampo | null>(null)
  const [editando, setEditando] = useState<Record<string, string>>({})
  const [error, setError] = useState('')
  const cargar = () => getCostosCampo(temporadaId).then((r) => setData(r.data)).catch((e) => setError(mensajeError(e)))
  useEffect(() => { cargar() }, [temporadaId])
  const guardar = async () => {
    const lineas = Object.entries(editando).map(([k, v]) => {
      const [cuartelId, categoria] = k.split('|')
      return { cuartelId, categoria, monto: Number(v) || 0 }
    })
    try {
      await guardarPresupuesto(temporadaId, lineas)
      setEditando({})
      cargar()
    } catch (e) {
      setError(mensajeError(e))
    }
  }
  if (!data) return <p className="text-sm text-gray-500">{error || 'Calculando...'}</p>
  return (
    <div className="space-y-3">
      {error && <p className="text-sm text-red-600">{error}</p>}
      {data.cuarteles.map((c) => (
        <section key={c.id} className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex flex-wrap justify-between gap-2">
            <h2 className="font-semibold">{c.predio} · {c.nombre} <span className="font-normal text-gray-500">{c.cultivo}, {Number(c.hectareas)} ha</span></h2>
            <p className="text-sm text-gray-700">
              Costo {clp(c.real)} · {c.costoHa ? `${clp(c.costoHa)}/ha` : '—'} · {c.costoKilo ? <b>{clp(c.costoKilo)}/kg</b> : 'sin cosecha'} · {Number(c.kilos).toLocaleString('es-CL')} kg{c.rendimientoHa ? ` (${Number(c.rendimientoHa).toLocaleString('es-CL')} kg/ha)` : ''}
            </p>
          </div>
          <table className="w-full text-sm mt-2">
            <thead className="text-gray-500 text-xs uppercase"><tr><th className="text-left py-1">Concepto</th><th className="text-right">Presupuesto</th><th className="text-right">Real</th><th className="text-right">Diferencia</th></tr></thead>
            <tbody>
              {CATEGORIAS_COSTO.map((cat) => {
                const fila = c.categorias.find((x) => x.categoria === cat)!
                const clave = `${c.id}|${cat}`
                const dif = Number(fila.real) - Number(fila.presupuesto)
                return (
                  <tr key={cat} className="border-t border-gray-100">
                    <td className="py-1">{NOMBRE_CATEGORIA[cat]}</td>
                    <td className="text-right">
                      {esAdmin ? (
                        <input inputMode="numeric" value={editando[clave] ?? String(Number(fila.presupuesto))} onChange={(e) => setEditando({ ...editando, [clave]: e.target.value.replace(/\D/g, '') })}
                          className="w-28 text-right border border-gray-200 rounded px-2 py-0.5" />
                      ) : clp(fila.presupuesto)}
                    </td>
                    <td className="text-right">{clp(fila.real)}</td>
                    <td className={`text-right ${dif > 0 ? 'text-red-600' : 'text-gray-600'}`}>{dif > 0 ? '+' : ''}{clp(dif)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </section>
      ))}
      {data.cuarteles.length === 0 && <p className="text-sm text-gray-500">Crea cuarteles para ver sus costos.</p>}
      {esAdmin && Object.keys(editando).length > 0 && <button onClick={guardar} className="px-4 py-2 rounded-lg bg-blue-600 text-white">Guardar presupuesto</button>}
    </div>
  )
}
