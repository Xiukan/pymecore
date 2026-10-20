-- CreateEnum
CREATE TYPE "TipoDocumentoGasto" AS ENUM ('FACTURA', 'BOLETA', 'BOLETA_HONORARIOS', 'SIN_DOCUMENTO');

-- CreateEnum
CREATE TYPE "EstadoPago" AS ENUM ('POR_PAGAR', 'PAGADO');

-- AlterTable
ALTER TABLE "empresa" ADD COLUMN     "tasa_retencion_honorarios" DECIMAL(5,2) NOT NULL DEFAULT 15.25,
ADD COLUMN     "tope_gasto_sin_documento" INTEGER NOT NULL DEFAULT 50000;

-- CreateTable
CREATE TABLE "categorias_gasto" (
    "id" UUID NOT NULL,
    "nombre" VARCHAR(50) NOT NULL,
    "iva_recuperable" BOOLEAN NOT NULL DEFAULT true,
    "activa" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "categorias_gasto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "categorias_gasto_nombre_key" ON "categorias_gasto"("nombre");

-- Catálogo inicial de categorías; el IVA de combustible, vehículos y alimentación suele no
-- ser recuperable, por lo que esas categorías registran el gasto por el total.
INSERT INTO "categorias_gasto" ("id", "nombre", "iva_recuperable") VALUES
  (gen_random_uuid(), 'Arriendo', true),
  (gen_random_uuid(), 'Remuneraciones', false),
  (gen_random_uuid(), 'Honorarios', false),
  (gen_random_uuid(), 'Servicios básicos', true),
  (gen_random_uuid(), 'Telefonía e internet', true),
  (gen_random_uuid(), 'Combustible', false),
  (gen_random_uuid(), 'Mantención y reparaciones', true),
  (gen_random_uuid(), 'Publicidad', true),
  (gen_random_uuid(), 'Impuestos y patentes', false),
  (gen_random_uuid(), 'Gastos bancarios', false),
  (gen_random_uuid(), 'Útiles y oficina', true),
  (gen_random_uuid(), 'Otros', true);

-- Las categorías escritas a mano en gastos existentes pasan al catálogo.
INSERT INTO "categorias_gasto" ("id", "nombre")
SELECT gen_random_uuid(), "categoria" FROM (SELECT DISTINCT "categoria" FROM "gastos_operacionales") c
ON CONFLICT ("nombre") DO NOTHING;

-- AlterTable
ALTER TABLE "gastos_operacionales" ADD COLUMN     "categoria_id" UUID,
ADD COLUMN     "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "estado" "EstadoDocumentoCompra" NOT NULL DEFAULT 'VIGENTE',
ADD COLUMN     "estado_pago" "EstadoPago" NOT NULL DEFAULT 'POR_PAGAR',
ADD COLUMN     "fecha_pago" DATE,
ADD COLUMN     "fecha_vencimiento" DATE,
ADD COLUMN     "iva" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "medio_pago" "MedioPago",
ADD COLUMN     "monto_neto" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "numero_documento" VARCHAR(30),
ADD COLUMN     "proveedor_id" UUID,
ADD COLUMN     "retencion" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "sucursal_id" UUID,
ADD COLUMN     "tipo_documento" "TipoDocumentoGasto" NOT NULL DEFAULT 'SIN_DOCUMENTO',
ADD COLUMN     "total" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- Gastos existentes: misma categoría por nombre y total = monto registrado.
UPDATE "gastos_operacionales" g SET "categoria_id" = c."id", "total" = g."monto", "monto_neto" = g."monto"
  FROM "categorias_gasto" c WHERE c."nombre" = g."categoria";
ALTER TABLE "gastos_operacionales" ALTER COLUMN "categoria_id" SET NOT NULL;
ALTER TABLE "gastos_operacionales" DROP COLUMN "categoria";





-- CreateIndex
CREATE INDEX "gastos_operacionales_fecha_registro_idx" ON "gastos_operacionales"("fecha_registro");

-- AddForeignKey
ALTER TABLE "gastos_operacionales" ADD CONSTRAINT "gastos_operacionales_categoria_id_fkey" FOREIGN KEY ("categoria_id") REFERENCES "categorias_gasto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gastos_operacionales" ADD CONSTRAINT "gastos_operacionales_sucursal_id_fkey" FOREIGN KEY ("sucursal_id") REFERENCES "sucursales"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gastos_operacionales" ADD CONSTRAINT "gastos_operacionales_proveedor_id_fkey" FOREIGN KEY ("proveedor_id") REFERENCES "entidades"("id") ON DELETE SET NULL ON UPDATE CASCADE;


ALTER TABLE "gastos_operacionales" ADD CONSTRAINT "gasto_montos_no_negativos"
  CHECK ("monto_neto" >= 0 AND "iva" >= 0 AND "retencion" >= 0 AND "total" >= 0);
ALTER TABLE "gastos_operacionales" ADD CONSTRAINT "gasto_pagado_con_fecha"
  CHECK ("estado_pago" = 'POR_PAGAR' OR "fecha_pago" IS NOT NULL);
ALTER TABLE "empresa" ADD CONSTRAINT "empresa_parametros_gasto"
  CHECK ("tope_gasto_sin_documento" >= 0 AND "tasa_retencion_honorarios" >= 0 AND "tasa_retencion_honorarios" <= 100);
