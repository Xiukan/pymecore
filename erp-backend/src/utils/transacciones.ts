/**
 * Límites de las transacciones que esperan bloqueos de filas compartidas (stock, caja, OC):
 * el valor por defecto de Prisma (5 s) se agota con carga concurrente.
 */
export const TX_OPCIONES = { maxWait: 10_000, timeout: 15_000 };
