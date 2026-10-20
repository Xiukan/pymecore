import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { TributarioService } from './tributario.service';

@ApiTags('Tributario')
@ApiBearerAuth('JWT')
@Roles('Administrador')
@Controller('tributario')
export class TributarioController {
  constructor(private readonly service: TributarioService) {}

  @Get('libro-ventas')
  @ApiOperation({ summary: 'Libro de ventas del mes (boletas, facturas y notas de crédito)' })
  @ApiQuery({ name: 'mes', example: '2026-10' })
  libroVentas(@Query('mes') mes: string) {
    return this.service.libroVentas(mes ?? '');
  }

  @Get('libro-compras')
  @ApiOperation({ summary: 'Libro de compras del mes' })
  @ApiQuery({ name: 'mes', example: '2026-10' })
  libroCompras(@Query('mes') mes: string) {
    return this.service.libroCompras(mes ?? '');
  }

  @Get('resumen-iva')
  @ApiOperation({ summary: 'Resumen mensual tipo F29: débito, crédito, IVA a pagar y retenciones' })
  @ApiQuery({ name: 'mes', example: '2026-10' })
  resumen(@Query('mes') mes: string) {
    return this.service.resumen(mes ?? '');
  }
}
