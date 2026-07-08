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
  estado: string
}

export interface Entidad {
  id: string
  tipoEntidad: 'CLIENTE' | 'PROVEEDOR'
  rut: string
  nombreRazonSocial: string
  telefono: string | null
  email: string | null
  estado: string
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
  sincronizacion: 'PENDIENTE' | 'SINCRONIZADO' | 'ERROR'
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
