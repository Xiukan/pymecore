import { ConfigService } from '@nestjs/config';

/** Sin secreto el sistema no arranca; en producción además debe ser largo y no el de ejemplo. */
export function jwtSecret(config: ConfigService): string {
  const secret = config.get<string>('JWT_SECRET') ?? '';
  if (!secret) throw new Error('Falta JWT_SECRET en el entorno.');
  if (config.get('NODE_ENV') === 'production' && (secret.length < 32 || secret === 'cambia_esto_en_produccion')) {
    throw new Error('JWT_SECRET debe tener al menos 32 caracteres aleatorios en producción.');
  }
  return secret;
}
