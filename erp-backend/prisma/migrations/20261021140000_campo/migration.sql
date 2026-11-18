-- CreateEnum
CREATE TYPE "CategoriaCosto" AS ENUM ('INSUMOS', 'MANO_OBRA', 'MAQUINARIA', 'SERVICIOS', 'OTROS');

-- CreateEnum
CREATE TYPE "TipoTrabajador" AS ENUM ('PROPIO', 'CONTRATISTA');

-- CreateEnum
CREATE TYPE "TipoLabor" AS ENUM ('JORNADA', 'TRATO');

-- AlterTable
ALTER TABLE "entidades" ADD COLUMN     "f30_vigencia" DATE;

-- AlterTable
ALTER TABLE "gastos_operacionales" ADD COLUMN     "categoria_costo" "CategoriaCosto",
ADD COLUMN     "cuartel_id" UUID,
ADD COLUMN     "temporada_id" UUID;

-- CreateTable
CREATE TABLE "predios" (
    "id" UUID NOT NULL,
    "nombre" VARCHAR(80) NOT NULL,
    "comuna" VARCHAR(60),
    "hectareas" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "predios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cuarteles" (
    "id" UUID NOT NULL,
    "predio_id" UUID NOT NULL,
    "nombre" VARCHAR(80) NOT NULL,
    "cultivo" VARCHAR(60) NOT NULL,
    "variedad" VARCHAR(60),
    "hectareas" DECIMAL(10,2) NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "cuarteles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "temporadas" (
    "id" UUID NOT NULL,
    "nombre" VARCHAR(30) NOT NULL,
    "fecha_inicio" DATE NOT NULL,
    "fecha_fin" DATE NOT NULL,

    CONSTRAINT "temporadas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "aplicaciones_fitosanitarias" (
    "id" UUID NOT NULL,
    "cuartel_id" UUID NOT NULL,
    "temporada_id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "sucursal_id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "fecha" DATE NOT NULL,
    "objetivo" VARCHAR(120) NOT NULL,
    "dosis_por_ha" DECIMAL(12,3) NOT NULL,
    "cantidad" DECIMAL(12,3) NOT NULL,
    "carencia_dias" INTEGER NOT NULL,
    "reingreso_horas" INTEGER NOT NULL DEFAULT 0,
    "aplicador" VARCHAR(100) NOT NULL,
    "metodo" VARCHAR(60),
    "costo" DECIMAL(12,2) NOT NULL,
    "estado" "EstadoDocumentoCompra" NOT NULL DEFAULT 'VIGENTE',
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "aplicaciones_fitosanitarias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cosechas" (
    "id" UUID NOT NULL,
    "cuartel_id" UUID NOT NULL,
    "temporada_id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "sucursal_id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "kilos" DECIMAL(12,3) NOT NULL,
    "costo_kilo" DECIMAL(12,2) NOT NULL,
    "costo_total" DECIMAL(12,2) NOT NULL,
    "lote_id" UUID,
    "estado" "EstadoDocumentoCompra" NOT NULL DEFAULT 'VIGENTE',

    CONSTRAINT "cosechas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "presupuestos" (
    "id" UUID NOT NULL,
    "temporada_id" UUID NOT NULL,
    "cuartel_id" UUID NOT NULL,
    "categoria" "CategoriaCosto" NOT NULL,
    "monto" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "presupuestos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trabajadores" (
    "id" UUID NOT NULL,
    "rut" VARCHAR(12) NOT NULL,
    "nombre" VARCHAR(120) NOT NULL,
    "tipo" "TipoTrabajador" NOT NULL DEFAULT 'PROPIO',
    "contratista_id" UUID,
    "valor_jornada" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trabajadores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "labores" (
    "id" UUID NOT NULL,
    "trabajador_id" UUID NOT NULL,
    "cuartel_id" UUID,
    "temporada_id" UUID,
    "fecha" DATE NOT NULL,
    "tipo" "TipoLabor" NOT NULL,
    "descripcion" VARCHAR(80) NOT NULL,
    "cantidad" DECIMAL(12,3) NOT NULL,
    "unidad" VARCHAR(10) NOT NULL,
    "tarifa" DECIMAL(12,2) NOT NULL,
    "monto" DECIMAL(12,2) NOT NULL,
    "liquidacion_id" UUID,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "labores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "anticipos_trabajador" (
    "id" UUID NOT NULL,
    "trabajador_id" UUID NOT NULL,
    "monto" DECIMAL(12,2) NOT NULL,
    "fecha" DATE NOT NULL,
    "medio_pago" "MedioPago" NOT NULL,
    "estado" "EstadoDocumentoCompra" NOT NULL DEFAULT 'VIGENTE',
    "liquidacion_id" UUID,

    CONSTRAINT "anticipos_trabajador_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "liquidaciones_trabajador" (
    "id" UUID NOT NULL,
    "trabajador_id" UUID NOT NULL,
    "hasta" DATE NOT NULL,
    "total_labores" DECIMAL(12,2) NOT NULL,
    "anticipos" DECIMAL(12,2) NOT NULL,
    "a_pagar" DECIMAL(12,2) NOT NULL,
    "fecha_pago" DATE NOT NULL,
    "medio_pago" "MedioPago" NOT NULL,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "liquidaciones_trabajador_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "predios_nombre_key" ON "predios"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "cuarteles_predio_id_nombre_key" ON "cuarteles"("predio_id", "nombre");

-- CreateIndex
CREATE UNIQUE INDEX "temporadas_nombre_key" ON "temporadas"("nombre");

-- CreateIndex
CREATE INDEX "aplicaciones_fitosanitarias_cuartel_id_fecha_idx" ON "aplicaciones_fitosanitarias"("cuartel_id", "fecha");

-- CreateIndex
CREATE UNIQUE INDEX "cosechas_lote_id_key" ON "cosechas"("lote_id");

-- CreateIndex
CREATE UNIQUE INDEX "presupuestos_temporada_id_cuartel_id_categoria_key" ON "presupuestos"("temporada_id", "cuartel_id", "categoria");

-- CreateIndex
CREATE UNIQUE INDEX "trabajadores_rut_key" ON "trabajadores"("rut");

-- CreateIndex
CREATE INDEX "labores_trabajador_id_fecha_idx" ON "labores"("trabajador_id", "fecha");

-- AddForeignKey
ALTER TABLE "gastos_operacionales" ADD CONSTRAINT "gastos_operacionales_cuartel_id_fkey" FOREIGN KEY ("cuartel_id") REFERENCES "cuarteles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gastos_operacionales" ADD CONSTRAINT "gastos_operacionales_temporada_id_fkey" FOREIGN KEY ("temporada_id") REFERENCES "temporadas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lotes" ADD CONSTRAINT "lotes_cuartel_id_fkey" FOREIGN KEY ("cuartel_id") REFERENCES "cuarteles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cuarteles" ADD CONSTRAINT "cuarteles_predio_id_fkey" FOREIGN KEY ("predio_id") REFERENCES "predios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aplicaciones_fitosanitarias" ADD CONSTRAINT "aplicaciones_fitosanitarias_cuartel_id_fkey" FOREIGN KEY ("cuartel_id") REFERENCES "cuarteles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aplicaciones_fitosanitarias" ADD CONSTRAINT "aplicaciones_fitosanitarias_temporada_id_fkey" FOREIGN KEY ("temporada_id") REFERENCES "temporadas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aplicaciones_fitosanitarias" ADD CONSTRAINT "aplicaciones_fitosanitarias_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aplicaciones_fitosanitarias" ADD CONSTRAINT "aplicaciones_fitosanitarias_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cosechas" ADD CONSTRAINT "cosechas_cuartel_id_fkey" FOREIGN KEY ("cuartel_id") REFERENCES "cuarteles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cosechas" ADD CONSTRAINT "cosechas_temporada_id_fkey" FOREIGN KEY ("temporada_id") REFERENCES "temporadas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cosechas" ADD CONSTRAINT "cosechas_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cosechas" ADD CONSTRAINT "cosechas_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cosechas" ADD CONSTRAINT "cosechas_lote_id_fkey" FOREIGN KEY ("lote_id") REFERENCES "lotes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "presupuestos" ADD CONSTRAINT "presupuestos_temporada_id_fkey" FOREIGN KEY ("temporada_id") REFERENCES "temporadas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "presupuestos" ADD CONSTRAINT "presupuestos_cuartel_id_fkey" FOREIGN KEY ("cuartel_id") REFERENCES "cuarteles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trabajadores" ADD CONSTRAINT "trabajadores_contratista_id_fkey" FOREIGN KEY ("contratista_id") REFERENCES "entidades"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "labores" ADD CONSTRAINT "labores_trabajador_id_fkey" FOREIGN KEY ("trabajador_id") REFERENCES "trabajadores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "labores" ADD CONSTRAINT "labores_cuartel_id_fkey" FOREIGN KEY ("cuartel_id") REFERENCES "cuarteles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "labores" ADD CONSTRAINT "labores_temporada_id_fkey" FOREIGN KEY ("temporada_id") REFERENCES "temporadas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "labores" ADD CONSTRAINT "labores_liquidacion_id_fkey" FOREIGN KEY ("liquidacion_id") REFERENCES "liquidaciones_trabajador"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "anticipos_trabajador" ADD CONSTRAINT "anticipos_trabajador_trabajador_id_fkey" FOREIGN KEY ("trabajador_id") REFERENCES "trabajadores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "anticipos_trabajador" ADD CONSTRAINT "anticipos_trabajador_liquidacion_id_fkey" FOREIGN KEY ("liquidacion_id") REFERENCES "liquidaciones_trabajador"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "liquidaciones_trabajador" ADD CONSTRAINT "liquidaciones_trabajador_trabajador_id_fkey" FOREIGN KEY ("trabajador_id") REFERENCES "trabajadores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


INSERT INTO "cuentas_contables" ("codigo", "nombre", "tipo") VALUES
  ('5116', 'Costo de producción traspasado a existencias', 'GASTO');

ALTER TABLE "labores" ADD CONSTRAINT "labores_montos" CHECK ("cantidad" > 0 AND "tarifa" >= 0 AND "monto" >= 0);
ALTER TABLE "aplicaciones_fitosanitarias" ADD CONSTRAINT "aplicaciones_cantidades" CHECK ("cantidad" > 0 AND "carencia_dias" >= 0);
ALTER TABLE "cosechas" ADD CONSTRAINT "cosechas_kilos" CHECK ("kilos" > 0);
ALTER TABLE "anticipos_trabajador" ADD CONSTRAINT "anticipos_trabajador_monto" CHECK ("monto" > 0);
