import { Body, Controller, ForbiddenException, Get, Headers, Param, Post, Query, Request } from '@nestjs/common';
import { TipoTransaccion } from '@prisma/client';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { CheckSucursal } from '../auth/decorators/check-sucursal.decorator';
import { exigirSucursal } from '../auth/sucursal-scope';
import { ParseLooseUuidPipe } from '../utils/parse-uuid.pipe';
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
  create(
    @Body() dto: CreateTransactionDto,
    @Request() req: any,
    @Headers('idempotency-key') clave?: string,
  ) {
    const soloGestion: TipoTransaccion[] = [TipoTransaccion.MERMA, TipoTransaccion.COMPRA];
    if (soloGestion.includes(dto.tipoTransaccion) && !['Administrador', 'Encargado'].includes(req.user.rol)) {
      throw new ForbiddenException('Solo Administrador o Encargado registran mermas y compras.');
    }
    return this.service.create(dto, req.user.id, clave);
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
  async findByFolio(@Param('folio') folio: string, @Request() req: any) {
    const tx = await this.service.findByFolio(folio);
    exigirSucursal(req.user, tx.sucursalId);
    return tx;
  }

  @Get(':id')
  @Roles('Administrador', 'Encargado')
  @ApiOperation({ summary: 'Detalle de una transacción' })
  async findOne(@Param('id', ParseLooseUuidPipe) id: string, @Request() req: any) {
    const tx = await this.service.findOne(id);
    exigirSucursal(req.user, tx.sucursalId);
    return tx;
  }
}
