-- PYMECORE — Schema PostgreSQL para DrawSQL
-- Dialecto: PostgreSQL

CREATE TYPE "EstadoGeneral" AS ENUM ('Activo', 'Inactivo');
CREATE TYPE "EstadoGuia" AS ENUM ('PENDIENTE', 'EN_TRANSITO', 'RECIBIDO', 'ANULADO');
CREATE TYPE "EstadoSincronizacion" AS ENUM ('PENDIENTE', 'SINCRONIZADO', 'ERROR');
CREATE TYPE "EstadoTransaccion" AS ENUM ('Activa', 'Anulada');
CREATE TYPE "EstadoUsuario" AS ENUM ('Activo', 'Inactivo');
CREATE TYPE "MedioPago" AS ENUM ('Efectivo', 'Tarjeta', 'Transferencia', 'No Aplica');
CREATE TYPE "RolUsuario" AS ENUM ('Administrador', 'Encargado', 'Vendedor');
CREATE TYPE "TipoDevolucion" AS ENUM ('CAMBIO_PRODUCTO', 'FALLA', 'DESISTIMIENTO');
CREATE TYPE "TipoEntidad" AS ENUM ('CLIENTE', 'PROVEEDOR');
CREATE TYPE "TipoTransaccion" AS ENUM ('VENTA', 'COMPRA', 'MERMA', 'DEVOLUCION', 'NOTA_CREDITO');

CREATE TABLE sucursales (
    id uuid PRIMARY KEY,
    nombre varchar(100) NOT NULL,
    direccion text,
    creado_en timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE usuarios (
    id uuid PRIMARY KEY,
    nombre_completo varchar(150) NOT NULL,
    username varchar(50) NOT NULL UNIQUE,
    password_hash varchar(255) NOT NULL,
    rol "RolUsuario" NOT NULL,
    estado "EstadoUsuario" NOT NULL DEFAULT 'Activo',
    sucursal_id uuid REFERENCES sucursales(id) ON DELETE SET NULL,
    creado_en timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE entidades (
    id uuid PRIMARY KEY,
    tipo_entidad "TipoEntidad" NOT NULL,
    rut varchar(12) NOT NULL,
    nombre_razon_social varchar(150) NOT NULL,
    telefono varchar(20),
    email varchar(100),
    direccion text,
    estado "EstadoGeneral" NOT NULL DEFAULT 'Activo',
    creado_en timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE items (
    id uuid PRIMARY KEY,
    codigo_sku varchar(50) NOT NULL UNIQUE,
    nombre varchar(150) NOT NULL,
    unidad_medida varchar(20) NOT NULL,
    precio_venta numeric(12,2) NOT NULL DEFAULT 0,
    costo_promedio numeric(12,2) NOT NULL DEFAULT 0,
    precio_compra numeric(12,2) NOT NULL DEFAULT 0,
    afecto_iva boolean NOT NULL DEFAULT true,
    estado "EstadoGeneral" NOT NULL DEFAULT 'Activo',
    creado_en timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE stock_local (
    id uuid PRIMARY KEY,
    sucursal_id uuid NOT NULL REFERENCES sucursales(id),
    item_id uuid NOT NULL REFERENCES items(id),
    stock_actual numeric(12,3) NOT NULL DEFAULT 0,
    stock_minimo numeric(12,3) NOT NULL DEFAULT 0,
    ultima_actualizacion timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(sucursal_id, item_id)
);

CREATE TABLE ofertas (
    id uuid PRIMARY KEY,
    item_id uuid NOT NULL REFERENCES items(id),
    precio_oferta numeric(12,2) NOT NULL,
    descripcion varchar(150),
    fecha_inicio timestamp NOT NULL,
    fecha_fin timestamp NOT NULL,
    activo boolean NOT NULL DEFAULT true,
    creado_en timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE transacciones (
    id uuid PRIMARY KEY,
    sucursal_id uuid NOT NULL REFERENCES sucursales(id),
    usuario_id uuid NOT NULL REFERENCES usuarios(id),
    entidad_id uuid REFERENCES entidades(id) ON DELETE SET NULL,
    transaccion_origen_id uuid,
    tipo_transaccion "TipoTransaccion" NOT NULL,
    tipo_devolucion "TipoDevolucion",
    medio_pago "MedioPago" NOT NULL DEFAULT 'No Aplica',
    descuento_global numeric(12,2) NOT NULL DEFAULT 0,
    monto_total numeric(12,2) NOT NULL DEFAULT 0,
    estado "EstadoTransaccion" NOT NULL DEFAULT 'Activa',
    sincronizacion "EstadoSincronizacion" NOT NULL DEFAULT 'SINCRONIZADO',
    numero_factura varchar(50),
    motivo_merma varchar(200),
    observaciones varchar(300),
    metadatos_sii jsonb,
    fecha_registro timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE transacciones_detalle (
    id uuid PRIMARY KEY,
    transaccion_id uuid NOT NULL REFERENCES transacciones(id) ON DELETE CASCADE,
    item_id uuid NOT NULL REFERENCES items(id),
    cantidad numeric(12,3) NOT NULL,
    costo_unitario numeric(12,2) NOT NULL DEFAULT 0,
    precio_unitario numeric(12,2) NOT NULL DEFAULT 0,
    monto_iva numeric(12,2) NOT NULL DEFAULT 0,
    descuento_linea numeric(12,2) NOT NULL DEFAULT 0,
    subtotal numeric(12,2) NOT NULL
);

CREATE TABLE guias_despacho (
    id uuid PRIMARY KEY,
    folio integer NOT NULL,
    sucursal_origen_id uuid NOT NULL REFERENCES sucursales(id),
    sucursal_destino_id uuid NOT NULL REFERENCES sucursales(id),
    usuario_id uuid NOT NULL REFERENCES usuarios(id),
    estado "EstadoGuia" NOT NULL DEFAULT 'PENDIENTE',
    notas varchar(300),
    fecha_emision timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fecha_recepcion timestamp
);

CREATE TABLE guias_despacho_detalle (
    id uuid PRIMARY KEY,
    guia_id uuid NOT NULL REFERENCES guias_despacho(id) ON DELETE CASCADE,
    item_id uuid NOT NULL REFERENCES items(id),
    cantidad numeric(12,3) NOT NULL
);

CREATE TABLE gastos_operacionales (
    id uuid PRIMARY KEY,
    usuario_id uuid NOT NULL REFERENCES usuarios(id),
    descripcion varchar(200) NOT NULL,
    categoria varchar(50) NOT NULL,
    monto numeric(12,2) NOT NULL,
    fecha_registro timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
);
