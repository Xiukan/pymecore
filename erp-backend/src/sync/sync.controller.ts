import { Controller, Get, Post, Query, Request } from '@nestjs/common';
import { sucursalDe } from '../auth/sucursal-scope';
import { Roles } from '../auth/decorators/roles.decorator';
import { SyncService } from './sync.service';

@Controller('sync')
export class SyncController {
  constructor(private readonly syncService: SyncService) {}

  @Get('pendientes')
  @Roles('Administrador', 'Encargado', 'Vendedor')
  getPendientes(@Request() req: any, @Query('sucursalId') sucursalId?: string) {
    return this.syncService.getPendientes(sucursalDe(req.user, sucursalId));
  }

  @Post('ejecutar')
  @Roles('Administrador', 'Encargado')
  ejecutar(@Request() req: any, @Query('sucursalId') sucursalId?: string) {
    return this.syncService.sincronizar(sucursalDe(req.user, sucursalId));
  }

  @Post('reintentar-errores')
  @Roles('Administrador', 'Encargado')
  reintentarErrores(@Request() req: any, @Query('sucursalId') sucursalId?: string) {
    return this.syncService.reintentarErrores(sucursalDe(req.user, sucursalId));
  }
}
