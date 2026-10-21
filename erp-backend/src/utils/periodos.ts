import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

type Db = { periodoCerrado: Prisma.TransactionClient['periodoCerrado'] };

/** Mes contable de una fecha: las DATE (UTC) por su día; los instantes por la hora local. */
export function mesDe(fecha: Date | string, utc = false): string {
  if (typeof fecha === 'string') return fecha.slice(0, 7);
  return utc
    ? fecha.toISOString().slice(0, 7)
    : `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}`;
}

/** Un mes ya declarado no admite documentos nuevos ni anulaciones con esa fecha. */
export async function exigirPeriodoAbierto(db: Db, fecha: Date | string, utc = false) {
  const mes = mesDe(fecha, utc);
  if (await db.periodoCerrado.findUnique({ where: { mes } })) {
    throw new BadRequestException(`El mes ${mes} está cerrado contablemente. Pide al administrador que lo reabra.`);
  }
}
