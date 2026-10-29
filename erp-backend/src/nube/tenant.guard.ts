import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { createHash } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

export const hashSecreto = (secreto: string) => createHash('sha256').update(secreto).digest('hex');

/**
 * TenantGuard (DA-04): cada local se identifica con su instalación y secreto; de ahí sale el
 * tenant_id de la PYME, que se adjunta a la solicitud antes de llegar a los casos de uso.
 * Solo la base de la nube tiene instalaciones: en un local estas rutas responden 401.
 */
@Injectable()
export class TenantGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(ctx: ExecutionContext) {
    const req = ctx.switchToHttp().getRequest();
    const id = String(req.headers['x-instalacion-id'] ?? '');
    const secreto = String(req.headers['x-instalacion-secreto'] ?? '');
    if (!/^[0-9a-f-]{36}$/i.test(id) || !secreto) throw new UnauthorizedException({ codigo: 'TOKEN_INVALIDO', message: 'Faltan credenciales de la instalación.' });
    const inst = await this.prisma.instalacion.findUnique({ where: { id }, include: { tenant: true } });
    if (!inst || inst.secretoHash !== hashSecreto(secreto)) {
      throw new UnauthorizedException({ codigo: 'TOKEN_INVALIDO', message: 'Instalación desconocida o secreto incorrecto.' });
    }
    if (!inst.activa || inst.tenant.estadoSuscripcion !== 'ACTIVA') {
      throw new ForbiddenException({ codigo: 'TENANT_NO_AUTORIZADO', message: 'La suscripción de esta PYME no está activa.' });
    }
    req.instalacion = { id: inst.id, tenantId: inst.tenantId };
    return true;
  }
}
