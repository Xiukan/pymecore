import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { CheckSucursal } from '../auth/decorators/check-sucursal.decorator';
import { ReportesService } from './reportes.service';
import type { Granularidad } from './reportes.service';

const GRANULARIDADES: Granularidad[] = ['dia', 'semana', 'mes'];

@ApiTags('Reportes')
@ApiBearerAuth('JWT')
@Controller('reportes')
export class ReportesController {
  constructor(private readonly service: ReportesService) {}

  @Get('dashboard')
  @CheckSucursal('query')
  @ApiOperation({ summary: 'KPIs, evolución y rankings de ventas e inventario para el dashboard' })
  @ApiQuery({ name: 'desde', required: true, example: '2026-09-01' })
  @ApiQuery({ name: 'hasta', required: true, example: '2026-09-30' })
  @ApiQuery({ name: 'granularidad', required: false, enum: GRANULARIDADES })
  @ApiQuery({ name: 'sucursalId', required: false })
  dashboard(
    @Query('desde') desde: string,
    @Query('hasta') hasta: string,
    @Query('granularidad') granularidad: Granularidad = 'dia',
    @Query('sucursalId') sucursalId?: string,
  ) {
    if (!desde || !hasta) throw new BadRequestException('desde y hasta son obligatorios');
    if (!GRANULARIDADES.includes(granularidad)) throw new BadRequestException('granularidad inválida');
    return this.service.dashboard(desde, hasta, granularidad, sucursalId);
  }
}
