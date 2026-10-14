-- AlterEnum
ALTER TYPE "EstadoSincronizacion" ADD VALUE 'ENVIANDO';

-- CreateTable
CREATE TABLE "operaciones_idempotentes" (
    "id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "operacion" VARCHAR(100) NOT NULL,
    "clave" UUID NOT NULL,
    "huella" CHAR(64) NOT NULL,
    "transaccion_id" UUID,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "operaciones_idempotentes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ajustes_stock" (
    "id" UUID NOT NULL,
    "stock_local_id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "anterior" DECIMAL(12,3) NOT NULL,
    "nuevo" DECIMAL(12,3) NOT NULL,
    "motivo" VARCHAR(200),
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ajustes_stock_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "operaciones_idempotentes_usuario_id_operacion_clave_key" ON "operaciones_idempotentes"("usuario_id", "operacion", "clave");

-- CreateIndex
CREATE UNIQUE INDEX "folios_disponibles_transaccion_id_key" ON "folios_disponibles"("transaccion_id");

-- CreateIndex
CREATE UNIQUE INDEX "guias_despacho_folio_key" ON "guias_despacho"("folio");

-- AddForeignKey
ALTER TABLE "transacciones" ADD CONSTRAINT "transacciones_transaccion_origen_id_fkey" FOREIGN KEY ("transaccion_origen_id") REFERENCES "transacciones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operaciones_idempotentes" ADD CONSTRAINT "operaciones_idempotentes_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ajustes_stock" ADD CONSTRAINT "ajustes_stock_stock_local_id_fkey" FOREIGN KEY ("stock_local_id") REFERENCES "stock_local"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ajustes_stock" ADD CONSTRAINT "ajustes_stock_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Invariantes que la base debe sostener aunque falle una validación de la aplicación
-- (equivalente a los CheckConstraint de APS). Los datos existentes se verificaron antes.
ALTER TABLE "stock_local" ADD CONSTRAINT "stock_actual_no_negativo" CHECK ("stock_actual" >= 0);
ALTER TABLE "stock_local" ADD CONSTRAINT "stock_minimo_no_negativo" CHECK ("stock_minimo" >= 0);
ALTER TABLE "transacciones" ADD CONSTRAINT "monto_total_no_negativo" CHECK ("monto_total" >= 0);
ALTER TABLE "transacciones" ADD CONSTRAINT "descuento_global_no_negativo" CHECK ("descuento_global" >= 0);
ALTER TABLE "transacciones_detalle" ADD CONSTRAINT "detalle_cantidad_positiva" CHECK ("cantidad" > 0);
ALTER TABLE "transacciones_detalle" ADD CONSTRAINT "detalle_montos_no_negativos" CHECK ("subtotal" >= 0 AND "monto_iva" >= 0 AND "descuento_linea" >= 0 AND "precio_unitario" >= 0);
ALTER TABLE "guias_despacho_detalle" ADD CONSTRAINT "guia_cantidad_positiva" CHECK ("cantidad" > 0);
ALTER TABLE "ofertas" ADD CONSTRAINT "oferta_fechas_validas" CHECK ("fecha_fin" >= "fecha_inicio");
ALTER TABLE "ofertas" ADD CONSTRAINT "oferta_precio_no_negativo" CHECK ("precio_oferta" >= 0);
