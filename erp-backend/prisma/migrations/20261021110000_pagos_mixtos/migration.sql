-- CreateTable
CREATE TABLE "pagos_transaccion" (
    "id" UUID NOT NULL,
    "transaccion_id" UUID NOT NULL,
    "medio_pago" "MedioPago" NOT NULL,
    "monto" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "pagos_transaccion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pagos_transaccion_transaccion_id_idx" ON "pagos_transaccion"("transaccion_id");

-- AddForeignKey
ALTER TABLE "pagos_transaccion" ADD CONSTRAINT "pagos_transaccion_transaccion_id_fkey" FOREIGN KEY ("transaccion_id") REFERENCES "transacciones"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "pagos_transaccion" ADD CONSTRAINT "pagos_transaccion_monto_positivo" CHECK ("monto" > 0);
