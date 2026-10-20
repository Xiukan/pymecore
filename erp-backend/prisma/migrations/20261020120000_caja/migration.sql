-- CreateEnum
CREATE TYPE "EstadoCaja" AS ENUM ('ABIERTA', 'CERRADA');

-- AlterTable
ALTER TABLE "transacciones" ADD COLUMN     "sesion_caja_id" UUID;

-- CreateTable
CREATE TABLE "sesiones_caja" (
    "id" UUID NOT NULL,
    "sucursal_id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "estado" "EstadoCaja" NOT NULL DEFAULT 'ABIERTA',
    "monto_apertura" DECIMAL(12,2) NOT NULL,
    "abierta_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cerrada_en" TIMESTAMP(3),
    "efectivo_esperado" DECIMAL(12,2),
    "efectivo_contado" DECIMAL(12,2),
    "diferencia" DECIMAL(12,2),
    "observaciones" VARCHAR(300),
    "resumen" JSONB,

    CONSTRAINT "sesiones_caja_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sesiones_caja_usuario_id_estado_idx" ON "sesiones_caja"("usuario_id", "estado");

-- AddForeignKey
ALTER TABLE "transacciones" ADD CONSTRAINT "transacciones_sesion_caja_id_fkey" FOREIGN KEY ("sesion_caja_id") REFERENCES "sesiones_caja"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sesiones_caja" ADD CONSTRAINT "sesiones_caja_sucursal_id_fkey" FOREIGN KEY ("sucursal_id") REFERENCES "sucursales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sesiones_caja" ADD CONSTRAINT "sesiones_caja_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Un cajero tiene a lo más una caja abierta, y los montos del arqueo no son negativos.
CREATE UNIQUE INDEX "sesion_caja_abierta_por_usuario" ON "sesiones_caja" ("usuario_id") WHERE "estado" = 'ABIERTA';
ALTER TABLE "sesiones_caja" ADD CONSTRAINT "caja_montos_validos"
  CHECK ("monto_apertura" >= 0 AND ("efectivo_contado" IS NULL OR "efectivo_contado" >= 0));
ALTER TABLE "sesiones_caja" ADD CONSTRAINT "caja_cerrada_completa"
  CHECK ("estado" = 'ABIERTA' OR ("cerrada_en" IS NOT NULL AND "efectivo_contado" IS NOT NULL));
