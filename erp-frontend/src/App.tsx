import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from '@/context/AuthContext'
import Layout from '@/components/Layout'
import LoginPage from '@/pages/LoginPage'
import DashboardPage from '@/pages/DashboardPage'
import VentasPage from '@/pages/VentasPage'
import InventarioPage from '@/pages/InventarioPage'
import HistorialPage from '@/pages/HistorialPage'
import MermasPage from '@/pages/MermasPage'
import DevolucionesPage from '@/pages/DevolucionesPage'
import PreciosPage from '@/pages/PreciosPage'
import DespachosPage from '@/pages/DespachosPage'
import DocumentosPage from '@/pages/DocumentosPage'
import ClientesPage from '@/pages/ClientesPage'
import UsuariosPage from '@/pages/UsuariosPage'

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { token } = useAuth()
  return token ? <>{children}</> : <Navigate to="/login" replace />
}

function PublicOnly({ children }: { children: React.ReactNode }) {
  const { token } = useAuth()
  return token ? <Navigate to="/" replace /> : <>{children}</>
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route
            path="/login"
            element={
              <PublicOnly>
                <LoginPage />
              </PublicOnly>
            }
          />
          <Route
            path="/"
            element={
              <RequireAuth>
                <Layout />
              </RequireAuth>
            }
          >
            <Route index element={<DashboardPage />} />
            <Route path="ventas" element={<VentasPage />} />
            <Route path="inventario" element={<InventarioPage />} />
            <Route path="historial" element={<HistorialPage />} />
            <Route path="mermas" element={<MermasPage />} />
            <Route path="devoluciones" element={<DevolucionesPage />} />
            <Route path="precios" element={<PreciosPage />} />
            <Route path="despachos" element={<DespachosPage />} />
            <Route path="documentos" element={<DocumentosPage />} />
            <Route path="clientes" element={<ClientesPage />} />
            <Route path="usuarios" element={<UsuariosPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
