import { Body, Controller, Get, Param, ParseIntPipe, Post, Query, Request } from '@nestjs/common';
import { Roles } from '../auth/decorators/roles.decorator';
import { RegistrarLoteDto } from './dto/lotes.dto';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { ParseLooseUuidPipe } from '../utils/parse-uuid.pipe';
import { LotesService } from './lotes.service';

@ApiTags('Lotes')
@ApiBearerAuth('JWT')
@Controller('lotes')
export class LotesController {
  constructor(private readonly service: LotesService) {}

  @Get()
  @ApiOperation({ summary: 'Lotes por sucursal y producto' })
  @ApiQuery({ name: 'sucursalId', required: false })
  @ApiQuery({ name: 'itemId', required: false })
  @ApiQuery({ name: 'conSaldo', required: false })
  listar(@Request() req: any, @Query('sucursalId') sucursalId?: string, @Query('itemId') itemId?: string, @Query('conSaldo') conSaldo?: string) {
    return this.service.listar(req.user, { sucursalId, itemId, conSaldo: conSaldo === 'true' });
  }

  @Post()
  @Roles('Administrador', 'Encargado')
  @ApiOperation({ summary: 'Registrar la fecha de vencimiento de stock existente' })
  registrar(@Body() dto: RegistrarLoteDto, @Request() req: any) {
    return this.service.registrar(dto, req.user);
  }

  @Get('por-vencer')
  @ApiOperation({ summary: 'Lotes con saldo que vencen pronto o ya vencieron' })
  porVencer(@Request() req: any, @Query('dias', new ParseIntPipe({ optional: true })) dias = 30, @Query('sucursalId') sucursalId?: string) {
    return this.service.porVencer(req.user, dias, sucursalId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Trazabilidad: origen del lote y documentos a los que salió' })
  trazabilidad(@Param('id', ParseLooseUuidPipe) id: string, @Request() req: any) {
    return this.service.trazabilidad(id, req.user);
  }
}

@ApiTags('Inventario')
@ApiBearerAuth('JWT')
@Controller('inventario')
export class InventarioController {
  constructor(private readonly service: LotesService) {}

  @Get('alertas')
  @ApiOperation({ summary: 'Estado de vencimiento del inventario: Próximo a vencer, Vencido, OK o Sin dato (AC-05, AC-06)' })
  @ApiQuery({ name: 'sucursalId', required: false })
  alertas(@Request() req: any, @Query('sucursalId') sucursalId?: string) {
    return this.service.alertasInventario(req.user, sucursalId);
  }
}
