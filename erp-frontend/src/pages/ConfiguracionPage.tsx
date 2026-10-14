import { useEffect, useState } from 'react'
import { createUnidad, getUnidades, updateEmpresa } from '@/api'
import { cargarEmpresa, invalidarEmpresa } from '@/hooks/useEmpresa'
import type { Empresa, UnidadMedida } from '@/types'

const input = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

type CampoEmpresa = Exclude<keyof Empresa, 'id'>

const CAMPOS: { campo: CampoEmpresa; label: string; tipo?: 'number'; ayuda?: string }[] = [
  { campo: 'razonSocial', label: 'Razón social' },
  { campo: 'rut', label: 'RUT', ayuda: 'Debe coincidir con el certificado y el CAF del SII' },
  { campo: 'giro', label: 'Giro' },
  { campo: 'direccion', label: 'Dirección' },
  { campo: 'comuna', label: 'Comuna' },
  { campo: 'tasaIva', label: 'Tasa de IVA (%)', tipo: 'number' },
  { campo: 'diasCambio', label: 'Plazo para cambios (días)', tipo: 'number' },
  { campo: 'rutConsumidorFinal', label: 'RUT consumidor final', ayuda: 'Se usa en boletas sin RUT de cliente' },
  { campo: 'nombreConsumidorFinal', label: 'Nombre consumidor final' },
]

const mensajeError = (e: any) => {
  const msg = e?.response?.data?.message ?? 'No se pudo guardar'
  return Array.isArray(msg) ? msg.join(', ') : msg
}

export default function ConfiguracionPage() {
  const [form, setForm] = useState<Record<CampoEmpresa, string> | null>(null)
  const [unidades, setUnidades] = useState<UnidadMedida[]>([])
  const [nueva, setNueva] = useState({ codigo: '', nombre: '' })
  const [guardando, setGuardando] = useState(false)
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null)

  useEffect(() => {
    cargarEmpresa().then((e) => {
      const { id: _id, ...resto } = e
      setForm(Object.fromEntries(Object.entries(resto).map(([k, v]) => [k, String(v)])) as Record<CampoEmpresa, string>)
    })
    getUnidades().then((r) => setUnidades(r.data))
  }, [])

  const guardar = async () => {
    if (!form) return
    setGuardando(true)
    setAviso(null)
    try {
      await updateEmpresa({ ...form, tasaIva: Number(form.tasaIva), diasCambio: Number(form.diasCambio) })
      invalidarEmpresa()
      setAviso({ ok: true, texto: 'Datos de la empresa actualizados.' })
    } catch (e) {
      setAviso({ ok: false, texto: mensajeError(e) })
    } finally {
      setGuardando(false)
    }
  }

  const agregarUnidad = async () => {
    setAviso(null)
    try {
      const { data } = await createUnidad({ codigo: nueva.codigo.trim(), nombre: nueva.nombre.trim() })
      setUnidades((u) => [...u, data].sort((a, b) => a.nombre.localeCompare(b.nombre)))
      setNueva({ codigo: '', nombre: '' })
    } catch (e) {
      setAviso({ ok: false, texto: mensajeError(e) })
    }
  }

  if (!form) return <p className="text-sm text-gray-500">Cargando...</p>

  return (
    <div className="space-y-6 max-w-4xl">
      <h1 className="text-xl font-semibold text-gray-900">Configuración</h1>

      {aviso && (
        <p className={`text-sm rounded-lg px-3 py-2 ${aviso.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
          {aviso.texto}
        </p>
      )}

      <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-gray-700">Empresa emisora y parámetros</h2>
          <p className="text-xs text-gray-500 mt-1">Se usan en boletas, facturas, guías, devoluciones y cálculo de IVA.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {CAMPOS.map(({ campo, label, tipo, ayuda }) => (
            <label key={campo} className="block">
              <span className="block text-xs font-medium text-gray-600 mb-1">{label}</span>
              <input
                type={tipo ?? 'text'}
                min={tipo ? 0 : undefined}
                value={form[campo]}
                onChange={(e) => setForm({ ...form, [campo]: e.target.value })}
                className={input}
              />
              {ayuda && <span className="block text-xs text-gray-400 mt-1">{ayuda}</span>}
            </label>
          ))}
        </div>
        <button
          onClick={guardar}
          disabled={guardando}
          className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm px-4 py-2 rounded-lg"
        >
          {guardando ? 'Guardando...' : 'Guardar cambios'}
        </button>
      </section>

      <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 space-y-4">
        <h2 className="text-sm font-semibold text-gray-700">Unidades de medida</h2>
        <div className="flex flex-wrap gap-2">
          {unidades.map((u) => (
            <span key={u.codigo} className="px-2 py-1 rounded bg-gray-100 text-xs text-gray-700">
              <b>{u.codigo}</b> · {u.nombre}
            </span>
          ))}
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <label className="block">
            <span className="block text-xs font-medium text-gray-600 mb-1">Código</span>
            <input value={nueva.codigo} onChange={(e) => setNueva({ ...nueva, codigo: e.target.value })} className={input} placeholder="ej. BOL" />
          </label>
          <label className="block">
            <span className="block text-xs font-medium text-gray-600 mb-1">Nombre</span>
            <input value={nueva.nombre} onChange={(e) => setNueva({ ...nueva, nombre: e.target.value })} className={input} placeholder="ej. Bolsa" />
          </label>
          <button
            onClick={agregarUnidad}
            disabled={!nueva.codigo.trim() || !nueva.nombre.trim()}
            className="bg-gray-100 hover:bg-gray-200 disabled:opacity-50 text-gray-700 text-sm px-4 py-2 rounded-lg"
          >
            Agregar unidad
          </button>
        </div>
      </section>
    </div>
  )
}
