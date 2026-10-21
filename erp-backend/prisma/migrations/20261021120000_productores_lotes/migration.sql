-- CreateEnum
CREATE TYPE "DocumentoProductor" AS ENUM ('FACTURA_COMPRA', 'FACTURA_PROVEEDOR');

-- AlterTable
ALTER TABLE "items" ADD COLUMN     "humedad_base_pct" DECIMAL(5,2) NOT NULL DEFAULT 0,
ADD COLUMN     "retencion_iva_pct" DECIMAL(5,2) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "recepciones_productor" (
    "id" UUID NOT NULL,
    "folio" INTEGER NOT NULL,
    "productor_id" UUID NOT NULL,
    "sucursal_id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "peso_bruto" DECIMAL(12,3) NOT NULL,
    "tara" DECIMAL(12,3) NOT NULL,
    "peso_neto" DECIMAL(12,3) NOT NULL,
    "humedad_pct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "impurezas_pct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "castigo_pct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "kilos_pagables" DECIMAL(12,3) NOT NULL,
    "precio_kilo" DECIMAL(12,2) NOT NULL,
    "monto_neto" DECIMAL(12,2) NOT NULL,
    "iva" DECIMAL(12,2) NOT NULL,
    "retencion_iva" DECIMAL(12,2) NOT NULL,
    "monto_total" DECIMAL(12,2) NOT NULL,
    "monto_a_pagar" DECIMAL(12,2) NOT NULL,
    "tipo_documento" "DocumentoProductor" NOT NULL,
    "folio_documento" VARCHAR(30) NOT NULL,
    "estado" "EstadoDocumentoCompra" NOT NULL DEFAULT 'VIGENTE',
    "estado_pago" "EstadoPago" NOT NULL DEFAULT 'POR_PAGAR',
    "fecha_pago" DATE,
    "medio_pago" "MedioPago",
    "anticipo_aplicado" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "observaciones" VARCHAR(300),
    "lote_id" UUID,

    CONSTRAINT "recepciones_productor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "anticipos_productor" (
    "id" UUID NOT NULL,
    "productor_id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "monto" DECIMAL(12,2) NOT NULL,
    "medio_pago" "MedioPago" NOT NULL,
    "fecha" DATE NOT NULL,
    "descripcion" VARCHAR(200) NOT NULL,
    "estado" "EstadoDocumentoCompra" NOT NULL DEFAULT 'VIGENTE',
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "anticipos_productor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "aplicaciones_anticipo" (
    "id" UUID NOT NULL,
    "anticipo_id" UUID NOT NULL,
    "recepcion_id" UUID NOT NULL,
    "monto" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "aplicaciones_anticipo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lotes" (
    "id" UUID NOT NULL,
    "codigo" VARCHAR(30) NOT NULL,
    "item_id" UUID NOT NULL,
    "sucursal_id" UUID NOT NULL,
    "origen" VARCHAR(30) NOT NULL,
    "productor_id" UUID,
    "cuartel_id" UUID,
    "fecha_ingreso" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fecha_vencimiento" DATE,
    "cantidad_inicial" DECIMAL(12,3) NOT NULL,
    "cantidad_actual" DECIMAL(12,3) NOT NULL,

    CONSTRAINT "lotes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "movimientos_lote" (
    "id" UUID NOT NULL,
    "lote_id" UUID NOT NULL,
    "tipo" VARCHAR(20) NOT NULL,
    "cantidad" DECIMAL(12,3) NOT NULL,
    "transaccion_id" UUID,
    "guia_id" UUID,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "movimientos_lote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "recepciones_productor_folio_key" ON "recepciones_productor"("folio");

-- CreateIndex
CREATE UNIQUE INDEX "recepciones_productor_lote_id_key" ON "recepciones_productor"("lote_id");

-- CreateIndex
CREATE INDEX "recepciones_productor_productor_id_idx" ON "recepciones_productor"("productor_id");

-- CreateIndex
CREATE INDEX "recepciones_productor_fecha_idx" ON "recepciones_productor"("fecha");

-- CreateIndex
CREATE INDEX "anticipos_productor_productor_id_idx" ON "anticipos_productor"("productor_id");

-- CreateIndex
CREATE INDEX "lotes_item_id_sucursal_id_idx" ON "lotes"("item_id", "sucursal_id");

-- CreateIndex
CREATE UNIQUE INDEX "lotes_codigo_sucursal_id_key" ON "lotes"("codigo", "sucursal_id");

-- CreateIndex
CREATE INDEX "movimientos_lote_lote_id_idx" ON "movimientos_lote"("lote_id");

-- CreateIndex
CREATE INDEX "movimientos_lote_transaccion_id_idx" ON "movimientos_lote"("transaccion_id");

-- CreateIndex
CREATE INDEX "movimientos_lote_guia_id_idx" ON "movimientos_lote"("guia_id");

-- AddForeignKey
ALTER TABLE "recepciones_productor" ADD CONSTRAINT "recepciones_productor_productor_id_fkey" FOREIGN KEY ("productor_id") REFERENCES "entidades"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recepciones_productor" ADD CONSTRAINT "recepciones_productor_sucursal_id_fkey" FOREIGN KEY ("sucursal_id") REFERENCES "sucursales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recepciones_productor" ADD CONSTRAINT "recepciones_productor_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recepciones_productor" ADD CONSTRAINT "recepciones_productor_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recepciones_productor" ADD CONSTRAINT "recepciones_productor_lote_id_fkey" FOREIGN KEY ("lote_id") REFERENCES "lotes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "anticipos_productor" ADD CONSTRAINT "anticipos_productor_productor_id_fkey" FOREIGN KEY ("productor_id") REFERENCES "entidades"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "anticipos_productor" ADD CONSTRAINT "anticipos_productor_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aplicaciones_anticipo" ADD CONSTRAINT "aplicaciones_anticipo_anticipo_id_fkey" FOREIGN KEY ("anticipo_id") REFERENCES "anticipos_productor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aplicaciones_anticipo" ADD CONSTRAINT "aplicaciones_anticipo_recepcion_id_fkey" FOREIGN KEY ("recepcion_id") REFERENCES "recepciones_productor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lotes" ADD CONSTRAINT "lotes_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lotes" ADD CONSTRAINT "lotes_sucursal_id_fkey" FOREIGN KEY ("sucursal_id") REFERENCES "sucursales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lotes" ADD CONSTRAINT "lotes_productor_id_fkey" FOREIGN KEY ("productor_id") REFERENCES "entidades"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimientos_lote" ADD CONSTRAINT "movimientos_lote_lote_id_fkey" FOREIGN KEY ("lote_id") REFERENCES "lotes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


ALTER TABLE "lotes" ADD CONSTRAINT "lotes_cantidad_no_negativa" CHECK ("cantidad_actual" >= 0);
ALTER TABLE "recepciones_productor" ADD CONSTRAINT "recepciones_productor_pesos" CHECK ("peso_neto" > 0 AND "kilos_pagables" >= 0);
ALTER TABLE "anticipos_productor" ADD CONSTRAINT "anticipos_productor_monto_positivo" CHECK ("monto" > 0);
ALTER TABLE "aplicaciones_anticipo" ADD CONSTRAINT "aplicaciones_anticipo_monto_positivo" CHECK ("monto" > 0);
