import { useEffect, useState } from 'react'
import { getUsuarios, getSucursales, createUsuario, updateUsuario, deleteUsuario } from '@/api'
import type { Usuario, Sucursal } from '@/types'

type FormData = {
  username: string
  password: string
  nombreCompleto: string
  rol: string
  sucursalId: string
}

const EMPTY_FORM: FormData = {
  username: '',
  password: '',
  nombreCompleto: '',
  rol: 'Vendedor',
  sucursalId: '',
}

export default function UsuariosPage() {
  const [usuarios, setUsuarios] = useState<Usuario[]>([])
  const [sucursales, setSucursales] = useState<Sucursal[]>([])
  const [modalAbierto, setModalAbierto] = useState(false)
  const [editando, setEditando] = useState<Usuario | null>(null)
  const [form, setForm] = useState<FormData>(EMPTY_FORM)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const cargar = () =>
    getUsuarios().then((r) => setUsuarios(r.data))

  useEffect(() => {
    cargar()
    getSucursales().then((r) => setSucursales(r.data))
  }, [])

  const abrirCrear = () => {
    setEditando(null)
    setForm(EMPTY_FORM)
    setError('')
    setModalAbierto(true)
  }

  const abrirEditar = (u: Usuario) => {
    setEditando(u)
    setForm({
      username: u.username,
      password: '',
      nombreCompleto: u.nombreCompleto,
      rol: u.rol,
      sucursalId: u.sucursalId ?? '',
    })
    setError('')
    setModalAbierto(true)
  }

  const cerrar = () => {
    setModalAbierto(false)
    setEditando(null)
  }

  const guardar = async () => {
    setError('')
    setLoading(true)
    try {
      if (editando) {
        await updateUsuario(editando.id, {
          nombreCompleto: form.nombreCompleto,
          rol: form.rol,
          sucursalId: form.sucursalId || null,
          password: form.password || undefined,
        })
      } else {
        if (!form.username || !form.password || !form.nombreCompleto) {
          setError('Completa todos los campos obligatorios')
          return
        }
        await createUsuario({
          username: form.username,
          password: form.password,
          nombreCompleto: form.nombreCompleto,
          rol: form.rol,
          sucursalId: form.sucursalId || undefined,
        })
      }
      await cargar()
      cerrar()
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } }).response?.data?.message ??
        'Error al guardar'
      setError(Array.isArray(msg) ? msg.join(', ') : msg)
    } finally {
      setLoading(false)
    }
  }

  const desactivar = async (u: Usuario) => {
    if (!confirm(`¿Desactivar a ${u.nombreCompleto}?`)) return
    await deleteUsuario(u.id)
    await cargar()
  }

  const reactivar = async (u: Usuario) => {
    await updateUsuario(u.id, { estado: 'Activo' })
    await cargar()
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">Usuarios</h1>
        <button
          onClick={abrirCrear}
          className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          Nuevo usuario
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
            <tr>
              <th className="px-4 py-3 text-left">Nombre</th>
              <th className="px-4 py-3 text-left">Usuario</th>
              <th className="px-4 py-3 text-left">Rol</th>
              <th className="px-4 py-3 text-left">Sucursal</th>
              <th className="px-4 py-3 text-left">Estado</th>
              <th className="px-4 py-3 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {usuarios.map((u) => (
              <tr key={u.id} className={u.estado === 'Inactivo' ? 'opacity-50' : ''}>
                <td className="px-4 py-3 font-medium">{u.nombreCompleto}</td>
                <td className="px-4 py-3 font-mono text-xs text-gray-500">{u.username}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                    u.rol === 'Administrador'
                      ? 'bg-purple-100 text-purple-700'
                      : u.rol === 'Encargado'
                      ? 'bg-blue-100 text-blue-700'
                      : 'bg-gray-100 text-gray-700'
                  }`}>
                    {u.rol}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-500">
                  {u.sucursal?.nombre ?? <span className="text-gray-300">—</span>}
                </td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                    u.estado === 'Activo'
                      ? 'bg-green-100 text-green-700'
                      : 'bg-red-100 text-red-700'
                  }`}>
                    {u.estado}
                  </span>
                </td>
                <td className="px-4 py-3 text-right space-x-2">
                  <button
                    onClick={() => abrirEditar(u)}
                    className="text-xs text-blue-600 hover:underline"
                  >
                    Editar
                  </button>
                  {u.estado === 'Activo' ? (
                    <button
                      onClick={() => desactivar(u)}
                      className="text-xs text-red-500 hover:underline"
                    >
                      Desactivar
                    </button>
                  ) : (
                    <button
                      onClick={() => reactivar(u)}
                      className="text-xs text-green-600 hover:underline"
                    >
                      Activar
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {usuarios.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-gray-400">
                  Sin usuarios
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {modalAbierto && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md">
            <h2 className="text-base font-semibold text-gray-900 mb-4">
              {editando ? 'Editar usuario' : 'Nuevo usuario'}
            </h2>

            <div className="space-y-3">
              {!editando && (
                <Field label="Username *">
                  <input
                    type="text"
                    value={form.username}
                    onChange={(e) => setForm({ ...form, username: e.target.value })}
                    className={inputCls}
                  />
                </Field>
              )}

              <Field label={editando ? 'Nueva contraseña (dejar vacío para no cambiar)' : 'Contraseña *'}>
                <input
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  className={inputCls}
                />
              </Field>

              <Field label="Nombre completo *">
                <input
                  type="text"
                  value={form.nombreCompleto}
                  onChange={(e) => setForm({ ...form, nombreCompleto: e.target.value })}
                  className={inputCls}
                />
              </Field>

              <Field label="Rol">
                <select
                  value={form.rol}
                  onChange={(e) => setForm({ ...form, rol: e.target.value })}
                  className={inputCls}
                >
                  <option value="Vendedor">Vendedor</option>
                  <option value="Encargado">Encargado</option>
                  <option value="Administrador">Administrador</option>
                </select>
              </Field>

              <Field label="Sucursal">
                <select
                  value={form.sucursalId}
                  onChange={(e) => setForm({ ...form, sucursalId: e.target.value })}
                  className={inputCls}
                >
                  <option value="">Sin sucursal (acceso global)</option>
                  {sucursales.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.nombre}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            {error && (
              <p className="mt-3 text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">
                {error}
              </p>
            )}

            <div className="flex justify-end gap-2 mt-5">
              <button
                onClick={cerrar}
                className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={guardar}
                disabled={loading}
                className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg transition-colors"
              >
                {loading ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const inputCls =
  'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs text-gray-500 mb-1">{label}</label>
      {children}
    </div>
  )
}
