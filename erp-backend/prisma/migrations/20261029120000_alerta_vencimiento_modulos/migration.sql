-- AlterTable
ALTER TABLE "empresa" ADD COLUMN     "dias_alerta_vencimiento" INTEGER NOT NULL DEFAULT 3,
ALTER COLUMN "modulos" SET DEFAULT ARRAY[]::TEXT[];

