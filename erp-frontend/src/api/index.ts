import { api } from './client'
import type { DashboardReporte, DteRecibido, Empresa, Entidad, OrdenCompra, UnidadMedida, GuiaDespacho, Item, Oferta, StockLocal, Sucursal, Transaccion, Usuario } from '@/types'

// Auth
export const login = (username: string, password: string) =>
  api.post<{ accessToken: string; user: any }>('/auth/login', { username, password })

export const getMe = () => api.get('/auth/me')

// Sucursales
export const getSucursales = () => api.get<Sucursal[]>('/sucursales')

// Items
export const getItems = () => api.get<Item[]>('/items')

export const createItem = (data: {
  codigoSku: string
  nombre: string
  unidadMedida: string
  precioVenta: number
  costoPromedio?: number
  precioCompra?: number
  afectoIva?: boolean
}) => api.post<Item>('/items', data)

export const updateItem = (id: string, data: {
  codigoSku?: string
  nombre?: string
  unidadMedida?: string
  precioVenta?: number
  costoPromedio?: number
  precioCompra?: number
  afectoIva?: boolean
  estado?: string
}) => api.patch<Item>(`/items/${id}`, data)

// Entidades
export const getClientes = () => api.get<Entidad[]>('/entidades?tipo=CLIENTE')

export const getEntidadByRut = (rut: string) => api.get<Entidad | null>(`/entidades/rut/${rut}`)

export const createEntidad = (data: {
  tipoEntidad: string
  rut: string
  nombreRazonSocial: string
  telefono?: string
  email?: string
  direccion?: string
}) => api.post<Entidad>('/entidades', data)

// Stock
export const getStock = (sucursalId: string) =>
  api.get<StockLocal[]>(`/stock?sucursalId=${sucursalId}`)

export const getAllStock = () => api.get<StockLocal[]>('/stock')

export const getAlertas = (sucursalId?: string) =>
  api.get<StockLocal[]>(`/stock/alertas${sucursalId ? `?sucursalId=${sucursalId}` : ''}`)

export const createStock = (data: {
  sucursalId: string
  itemId: string
  stockActual: number
  stockMinimo?: number
}) => api.post<StockLocal>('/stock', data)

export const adjustStock = (id: string, data: {
  stockActual: number
  stockMinimo?: number
}) => api.patch<StockLocal>(`/stock/${id}`, data)

// Transacciones
export const getTransacciones = (sucursalId?: string) =>
  api.get<Transaccion[]>(`/transactions${sucursalId ? `?sucursalId=${sucursalId}` : ''}`)

export const getTransaccion = (id: string) =>
  api.get<Transaccion>(`/transactions/${id}`)

export const getTransaccionByFolio = (folio: string) =>
  api.get<Transaccion>(`/transactions/folio/${encodeURIComponent(folio)}`)

export const createTransaccion = (
  data: {
    sucursalId: string
    entidadId?: string
    tipoTransaccion: string
    medioPago?: string
    descuentoGlobal?: number
    rutReceptor?: string
    razonSocialReceptor?: string
    tipoDocumento?: number
    transaccionOrigenId?: string
    tipoDevolucion?: string
    observaciones?: string
    motivoMerma?: string
    detalles: { itemId: string; cantidad: number; precioUnitario?: number }[]
  },
  idempotencyKey?: string,
) =>
  api.post<Transaccion>('/transactions', data, {
    headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : undefined,
  })

// Usuarios
export const getUsuarios = () => api.get<Usuario[]>('/usuarios')

export const createUsuario = (data: {
  username: string
  password: string
  nombreCompleto: string
  rol: string
  sucursalId?: string
}) => api.post<Usuario>('/usuarios', data)

export const updateUsuario = (id: string, data: {
  nombreCompleto?: string
  password?: string
  rol?: string
  sucursalId?: string | null
  estado?: string
}) => api.patch<Usuario>(`/usuarios/${id}`, data)

export const deleteUsuario = (id: string) => api.delete<Usuario>(`/usuarios/${id}`)

// Ofertas
export const getOfertas = (soloActivas = false) =>
  api.get<Oferta[]>(`/ofertas${soloActivas ? '?soloActivas=true' : ''}`)

export const createOferta = (data: {
  itemId: string
  precioOferta: number
  descripcion?: string
  fechaInicio: string
  fechaFin: string
}) => api.post<Oferta>('/ofertas', data)

export const updateOferta = (id: string, data: {
  precioOferta?: number
  descripcion?: string
  fechaInicio?: string
  fechaFin?: string
  activo?: boolean
}) => api.patch<Oferta>(`/ofertas/${id}`, data)

export const deleteOferta = (id: string) => api.delete(`/ofertas/${id}`)

// Guías de despacho
export const getGuias = (sucursalId?: string) =>
  api.get<GuiaDespacho[]>(`/guias-despacho${sucursalId ? `?sucursalId=${sucursalId}` : ''}`)

export const getGuia = (id: string) => api.get<GuiaDespacho>(`/guias-despacho/${id}`)

export const createGuia = (data: {
  sucursalOrigenId: string
  sucursalDestinoId: string
  notas?: string
  detalles: { itemId: string; cantidad: number }[]
}) => api.post<GuiaDespacho>('/guias-despacho', data)

export const recibirGuia = (id: string) => api.patch<GuiaDespacho>(`/guias-despacho/${id}/recibir`, {})

export const anularGuia = (id: string) => api.patch<GuiaDespacho>(`/guias-despacho/${id}/anular`, {})

// Sync
export const getSyncPendientes = (sucursalId?: string) =>
  api.get<{ pendientes: number }>(`/sync/pendientes${sucursalId ? `?sucursalId=${sucursalId}` : ''}`)

export const ejecutarSync = (sucursalId?: string) =>
  api.post<{ sincronizados: number; errores: number; detalle: { folio: string; resultado: string }[] }>(
    `/sync/ejecutar${sucursalId ? `?sucursalId=${sucursalId}` : ''}`,
    {}
  )

// Reportes
export const getDashboard = (params: {
  desde: string
  hasta: string
  granularidad: 'dia' | 'semana' | 'mes'
  sucursalId?: string
}) => api.get<DashboardReporte>('/reportes/dashboard', { params })

// Empresa y catálogos
export const getEmpresa = () => api.get<Empresa>('/empresa')

export const updateEmpresa = (data: Partial<Omit<Empresa, 'id' | 'tasaIva'>> & { tasaIva?: number }) =>
  api.patch<Empresa>('/empresa', data)

export const getUnidades = () => api.get<UnidadMedida[]>('/unidades')

export const createUnidad = (data: UnidadMedida) => api.post<UnidadMedida>('/unidades', data)

// Compras
export const getProveedores = () => api.get<Entidad[]>('/entidades?tipo=PROVEEDOR')

export const getOrdenesCompra = (params: { sucursalId?: string; estado?: string } = {}) =>
  api.get<OrdenCompra[]>('/compras/ordenes', { params })

export const getOrdenCompra = (id: string) => api.get<OrdenCompra>(`/compras/ordenes/${id}`)

export const createOrdenCompra = (data: {
  proveedorId: string
  sucursalId: string
  fechaEntrega?: string
  notas?: string
  detalles: { itemId: string; cantidad: number; costoUnitario: number }[]
}) => api.post<OrdenCompra>('/compras/ordenes', data)

export const recibirOrdenCompra = (id: string, data: {
  guiaDespacho?: string
  detalles: { detalleId: string; cantidad: number }[]
}) => api.post(`/compras/ordenes/${id}/recepciones`, data)

export const facturarOrdenCompra = (id: string, data: {
  dteId?: string
  folio: string
  fechaEmision: string
  fechaVencimiento?: string
  montoTotal?: number
  detalles: { detalleId: string; cantidad: number; costoUnitario: number }[]
}) => api.post(`/compras/ordenes/${id}/facturas`, data)

export const cerrarOrdenCompra = (id: string) => api.patch(`/compras/ordenes/${id}/cerrar`, {})

export const anularOrdenCompra = (id: string) => api.patch(`/compras/ordenes/${id}/anular`, {})

export const anularRecepcionCompra = (id: string) => api.patch(`/compras/recepciones/${id}/anular`, {})

export const anularFacturaCompra = (id: string) => api.patch(`/compras/facturas/${id}/anular`, {})

// DTE recibidos
export const importarDte = (xml: string) => api.post<DteRecibido>('/compras/dte', { xml })

export const getDtes = (estado?: string) =>
  api.get<DteRecibido[]>('/compras/dte', { params: estado ? { estado } : undefined })

export const registrarGastoDte = (id: string, data: { categoria: string; descripcion?: string }) =>
  api.post<DteRecibido>(`/compras/dte/${id}/gasto`, data)

export const descartarDte = (id: string, motivo: string) =>
  api.patch<DteRecibido>(`/compras/dte/${id}/descartar`, { motivo })
