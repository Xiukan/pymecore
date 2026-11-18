-- CreateEnum
CREATE TYPE "EstadoPedido" AS ENUM ('COTIZACION', 'PEDIDO', 'VENDIDO', 'ANULADO');

-- AlterTable
ALTER TABLE "entidades" ADD COLUMN     "lista_precio_id" UUID;

-- CreateTable
CREATE TABLE "listas_precio" (
    "id" UUID NOT NULL,
    "nombre" VARCHAR(60) NOT NULL,
    "activa" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "listas_precio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "precios_lista" (
    "lista_id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "precio" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "precios_lista_pkey" PRIMARY KEY ("lista_id","item_id")
);

-- CreateTable
CREATE TABLE "pedidos" (
    "id" UUID NOT NULL,
    "folio" INTEGER NOT NULL,
    "entidad_id" UUID NOT NULL,
    "sucursal_id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "estado" "EstadoPedido" NOT NULL DEFAULT 'COTIZACION',
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "valido_hasta" DATE,
    "fecha_entrega" DATE,
    "observaciones" VARCHAR(300),
    "total" DECIMAL(12,2) NOT NULL,
    "transaccion_id" UUID,

    CONSTRAINT "pedidos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pedidos_detalle" (
    "id" UUID NOT NULL,
    "pedido_id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "cantidad" DECIMAL(12,3) NOT NULL,
    "precio_unitario" DECIMAL(12,2) NOT NULL,
    "subtotal" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "pedidos_detalle_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "listas_precio_nombre_key" ON "listas_precio"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "pedidos_folio_key" ON "pedidos"("folio");

-- CreateIndex
CREATE UNIQUE INDEX "pedidos_transaccion_id_key" ON "pedidos"("transaccion_id");

-- CreateIndex
CREATE INDEX "pedidos_estado_idx" ON "pedidos"("estado");

-- AddForeignKey
ALTER TABLE "entidades" ADD CONSTRAINT "entidades_lista_precio_id_fkey" FOREIGN KEY ("lista_precio_id") REFERENCES "listas_precio"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "precios_lista" ADD CONSTRAINT "precios_lista_lista_id_fkey" FOREIGN KEY ("lista_id") REFERENCES "listas_precio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "precios_lista" ADD CONSTRAINT "precios_lista_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_entidad_id_fkey" FOREIGN KEY ("entidad_id") REFERENCES "entidades"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_sucursal_id_fkey" FOREIGN KEY ("sucursal_id") REFERENCES "sucursales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_transaccion_id_fkey" FOREIGN KEY ("transaccion_id") REFERENCES "transacciones"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedidos_detalle" ADD CONSTRAINT "pedidos_detalle_pedido_id_fkey" FOREIGN KEY ("pedido_id") REFERENCES "pedidos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedidos_detalle" ADD CONSTRAINT "pedidos_detalle_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "precios_lista" ADD CONSTRAINT "precios_lista_precio_positivo" CHECK ("precio" > 0);
