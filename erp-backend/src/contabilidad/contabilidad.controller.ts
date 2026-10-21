import { Body, Controller, Delete, Get, Param, Post, Query, Request } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { ParseLooseUuidPipe } from '../utils/parse-uuid.pipe';
import { ContabilidadService } from './contabilidad.service';
import { AsientoManualDto } from './dto/contabilidad.dto';

@ApiTags('Contabilidad')
@ApiBearerAuth('JWT')
@Roles('Administrador')
@Controller('contabilidad')
export class ContabilidadController {
  constructor(private readonly service: ContabilidadService) {}

  @Get('cuentas')
  @ApiOperation({ summary: 'Plan de cuentas' })
  cuentas() {
    return this.service.cuentas();
  }

  @Get('resultados')
  @ApiOperation({ summary: 'Estado de resultados del período (por defecto, el año en curso)' })
  @ApiQuery({ name: 'desde', required: false })
  @ApiQuery({ name: 'hasta', required: false })
  resultados(@Query('desde') desde?: string, @Query('hasta') hasta?: string) {
    return this.service.resultados(desde, hasta);
  }

  @Get('balance')
  @ApiOperation({ summary: 'Balance de 8 columnas' })
  @ApiQuery({ name: 'desde', required: false })
  @ApiQuery({ name: 'hasta', required: false })
  balance(@Query('desde') desde?: string, @Query('hasta') hasta?: string) {
    return this.service.balance(desde, hasta);
  }

  @Get('diario')
  @ApiOperation({ summary: 'Libro diario del mes' })
  diario(@Query('mes') mes: string) {
    return this.service.diario(mes ?? '');
  }

  @Get('mayor/:cuenta')
  @ApiOperation({ summary: 'Libro mayor de una cuenta con saldo corrido' })
  @ApiQuery({ name: 'desde', required: false })
  @ApiQuery({ name: 'hasta', required: false })
  mayor(@Param('cuenta') cuenta: string, @Query('desde') desde?: string, @Query('hasta') hasta?: string) {
    return this.service.libroMayor(cuenta, desde, hasta);
  }

  @Post('asientos')
  @ApiOperation({ summary: 'Asiento manual (ajustes del contador)' })
  crearManual(@Body() dto: AsientoManualDto) {
    return this.service.crearManual(dto);
  }

  @Delete('asientos/:id')
  eliminarManual(@Param('id', ParseLooseUuidPipe) id: string) {
    return this.service.eliminarManual(id);
  }

  @Get('periodos')
  @ApiOperation({ summary: 'Meses cerrados' })
  periodos() {
    return this.service.periodos();
  }

  @Post('periodos/:mes/cerrar')
  @ApiOperation({ summary: 'Cerrar un mes: congela sus asientos y bloquea documentos con esa fecha' })
  cerrar(@Param('mes') mes: string, @Request() req: any) {
    return this.service.cerrarPeriodo(mes, req.user.id);
  }

  @Delete('periodos/:mes')
  @ApiOperation({ summary: 'Reabrir un mes cerrado' })
  reabrir(@Param('mes') mes: string) {
    return this.service.reabrirPeriodo(mes);
  }
}
