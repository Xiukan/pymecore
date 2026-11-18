-- CreateEnum
CREATE TYPE "TipoCuenta" AS ENUM ('ACTIVO', 'PASIVO', 'PATRIMONIO', 'INGRESO', 'GASTO');

-- AlterTable
ALTER TABLE "categorias_gasto" ADD COLUMN     "cuenta_codigo" VARCHAR(10) NOT NULL DEFAULT '5103';

-- CreateTable
CREATE TABLE "cuentas_contables" (
    "codigo" VARCHAR(10) NOT NULL,
    "nombre" VARCHAR(80) NOT NULL,
    "tipo" "TipoCuenta" NOT NULL,
    "activa" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "cuentas_contables_pkey" PRIMARY KEY ("codigo")
);

-- CreateTable
CREATE TABLE "asientos" (
    "id" UUID NOT NULL,
    "fecha" DATE NOT NULL,
    "glosa" VARCHAR(200) NOT NULL,
    "origen_tipo" VARCHAR(30) NOT NULL,
    "origen_id" VARCHAR(80),
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "asientos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asiento_lineas" (
    "id" UUID NOT NULL,
    "asiento_id" UUID NOT NULL,
    "cuenta_codigo" VARCHAR(10) NOT NULL,
    "debe" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "haber" DECIMAL(14,2) NOT NULL DEFAULT 0,

    CONSTRAINT "asiento_lineas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "periodos_cerrados" (
    "mes" CHAR(7) NOT NULL,
    "usuario_id" UUID NOT NULL,
    "cerrado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "periodos_cerrados_pkey" PRIMARY KEY ("mes")
);

-- CreateIndex
CREATE INDEX "asientos_fecha_idx" ON "asientos"("fecha");

-- CreateIndex
CREATE UNIQUE INDEX "asientos_origen_tipo_origen_id_key" ON "asientos"("origen_tipo", "origen_id");

-- CreateIndex
CREATE INDEX "asiento_lineas_cuenta_codigo_idx" ON "asiento_lineas"("cuenta_codigo");

-- AddForeignKey
ALTER TABLE "asiento_lineas" ADD CONSTRAINT "asiento_lineas_asiento_id_fkey" FOREIGN KEY ("asiento_id") REFERENCES "asientos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asiento_lineas" ADD CONSTRAINT "asiento_lineas_cuenta_codigo_fkey" FOREIGN KEY ("cuenta_codigo") REFERENCES "cuentas_contables"("codigo") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Plan de cuentas inicial. Los códigos los usan los asientos automáticos.
INSERT INTO "cuentas_contables" ("codigo", "nombre", "tipo") VALUES
  ('1101', 'Caja', 'ACTIVO'),
  ('1102', 'Banco', 'ACTIVO'),
  ('1103', 'Ventas con tarjeta por cobrar', 'ACTIVO'),
  ('1104', 'Clientes', 'ACTIVO'),
  ('1105', 'IVA crédito fiscal', 'ACTIVO'),
  ('1106', 'Mercaderías', 'ACTIVO'),
  ('1107', 'Anticipos a productores', 'ACTIVO'),
  ('1108', 'Anticipos al personal', 'ACTIVO'),
  ('1201', 'Activo fijo', 'ACTIVO'),
  ('1202', 'Depreciación acumulada', 'ACTIVO'),
  ('2101', 'Proveedores', 'PASIVO'),
  ('2102', 'IVA débito fiscal', 'PASIVO'),
  ('2103', 'Retenciones por pagar', 'PASIVO'),
  ('2104', 'Remuneraciones por pagar', 'PASIVO'),
  ('2105', 'Mercadería recibida por facturar', 'PASIVO'),
  ('3101', 'Capital', 'PATRIMONIO'),
  ('3102', 'Resultados acumulados', 'PATRIMONIO'),
  ('4101', 'Ventas', 'INGRESO'),
  ('4102', 'Devoluciones sobre ventas', 'INGRESO'),
  ('4103', 'Otros ingresos', 'INGRESO'),
  ('5101', 'Costo de ventas', 'GASTO'),
  ('5102', 'Mermas', 'GASTO'),
  ('5103', 'Gastos generales', 'GASTO'),
  ('5104', 'Depreciación', 'GASTO'),
  ('5105', 'Mano de obra', 'GASTO'),
  ('5106', 'Diferencias de caja', 'GASTO'),
  ('5107', 'Arriendos', 'GASTO'),
  ('5108', 'Remuneraciones', 'GASTO'),
  ('5109', 'Honorarios', 'GASTO'),
  ('5110', 'Servicios básicos', 'GASTO'),
  ('5111', 'Combustible', 'GASTO'),
  ('5112', 'Mantención y reparaciones', 'GASTO'),
  ('5113', 'Impuestos y patentes', 'GASTO'),
  ('5114', 'Gastos bancarios', 'GASTO'),
  ('5115', 'Insumos agrícolas', 'GASTO');

UPDATE "categorias_gasto" SET "cuenta_codigo" = CASE "nombre"
  WHEN 'Arriendo' THEN '5107'
  WHEN 'Remuneraciones' THEN '5108'
  WHEN 'Honorarios' THEN '5109'
  WHEN 'Servicios básicos' THEN '5110'
  WHEN 'Telefonía e internet' THEN '5110'
  WHEN 'Combustible' THEN '5111'
  WHEN 'Mantención y reparaciones' THEN '5112'
  WHEN 'Impuestos y patentes' THEN '5113'
  WHEN 'Gastos bancarios' THEN '5114'
  ELSE '5103' END;

ALTER TABLE "categorias_gasto" ADD CONSTRAINT "categorias_gasto_cuenta_codigo_fkey" FOREIGN KEY ("cuenta_codigo") REFERENCES "cuentas_contables"("codigo") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "asiento_lineas" ADD CONSTRAINT "asiento_lineas_un_lado" CHECK ("debe" >= 0 AND "haber" >= 0 AND ("debe" = 0 OR "haber" = 0));
