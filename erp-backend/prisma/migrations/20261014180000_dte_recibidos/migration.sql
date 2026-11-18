-- CreateEnum
CREATE TYPE "EstadoDteRecibido" AS ENUM ('PENDIENTE', 'ASOCIADO_OC', 'GASTO', 'DESCARTADO');

-- CreateTable
CREATE TABLE "dte_recibidos" (
    "id" UUID NOT NULL,
    "tipo_dte" INTEGER NOT NULL,
    "folio" VARCHAR(20) NOT NULL,
    "rut_emisor" VARCHAR(12) NOT NULL,
    "razon_social_emisor" VARCHAR(120) NOT NULL,
    "fecha_emision" DATE NOT NULL,
    "fecha_vencimiento" DATE,
    "monto_neto" DECIMAL(14,2) NOT NULL,
    "monto_exento" DECIMAL(14,2) NOT NULL,
    "iva" DECIMAL(14,2) NOT NULL,
    "otros_impuestos" DECIMAL(14,2) NOT NULL,
    "monto_total" DECIMAL(14,2) NOT NULL,
    "referencia_oc" VARCHAR(20),
    "detalle" JSONB NOT NULL,
    "observaciones" JSONB NOT NULL,
    "timbre_valido" BOOLEAN NOT NULL,
    "firma_valida" BOOLEAN NOT NULL,
    "xml" TEXT NOT NULL,
    "sha256" CHAR(64) NOT NULL,
    "estado" "EstadoDteRecibido" NOT NULL DEFAULT 'PENDIENTE',
    "motivo_descarte" VARCHAR(200),
    "proveedor_id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "factura_compra_id" UUID,
    "gasto_id" UUID,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dte_recibidos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "dte_recibidos_factura_compra_id_key" ON "dte_recibidos"("factura_compra_id");

-- CreateIndex
CREATE UNIQUE INDEX "dte_recibidos_gasto_id_key" ON "dte_recibidos"("gasto_id");

-- CreateIndex
CREATE UNIQUE INDEX "dte_recibidos_rut_emisor_tipo_dte_folio_key" ON "dte_recibidos"("rut_emisor", "tipo_dte", "folio");

-- AddForeignKey
ALTER TABLE "dte_recibidos" ADD CONSTRAINT "dte_recibidos_proveedor_id_fkey" FOREIGN KEY ("proveedor_id") REFERENCES "entidades"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dte_recibidos" ADD CONSTRAINT "dte_recibidos_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dte_recibidos" ADD CONSTRAINT "dte_recibidos_factura_compra_id_fkey" FOREIGN KEY ("factura_compra_id") REFERENCES "facturas_compra"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dte_recibidos" ADD CONSTRAINT "dte_recibidos_gasto_id_fkey" FOREIGN KEY ("gasto_id") REFERENCES "gastos_operacionales"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Un DTE recibido tiene a lo más un destino.
ALTER TABLE "dte_recibidos" ADD CONSTRAINT "dte_recibido_un_destino" CHECK (num_nonnulls("factura_compra_id", "gasto_id") <= 1);
ALTER TABLE "gastos_operacionales" ADD CONSTRAINT "gasto_monto_no_negativo" CHECK ("monto" >= 0);
