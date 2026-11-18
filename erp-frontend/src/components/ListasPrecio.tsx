import { useEffect, useState } from 'react'
import { asignarListaCliente, crearListaPrecio, getClientes, getItems, getListasPrecio, guardarPreciosLista } from '@/api'
import type { Entidad, Item, ListaPrecio } from '@/types'
import { mensajeError } from '@/utils/contabilidad'
import { clp } from '@/utils/formato'

/** Precios especiales por tipo de cliente (mayorista, distribuidor) y a qué clientes aplican. */
export default function ListasPrecio() {
  const [listas, setListas] = useState<ListaPrecio[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [clientes, setClientes] = useState<Entidad[]>([])
  const [sel, setSel] = useState('')
  const [nombre, setNombre] = useState('')
  const [editados, setEditados] = useState<Record<string, string>>({})
  const [cliente, setCliente] = useState('')
  const [msg, setMsg] = useState('')
  const cargar = () => getListasPrecio().then((r) => { setListas(r.data); setSel((s) => s || r.data[0]?.id || '') })
  useEffect(() => {
    cargar()
    getItems().then((r) => setItems(r.data.filter((i) => i.estado === 'Activo')))
    getClientes().then((r) => setClientes(r.data))
  }, [])
  const lista = listas.find((l) => l.id === sel)
  const accion = async (fn: () => Promise<unknown>, ok: string) => {
    setMsg('')
    try {
      await fn()
      setMsg(ok)
      setEditados({})
      cargar()
    } catch (e) {
      setMsg(mensajeError(e))
    }
  }
  return (
    <section className="bg-white rounded-xl border border-gray-200 p-5 space-y-4 text-sm">
      <div className="flex flex-wrap justify-between items-center gap-3">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Precios por tipo de cliente</h2>
          <p className="text-gray-500">Ej: "Mayorista". Al identificar al cliente en la venta se cobra su precio (o la oferta, si es menor).</p>
        </div>
        <div className="flex gap-2">
          <input placeholder="Nueva lista" value={nombre} onChange={(e) => setNombre(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2" />
          <button disabled={nombre.trim().length < 2} onClick={() => accion(() => crearListaPrecio(nombre.trim()).then(() => setNombre('')), 'Lista creada.')} className="px-3 py-2 rounded-lg border border-gray-300 disabled:opacity-50">Crear</button>
        </div>
      </div>
      {listas.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {listas.map((l) => (
            <button key={l.id} onClick={() => { setSel(l.id); setEditados({}) }} className={`px-3 py-1.5 rounded-full border ${sel === l.id ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-gray-300'}`}>
              {l.nombre} ({l.clientes.length} clientes)
            </button>
          ))}
        </div>
      )}
      {msg && <p className="text-gray-700">{msg}</p>}
      {lista && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 max-h-96 overflow-y-auto border border-gray-100 rounded-lg">
            <table className="w-full">
              <thead className="bg-gray-50 text-gray-500 text-xs uppercase sticky top-0"><tr><th className="px-3 py-2 text-left">Producto</th><th className="px-3 py-2 text-right">Precio normal</th><th className="px-3 py-2 text-right">Precio {lista.nombre}</th></tr></thead>
              <tbody className="divide-y divide-gray-100">
                {items.map((i) => {
                  const actual = lista.precios.find((p) => p.itemId === i.id)?.precio
                  return (
                    <tr key={i.id}>
                      <td className="px-3 py-1.5">{i.nombre}</td>
                      <td className="px-3 py-1.5 text-right text-gray-500">{clp(i.precioVenta)}</td>
                      <td className="px-3 py-1.5 text-right">
                        <input inputMode="numeric" placeholder="—" value={editados[i.id] ?? (actual ? String(Number(actual)) : '')}
                          onChange={(e) => setEditados({ ...editados, [i.id]: e.target.value.replace(/\D/g, '') })}
                          className="w-28 text-right border border-gray-200 rounded px-2 py-1" />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className="space-y-3">
            <button disabled={!Object.keys(editados).length}
              onClick={() => accion(() => guardarPreciosLista(lista.id, Object.entries(editados).map(([itemId, v]) => ({ itemId, precio: Number(v) || 0 }))), 'Precios guardados.')}
              className="w-full px-4 py-2 rounded-lg bg-blue-600 text-white disabled:opacity-50">Guardar precios</button>
            <p className="text-xs text-gray-500">Deja vacío o en 0 para cobrar el precio normal. Precios con IVA incluido.</p>
            <div>
              <p className="font-medium mb-1">Clientes con esta lista</p>
              {lista.clientes.map((c) => (
                <p key={c.id} className="flex justify-between text-gray-600">{c.nombreRazonSocial}
                  <button onClick={() => accion(() => asignarListaCliente(c.id, null), 'Cliente quitado.')} className="text-xs text-red-600 hover:underline">Quitar</button>
                </p>
              ))}
              <div className="flex gap-2 mt-2">
                <select value={cliente} onChange={(e) => setCliente(e.target.value)} className="flex-1 border border-gray-300 rounded-lg px-2 py-1.5">
                  <option value="">Agregar cliente...</option>
                  {clientes.filter((c) => !lista.clientes.some((x) => x.id === c.id)).map((c) => <option key={c.id} value={c.id}>{c.nombreRazonSocial}</option>)}
                </select>
                <button disabled={!cliente} onClick={() => accion(() => asignarListaCliente(cliente, lista.id).then(() => setCliente('')), 'Cliente agregado.')} className="px-3 py-1.5 rounded bg-blue-600 text-white disabled:opacity-50">Agregar</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
