-- CreateEnum
CREATE TYPE "EstadoOrdenCompra" AS ENUM ('ABIERTA', 'CERRADA', 'ANULADA');

-- CreateEnum
CREATE TYPE "EstadoDocumentoCompra" AS ENUM ('VIGENTE', 'ANULADO');

-- CreateTable
CREATE TABLE "empresa" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "rut" VARCHAR(12) NOT NULL,
    "razon_social" VARCHAR(100) NOT NULL,
    "giro" VARCHAR(80) NOT NULL,
    "direccion" VARCHAR(120) NOT NULL,
    "comuna" VARCHAR(60) NOT NULL,
    "tasa_iva" DECIMAL(5,2) NOT NULL DEFAULT 19,
    "dias_cambio" INTEGER NOT NULL DEFAULT 30,
    "rut_consumidor_final" VARCHAR(12) NOT NULL DEFAULT '66.666.666-6',
    "nombre_consumidor_final" VARCHAR(100) NOT NULL DEFAULT 'CLIENTE FINAL',

    CONSTRAINT "empresa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "unidades_medida" (
    "codigo" VARCHAR(20) NOT NULL,
    "nombre" VARCHAR(50) NOT NULL,

    CONSTRAINT "unidades_medida_pkey" PRIMARY KEY ("codigo")
);

-- CreateTable
CREATE TABLE "ordenes_compra" (
    "id" UUID NOT NULL,
    "folio" INTEGER NOT NULL,
    "proveedor_id" UUID NOT NULL,
    "sucursal_id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "estado" "EstadoOrdenCompra" NOT NULL DEFAULT 'ABIERTA',
    "fecha_emision" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fecha_entrega" DATE,
    "notas" VARCHAR(300),
    "monto_neto" DECIMAL(12,2) NOT NULL,
    "monto_iva" DECIMAL(12,2) NOT NULL,
    "monto_total" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "ordenes_compra_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ordenes_compra_detalle" (
    "id" UUID NOT NULL,
    "orden_id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "cantidad" DECIMAL(12,3) NOT NULL,
    "costo_unitario" DECIMAL(12,2) NOT NULL,
    "subtotal" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "ordenes_compra_detalle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recepciones_compra" (
    "id" UUID NOT NULL,
    "orden_id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "guia_despacho" VARCHAR(50),
    "estado" "EstadoDocumentoCompra" NOT NULL DEFAULT 'VIGENTE',
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recepciones_compra_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recepciones_compra_detalle" (
    "id" UUID NOT NULL,
    "recepcion_id" UUID NOT NULL,
    "detalle_orden_id" UUID NOT NULL,
    "cantidad" DECIMAL(12,3) NOT NULL,

    CONSTRAINT "recepciones_compra_detalle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "facturas_compra" (
    "id" UUID NOT NULL,
    "orden_id" UUID NOT NULL,
    "proveedor_id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "folio" VARCHAR(30) NOT NULL,
    "fecha_emision" DATE NOT NULL,
    "fecha_vencimiento" DATE,
    "estado" "EstadoDocumentoCompra" NOT NULL DEFAULT 'VIGENTE',
    "monto_neto" DECIMAL(12,2) NOT NULL,
    "monto_iva" DECIMAL(12,2) NOT NULL,
    "monto_total" DECIMAL(12,2) NOT NULL,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "facturas_compra_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "facturas_compra_detalle" (
    "id" UUID NOT NULL,
    "factura_id" UUID NOT NULL,
    "detalle_orden_id" UUID NOT NULL,
    "cantidad" DECIMAL(12,3) NOT NULL,
    "costo_unitario" DECIMAL(12,2) NOT NULL,
    "subtotal" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "facturas_compra_detalle_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ordenes_compra_folio_key" ON "ordenes_compra"("folio");

-- CreateIndex
CREATE UNIQUE INDEX "ordenes_compra_detalle_orden_id_item_id_key" ON "ordenes_compra_detalle"("orden_id", "item_id");

-- CreateIndex
CREATE INDEX "facturas_compra_proveedor_id_folio_idx" ON "facturas_compra"("proveedor_id", "folio");

-- Datos iniciales: los valores que antes estaban escritos en el código.
-- El emisor es el del certificado y CAF de prueba con que se firman hoy los DTE.
INSERT INTO "empresa" ("id", "rut", "razon_social", "giro", "direccion", "comuna")
VALUES (1, '76.000.000-1', 'EMPRESA PRUEBA SPA', 'TECNOLOGIA', 'AV. TESIS 123', 'VILLA ALEGRE');

INSERT INTO "unidades_medida" ("codigo", "nombre") VALUES
  ('UN', 'Unidad'), ('KG', 'Kilogramo'), ('GR', 'Gramo'), ('LT', 'Litro'), ('ML', 'Mililitro'),
  ('MT', 'Metro'), ('M2', 'Metro cuadrado'), ('CJ', 'Caja'), ('PAQ', 'Paquete'), ('DOC', 'Docena');

-- Toda unidad ya usada por un producto se conserva, así la llave foránea no rechaza datos existentes.
INSERT INTO "unidades_medida" ("codigo", "nombre")
SELECT DISTINCT "unidad_medida", initcap("unidad_medida") FROM "items"
ON CONFLICT ("codigo") DO NOTHING;

-- AddForeignKey
ALTER TABLE "items" ADD CONSTRAINT "items_unidad_medida_fkey" FOREIGN KEY ("unidad_medida") REFERENCES "unidades_medida"("codigo") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ordenes_compra" ADD CONSTRAINT "ordenes_compra_proveedor_id_fkey" FOREIGN KEY ("proveedor_id") REFERENCES "entidades"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ordenes_compra" ADD CONSTRAINT "ordenes_compra_sucursal_id_fkey" FOREIGN KEY ("sucursal_id") REFERENCES "sucursales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ordenes_compra" ADD CONSTRAINT "ordenes_compra_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ordenes_compra_detalle" ADD CONSTRAINT "ordenes_compra_detalle_orden_id_fkey" FOREIGN KEY ("orden_id") REFERENCES "ordenes_compra"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ordenes_compra_detalle" ADD CONSTRAINT "ordenes_compra_detalle_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recepciones_compra" ADD CONSTRAINT "recepciones_compra_orden_id_fkey" FOREIGN KEY ("orden_id") REFERENCES "ordenes_compra"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recepciones_compra" ADD CONSTRAINT "recepciones_compra_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recepciones_compra_detalle" ADD CONSTRAINT "recepciones_compra_detalle_recepcion_id_fkey" FOREIGN KEY ("recepcion_id") REFERENCES "recepciones_compra"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recepciones_compra_detalle" ADD CONSTRAINT "recepciones_compra_detalle_detalle_orden_id_fkey" FOREIGN KEY ("detalle_orden_id") REFERENCES "ordenes_compra_detalle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "facturas_compra" ADD CONSTRAINT "facturas_compra_orden_id_fkey" FOREIGN KEY ("orden_id") REFERENCES "ordenes_compra"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "facturas_compra" ADD CONSTRAINT "facturas_compra_proveedor_id_fkey" FOREIGN KEY ("proveedor_id") REFERENCES "entidades"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "facturas_compra" ADD CONSTRAINT "facturas_compra_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "facturas_compra_detalle" ADD CONSTRAINT "facturas_compra_detalle_factura_id_fkey" FOREIGN KEY ("factura_id") REFERENCES "facturas_compra"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "facturas_compra_detalle" ADD CONSTRAINT "facturas_compra_detalle_detalle_orden_id_fkey" FOREIGN KEY ("detalle_orden_id") REFERENCES "ordenes_compra_detalle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Invariantes de compras.
ALTER TABLE "empresa" ADD CONSTRAINT "empresa_fila_unica" CHECK ("id" = 1);
ALTER TABLE "empresa" ADD CONSTRAINT "empresa_parametros_validos" CHECK ("tasa_iva" >= 0 AND "tasa_iva" <= 100 AND "dias_cambio" >= 0);
ALTER TABLE "ordenes_compra" ADD CONSTRAINT "oc_montos_no_negativos" CHECK ("monto_neto" >= 0 AND "monto_iva" >= 0 AND "monto_total" >= 0);
ALTER TABLE "ordenes_compra_detalle" ADD CONSTRAINT "oc_detalle_valido" CHECK ("cantidad" > 0 AND "costo_unitario" >= 0 AND "subtotal" >= 0);
ALTER TABLE "recepciones_compra_detalle" ADD CONSTRAINT "recepcion_cantidad_positiva" CHECK ("cantidad" > 0);
ALTER TABLE "facturas_compra" ADD CONSTRAINT "factura_compra_montos_no_negativos" CHECK ("monto_neto" >= 0 AND "monto_iva" >= 0 AND "monto_total" >= 0);
ALTER TABLE "facturas_compra_detalle" ADD CONSTRAINT "factura_compra_detalle_valido" CHECK ("cantidad" > 0 AND "costo_unitario" >= 0 AND "subtotal" >= 0);
