import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { useOnlineStatus } from '@/hooks/useOnlineStatus'
import { useSyncPendientes } from '@/hooks/useSyncPendientes'
import { useEmpresa } from '@/hooks/useEmpresa'
import { getEstadoSync, type EstadoSync } from '@/api'
import { textoEstadoSync } from '@/utils/sync'
import { pantallaDe, seccionesPara } from '@/navegacion'

const enlace = ({ isActive }: { isActive: boolean }) =>
  `block px-3 py-2.5 rounded-lg text-[15px] font-medium transition-colors ${
    isActive ? 'bg-blue-600 text-white' : 'text-gray-700 hover:bg-gray-100'
  }`

function Ayuda({ pathname }: { pathname: string }) {
  const pantalla = pantallaDe(pathname)
  const [abierta, setAbierta] = useState(false)
  if (!pantalla) return null
  return (
    <div className="mb-5 rounded-xl bg-blue-50 border border-blue-100 px-4 py-3 text-blue-900">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[15px]">{pantalla.descripcion}</p>
        <button
          onClick={() => setAbierta(!abierta)}
          className="shrink-0 text-sm font-medium text-blue-700 hover:underline"
        >
          {abierta ? 'Ocultar ayuda' : '¿Cómo se usa?'}
        </button>
      </div>
      {abierta && (
        <ul className="mt-2 space-y-1 text-sm list-disc pl-5">
          {pantalla.ayuda.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default function Layout() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const online = useOnlineStatus()
  const { sincronizando, sincronizar } = useSyncPendientes(user?.sucursalId ?? undefined)
  const [estadoSync, setEstadoSync] = useState<EstadoSync | null>(null)
  useEffect(() => {
    const leer = () => getEstadoSync().then((r) => setEstadoSync(r.data)).catch(() => {})
    leer()
    const t = setInterval(leer, 20_000)
    return () => clearInterval(t)
  }, [sincronizando])
  const sync = textoEstadoSync(estadoSync, online)
  const [menuAbierto, setMenuAbierto] = useState(false)
  const { pathname } = useLocation()

  const handleSignOut = () => {
    signOut()
    navigate('/login')
  }

  const empresa = useEmpresa()
  const secciones = seccionesPara(user?.rol, empresa?.modulos)
  const cerrarMenu = () => setMenuAbierto(false)

  return (
    <div className="flex min-h-screen bg-gray-100">
      <header className="lg:hidden fixed top-0 inset-x-0 z-30 flex items-center justify-between bg-white border-b border-gray-200 px-4 h-14">
        <span className="font-bold text-blue-600 text-lg">PYMECORE</span>
        <button
          onClick={() => setMenuAbierto(!menuAbierto)}
          className="px-3 py-1.5 rounded-lg border border-gray-300 text-sm font-medium"
        >
          {menuAbierto ? 'Cerrar' : 'Menú'}
        </button>
      </header>

      {menuAbierto && <div className="lg:hidden fixed inset-0 z-30 bg-black/30" onClick={cerrarMenu} />}

      <aside
        className={`fixed lg:static z-40 inset-y-0 left-0 w-64 bg-white border-r border-gray-200 flex flex-col transition-transform ${
          menuAbierto ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        <div className="px-4 py-5 border-b border-gray-200">
          <span className="font-bold text-blue-600 text-xl">PYMECORE</span>
          <p className="text-sm text-gray-600 mt-1 truncate">Hola, {user?.nombreCompleto?.split(' ')[0]}</p>
        </div>

        <nav className="flex-1 py-3 px-2 overflow-y-auto">
          <NavLink to="/" end className={enlace} onClick={cerrarMenu}>
            Inicio
          </NavLink>
          {secciones.map((s) => (
            <div key={s.titulo} className="mt-4">
              <p className="px-3 mb-1 text-xs font-semibold uppercase tracking-wide text-gray-400">{s.titulo}</p>
              <div className="space-y-0.5">
                {s.pantallas.map((p) => (
                  <NavLink key={p.to} to={p.to} className={enlace} onClick={cerrarMenu}>
                    {p.label}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>

        <div className="px-4 py-4 border-t border-gray-200 space-y-2">
          <div className="flex items-center gap-1.5" role="status">
            <span aria-hidden="true">{sync.enLinea ? '●' : '○'}</span>
            <span className={`text-sm font-medium ${sync.enLinea ? 'text-green-700' : 'text-red-700'}`}>{sync.conexion}</span>
          </div>
          {sync.pendientes && (
            <button
              onClick={sincronizar}
              disabled={sincronizando}
              className="flex items-center gap-1.5 text-sm text-amber-700 hover:text-amber-900 disabled:opacity-50 transition-colors"
            >
              {sincronizando ? <span className="w-3 h-3 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" /> : <span aria-hidden="true">↻</span>}
              {sincronizando ? 'Enviando...' : sync.pendientes}
            </button>
          )}
          <button onClick={handleSignOut} className="text-sm text-gray-500 hover:text-red-600 transition-colors">
            Salir
          </button>
        </div>
      </aside>

      <main className="flex-1 min-w-0 overflow-y-auto p-4 pt-18 lg:p-6">
        {sync.licencia && (
          <div role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-red-900">⛔ No se puede vender: {sync.licencia}</div>
        )}
        {sync.gracia && <div role="status" className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-900">⚠ {sync.gracia}</div>}
        <Ayuda key={pathname} pathname={pathname} />
        <Outlet />
      </main>
    </div>
  )
}
