-- CreateEnum
CREATE TYPE "RolUsuario" AS ENUM ('Administrador', 'Encargado', 'Vendedor');

-- CreateEnum
CREATE TYPE "EstadoUsuario" AS ENUM ('Activo', 'Inactivo');

-- CreateEnum
CREATE TYPE "TipoEntidad" AS ENUM ('CLIENTE', 'PROVEEDOR');

-- CreateEnum
CREATE TYPE "EstadoGeneral" AS ENUM ('Activo', 'Inactivo');

-- CreateEnum
CREATE TYPE "TipoTransaccion" AS ENUM ('VENTA', 'COMPRA', 'MERMA');

-- CreateEnum
CREATE TYPE "MedioPago" AS ENUM ('Efectivo', 'Tarjeta', 'Transferencia', 'No Aplica');

-- CreateEnum
CREATE TYPE "EstadoTransaccion" AS ENUM ('Activa', 'Anulada');

-- CreateEnum
CREATE TYPE "EstadoSincronizacion" AS ENUM ('PENDIENTE', 'SINCRONIZADO', 'ERROR');

-- CreateTable
CREATE TABLE "sucursales" (
    "id" UUID NOT NULL,
    "nombre" VARCHAR(100) NOT NULL,
    "direccion" TEXT,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sucursales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usuarios" (
    "id" UUID NOT NULL,
    "nombre_completo" VARCHAR(150) NOT NULL,
    "username" VARCHAR(50) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "rol" "RolUsuario" NOT NULL,
    "estado" "EstadoUsuario" NOT NULL DEFAULT 'Activo',
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "entidades" (
    "id" UUID NOT NULL,
    "tipo_entidad" "TipoEntidad" NOT NULL,
    "rut" VARCHAR(12) NOT NULL,
    "nombre_razon_social" VARCHAR(150) NOT NULL,
    "telefono" VARCHAR(20),
    "email" VARCHAR(100),
    "direccion" TEXT,
    "estado" "EstadoGeneral" NOT NULL DEFAULT 'Activo',
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "entidades_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "items" (
    "id" UUID NOT NULL,
    "codigo_sku" VARCHAR(50) NOT NULL,
    "nombre" VARCHAR(150) NOT NULL,
    "unidad_medida" VARCHAR(20) NOT NULL,
    "precio_venta" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "costo_promedio" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "afecto_iva" BOOLEAN NOT NULL DEFAULT true,
    "estado" "EstadoGeneral" NOT NULL DEFAULT 'Activo',
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_local" (
    "id" UUID NOT NULL,
    "sucursal_id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "stock_actual" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "stock_minimo" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "ultima_actualizacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_local_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transacciones" (
    "id" UUID NOT NULL,
    "sucursal_id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "entidad_id" UUID,
    "tipo_transaccion" "TipoTransaccion" NOT NULL,
    "fecha_registro" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "medio_pago" "MedioPago" NOT NULL DEFAULT 'No Aplica',
    "descuento_global" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "monto_total" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "estado" "EstadoTransaccion" NOT NULL DEFAULT 'Activa',
    "sincronizacion" "EstadoSincronizacion" NOT NULL DEFAULT 'SINCRONIZADO',
    "motivo_merma" VARCHAR(100),
    "numero_factura" VARCHAR(50),
    "metadatos_sii" JSONB,

    CONSTRAINT "transacciones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transacciones_detalle" (
    "id" UUID NOT NULL,
    "transaccion_id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "cantidad" DECIMAL(12,3) NOT NULL,
    "costo_unitario" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "precio_unitario" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "monto_iva" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "descuento_linea" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "subtotal" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "transacciones_detalle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gastos_operacionales" (
    "id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "descripcion" VARCHAR(200) NOT NULL,
    "categoria" VARCHAR(50) NOT NULL,
    "monto" DECIMAL(12,2) NOT NULL,
    "fecha_registro" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gastos_operacionales_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_username_key" ON "usuarios"("username");

-- CreateIndex
CREATE UNIQUE INDEX "items_codigo_sku_key" ON "items"("codigo_sku");

-- CreateIndex
CREATE UNIQUE INDEX "stock_local_sucursal_id_item_id_key" ON "stock_local"("sucursal_id", "item_id");

-- AddForeignKey
ALTER TABLE "stock_local" ADD CONSTRAINT "stock_local_sucursal_id_fkey" FOREIGN KEY ("sucursal_id") REFERENCES "sucursales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_local" ADD CONSTRAINT "stock_local_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transacciones" ADD CONSTRAINT "transacciones_sucursal_id_fkey" FOREIGN KEY ("sucursal_id") REFERENCES "sucursales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transacciones" ADD CONSTRAINT "transacciones_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transacciones" ADD CONSTRAINT "transacciones_entidad_id_fkey" FOREIGN KEY ("entidad_id") REFERENCES "entidades"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transacciones_detalle" ADD CONSTRAINT "transacciones_detalle_transaccion_id_fkey" FOREIGN KEY ("transaccion_id") REFERENCES "transacciones"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transacciones_detalle" ADD CONSTRAINT "transacciones_detalle_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gastos_operacionales" ADD CONSTRAINT "gastos_operacionales_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
