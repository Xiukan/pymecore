import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { useNavigate } from 'react-router-dom'
import { useOnlineStatus } from '@/hooks/useOnlineStatus'
import { useSyncPendientes } from '@/hooks/useSyncPendientes'

const navItems = [
  { to: '/', label: 'Dashboard', end: true, roles: null },
  { to: '/ventas', label: 'Ventas POS', end: false, roles: null },
  { to: '/inventario', label: 'Inventario', end: false, roles: null },
  { to: '/historial', label: 'Historial ventas', end: false, roles: null },
  { to: '/mermas', label: 'Mermas', end: false, roles: ['Administrador', 'Encargado'] },
  { to: '/devoluciones', label: 'Devoluciones', end: false, roles: null },
  { to: '/precios', label: 'Precios / Ofertas', end: false, roles: ['Administrador', 'Encargado'] },
  { to: '/despachos', label: 'Despacho sucursales', end: false, roles: ['Administrador', 'Encargado'] },
  { to: '/documentos', label: 'Documentos', end: false, roles: null },
  { to: '/clientes', label: 'Clientes', end: false, roles: null },
  { to: '/usuarios', label: 'Usuarios', end: false, roles: ['Administrador'] },
]

function forzarOffline() {
  Object.defineProperty(navigator, 'onLine', { get: () => false, configurable: true })
  window.dispatchEvent(new Event('offline'))
}

function forzarOnline() {
  Object.defineProperty(navigator, 'onLine', { get: () => true, configurable: true })
  window.dispatchEvent(new Event('online'))
}

export default function Layout() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const online = useOnlineStatus()
  const { pendientes, sincronizando, sincronizar } = useSyncPendientes(user?.sucursalId)

  const handleSignOut = () => {
    signOut()
    navigate('/login')
  }

  const itemsVisibles = navItems.filter(
    (item) => !item.roles || item.roles.includes(user?.rol ?? ''),
  )

  return (
    <div className="flex min-h-screen bg-gray-100">
      <aside className="w-56 bg-white border-r border-gray-200 flex flex-col">
        <div className="px-4 py-5 border-b border-gray-200">
          <span className="font-bold text-blue-600 text-lg">PYMECORE</span>
          <p className="text-xs text-gray-400 mt-0.5">{user?.rol}</p>
        </div>

        <nav className="flex-1 py-4 px-2 space-y-0.5 overflow-y-auto">
          {itemsVisibles.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `block px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-gray-600 hover:bg-gray-100'
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="px-4 py-4 border-t border-gray-200 space-y-2">
          <div className="flex items-center gap-1.5">
            <span
              className={`w-2 h-2 rounded-full ${online ? 'bg-green-500' : 'bg-red-500'}`}
            />
            <span className={`text-xs font-medium ${online ? 'text-green-600' : 'text-red-600'}`}>
              {online ? 'En línea' : 'Sin conexión'}
            </span>
          </div>
          {pendientes > 0 && (
            <button
              onClick={sincronizar}
              disabled={sincronizando || !online}
              className="flex items-center gap-1.5 text-xs text-amber-600 hover:text-amber-800 disabled:opacity-50 transition-colors"
            >
              {sincronizando ? (
                <span className="w-3 h-3 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
              ) : (
                <span className="w-2 h-2 rounded-full bg-amber-500" />
              )}
              {sincronizando ? 'Sincronizando...' : `${pendientes} pendiente${pendientes > 1 ? 's' : ''}`}
            </button>
          )}
          {import.meta.env.DEV && (
            <div className="flex gap-1 pt-1 border-t border-dashed border-gray-200">
              <button
                onClick={online ? forzarOffline : forzarOnline}
                className={`flex-1 text-xs px-2 py-1 rounded font-medium transition-colors ${
                  online
                    ? 'bg-red-50 text-red-600 hover:bg-red-100'
                    : 'bg-green-50 text-green-600 hover:bg-green-100'
                }`}
              >
                {online ? 'Simular offline' : 'Simular online'}
              </button>
            </div>
          )}
          <p className="text-xs text-gray-500 truncate">{user?.nombreCompleto}</p>
          <button
            onClick={handleSignOut}
            className="text-xs text-gray-400 hover:text-red-600 transition-colors"
          >
            Cerrar sesion
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto p-6">
        <Outlet />
      </main>
    </div>
  )
}
