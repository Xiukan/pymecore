import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * Cuenta los intentos por IP y usuario: frena la prueba de contraseñas sobre una cuenta
 * sin bloquear a otros cajeros que salen por la misma IP pública del local.
 */
@Injectable()
export class UsuarioIpThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, any>): Promise<string> {
    const usuario = typeof req.body?.username === 'string' ? req.body.username.toLowerCase() : '';
    return `${req.ip}|${usuario}`;
  }
}
