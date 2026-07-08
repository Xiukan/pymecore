import { Controller, Get, Post, Query } from '@nestjs/common';
import { Roles } from '../auth/decorators/roles.decorator';
import { SyncService } from './sync.service';

@Controller('sync')
export class SyncController {
  constructor(private readonly syncService: SyncService) {}

  @Get('pendientes')
  @Roles('Administrador', 'Encargado', 'Vendedor')
  getPendientes(@Query('sucursalId') sucursalId?: string) {
    return this.syncService.getPendientes(sucursalId);
  }

  @Post('ejecutar')
  @Roles('Administrador', 'Encargado')
  ejecutar(@Query('sucursalId') sucursalId?: string) {
    return this.syncService.sincronizar(sucursalId);
  }

  @Post('reintentar-errores')
  @Roles('Administrador', 'Encargado')
  reintentarErrores(@Query('sucursalId') sucursalId?: string) {
    return this.syncService.reintentarErrores(sucursalId);
  }
}
