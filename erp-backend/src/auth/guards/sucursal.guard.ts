import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { CHECK_SUCURSAL_KEY } from '../decorators/check-sucursal.decorator';

const RESTRICTED_ROLES = ['Vendedor', 'Encargado'];

@Injectable()
export class SucursalGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const from = this.reflector.getAllAndOverride<'body' | 'query' | 'params'>(
      CHECK_SUCURSAL_KEY,
      [context.getHandler(), context.getClass()],
    );

    // Si el decorador no está presente, no aplica la restricción
    if (!from) return true;

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    // Administrador tiene acceso total
    if (!RESTRICTED_ROLES.includes(user.rol)) return true;

    // Vendedor/Encargado deben tener una sucursal asignada
    if (!user.sucursalId) {
      throw new ForbiddenException('Tu usuario no tiene una sucursal asignada. Contacta al administrador.');
    }

    const requestedSucursalId: string | undefined = request[from]?.sucursalId;

    if (!requestedSucursalId) {
      throw new ForbiddenException('Debes especificar una sucursal en la petición.');
    }

    if (requestedSucursalId !== user.sucursalId) {
      throw new ForbiddenException('No puedes operar en una sucursal diferente a la tuya.');
    }

    return true;
  }
}
