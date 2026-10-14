import { Prisma } from '@prisma/client';

/** Toma el menor folio libre; SKIP LOCKED evita entregar el mismo folio a dos ventas simultáneas. */
export async function reclamarFolio(
  tx: Prisma.TransactionClient,
  tipoDoc: number,
  transaccionId: string,
): Promise<number | null> {
  const filas = await tx.$queryRaw<{ numero: number }[]>`
    UPDATE folios_disponibles
       SET usado = true, usado_en = now(), transaccion_id = ${transaccionId}::uuid
     WHERE id = (
       SELECT id FROM folios_disponibles
        WHERE tipo_doc = ${tipoDoc} AND usado = false
        ORDER BY numero
        LIMIT 1
        FOR UPDATE SKIP LOCKED
     )
    RETURNING numero`;
  return filas[0]?.numero ?? null;
}
