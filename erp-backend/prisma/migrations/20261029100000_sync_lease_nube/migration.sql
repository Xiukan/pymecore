-- CreateEnum
CREATE TYPE "EstadoDte" AS ENUM ('PENDIENTE_ENVIO_SII', 'ACEPTADO', 'RECHAZADO');

-- CreateEnum
CREATE TYPE "EstadoSuscripcion" AS ENUM ('ACTIVA', 'SUSPENDIDA');

-- AlterTable
ALTER TABLE "transacciones" ADD COLUMN     "estado_dte" "EstadoDte",
ADD COLUMN     "glosa_sii" VARCHAR(200);

-- CreateTable
CREATE TABLE "outbox_sync" (
    "id" UUID NOT NULL,
    "venta_id" UUID NOT NULL,
    "secuencia" SERIAL NOT NULL,
    "intentos" INTEGER NOT NULL DEFAULT 0,
    "ultimo_error" VARCHAR(300),
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "enviado_en" TIMESTAMP(3),

    CONSTRAINT "outbox_sync_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lease_tokens" (
    "instalacion_id" UUID NOT NULL,
    "jwt" TEXT NOT NULL,
    "emitido_en" TIMESTAMP(3) NOT NULL,
    "vence_en" TIMESTAMP(3) NOT NULL,
    "ultima_validacion_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lease_tokens_pkey" PRIMARY KEY ("instalacion_id")
);

-- CreateTable
CREATE TABLE "tenants" (
    "id" UUID NOT NULL,
    "nombre" VARCHAR(120) NOT NULL,
    "estado_suscripcion" "EstadoSuscripcion" NOT NULL DEFAULT 'ACTIVA',
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "instalaciones" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "nombre" VARCHAR(120) NOT NULL,
    "secreto_hash" CHAR(64) NOT NULL,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "instalaciones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ventas_nube" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "instalacion_id" UUID NOT NULL,
    "secuencia" INTEGER NOT NULL,
    "creada_en" TIMESTAMP(3) NOT NULL,
    "total" DECIMAL(12,2) NOT NULL,
    "payload" JSONB NOT NULL,
    "estado_dte" "EstadoDte" NOT NULL DEFAULT 'PENDIENTE_ENVIO_SII',
    "glosa_sii" VARCHAR(200),
    "recibida_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ventas_nube_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "outbox_sync_venta_id_key" ON "outbox_sync"("venta_id");

-- CreateIndex
CREATE UNIQUE INDEX "outbox_sync_secuencia_key" ON "outbox_sync"("secuencia");

-- CreateIndex
CREATE INDEX "outbox_sync_enviado_en_idx" ON "outbox_sync"("enviado_en");

-- CreateIndex
CREATE INDEX "ventas_nube_tenant_id_creada_en_idx" ON "ventas_nube"("tenant_id", "creada_en");

-- AddForeignKey
ALTER TABLE "instalaciones" ADD CONSTRAINT "instalaciones_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ventas_nube" ADD CONSTRAINT "ventas_nube_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ventas_nube" ADD CONSTRAINT "ventas_nube_instalacion_id_fkey" FOREIGN KEY ("instalacion_id") REFERENCES "instalaciones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Ventas existentes: su DTE se da por aceptado si ya se sincronizó; si no, queda pendiente.
UPDATE "transacciones" SET "estado_dte" = CASE WHEN "sincronizacion" = 'SINCRONIZADO' THEN 'ACEPTADO'::"EstadoDte" ELSE 'PENDIENTE_ENVIO_SII'::"EstadoDte" END
WHERE "tipo_transaccion" = 'VENTA';
