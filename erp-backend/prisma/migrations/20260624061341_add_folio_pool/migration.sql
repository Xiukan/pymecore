-- CreateTable
CREATE TABLE "folios_disponibles" (
    "id" UUID NOT NULL,
    "tipo_doc" INTEGER NOT NULL,
    "numero" INTEGER NOT NULL,
    "usado" BOOLEAN NOT NULL DEFAULT false,
    "usado_en" TIMESTAMP(3),
    "transaccion_id" UUID,

    CONSTRAINT "folios_disponibles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "folios_disponibles_tipo_doc_numero_key" ON "folios_disponibles"("tipo_doc", "numero");
