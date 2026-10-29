import { ForbiddenException } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';

/** Vigencia de la licencia emitida por la nube y margen de tolerancia sin conexión. */
export const LEASE_HORAS = 24;
export const leaseGraciaMin = () => Number(process.env.LEASE_GRACIA_MIN ?? 60);

const b64 = (s: string | Buffer) => Buffer.from(s).toString('base64url');

export interface ContenidoLease {
  instalacionId: string;
  tenantId: string;
  iat: number;
  exp: number;
}

/** JWT HS256 firmado por la nube con el secreto compartido (LEASE_SECRET). */
export function firmarLease(c: ContenidoLease, secreto: string) {
  const cuerpo = `${b64(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))}.${b64(JSON.stringify(c))}`;
  return `${cuerpo}.${createHmac('sha256', secreto).update(cuerpo).digest('base64url')}`;
}

export type EstadoLease = { permitido: true; venceEn: Date; enGracia: boolean } | { permitido: false; motivo: string };

/**
 * Valida la licencia en el local, sin red: firma correcta, emitida para esta instalación y
 * no vencida más allá del margen de gracia.
 */
export function validarLease(jwt: string | null | undefined, instalacionId: string, secreto: string, ahora = new Date()): EstadoLease {
  if (!jwt) return { permitido: false, motivo: 'Este local no tiene licencia: conéctese a internet para obtenerla.' };
  const partes = jwt.split('.');
  if (partes.length !== 3) return { permitido: false, motivo: 'Licencia ilegible.' };
  const esperada = createHmac('sha256', secreto).update(`${partes[0]}.${partes[1]}`).digest();
  const recibida = Buffer.from(partes[2], 'base64url');
  if (recibida.length !== esperada.length || !timingSafeEqual(recibida, esperada)) return { permitido: false, motivo: 'Licencia con firma inválida.' };
  let c: ContenidoLease;
  try {
    c = JSON.parse(Buffer.from(partes[1], 'base64url').toString());
  } catch {
    return { permitido: false, motivo: 'Licencia ilegible.' };
  }
  if (c.instalacionId !== instalacionId) return { permitido: false, motivo: 'La licencia es de otro local.' };
  const vence = c.exp * 1000;
  if (ahora.getTime() > vence + leaseGraciaMin() * 60_000) {
    return { permitido: false, motivo: `La licencia venció (${LEASE_HORAS} h sin conexión). Conéctese a internet para renovarla; las ventas guardadas no se pierden.` };
  }
  return { permitido: true, venceEn: new Date(vence), enGracia: ahora.getTime() > vence };
}

/** En el local (MODO=edge) no se vende sin licencia vigente; en otros modos no aplica. */
export async function exigirLease(db: { leaseToken: { findUnique: (a: { where: { instalacionId: string } }) => Promise<{ jwt: string } | null> } }) {
  if (process.env.MODO !== 'edge') return;
  const id = process.env.INSTALACION_ID ?? '';
  const lease = id ? await db.leaseToken.findUnique({ where: { instalacionId: id } }) : null;
  const r = validarLease(lease?.jwt, id, process.env.LEASE_SECRET ?? '');
  if (!r.permitido) {
    throw new ForbiddenException({ codigo: 'LEASE_VENCIDO', message: r.motivo });
  }
}
