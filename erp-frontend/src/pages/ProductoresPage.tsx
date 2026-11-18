import { useEffect, useMemo, useState } from 'react'
import {
  anularAnticipoProductor,
  createEntidad,
  anularRecepcionProductor,
  crearAnticipoProductor,
  crearRecepcionProductor,
  getAnticiposProductor,
  getCuentaProductor,
  getItems,
  getProveedores,
  getRecepcionesProductor,
  getSucursales,
  pagarRecepcionProductor,
} from '@/api'
import { useAuth } from '@/context/AuthContext'
import { useEmpresa } from '@/hooks/useEmpresa'
import type { AnticipoProductor, CuentaProductor, Entidad, Item, RecepcionProductor, Sucursal } from '@/types'
import { mensajeError } from '@/utils/contabilidad'
import { clp } from '@/utils/formato'
import { liquidarPrevia, type DocumentoProductor } from '@/utils/productores'

type Pestana = 'recibir' | 'recepciones' | 'anticipos' | 'cuenta'
const kg = (v: string | number) => `${Number(v).toLocaleString('es-CL')} kg`
const input = 'border border-gray-300 rounded-lg px-3 py-2 text-[15px] w-full'

export default function ProductoresPage() {
  const [pestana, setPestana] = useState<Pestana>('recibir')
  const [productores, setProductores] = useState<Entidad[]>([])
  const [version, setVersion] = useState(0)
  useEffect(() => { getProveedores().then((r) => setProductores(r.data)) }, [])
  const recargar = () => setVersion((v) => v + 1)

  return (
    <div className="space-y-5 max-w-6xl">
      <h1 className="text-xl font-semibold text-gray-900">Compras a productores</h1>
      <div className="flex gap-1 border-b border-gray-200 overflow-x-auto">
        {([['recibir', 'Recibir producto'], ['recepciones', 'Recepciones'], ['anticipos', 'Anticipos'], ['cuenta', 'Cuenta del productor']] as const).map(([id, label]) => (
          <button key={id} onClick={() => setPestana(id)}
            className={`px-4 py-2 text-sm font-medium -mb-px border-b-2 whitespace-nowrap ${pestana === id ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-500'}`}>
            {label}
          </button>
        ))}
      </div>
      {pestana === 'recibir' && (
        <Recibir productores={productores} onNuevoProductor={(p) => setProductores([...productores, p])} onListo={() => { recargar(); setPestana('recepciones') }} />
      )}
      {pestana === 'recepciones' && <Recepciones version={version} onCambio={recargar} />}
      {pestana === 'anticipos' && <Anticipos productores={productores} />}
      {pestana === 'cuenta' && <Cuenta productores={productores} />}
    </div>
  )
}

function NuevoProductor({ onCreado }: { onCreado: (p: Entidad) => void }) {
  const [abierto, setAbierto] = useState(false)
  const [rut, setRut] = useState('')
  const [nombre, setNombre] = useState('')
  const [error, setError] = useState('')
  if (!abierto) return <button type="button" onClick={() => setAbierto(true)} className="text-sm text-blue-700 hover:underline">+ Nuevo productor</button>
  const crear = async () => {
    setError('')
    try {
      const { data } = await createEntidad({ tipoEntidad: 'PROVEEDOR', rut: rut.trim(), nombreRazonSocial: nombre.trim() })
      onCreado(data)
      setAbierto(false)
      setRut('')
      setNombre('')
    } catch (e) {
      setError(mensajeError(e))
    }
  }
  return (
    <div className="flex flex-wrap gap-2 items-center bg-gray-50 rounded-lg p-2">
      <input placeholder="RUT (12345678-5)" value={rut} onChange={(e) => setRut(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-40" />
      <input placeholder="Nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm flex-1" />
      <button type="button" onClick={crear} disabled={!rut.trim() || nombre.trim().length < 2} className="px-3 py-2 rounded-lg bg-blue-600 text-white text-sm disabled:opacity-50">Guardar</button>
      <button type="button" onClick={() => setAbierto(false)} className="text-sm text-gray-500">Cancelar</button>
      {error && <p className="w-full text-sm text-red-600">{error}</p>}
    </div>
  )
}

function Recibir({ productores, onListo, onNuevoProductor }: { productores: Entidad[]; onListo: () => void; onNuevoProductor: (p: Entidad) => void }) {
  const { user } = useAuth()
  const empresa = useEmpresa()
  const [items, setItems] = useState<Item[]>([])
  const [sucursales, setSucursales] = useState<Sucursal[]>([])
  const [f, setF] = useState({
    productorId: '', itemId: '', sucursalId: user?.sucursalId ?? '', pesoBruto: '', tara: '', humedadPct: '', impurezasPct: '',
    precioKilo: '', tipoDocumento: 'FACTURA_COMPRA' as DocumentoProductor, folioDocumento: '', fechaVencimiento: '',
  })
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)
  useEffect(() => {
    getItems().then((r) => setItems(r.data.filter((i) => i.estado === 'Activo')))
    getSucursales().then((r) => {
      setSucursales(r.data)
      if (!user?.sucursalId && r.data[0]) setF((x) => ({ ...x, sucursalId: r.data[0].id }))
    })
  }, [user?.sucursalId])
  const item = items.find((i) => i.id === f.itemId)
  const num = (v: string) => Number(v.replace(',', '.')) || 0
  const previa = useMemo(
    () =>
      liquidarPrevia(
        { pesoBruto: num(f.pesoBruto), tara: num(f.tara), humedadPct: num(f.humedadPct), impurezasPct: num(f.impurezasPct), precioKilo: num(f.precioKilo) },
        { tipoDocumento: f.tipoDocumento, tasaIva: Number(empresa?.tasaIva ?? 19), humedadBasePct: Number(item?.humedadBasePct ?? 0), retencionIvaPct: Number(item?.retencionIvaPct ?? 0) },
      ),
    [f, empresa, item],
  )
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value })
  const guardar = async () => {
    setError('')
    setGuardando(true)
    try {
      await crearRecepcionProductor({
        productorId: f.productorId, itemId: f.itemId, sucursalId: f.sucursalId, pesoBruto: num(f.pesoBruto), tara: num(f.tara),
        humedadPct: num(f.humedadPct), impurezasPct: num(f.impurezasPct), precioKilo: num(f.precioKilo), tipoDocumento: f.tipoDocumento,
        folioDocumento: f.folioDocumento || undefined, fechaVencimiento: f.fechaVencimiento || undefined,
      })
      onListo()
    } catch (e) {
      setError(mensajeError(e))
    } finally {
      setGuardando(false)
    }
  }
  const listo = f.productorId && f.itemId && f.sucursalId && previa && previa.kilosPagables > 0 && num(f.precioKilo) > 0 && (f.tipoDocumento === 'FACTURA_COMPRA' || f.folioDocumento.trim())

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
      <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 p-5 space-y-4">
        <Paso n={1} titulo="¿Quién entrega y qué trae?">
          <div className="mb-2"><NuevoProductor onCreado={(p) => { onNuevoProductor(p); setF((x) => ({ ...x, productorId: p.id })) }} /></div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="text-sm text-gray-600">Productor
              <select value={f.productorId} onChange={set('productorId')} className={input}>
                <option value="">Elige...</option>
                {productores.map((p) => <option key={p.id} value={p.id}>{p.nombreRazonSocial} ({p.rut})</option>)}
              </select>
            </label>
            <label className="text-sm text-gray-600">Producto
              <select value={f.itemId} onChange={set('itemId')} className={input}>
                <option value="">Elige...</option>
                {items.map((i) => <option key={i.id} value={i.id}>{i.nombre}</option>)}
              </select>
            </label>
            {sucursales.length > 1 && !user?.sucursalId && (
              <label className="text-sm text-gray-600">Bodega
                <select value={f.sucursalId} onChange={set('sucursalId')} className={input}>
                  {sucursales.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                </select>
              </label>
            )}
          </div>
        </Paso>
        <Paso n={2} titulo="Pesaje en romana (kilos)">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Campo label="Peso bruto" value={f.pesoBruto} onChange={set('pesoBruto')} />
            <Campo label="Tara (camión vacío, envases)" value={f.tara} onChange={set('tara')} />
            <Campo label="Humedad %" value={f.humedadPct} onChange={set('humedadPct')} ayuda={item && Number(item.humedadBasePct) ? `Se castiga sobre ${Number(item.humedadBasePct)} %` : undefined} />
            <Campo label="Impurezas %" value={f.impurezasPct} onChange={set('impurezasPct')} />
          </div>
        </Paso>
        <Paso n={3} titulo="Precio y documento">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Campo label="Precio por kilo (neto)" value={f.precioKilo} onChange={set('precioKilo')} />
            <label className="text-sm text-gray-600">Documento
              <select value={f.tipoDocumento} onChange={set('tipoDocumento')} className={input}>
                <option value="FACTURA_COMPRA">Yo emito factura de compra (productor sin factura)</option>
                <option value="FACTURA_PROVEEDOR">El productor me da su factura</option>
              </select>
            </label>
            {f.tipoDocumento === 'FACTURA_PROVEEDOR' && <Campo label="N° de su factura" value={f.folioDocumento} onChange={set('folioDocumento')} texto />}
            <label className="text-sm text-gray-600">Vence (opcional)
              <input type="date" value={f.fechaVencimiento} onChange={set('fechaVencimiento')} className={input} />
            </label>
          </div>
        </Paso>
      </div>
      <aside className="bg-white rounded-xl border border-gray-200 p-5 space-y-2 text-[15px] h-fit">
        <h2 className="font-semibold text-gray-900">Liquidación</h2>
        {!previa && <p className="text-gray-400 text-sm">Ingresa el pesaje para ver el cálculo.</p>}
        {previa && (
          <>
            <Linea label="Peso neto" valor={kg(previa.pesoNeto)} />
            <Linea label={`Castigo (${previa.castigoPct} %)`} valor={`-${kg(previa.pesoNeto - previa.kilosPagables)}`} />
            <Linea label="Kilos a pagar" valor={kg(previa.kilosPagables)} fuerte />
            <hr />
            <Linea label="Neto" valor={clp(previa.montoNeto)} />
            <Linea label="IVA" valor={clp(previa.iva)} />
            {previa.retencionIva > 0 && <Linea label="IVA retenido (lo pagas tú al SII)" valor={`-${clp(previa.retencionIva)}`} />}
            <Linea label="A pagar al productor" valor={clp(previa.montoAPagar)} fuerte />
            {f.tipoDocumento === 'FACTURA_COMPRA' && (
              <p className="text-xs text-gray-500">Factura de compra (DTE 46): se queda pendiente de emitir en el SII con el folio interno.</p>
            )}
          </>
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button onClick={guardar} disabled={!listo || guardando} className="w-full mt-2 px-4 py-3 rounded-lg bg-blue-600 text-white font-medium disabled:opacity-50">
          {guardando ? 'Guardando...' : 'Registrar recepción'}
        </button>
        <p className="text-xs text-gray-500">El stock sube con los kilos a pagar y se crea un lote para seguir el producto.</p>
      </aside>
    </div>
  )
}

function Paso({ n, titulo, children }: { n: number; titulo: string; children: React.ReactNode }) {
  return (
    <section>
      <p className="font-medium text-gray-800 mb-2"><span className="inline-flex w-6 h-6 rounded-full bg-blue-600 text-white text-sm items-center justify-center mr-2">{n}</span>{titulo}</p>
      {children}
    </section>
  )
}

function Campo({ label, value, onChange, ayuda, texto }: { label: string; value: string; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void; ayuda?: string; texto?: boolean }) {
  return (
    <label className="text-sm text-gray-600">{label}
      <input inputMode={texto ? 'text' : 'decimal'} value={value} onChange={onChange} className={input} />
      {ayuda && <span className="text-xs text-gray-400">{ayuda}</span>}
    </label>
  )
}

function Linea({ label, valor, fuerte }: { label: string; valor: string; fuerte?: boolean }) {
  return (
    <div className={`flex justify-between ${fuerte ? 'font-semibold text-gray-900' : 'text-gray-600'}`}>
      <span>{label}</span>
      <span>{valor}</span>
    </div>
  )
}

function Recepciones({ version, onCambio }: { version: number; onCambio: () => void }) {
  const [filas, setFilas] = useState<RecepcionProductor[]>([])
  const [error, setError] = useState('')
  useEffect(() => { getRecepcionesProductor().then((r) => setFilas(r.data)).catch((e) => setError(mensajeError(e))) }, [version])
  const accion = async (fn: () => Promise<unknown>) => {
    setError('')
    try {
      await fn()
      onCambio()
    } catch (e) {
      setError(mensajeError(e))
    }
  }
  return (
    <div className="space-y-2">
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
            <tr>
              <th className="px-3 py-2 text-left">N°</th>
              <th className="px-3 py-2 text-left">Fecha</th>
              <th className="px-3 py-2 text-left">Productor</th>
              <th className="px-3 py-2 text-left">Producto</th>
              <th className="px-3 py-2 text-right">Kilos</th>
              <th className="px-3 py-2 text-left">Documento</th>
              <th className="px-3 py-2 text-right">A pagar</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filas.map((r) => (
              <tr key={r.id} className={r.estado === 'ANULADO' ? 'text-gray-400 line-through' : ''}>
                <td className="px-3 py-2">{r.folio}</td>
                <td className="px-3 py-2 whitespace-nowrap">{new Date(r.fecha).toLocaleDateString('es-CL')}</td>
                <td className="px-3 py-2">{r.productor.nombreRazonSocial}</td>
                <td className="px-3 py-2">{r.item.nombre} <span className="text-gray-400">{r.lote?.codigo}</span></td>
                <td className="px-3 py-2 text-right">{kg(r.kilosPagables)}</td>
                <td className="px-3 py-2">{r.tipoDocumento === 'FACTURA_COMPRA' ? `F. compra ${r.folioDocumento}` : `Factura ${r.folioDocumento}`}</td>
                <td className="px-3 py-2 text-right">{clp(r.montoAPagar)}</td>
                <td className="px-3 py-2 text-right whitespace-nowrap space-x-3">
                  {r.estado === 'VIGENTE' && r.estadoPago === 'POR_PAGAR' && (
                    <>
                      <button onClick={() => confirm(`¿Pagar ${clp(r.montoAPagar)} por transferencia? Se descuentan los anticipos pendientes.`) && accion(() => pagarRecepcionProductor(r.id, 'Transferencia'))} className="text-blue-700 hover:underline">Pagar</button>
                      <button onClick={() => confirm('¿Anular esta recepción? Se descuenta el stock.') && accion(() => anularRecepcionProductor(r.id))} className="text-red-600 hover:underline">Anular</button>
                    </>
                  )}
                  {r.estadoPago === 'PAGADO' && <span className="text-green-700">Pagada{Number(r.anticipoAplicado) ? ` (−${clp(r.anticipoAplicado)} anticipo)` : ''}</span>}
                </td>
              </tr>
            ))}
            {filas.length === 0 && <tr><td colSpan={8} className="px-3 py-6 text-center text-gray-400">Sin recepciones</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Anticipos({ productores }: { productores: Entidad[] }) {
  const [filas, setFilas] = useState<AnticipoProductor[]>([])
  const [f, setF] = useState({ productorId: '', monto: '', medioPago: 'Transferencia', descripcion: '' })
  const [error, setError] = useState('')
  const cargar = () => getAnticiposProductor().then((r) => setFilas(r.data))
  useEffect(() => { cargar() }, [])
  const guardar = async () => {
    setError('')
    try {
      await crearAnticipoProductor({ ...f, monto: Number(f.monto) })
      setF({ productorId: '', monto: '', medioPago: 'Transferencia', descripcion: '' })
      cargar()
    } catch (e) {
      setError(mensajeError(e))
    }
  }
  const anular = async (id: string) => {
    try {
      await anularAnticipoProductor(id)
      cargar()
    } catch (e) {
      setError(mensajeError(e))
    }
  }
  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-gray-200 p-4 grid grid-cols-1 sm:grid-cols-5 gap-2 items-end text-sm">
        <label className="text-gray-600 sm:col-span-2">Productor
          <select value={f.productorId} onChange={(e) => setF({ ...f, productorId: e.target.value })} className={input}>
            <option value="">Elige...</option>
            {productores.map((p) => <option key={p.id} value={p.id}>{p.nombreRazonSocial}</option>)}
          </select>
        </label>
        <label className="text-gray-600">Monto
          <input inputMode="numeric" value={f.monto} onChange={(e) => setF({ ...f, monto: e.target.value.replace(/\D/g, '') })} className={input} />
        </label>
        <label className="text-gray-600">Cómo se pagó
          <select value={f.medioPago} onChange={(e) => setF({ ...f, medioPago: e.target.value })} className={input}>
            <option>Transferencia</option>
            <option>Efectivo</option>
          </select>
        </label>
        <label className="text-gray-600">Motivo
          <input value={f.descripcion} onChange={(e) => setF({ ...f, descripcion: e.target.value })} placeholder="Ej: adelanto cosecha" className={input} />
        </label>
        <button onClick={guardar} disabled={!f.productorId || !Number(f.monto) || f.descripcion.trim().length < 3} className="sm:col-span-5 px-4 py-2 rounded-lg bg-blue-600 text-white disabled:opacity-50">Registrar anticipo</button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100 text-sm">
        {filas.map((a) => {
          const usado = a.aplicaciones.reduce((s, x) => s + Number(x.monto), 0)
          return (
            <div key={a.id} className={`flex justify-between items-center px-4 py-2 ${a.estado === 'ANULADO' ? 'text-gray-400 line-through' : ''}`}>
              <span>{a.fecha.slice(0, 10)} · {a.productor.nombreRazonSocial} · {a.descripcion}</span>
              <span className="flex gap-3 items-center">
                <span>{clp(a.monto)}{usado ? ` (descontado ${clp(usado)})` : ''}</span>
                {a.estado === 'VIGENTE' && usado === 0 && <button onClick={() => anular(a.id)} className="text-xs text-red-600 hover:underline">Anular</button>}
              </span>
            </div>
          )
        })}
        {filas.length === 0 && <p className="px-4 py-3 text-gray-400">Sin anticipos</p>}
      </div>
    </div>
  )
}

function Cuenta({ productores }: { productores: Entidad[] }) {
  const [id, setId] = useState('')
  const [cuenta, setCuenta] = useState<CuentaProductor | null>(null)
  useEffect(() => {
    if (id) getCuentaProductor(id).then((r) => setCuenta(r.data))
    else setCuenta(null)
  }, [id])
  return (
    <div className="space-y-4 max-w-3xl">
      <select value={id} onChange={(e) => setId(e.target.value)} className={`${input} max-w-md`}>
        <option value="">Elige un productor...</option>
        {productores.map((p) => <option key={p.id} value={p.id}>{p.nombreRazonSocial}</option>)}
      </select>
      {cuenta && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-2 text-[15px]">
          <Linea label="Le debes por recepciones" valor={clp(cuenta.deuda)} />
          <Linea label="Le adelantaste (pendiente de descontar)" valor={`-${clp(cuenta.anticipado)}`} />
          <hr />
          <Linea label={Number(cuenta.saldo) >= 0 ? 'Saldo a pagarle' : 'Te debe (anticipo mayor que lo entregado)'} valor={clp(Math.abs(Number(cuenta.saldo)))} fuerte />
          {cuenta.porPagar.map((r) => (
            <p key={r.id} className="text-sm text-gray-500">Recepción {r.folio}: {kg(r.kilosPagables)} de {r.item.nombre}, {clp(r.montoAPagar)}</p>
          ))}
        </div>
      )}
    </div>
  )
}
