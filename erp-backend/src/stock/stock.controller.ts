import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query, Request } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { CheckSucursal } from '../auth/decorators/check-sucursal.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AdjustStockDto, ConteoDto, CreateStockDto } from './dto/adjust-stock.dto';
import { StockService } from './stock.service';
import { ParseLooseUuidPipe } from '../utils/parse-uuid.pipe';

@ApiTags('Stock')
@ApiBearerAuth('JWT')
@Controller('stock')
export class StockController {
  constructor(private readonly service: StockService) {}

  @Post()
  @Roles('Administrador', 'Encargado')
  @CheckSucursal('body')
  @ApiOperation({ summary: 'Registrar stock inicial de un ítem en una sucursal' })
  create(@Body() dto: CreateStockDto) {
    return this.service.create(dto);
  }

  @Get()
  @CheckSucursal('query')
  @ApiOperation({ summary: 'Consultar stock (filtrar por sucursalId)' })
  @ApiQuery({ name: 'sucursalId', required: false })
  findAll(@Query('sucursalId') sucursalId?: string) {
    return sucursalId ? this.service.findBySucursal(sucursalId) : this.service.findAll();
  }

  @Get('alertas')
  @CheckSucursal('query')
  @ApiOperation({ summary: 'Ítems con stock actual <= stock mínimo' })
  @ApiQuery({ name: 'sucursalId', required: false })
  alertas(@Query('sucursalId') sucursalId?: string) {
    return this.service.alertasBajoStock(sucursalId);
  }

  @Patch(':id')
  @Roles('Administrador', 'Encargado')
  @ApiOperation({ summary: 'Ajustar stock manualmente' })
  adjust(@Param('id', ParseLooseUuidPipe) id: string, @Body() dto: AdjustStockDto, @Request() req: any) {
    return this.service.adjust(id, dto, req.user);
  }

  @Post('conteo/previa')
  @Roles('Administrador', 'Encargado')
  @ApiOperation({ summary: 'Comparar un conteo físico con el sistema sin aplicarlo' })
  previaConteo(@Body() dto: ConteoDto, @Request() req: any) {
    return this.service.previaConteo(dto, req.user);
  }

  @Post('conteo')
  @Roles('Administrador', 'Encargado')
  @ApiOperation({ summary: 'Aplicar el conteo físico: ajusta el stock y contabiliza faltantes y sobrantes' })
  aplicarConteo(@Body() dto: ConteoDto, @Request() req: any) {
    return this.service.aplicarConteo(dto, req.user);
  }

  @Get('sugerencia-compra')
  @Roles('Administrador', 'Encargado')
  @CheckSucursal('query')
  @ApiOperation({ summary: 'Qué comprar según la venta de los últimos 30 días, el stock y lo que ya viene' })
  sugerencia(@Query('sucursalId', ParseLooseUuidPipe) sucursalId: string, @Query('dias', new ParseIntPipe({ optional: true })) dias = 30) {
    return this.service.sugerenciaCompra(sucursalId, dias);
  }
}
