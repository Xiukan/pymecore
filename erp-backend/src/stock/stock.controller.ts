import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { CheckSucursal } from '../auth/decorators/check-sucursal.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AdjustStockDto, CreateStockDto } from './dto/adjust-stock.dto';
import { StockService } from './stock.service';

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
  adjust(@Param('id') id: string, @Body() dto: AdjustStockDto) {
    return this.service.adjust(id, dto);
  }
}
