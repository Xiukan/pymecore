-- AlterEnum
ALTER TYPE "MedioPago" ADD VALUE 'Credito';

-- AlterTable
ALTER TABLE "entidades" ADD COLUMN     "cupo_credito" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "dias_credito" INTEGER NOT NULL DEFAULT 30;

-- AlterTable
ALTER TABLE "facturas_compra" ADD COLUMN     "estado_pago" "EstadoPago" NOT NULL DEFAULT 'POR_PAGAR',
ADD COLUMN     "fecha_pago" DATE,
ADD COLUMN     "medio_pago" "MedioPago";

-- CreateTable
CREATE TABLE "abonos_cliente" (
    "id" UUID NOT NULL,
    "transaccion_id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "sesion_caja_id" UUID,
    "monto" DECIMAL(12,2) NOT NULL,
    "medio_pago" "MedioPago" NOT NULL,
    "estado" "EstadoDocumentoCompra" NOT NULL DEFAULT 'VIGENTE',
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "abonos_cliente_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "abonos_cliente_transaccion_id_idx" ON "abonos_cliente"("transaccion_id");

-- AddForeignKey
ALTER TABLE "abonos_cliente" ADD CONSTRAINT "abonos_cliente_transaccion_id_fkey" FOREIGN KEY ("transaccion_id") REFERENCES "transacciones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "abonos_cliente" ADD CONSTRAINT "abonos_cliente_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "abonos_cliente" ADD CONSTRAINT "abonos_cliente_sesion_caja_id_fkey" FOREIGN KEY ("sesion_caja_id") REFERENCES "sesiones_caja"("id") ON DELETE SET NULL ON UPDATE CASCADE;


ALTER TABLE "abonos_cliente" ADD CONSTRAINT "abono_monto_positivo" CHECK ("monto" > 0);
ALTER TABLE "entidades" ADD CONSTRAINT "credito_valido" CHECK ("cupo_credito" >= 0 AND "dias_credito" >= 0);
-- Las facturas de compra existentes quedan por pagar.
