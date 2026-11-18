-- AlterTable
ALTER TABLE "items" ADD COLUMN     "dias_alerta_vencimiento" INTEGER;

ALTER TABLE "items" ADD CONSTRAINT "items_dias_alerta_rango" CHECK ("dias_alerta_vencimiento" IS NULL OR "dias_alerta_vencimiento" BETWEEN 0 AND 365);
