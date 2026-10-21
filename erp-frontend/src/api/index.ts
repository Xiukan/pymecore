import { api } from './client'
import type { AnticipoProductor, CuentaProductor, Lote, RecepcionProductor, TrazabilidadLote, AsientoContable, Balance, CuentaContable, EstadoResultados, LibroMayor, CategoriaGasto, Libro, PorCobrar, PorPagar, ResumenIva, SesionCaja, DashboardReporte, DteRecibido, Gasto, ListadoGastos, Empresa, Entidad, OrdenCompra, UnidadMedida, GuiaDespacho, Item, Oferta, StockLocal, Sucursal, Transaccion, Usuario } from '@/types'

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
  humedadBasePct?: number
  retencionIvaPct?: number
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
    pagos?: { medioPago: string; monto: number }[]
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

export const updateEmpresa = (
  data: Partial<Omit<Empresa, 'id' | 'tasaIva' | 'tasaRetencionHonorarios'>> & { tasaIva?: number; tasaRetencionHonorarios?: number },
) =>
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

export const registrarGastoDte = (id: string, data: { categoriaId: string; descripcion?: string }) =>
  api.post<DteRecibido>(`/compras/dte/${id}/gasto`, data)

export const descartarDte = (id: string, motivo: string) =>
  api.patch<DteRecibido>(`/compras/dte/${id}/descartar`, { motivo })

// Gastos
export const getCategoriasGasto = () => api.get<CategoriaGasto[]>('/gastos/categorias')

export const createCategoriaGasto = (data: { nombre: string; ivaRecuperable: boolean }) =>
  api.post<CategoriaGasto>('/gastos/categorias', data)

export const updateCategoriaGasto = (id: string, data: Partial<Pick<CategoriaGasto, 'nombre' | 'ivaRecuperable' | 'activa'>>) =>
  api.patch<CategoriaGasto>(`/gastos/categorias/${id}`, data)

export const getGastos = (params: { desde?: string; hasta?: string; categoriaId?: string; estadoPago?: string; sucursalId?: string }) =>
  api.get<ListadoGastos>('/gastos', { params })

export const createGasto = (data: {
  categoriaId: string
  sucursalId?: string
  proveedorId?: string
  descripcion: string
  tipoDocumento: string
  numeroDocumento?: string
  monto: number
  fecha: string
  fechaVencimiento?: string
  medioPago?: string
}) => api.post<Gasto>('/gastos', data)

export const pagarGasto = (id: string, data: { medioPago: string; fechaPago?: string }) =>
  api.patch<Gasto>(`/gastos/${id}/pagar`, data)

export const anularGasto = (id: string) => api.patch<Gasto>(`/gastos/${id}/anular`, {})

// Caja
export const getCajaActual = () => api.get<SesionCaja | null>('/caja/actual')

export const abrirCaja = (data: { sucursalId: string; montoApertura: number }) => api.post<SesionCaja>('/caja/abrir', data)

export const cerrarCaja = (id: string, data: { efectivoContado: number; observaciones?: string }) =>
  api.post<SesionCaja>(`/caja/${id}/cerrar`, data)

export const getSesionesCaja = (params: { sucursalId?: string; desde?: string; hasta?: string } = {}) =>
  api.get<SesionCaja[]>('/caja/sesiones', { params })

// Tributario
export const getLibroVentas = (mes: string) => api.get<Libro>('/tributario/libro-ventas', { params: { mes } })
export const getLibroCompras = (mes: string) => api.get<Libro>('/tributario/libro-compras', { params: { mes } })
export const getResumenIva = (mes: string) => api.get<ResumenIva>('/tributario/resumen-iva', { params: { mes } })

// Cuentas por cobrar y por pagar
export const updateEntidad = (id: string, data: { cupoCredito?: number; diasCredito?: number }) =>
  api.patch<Entidad>(`/entidades/${id}`, data)

export const getPorCobrar = () => api.get<PorCobrar>('/cuentas/por-cobrar')

export const registrarAbono = (data: { transaccionId: string; monto: number; medioPago: string }) =>
  api.post('/cuentas/abonos', data)

export const getPorPagar = () => api.get<PorPagar>('/cuentas/por-pagar')

export const pagarFacturaCompra = (id: string, medioPago: string) =>
  api.patch(`/cuentas/facturas-compra/${id}/pagar`, { medioPago })

// Contabilidad
export const getResultados = (params: { desde?: string; hasta?: string }) =>
  api.get<EstadoResultados>('/contabilidad/resultados', { params })
export const getBalance = (params: { desde?: string; hasta?: string }) => api.get<Balance>('/contabilidad/balance', { params })
export const getDiario = (mes: string) => api.get<{ mes: string; asientos: AsientoContable[] }>('/contabilidad/diario', { params: { mes } })
export const getMayor = (cuenta: string, params: { desde?: string; hasta?: string }) =>
  api.get<LibroMayor>(`/contabilidad/mayor/${cuenta}`, { params })
export const getCuentasContables = () => api.get<CuentaContable[]>('/contabilidad/cuentas')
export const crearAsientoManual = (data: { fecha: string; glosa: string; lineas: { cuenta: string; debe?: number; haber?: number }[] }) =>
  api.post('/contabilidad/asientos', data)
export const eliminarAsientoManual = (id: string) => api.delete(`/contabilidad/asientos/${id}`)
export const getPeriodosCerrados = () => api.get<{ mes: string; cerradoEn: string }[]>('/contabilidad/periodos')
export const cerrarPeriodo = (mes: string) => api.post(`/contabilidad/periodos/${mes}/cerrar`, {})
export const reabrirPeriodo = (mes: string) => api.delete(`/contabilidad/periodos/${mes}`)

// Productores y lotes
export const getRecepcionesProductor = (params: { productorId?: string; estadoPago?: string } = {}) =>
  api.get<RecepcionProductor[]>('/productores/recepciones', { params })
export const crearRecepcionProductor = (data: {
  productorId: string
  sucursalId: string
  itemId: string
  pesoBruto: number
  tara: number
  humedadPct?: number
  impurezasPct?: number
  precioKilo: number
  tipoDocumento: string
  folioDocumento?: string
  fechaVencimiento?: string
  observaciones?: string
}) => api.post<RecepcionProductor>('/productores/recepciones', data)
export const anularRecepcionProductor = (id: string) => api.patch(`/productores/recepciones/${id}/anular`, {})
export const pagarRecepcionProductor = (id: string, medioPago: string) =>
  api.post<RecepcionProductor>(`/productores/recepciones/${id}/pagar`, { medioPago })
export const getAnticiposProductor = () => api.get<AnticipoProductor[]>('/productores/anticipos')
export const crearAnticipoProductor = (data: { productorId: string; monto: number; medioPago: string; descripcion: string }) =>
  api.post('/productores/anticipos', data)
export const anularAnticipoProductor = (id: string) => api.patch(`/productores/anticipos/${id}/anular`, {})
export const getCuentaProductor = (id: string) => api.get<CuentaProductor>(`/productores/${id}/cuenta`)
export const getLotes = (params: { sucursalId?: string; itemId?: string; conSaldo?: boolean } = {}) =>
  api.get<Lote[]>('/lotes', { params })
export const getLotesPorVencer = (dias = 30, sucursalId?: string) =>
  api.get<Lote[]>('/lotes/por-vencer', { params: { dias, sucursalId } })
export const getTrazabilidadLote = (id: string) => api.get<TrazabilidadLote>(`/lotes/${id}`)
