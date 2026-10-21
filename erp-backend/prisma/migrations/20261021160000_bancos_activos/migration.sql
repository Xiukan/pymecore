-- CreateEnum
CREATE TYPE "EstadoActivo" AS ENUM ('ACTIVO', 'BAJA');

-- CreateTable
CREATE TABLE "cuentas_bancarias" (
    "id" UUID NOT NULL,
    "banco" VARCHAR(60) NOT NULL,
    "numero" VARCHAR(30) NOT NULL,
    "alias" VARCHAR(60),
    "saldo_inicial" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "fecha_saldo_inicial" DATE NOT NULL,
    "activa" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "cuentas_bancarias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "movimientos_bancarios" (
    "id" UUID NOT NULL,
    "cuenta_bancaria_id" UUID NOT NULL,
    "fecha" DATE NOT NULL,
    "descripcion" VARCHAR(200) NOT NULL,
    "monto" DECIMAL(14,2) NOT NULL,
    "huella" CHAR(64) NOT NULL,
    "conciliado_tipo" VARCHAR(30),
    "conciliado_id" VARCHAR(80),
    "cuenta_codigo" VARCHAR(10),
    "conciliado_en" TIMESTAMP(3),
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "movimientos_bancarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activos_fijos" (
    "id" UUID NOT NULL,
    "nombre" VARCHAR(120) NOT NULL,
    "categoria" VARCHAR(60) NOT NULL,
    "fecha_compra" DATE NOT NULL,
    "valor_compra" DECIMAL(14,2) NOT NULL,
    "iva_credito" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "valor_residual" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "vida_util_meses" INTEGER NOT NULL,
    "medio_pago" "MedioPago",
    "estado" "EstadoActivo" NOT NULL DEFAULT 'ACTIVO',
    "fecha_baja" DATE,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activos_fijos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "cuentas_bancarias_banco_numero_key" ON "cuentas_bancarias"("banco", "numero");

-- CreateIndex
CREATE INDEX "movimientos_bancarios_cuenta_bancaria_id_fecha_idx" ON "movimientos_bancarios"("cuenta_bancaria_id", "fecha");

-- CreateIndex
CREATE UNIQUE INDEX "movimientos_bancarios_cuenta_bancaria_id_huella_key" ON "movimientos_bancarios"("cuenta_bancaria_id", "huella");

-- CreateIndex
CREATE UNIQUE INDEX "movimientos_bancarios_conciliado_tipo_conciliado_id_key" ON "movimientos_bancarios"("conciliado_tipo", "conciliado_id");

-- AddForeignKey
ALTER TABLE "movimientos_bancarios" ADD CONSTRAINT "movimientos_bancarios_cuenta_bancaria_id_fkey" FOREIGN KEY ("cuenta_bancaria_id") REFERENCES "cuentas_bancarias"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimientos_bancarios" ADD CONSTRAINT "movimientos_bancarios_cuenta_codigo_fkey" FOREIGN KEY ("cuenta_codigo") REFERENCES "cuentas_contables"("codigo") ON DELETE SET NULL ON UPDATE CASCADE;


INSERT INTO "cuentas_contables" ("codigo", "nombre", "tipo") VALUES
  ('5117', 'Pérdida por baja de activo fijo', 'GASTO'),
  ('4104', 'Intereses ganados', 'INGRESO');

ALTER TABLE "activos_fijos" ADD CONSTRAINT "activos_fijos_valores" CHECK ("valor_compra" > 0 AND "valor_residual" >= 0 AND "valor_residual" < "valor_compra" AND "vida_util_meses" > 0);
ALTER TABLE "movimientos_bancarios" ADD CONSTRAINT "movimientos_bancarios_monto" CHECK ("monto" <> 0);
