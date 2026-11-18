import { Body, Controller, Get, Param, Post, Query, Request } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ParseLooseUuidPipe } from '../utils/parse-uuid.pipe';
import { CajaService } from './caja.service';
import { AbrirCajaDto, CerrarCajaDto } from './dto/caja.dto';

@ApiTags('Caja')
@ApiBearerAuth('JWT')
@Controller('caja')
export class CajaController {
  constructor(private readonly service: CajaService) {}

  @Get('actual')
  @ApiOperation({ summary: 'Caja abierta del usuario con su arqueo en curso' })
  actual(@Request() req: any) {
    return this.service.actual(req.user);
  }

  @Post('abrir')
  @ApiOperation({ summary: 'Abrir caja con fondo inicial' })
  abrir(@Body() dto: AbrirCajaDto, @Request() req: any) {
    return this.service.abrir(dto, req.user);
  }

  @Post(':id/cerrar')
  @ApiOperation({ summary: 'Cerrar caja: arqueo e informe Z por medio de pago' })
  cerrar(@Param('id', ParseLooseUuidPipe) id: string, @Body() dto: CerrarCajaDto, @Request() req: any) {
    return this.service.cerrar(id, dto, req.user);
  }

  @Get('sesiones')
  @ApiOperation({ summary: 'Historial de cajas (el vendedor ve solo las suyas)' })
  listar(@Request() req: any, @Query('sucursalId') sucursalId?: string, @Query('desde') desde?: string, @Query('hasta') hasta?: string) {
    const fecha = (v?: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v ?? '') ? v : undefined);
    return this.service.listar(req.user, { sucursalId, desde: fecha(desde), hasta: fecha(hasta) });
  }
}
