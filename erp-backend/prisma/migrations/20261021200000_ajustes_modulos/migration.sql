-- AlterTable
ALTER TABLE "ajustes_stock" ADD COLUMN     "costo_unitario" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "empresa" ADD COLUMN     "modulos" TEXT[] DEFAULT ARRAY['contabilidad', 'pedidos']::TEXT[];


-- Empresas existentes: se activan todos los módulos para no esconder nada que ya usen.
UPDATE "empresa" SET "modulos" = ARRAY['contabilidad', 'pedidos', 'productores', 'campo', 'finanzas', 'despachos'];
