-- CreateEnum
CREATE TYPE "EstadoGuia" AS ENUM ('PENDIENTE', 'EN_TRANSITO', 'RECIBIDO', 'ANULADO');

-- CreateEnum
CREATE TYPE "TipoDevolucion" AS ENUM ('CAMBIO_PRODUCTO', 'FALLA', 'DESISTIMIENTO');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "TipoTransaccion" ADD VALUE 'DEVOLUCION';
ALTER TYPE "TipoTransaccion" ADD VALUE 'NOTA_CREDITO';

-- AlterTable
ALTER TABLE "items" ADD COLUMN     "precio_compra" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "transacciones" ADD COLUMN     "observaciones" VARCHAR(300),
ADD COLUMN     "tipo_devolucion" "TipoDevolucion",
ADD COLUMN     "transaccion_origen_id" UUID,
ALTER COLUMN "motivo_merma" SET DATA TYPE VARCHAR(200);

-- CreateTable
CREATE TABLE "ofertas" (
    "id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "precio_oferta" DECIMAL(12,2) NOT NULL,
    "descripcion" VARCHAR(150),
    "fecha_inicio" TIMESTAMP(3) NOT NULL,
    "fecha_fin" TIMESTAMP(3) NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ofertas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guias_despacho" (
    "id" UUID NOT NULL,
    "folio" INTEGER NOT NULL,
    "sucursal_origen_id" UUID NOT NULL,
    "sucursal_destino_id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "fecha_emision" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fecha_recepcion" TIMESTAMP(3),
    "estado" "EstadoGuia" NOT NULL DEFAULT 'PENDIENTE',
    "notas" VARCHAR(300),
    "xml_pdf" TEXT,

    CONSTRAINT "guias_despacho_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guias_despacho_detalle" (
    "id" UUID NOT NULL,
    "guia_id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "cantidad" DECIMAL(12,3) NOT NULL,

    CONSTRAINT "guias_despacho_detalle_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "ofertas" ADD CONSTRAINT "ofertas_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guias_despacho" ADD CONSTRAINT "guias_despacho_sucursal_origen_id_fkey" FOREIGN KEY ("sucursal_origen_id") REFERENCES "sucursales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guias_despacho" ADD CONSTRAINT "guias_despacho_sucursal_destino_id_fkey" FOREIGN KEY ("sucursal_destino_id") REFERENCES "sucursales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guias_despacho" ADD CONSTRAINT "guias_despacho_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guias_despacho_detalle" ADD CONSTRAINT "guias_despacho_detalle_guia_id_fkey" FOREIGN KEY ("guia_id") REFERENCES "guias_despacho"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guias_despacho_detalle" ADD CONSTRAINT "guias_despacho_detalle_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
