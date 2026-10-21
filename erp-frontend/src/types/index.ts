export interface User {
  id: string
  username: string
  nombreCompleto: string
  rol: 'Administrador' | 'Encargado' | 'Vendedor'
  estado: string
  sucursalId: string | null
}

export interface AuthState {
  user: User | null
  token: string | null
}

export interface Sucursal {
  id: string
  nombre: string
  direccion: string | null
}

export interface Item {
  id: string
  codigoSku: string
  nombre: string
  unidadMedida: string
  precioVenta: string
  costoPromedio: string
  afectoIva: boolean
  retencionIvaPct?: string
  humedadBasePct?: string
  estado: string
}

export interface Entidad {
  id: string
  tipoEntidad: 'CLIENTE' | 'PROVEEDOR'
  rut: string
  nombreRazonSocial: string
  telefono: string | null
  email: string | null
  direccion?: string | null
  estado: string
  cupoCredito?: string
  diasCredito?: number
}

export interface StockLocal {
  id: string
  sucursalId: string
  itemId: string
  stockActual: string
  stockMinimo: string
  item: Pick<Item, 'id' | 'nombre' | 'codigoSku' | 'unidadMedida'>
}

export interface TransaccionDetalle {
  id: string
  itemId: string
  cantidad: string
  precioUnitario: string
  montoIva: string
  subtotal: string
  item?: Pick<Item, 'nombre' | 'codigoSku'>
}

export interface Usuario {
  id: string
  username: string
  nombreCompleto: string
  rol: 'Administrador' | 'Encargado' | 'Vendedor'
  estado: 'Activo' | 'Inactivo'
  sucursalId: string | null
  creadoEn: string
  sucursal: { nombre: string } | null
}

export interface Transaccion {
  id: string
  sucursalId: string
  tipoTransaccion: 'VENTA' | 'COMPRA' | 'MERMA' | 'DEVOLUCION' | 'NOTA_CREDITO'
  fechaRegistro: string
  medioPago: string
  montoTotal: string
  estado: string
  numeroFactura: string | null
  transaccionOrigenId: string | null
  tipoDevolucion: 'CAMBIO_PRODUCTO' | 'FALLA' | 'DESISTIMIENTO' | null
  observaciones: string | null
  motivoMerma: string | null
  sincronizacion: 'PENDIENTE' | 'ENVIANDO' | 'SINCRONIZADO' | 'ERROR'
  metadatosSii: Record<string, any> | null
  entidad?: Pick<Entidad, 'nombreRazonSocial' | 'rut'> | null
  detalles?: TransaccionDetalle[]
}

export interface Oferta {
  id: string
  itemId: string
  precioOferta: string
  descripcion: string | null
  fechaInicio: string
  fechaFin: string
  activo: boolean
  creadoEn: string
  item: Pick<Item, 'id' | 'nombre' | 'codigoSku' | 'precioVenta'>
}

export interface GuiaDetalle {
  id: string
  itemId: string
  cantidad: string
  item: Pick<Item, 'nombre' | 'codigoSku' | 'unidadMedida'>
}

export interface GuiaDespacho {
  id: string
  folio: number
  sucursalOrigenId: string
  sucursalDestinoId: string
  usuarioId: string
  fechaEmision: string
  fechaRecepcion: string | null
  estado: 'PENDIENTE' | 'EN_TRANSITO' | 'RECIBIDO' | 'ANULADO'
  notas: string | null
  sucursalOrigen: { nombre: string }
  sucursalDestino: { nombre: string }
  usuario: { nombreCompleto: string }
  detalles: GuiaDetalle[]
}

export interface RankingFila {
  nombre: string
  monto: number
  ventas: number
  unidades: number
  margen: number
}

export interface DashboardReporte {
  kpis: {
    ventasTotales: number
    numVentas: number
    ticketPromedio: number
    unidadesVendidas: number
    margenBruto: number
    margenPct: number
    clientesUnicos: number
    devoluciones: number
    numDevoluciones: number
    costoMermas: number
    gastos: number
    resultado: number
  }
  serie: { periodo: string; monto: number; ventas: number; margen: number }[]
  mediosPago: { medio: string; monto: number }[]
  productos: { itemId: string; nombre: string; sku: string; monto: number; unidades: number; margen: number; lineas: number }[]
  sucursales: RankingFila[]
  vendedores: RankingFila[]
  inventario: { sucursal: string; valor: number; productos: number; alertas: number }[]
}

export interface Empresa {
  id: number
  rut: string
  razonSocial: string
  giro: string
  direccion: string
  comuna: string
  tasaIva: string
  diasCambio: number
  rutConsumidorFinal: string
  nombreConsumidorFinal: string
  topeGastoSinDocumento: number
  tasaRetencionHonorarios: string
}

export interface UnidadMedida {
  codigo: string
  nombre: string
}

export type EstadoOrdenCompra = 'ABIERTA' | 'CERRADA' | 'ANULADA'
export type SituacionCompra = 'SIN_RECEPCION' | 'RECEPCION_PARCIAL' | 'POR_FACTURAR' | 'COMPLETA'

export interface DetalleOrdenCompra {
  id: string
  itemId: string
  cantidad: string
  costoUnitario: string
  subtotal: string
  item: { nombre: string; codigoSku: string; unidadMedida: string }
  recibido?: string
  facturado?: string
  porRecibir?: string
  porFacturar?: string
}

export interface DocumentoCompra {
  id: string
  estado: 'VIGENTE' | 'ANULADO'
  usuario: { nombreCompleto: string }
  detalles: { id: string; detalleOrdenId: string; cantidad: string; costoUnitario?: string; subtotal?: string }[]
}

export interface RecepcionCompra extends DocumentoCompra {
  guiaDespacho: string | null
  fecha: string
}

export interface FacturaCompra extends DocumentoCompra {
  folio: string
  fechaEmision: string
  fechaVencimiento: string | null
  montoNeto: string
  montoIva: string
  montoTotal: string
}

export interface OrdenCompra {
  id: string
  folio: number
  estado: EstadoOrdenCompra
  fechaEmision: string
  fechaEntrega: string | null
  notas: string | null
  montoNeto: string
  montoIva: string
  montoTotal: string
  proveedor: { id: string; rut: string; nombreRazonSocial: string }
  sucursal: { id: string; nombre: string }
  usuario: { nombreCompleto: string }
  detalles: DetalleOrdenCompra[]
  resumen: { porRecibir: string; porFacturar: string; situacion: SituacionCompra }
  recepciones?: RecepcionCompra[]
  facturas?: FacturaCompra[]
}

export type EstadoDteRecibido = 'PENDIENTE' | 'ASOCIADO_OC' | 'GASTO' | 'DESCARTADO'

export interface DteRecibido {
  id: string
  tipoDte: number
  folio: string
  rutEmisor: string
  razonSocialEmisor: string
  fechaEmision: string
  fechaVencimiento: string | null
  montoNeto: string
  montoExento: string
  iva: string
  otrosImpuestos: string
  montoTotal: string
  referenciaOc: string | null
  detalle: {
    lineas: { linea: number; nombre: string; descripcion?: string; cantidad?: string; unidad?: string; precio?: string; exento: boolean; monto: string }[]
    otrosImpuestos: { tipo: string; tasa?: string; monto: string }[]
  }
  observaciones: string[]
  timbreValido: boolean
  firmaValida: boolean
  sha256: string
  estado: EstadoDteRecibido
  motivoDescarte: string | null
  facturaCompraId: string | null
  gastoId: string | null
  creadoEn: string
  proveedor: { id: string; rut: string; nombreRazonSocial: string }
  usuario: { nombreCompleto: string }
}

export type TipoDocumentoGasto = 'FACTURA' | 'BOLETA' | 'BOLETA_HONORARIOS' | 'SIN_DOCUMENTO'
export type MedioPagoGasto = 'Efectivo' | 'Tarjeta' | 'Transferencia'

export interface CategoriaGasto {
  id: string
  nombre: string
  ivaRecuperable: boolean
  activa: boolean
}

export interface Gasto {
  id: string
  descripcion: string
  tipoDocumento: TipoDocumentoGasto
  numeroDocumento: string | null
  montoNeto: string
  iva: string
  retencion: string
  total: string
  monto: string
  fechaRegistro: string
  fechaVencimiento: string | null
  estadoPago: 'POR_PAGAR' | 'PAGADO'
  fechaPago: string | null
  medioPago: string | null
  categoria: { id: string; nombre: string; ivaRecuperable: boolean }
  sucursal: { id: string; nombre: string } | null
  proveedor: { id: string; rut: string; nombreRazonSocial: string } | null
  usuario: { nombreCompleto: string }
  dte: { id: string; tipoDte: number; folio: string } | null
}

export interface ListadoGastos {
  gastos: Gasto[]
  resumen: { costo: string; porPagar: string; porCategoria: { categoria: string; monto: string }[] }
}

export interface ResumenCaja {
  porMedio: { medio: string; ventas: number; montoVentas: string; reembolsos: number; montoReembolsos: string }[]
  totalVentas: string
  efectivoEsperado: string
}

export interface SesionCaja {
  id: string
  sucursalId: string
  usuarioId: string
  estado: 'ABIERTA' | 'CERRADA'
  montoApertura: string
  abiertaEn: string
  cerradaEn: string | null
  efectivoEsperado: string | null
  efectivoContado: string | null
  diferencia: string | null
  observaciones: string | null
  resumen: ResumenCaja | null
  sucursal?: { nombre: string }
  usuario?: { nombreCompleto: string }
}

export interface FilaLibro {
  fecha: string
  tipoDte: number
  folio: string
  rut: string
  razonSocial: string
  neto: string
  exento: string
  iva: string
  otros: string
  total: string
  ivaRecuperable?: boolean
  origen?: string
}

export interface Libro {
  mes: string
  filas: FilaLibro[]
  totales: { tipoDte: number; documentos: number; neto: string; exento: string; iva: string; otros: string; total: string }[]
}

export interface ResumenIva {
  mes: string
  ventasNetas: string
  comprasNetas: string
  debito: string
  credito: string
  ivaNoRecuperable: string
  ivaAPagar: string
  remanente: string
  retencionHonorarios: string
  retencionIva: string
  totalAPagar: string
}

export type Tramos = { porVencer: string; d1a30: string; d31a60: string; d61a90: string; mas90: string }

export interface PorCobrar {
  porTramo: Tramos
  clientes: {
    cliente: { id: string; rut?: string; nombre?: string }
    saldo: string
    porTramo: Tramos
    documentos: { transaccionId: string; folio: string | null; fecha: string; vencimiento: string; total: string; saldo: string }[]
  }[]
}

export interface PorPagar {
  porTramo: Tramos
  documentos: { tipo: 'FACTURA_COMPRA' | 'GASTO'; id: string; documento: string; proveedor: string; rut: string; vencimiento: string; saldo: string }[]
}

export interface CuentaContable {
  codigo: string
  nombre: string
  tipo: 'ACTIVO' | 'PASIVO' | 'PATRIMONIO' | 'INGRESO' | 'GASTO'
  activa: boolean
}

export interface LineaResultado {
  codigo: string
  nombre: string
  monto: string
}

export interface EstadoResultados {
  desde: string
  hasta: string
  ingresos: LineaResultado[]
  costos: LineaResultado[]
  gastos: LineaResultado[]
  totalIngresos: string
  totalCostos: string
  margen: string
  totalGastos: string
  resultado: string
}

export interface FilaBalance {
  codigo: string
  nombre: string
  debe: string
  haber: string
  deudor: string
  acreedor: string
  activo: string
  pasivo: string
  perdida: string
  ganancia: string
}

export interface Balance {
  desde: string
  hasta: string
  filas: FilaBalance[]
  totales: Omit<FilaBalance, 'codigo' | 'nombre'>
  resultado: string
}

export interface AsientoContable {
  id: string
  fecha: string
  glosa: string
  origenTipo: string
  manual: boolean
  lineas: { cuenta: string; nombre: string; debe: string; haber: string }[]
}

export interface LibroMayor {
  cuenta: CuentaContable
  desde: string
  hasta: string
  saldoInicial: string
  saldoFinal: string
  filas: { fecha: string; glosa: string; debe: string; haber: string; saldo: string }[]
}

export interface Lote {
  id: string
  codigo: string
  itemId: string
  sucursalId: string
  origen: string
  fechaIngreso: string
  fechaVencimiento: string | null
  cantidadInicial: string
  cantidadActual: string
  item: { nombre: string; codigoSku?: string; unidadMedida: string }
  sucursal: { nombre: string }
  productor?: { nombreRazonSocial: string } | null
}

export interface TrazabilidadLote extends Lote {
  productor: { rut: string; nombreRazonSocial: string } | null
  recepcion: { folio: number; fecha: string; tipoDocumento: string; folioDocumento: string } | null
  movimientos: {
    id: string
    tipo: string
    cantidad: string
    fecha: string
    documento: { tipoTransaccion: string; numeroFactura: string | null; fechaRegistro: string; entidad: { rut: string; nombreRazonSocial: string } | null } | null
    guia: { folio: number; sucursalDestino: { nombre: string } } | null
  }[]
}

export interface RecepcionProductor {
  id: string
  folio: number
  fecha: string
  pesoBruto: string
  tara: string
  pesoNeto: string
  humedadPct: string
  impurezasPct: string
  castigoPct: string
  kilosPagables: string
  precioKilo: string
  montoNeto: string
  iva: string
  retencionIva: string
  montoTotal: string
  montoAPagar: string
  tipoDocumento: 'FACTURA_COMPRA' | 'FACTURA_PROVEEDOR'
  folioDocumento: string
  estado: 'VIGENTE' | 'ANULADO'
  estadoPago: 'POR_PAGAR' | 'PAGADO'
  anticipoAplicado: string
  productor: { id: string; rut: string; nombreRazonSocial: string }
  item: { id: string; nombre: string; unidadMedida: string }
  sucursal: { nombre: string }
  lote: { id: string; codigo: string; fechaVencimiento: string | null } | null
}

export interface AnticipoProductor {
  id: string
  monto: string
  medioPago: string
  fecha: string
  descripcion: string
  estado: 'VIGENTE' | 'ANULADO'
  productor: { rut: string; nombreRazonSocial: string }
  aplicaciones: { monto: string }[]
}

export interface CuentaProductor {
  productor: { id: string; rut: string; nombreRazonSocial: string }
  porPagar: RecepcionProductor[]
  anticipos: { id: string; fecha: string; descripcion: string; monto: string; saldo: string }[]
  deuda: string
  anticipado: string
  saldo: string
}

export interface Cuartel {
  id: string
  predioId: string
  nombre: string
  cultivo: string
  variedad: string | null
  hectareas: string
  activo: boolean
}

export interface Predio {
  id: string
  nombre: string
  comuna: string | null
  hectareas: string
  activo: boolean
  cuarteles: Cuartel[]
}

export interface Temporada {
  id: string
  nombre: string
  fechaInicio: string
  fechaFin: string
}

export interface AplicacionFitosanitaria {
  id: string
  fecha: string
  objetivo: string
  dosisPorHa: string
  cantidad: string
  carenciaDias: number
  reingresoHoras: number
  aplicador: string
  metodo: string | null
  costo: string
  estado: 'VIGENTE' | 'ANULADO'
  cuartel: { nombre: string; predio: { nombre: string } }
  item: { nombre: string; unidadMedida: string }
}

export interface Carencia {
  cuartel: { id: string; nombre: string; predio: { nombre: string } }
  cosecharDesde: string
  objetivo: string
}

export interface Cosecha {
  id: string
  fecha: string
  kilos: string
  costoKilo: string
  costoTotal: string
  estado: 'VIGENTE' | 'ANULADO'
  cuartel: { nombre: string }
  item?: { nombre: string }
  lote: { codigo: string } | null
}

export type CategoriaCosto = 'INSUMOS' | 'MANO_OBRA' | 'MAQUINARIA' | 'SERVICIOS' | 'OTROS'

export interface CostoCuartel {
  id: string
  nombre: string
  predio: string
  cultivo: string
  hectareas: string
  categorias: { categoria: CategoriaCosto; real: string; presupuesto: string }[]
  real: string
  presupuesto: string
  desviacion: string
  kilos: string
  costoKilo: string | null
  costoHa: string | null
  rendimientoHa: string | null
}

export interface InformeCostosCampo {
  temporada: Temporada
  cuarteles: CostoCuartel[]
}

export interface Trabajador {
  id: string
  rut: string
  nombre: string
  tipo: 'PROPIO' | 'CONTRATISTA'
  valorJornada: string
  activo: boolean
  contratista: { id: string; nombreRazonSocial: string; f30Vigencia: string | null } | null
}

export interface Labor {
  id: string
  fecha: string
  tipo: 'JORNADA' | 'TRATO'
  descripcion: string
  cantidad: string
  unidad: string
  tarifa: string
  monto: string
  liquidacionId: string | null
  trabajador: { nombre: string; rut: string }
  cuartel: { nombre: string } | null
}

export interface LiquidacionTrabajador {
  id: string
  hasta: string
  totalLabores: string
  anticipos: string
  aPagar: string
  fechaPago: string
  medioPago: string
  trabajador: { nombre: string; rut: string; contratista?: { nombreRazonSocial: string } | null }
}
