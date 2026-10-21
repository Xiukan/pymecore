import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { ParseLooseUuidPipe } from '../utils/parse-uuid.pipe';
import { ActivoDto, BajaActivoDto, ConciliarDto, CuentaBancariaDto, ImportarCartolaDto } from './dto/finanzas.dto';
import { FinanzasService } from './finanzas.service';

@ApiTags('Finanzas')
@ApiBearerAuth('JWT')
@Roles('Administrador')
@Controller('finanzas')
export class FinanzasController {
  constructor(private readonly service: FinanzasService) {}

  @Get('bancos')
  @ApiOperation({ summary: 'Cuentas bancarias con saldo según cartola y movimientos por conciliar' })
  bancos() {
    return this.service.cuentasBancarias();
  }

  @Post('bancos')
  crearBanco(@Body() dto: CuentaBancariaDto) {
    return this.service.crearCuentaBancaria(dto);
  }

  @Post('bancos/:id/cartola')
  @ApiOperation({ summary: 'Importar cartola en CSV (los movimientos repetidos se omiten)' })
  importar(@Param('id', ParseLooseUuidPipe) id: string, @Body() dto: ImportarCartolaDto) {
    return this.service.importarCartola(id, dto.contenido);
  }

  @Get('bancos/:id/movimientos')
  movimientos(@Param('id', ParseLooseUuidPipe) id: string, @Query('pendientes') pendientes?: string) {
    return this.service.movimientos(id, pendientes === 'true');
  }

  @Get('movimientos/:id/sugerencias')
  @ApiOperation({ summary: 'Documentos del mismo monto y fecha cercana que pueden explicar el movimiento' })
  sugerencias(@Param('id', ParseLooseUuidPipe) id: string) {
    return this.service.sugerencias(id);
  }

  @Post('movimientos/:id/conciliar')
  conciliar(@Param('id', ParseLooseUuidPipe) id: string, @Body() dto: ConciliarDto) {
    return this.service.conciliar(id, dto);
  }

  @Delete('movimientos/:id/conciliacion')
  desconciliar(@Param('id', ParseLooseUuidPipe) id: string) {
    return this.service.desconciliar(id);
  }

  @Get('flujo')
  @ApiOperation({ summary: 'Flujo de caja proyectado por semana' })
  flujo(@Query('semanas', new ParseIntPipe({ optional: true })) semanas = 12) {
    return this.service.flujo(semanas);
  }

  @Get('activos')
  activos() {
    return this.service.activos();
  }

  @Post('activos')
  crearActivo(@Body() dto: ActivoDto) {
    return this.service.crearActivo(dto);
  }

  @Patch('activos/:id/baja')
  baja(@Param('id', ParseLooseUuidPipe) id: string, @Body() dto: BajaActivoDto) {
    return this.service.bajaActivo(id, dto.fecha);
  }
}
