import { useEffect, useState } from 'react'
import { useAuth } from '@/context/AuthContext'
import {
  anularGasto,
  createCategoriaGasto,
  createGasto,
  getCategoriasGasto,
  getGastos,
  getProveedores,
  getSucursales,
  pagarGasto,
  updateCategoriaGasto,
} from '@/api'
import { useEmpresa } from '@/hooks/useEmpresa'
import type { CategoriaGasto, Entidad, ListadoGastos, Sucursal, TipoDocumentoGasto } from '@/types'
import { previaGasto } from '@/utils/gastos'

const input = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'
const clp = (v: string | number) => `$${Math.round(Number(v)).toLocaleString('es-CL')}`
const fecha = (v: string) => new Date(v).toLocaleDateString('es-CL', { timeZone: 'UTC' })
const hoy = () => new Date().toISOString().slice(0, 10)
const inicioMes = () => `${hoy().slice(0, 8)}01`
const mensajeError = (e: any) => {
  const msg = e?.response?.data?.message ?? 'No se pudo completar la operación'
  return Array.isArray(msg) ? msg.join(', ') : msg
}

export const TIPOS_DOCUMENTO: Record<TipoDocumentoGasto, { label: string; monto: string }> = {
  FACTURA: { label: 'Factura', monto: 'Monto neto (sin IVA)' },
  BOLETA: { label: 'Boleta', monto: 'Total pagado' },
  BOLETA_HONORARIOS: { label: 'Boleta de honorarios', monto: 'Monto bruto' },
  SIN_DOCUMENTO: { label: 'Sin documento', monto: 'Total pagado' },
}
const MEDIOS = ['Efectivo', 'Tarjeta', 'Transferencia']

const vacio = () => ({
  categoriaId: '',
  sucursalId: '',
  proveedorId: '',
  descripcion: '',
  tipoDocumento: 'BOLETA' as TipoDocumentoGasto,
  numeroDocumento: '',
  monto: '',
  fecha: hoy(),
  fechaVencimiento: '',
  pagado: true,
  medioPago: 'Efectivo',
})

export default function GastosPage() {
  const { user } = useAuth()
  const empresa = useEmpresa()
  const esAdmin = user?.rol === 'Administrador'

  const [datos, setDatos] = useState<ListadoGastos | null>(null)
  const [categorias, setCategorias] = useState<CategoriaGasto[]>([])
  const [proveedores, setProveedores] = useState<Entidad[]>([])
  const [sucursales, setSucursales] = useState<Sucursal[]>([])
  const [filtros, setFiltros] = useState({ desde: inicioMes(), hasta: hoy(), categoriaId: '', estadoPago: '' })
  const [form, setForm] = useState<ReturnType<typeof vacio> | null>(null)
  const [nuevaCategoria, setNuevaCategoria] = useState({ nombre: '', ivaRecuperable: true })
  const [verCategorias, setVerCategorias] = useState(false)
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)

  const cargar = () =>
    getGastos({
      desde: filtros.desde || undefined,
      hasta: filtros.hasta || undefined,
      categoriaId: filtros.categoriaId || undefined,
      estadoPago: filtros.estadoPago || undefined,
    })
      .then((r) => setDatos(r.data))
      .catch((e) => setError(mensajeError(e)))

  useEffect(() => { cargar() }, [filtros])
  useEffect(() => {
    getCategoriasGasto().then((r) => setCategorias(r.data))
    getProveedores().then((r) => setProveedores(r.data))
    if (esAdmin) getSucursales().then((r) => setSucursales(r.data))
  }, [esAdmin])

  const categoriaForm = categorias.find((c) => c.id === form?.categoriaId)
  const previa =
    form && empresa && Number(form.monto) > 0
      ? previaGasto(form.tipoDocumento, Number(form.monto), categoriaForm?.ivaRecuperable ?? true, Number(empresa.tasaIva), Number(empresa.tasaRetencionHonorarios))
      : null
  const conDocumento = form?.tipoDocumento === 'FACTURA' || form?.tipoDocumento === 'BOLETA_HONORARIOS'

  const guardar = async () => {
    if (!form) return
    setEnviando(true)
    setError('')
    try {
      await createGasto({
        categoriaId: form.categoriaId,
        sucursalId: esAdmin ? form.sucursalId || undefined : user?.sucursalId ?? undefined,
        proveedorId: form.proveedorId || undefined,
        descripcion: form.descripcion,
        tipoDocumento: form.tipoDocumento,
        numeroDocumento: form.numeroDocumento || undefined,
        monto: Number(form.monto),
        fecha: form.fecha,
        fechaVencimiento: !form.pagado && form.fechaVencimiento ? form.fechaVencimiento : undefined,
        medioPago: form.pagado ? form.medioPago : undefined,
      })
      setForm(null)
      cargar()
    } catch (e) {
      setError(mensajeError(e))
    } finally {
      setEnviando(false)
    }
  }

  const accion = async (fn: () => Promise<unknown>) => {
    setError('')
    try {
      await fn()
      cargar()
    } catch (e) {
      setError(mensajeError(e))
    }
  }

  const agregarCategoria = () =>
    accion(async () => {
      await createCategoriaGasto(nuevaCategoria)
      setNuevaCategoria({ nombre: '', ivaRecuperable: true })
      setCategorias((await getCategoriasGasto()).data)
    })

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-gray-900">Gastos de la empresa</h1>
        <div className="flex gap-2">
          {esAdmin && (
            <button onClick={() => setVerCategorias(!verCategorias)} className="text-sm px-4 py-2 rounded-lg bg-gray-100 text-gray-700">
              Categorías
            </button>
          )}
          <button onClick={() => { setForm(vacio()); setError('') }} className="text-sm px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white">
            Registrar gasto
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 items-end">
        <label className="text-xs text-gray-500">Desde<input type="date" value={filtros.desde} onChange={(e) => setFiltros({ ...filtros, desde: e.target.value })} className={input} /></label>
        <label className="text-xs text-gray-500">Hasta<input type="date" value={filtros.hasta} onChange={(e) => setFiltros({ ...filtros, hasta: e.target.value })} className={input} /></label>
        <label className="text-xs text-gray-500">Categoría
          <select value={filtros.categoriaId} onChange={(e) => setFiltros({ ...filtros, categoriaId: e.target.value })} className={input}>
            <option value="">Todas</option>
            {categorias.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
        </label>
        <label className="text-xs text-gray-500">Pago
          <select value={filtros.estadoPago} onChange={(e) => setFiltros({ ...filtros, estadoPago: e.target.value })} className={input}>
            <option value="">Todos</option>
            <option value="POR_PAGAR">Por pagar</option>
            <option value="PAGADO">Pagados</option>
          </select>
        </label>
      </div>

      {error && !form && <p className="text-sm text-red-600">{error}</p>}

      {datos && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
            <p className="text-xs text-gray-500">Gasto del período</p>
            <p className="text-2xl font-bold text-gray-900">{clp(datos.resumen.costo)}</p>
            <p className="text-xs text-gray-400">neto si el IVA es recuperable</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
            <p className="text-xs text-gray-500">Por pagar</p>
            <p className={`text-2xl font-bold ${Number(datos.resumen.porPagar) > 0 ? 'text-amber-600' : 'text-gray-900'}`}>{clp(datos.resumen.porPagar)}</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
            <p className="text-xs text-gray-500 mb-1">Por categoría</p>
            {datos.resumen.porCategoria.slice(0, 4).map((c) => (
              <p key={c.categoria} className="text-sm flex justify-between"><span>{c.categoria}</span><b>{clp(c.monto)}</b></p>
            ))}
            {datos.resumen.porCategoria.length === 0 && <p className="text-sm text-gray-400">Sin gastos</p>}
          </div>
        </div>
      )}

      {verCategorias && (
        <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 space-y-3">
          <h2 className="text-sm font-semibold text-gray-700">Categorías</h2>
          <div className="flex flex-wrap gap-2">
            {categorias.map((c) => (
              <label key={c.id} className={`flex items-center gap-2 px-2 py-1 rounded text-xs ${c.activa ? 'bg-gray-100' : 'bg-gray-50 text-gray-400 line-through'}`}>
                {c.nombre}
                <span title="IVA recuperable">{c.ivaRecuperable ? 'IVA ✓' : 'sin IVA'}</span>
                <button onClick={() => accion(async () => { await updateCategoriaGasto(c.id, { activa: !c.activa }); setCategorias((await getCategoriasGasto()).data) })} className="text-blue-600">
                  {c.activa ? 'desactivar' : 'activar'}
                </button>
              </label>
            ))}
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <input value={nuevaCategoria.nombre} maxLength={50} onChange={(e) => setNuevaCategoria({ ...nuevaCategoria, nombre: e.target.value })} placeholder="Nueva categoría" className={`${input} max-w-xs`} />
            <label className="text-sm flex items-center gap-2">
              <input type="checkbox" checked={nuevaCategoria.ivaRecuperable} onChange={(e) => setNuevaCategoria({ ...nuevaCategoria, ivaRecuperable: e.target.checked })} />
              IVA recuperable
            </label>
            <button disabled={nuevaCategoria.nombre.trim().length < 2} onClick={agregarCategoria} className="text-sm px-3 py-2 rounded-lg bg-gray-100 disabled:opacity-50">Agregar</button>
          </div>
        </section>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
            <tr>
              <th className="px-4 py-3 text-left">Fecha</th>
              <th className="px-4 py-3 text-left">Descripción</th>
              <th className="px-4 py-3 text-left">Categoría</th>
              <th className="px-4 py-3 text-left">Documento</th>
              <th className="px-4 py-3 text-right">Total</th>
              <th className="px-4 py-3 text-right">Costo</th>
              <th className="px-4 py-3 text-left">Pago</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {datos?.gastos.map((g) => {
              const vencido = g.estadoPago === 'POR_PAGAR' && g.fechaVencimiento && g.fechaVencimiento.slice(0, 10) < hoy()
              return (
                <tr key={g.id}>
                  <td className="px-4 py-3 text-gray-500">{fecha(g.fechaRegistro)}</td>
                  <td className="px-4 py-3">
                    {g.descripcion}
                    <span className="block text-xs text-gray-400">{[g.proveedor?.nombreRazonSocial, g.sucursal?.nombre ?? 'Empresa'].filter(Boolean).join(' · ')}</span>
                  </td>
                  <td className="px-4 py-3">{g.categoria.nombre}</td>
                  <td className="px-4 py-3 text-gray-600">{TIPOS_DOCUMENTO[g.tipoDocumento].label}{g.numeroDocumento && ` N° ${g.numeroDocumento}`}{g.dte && ' (DTE)'}</td>
                  <td className="px-4 py-3 text-right">{clp(g.total)}{Number(g.retencion) > 0 && <span className="block text-xs text-gray-400">ret. {clp(g.retencion)}</span>}</td>
                  <td className="px-4 py-3 text-right font-medium">{clp(g.monto)}</td>
                  <td className="px-4 py-3">
                    {g.estadoPago === 'PAGADO' ? (
                      <span className="text-xs text-green-700">Pagado{g.medioPago && ` · ${g.medioPago}`}</span>
                    ) : (
                      <span className={`text-xs ${vencido ? 'text-red-600 font-semibold' : 'text-amber-600'}`}>
                        {vencido ? 'Vencido' : 'Por pagar'}{g.fechaVencimiento && ` · ${fecha(g.fechaVencimiento)}`}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap space-x-3">
                    {g.estadoPago === 'POR_PAGAR' && (
                      <select defaultValue="" onChange={(e) => e.target.value && accion(() => pagarGasto(g.id, { medioPago: e.target.value }))} className="text-xs border border-gray-200 rounded">
                        <option value="">Pagar con…</option>
                        {MEDIOS.map((m) => <option key={m} value={m}>{m}</option>)}
                      </select>
                    )}
                    <button onClick={() => window.confirm('¿Anular el gasto?') && accion(() => anularGasto(g.id))} className="text-xs text-red-600 hover:underline">Anular</button>
                  </td>
                </tr>
              )
            })}
            {datos?.gastos.length === 0 && <tr><td colSpan={8} className="px-4 py-6 text-center text-gray-400">Sin gastos en el período</td></tr>}
          </tbody>
        </table>
      </div>

      {form && (
        <div className="fixed inset-0 bg-black/40 flex items-start justify-center p-4 overflow-y-auto z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl p-6 space-y-4 my-8">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Registrar gasto</h2>
              <button onClick={() => setForm(null)} className="text-gray-400 text-xl">×</button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <label className="block text-xs text-gray-600 sm:col-span-2">Descripción *
                <input value={form.descripcion} maxLength={200} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} className={input} placeholder="ej. Arriendo local octubre" />
              </label>
              <label className="block text-xs text-gray-600">Categoría *
                <select value={form.categoriaId} onChange={(e) => setForm({ ...form, categoriaId: e.target.value })} className={input}>
                  <option value="">Seleccione…</option>
                  {categorias.filter((c) => c.activa).map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                </select>
              </label>
              <label className="block text-xs text-gray-600">Documento *
                <select value={form.tipoDocumento} onChange={(e) => setForm({ ...form, tipoDocumento: e.target.value as TipoDocumentoGasto })} className={input}>
                  {Object.entries(TIPOS_DOCUMENTO).map(([v, t]) => <option key={v} value={v}>{t.label}</option>)}
                </select>
              </label>
              {(conDocumento || form.tipoDocumento === 'BOLETA') && (
                <>
                  <label className="block text-xs text-gray-600">Proveedor {conDocumento && '*'}
                    <select value={form.proveedorId} onChange={(e) => setForm({ ...form, proveedorId: e.target.value })} className={input}>
                      <option value="">—</option>
                      {proveedores.map((p) => <option key={p.id} value={p.id}>{p.nombreRazonSocial} ({p.rut})</option>)}
                    </select>
                  </label>
                  <label className="block text-xs text-gray-600">N° documento {conDocumento && '*'}
                    <input value={form.numeroDocumento} maxLength={30} onChange={(e) => setForm({ ...form, numeroDocumento: e.target.value })} className={input} />
                  </label>
                </>
              )}
              <label className="block text-xs text-gray-600">{TIPOS_DOCUMENTO[form.tipoDocumento].monto} *
                <input type="number" min="1" value={form.monto} onChange={(e) => setForm({ ...form, monto: e.target.value })} className={input} />
              </label>
              <label className="block text-xs text-gray-600">Fecha *
                <input type="date" value={form.fecha} max={hoy()} onChange={(e) => setForm({ ...form, fecha: e.target.value })} className={input} />
              </label>
              {esAdmin && (
                <label className="block text-xs text-gray-600">Sucursal
                  <select value={form.sucursalId} onChange={(e) => setForm({ ...form, sucursalId: e.target.value })} className={input}>
                    <option value="">Gasto de la empresa</option>
                    {sucursales.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                  </select>
                </label>
              )}
              <label className="flex items-center gap-2 text-sm sm:col-span-2">
                <input type="checkbox" checked={form.pagado} onChange={(e) => setForm({ ...form, pagado: e.target.checked })} />
                Ya está pagado
              </label>
              {form.pagado ? (
                <label className="block text-xs text-gray-600">Medio de pago
                  <select value={form.medioPago} onChange={(e) => setForm({ ...form, medioPago: e.target.value })} className={input}>
                    {MEDIOS.map((m) => <option key={m}>{m}</option>)}
                  </select>
                </label>
              ) : (
                <label className="block text-xs text-gray-600">Vence
                  <input type="date" value={form.fechaVencimiento} min={form.fecha} onChange={(e) => setForm({ ...form, fechaVencimiento: e.target.value })} className={input} />
                </label>
              )}
            </div>
            {previa && (
              <p className="text-sm text-gray-600 bg-gray-50 rounded-lg p-3">
                {previa.iva > 0 && <>IVA {clp(previa.iva)} · </>}
                {previa.retencion > 0 && <>Retención {clp(previa.retencion)} (se paga al SII) · </>}
                Total {clp(previa.total)} · A pagar {clp(previa.aPagar)} · <b>Costo {clp(previa.costo)}</b>
                {form.tipoDocumento === 'SIN_DOCUMENTO' && empresa && <span className="block text-xs text-gray-400">Tope sin documento: {clp(empresa.topeGastoSinDocumento)}</span>}
              </p>
            )}
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex justify-end gap-2">
              <button onClick={() => setForm(null)} className="text-sm px-4 py-2 text-gray-600">Cancelar</button>
              <button onClick={guardar} disabled={enviando || !form.categoriaId || form.descripcion.trim().length < 3 || !(Number(form.monto) > 0)} className="text-sm px-4 py-2 rounded-lg bg-blue-600 text-white disabled:opacity-50">
                {enviando ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
