import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { CheckSucursal } from '../auth/decorators/check-sucursal.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { TransactionsService } from './transactions.service';

@ApiTags('Transacciones')
@ApiBearerAuth('JWT')
@Controller('transactions')
export class TransactionsController {
  constructor(private readonly service: TransactionsService) {}

  @Post()
  @CheckSucursal('body')
  @ApiOperation({ summary: 'Registrar venta, compra o merma (descuenta stock atómicamente)' })
  create(@Body() dto: CreateTransactionDto) {
    return this.service.create(dto);
  }

  @Get()
  @CheckSucursal('query')
  @ApiOperation({ summary: 'Listar transacciones (filtrable por sucursal)' })
  @ApiQuery({ name: 'sucursalId', required: false })
  findAll(@Query('sucursalId') sucursalId?: string) {
    return this.service.findAll(sucursalId);
  }

  @Get('folio/:folio')
  @ApiOperation({ summary: 'Buscar transacción por número de folio/boleta' })
  findByFolio(@Param('folio') folio: string) {
    return this.service.findByFolio(folio);
  }

  @Get(':id')
  @Roles('Administrador', 'Encargado')
  @ApiOperation({ summary: 'Detalle de una transacción' })
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }
}
