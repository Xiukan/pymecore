import { Body, Controller, Get, HttpCode, Post, Request, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { validarLote } from './lote';
import { NubeService } from './nube.service';
import { TenantGuard } from './tenant.guard';

/** API de la nube (MODO=cloud). La autenticación es de instalación, no de usuario. */
@ApiTags('Nube')
@Public()
@UseGuards(TenantGuard)
@Controller()
export class NubeController {
  constructor(private readonly service: NubeService) {}

  @Post('sync/lotes')
  @HttpCode(200)
  @ApiOperation({ summary: 'Recibir un lote de ventas de un local (idempotente por UUID)' })
  lotes(@Body() cuerpo: unknown, @Request() req: any) {
    return this.service.recibirLote(validarLote(cuerpo), req.instalacion);
  }

  @Post('lease/renovar')
  @HttpCode(200)
  @ApiOperation({ summary: 'Emitir la licencia de 24 h del local' })
  renovar(@Request() req: any) {
    return this.service.renovarLease(req.instalacion);
  }

  @Get('sync/ventas-nube')
  @ApiOperation({ summary: 'Ventas de la PYME consolidadas en la nube' })
  ventas(@Request() req: any) {
    return this.service.ventas(req.instalacion.tenantId);
  }
}
