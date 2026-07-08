import { SetMetadata } from '@nestjs/common';

export const CHECK_SUCURSAL_KEY = 'checkSucursal';

/**
 * Marca una ruta para que SucursalGuard valide que el sucursalId de la petición
 * coincide con el del token. Solo aplica a roles Vendedor y Encargado.
 * El parámetro indica dónde buscar el sucursalId: 'body' | 'query' | 'params'
 */
export const CheckSucursal = (from: 'body' | 'query' | 'params' = 'body') =>
  SetMetadata(CHECK_SUCURSAL_KEY, from);
