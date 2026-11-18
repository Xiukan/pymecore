import { ForbiddenException, NotFoundException } from '@nestjs/common';

export interface UsuarioSesion {
  id: string;
  rol: string;
  sucursalId: string | null;
}

export const esAdmin = (user: UsuarioSesion) => user.rol === 'Administrador';

/** Sucursal efectiva para consultas: el Administrador elige; el resto queda fijo en la suya. */
export function sucursalDe(user: UsuarioSesion, solicitada?: string): string | undefined {
  if (esAdmin(user)) return solicitada || undefined;
  if (!user.sucursalId) {
    throw new ForbiddenException('Tu usuario no tiene una sucursal asignada. Contacta al administrador.');
  }
  return user.sucursalId;
}

/** Documento de otra sucursal: se responde 404 para no revelar que existe. */
export function exigirSucursal(user: UsuarioSesion, ...sucursales: string[]) {
  if (esAdmin(user)) return;
  if (!user.sucursalId || !sucursales.includes(user.sucursalId)) {
    throw new NotFoundException('Documento no encontrado');
  }
}
