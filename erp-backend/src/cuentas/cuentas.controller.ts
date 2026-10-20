import { Body, Controller, Get, Param, Patch, Post, Query, Request } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { ParseLooseUuidPipe } from '../utils/parse-uuid.pipe';
import { CuentasService } from './cuentas.service';
import { AbonoDto, PagoProveedorDto } from './dto/cuentas.dto';

@ApiTags('Cuentas por cobrar y pagar')
@ApiBearerAuth('JWT')
@Controller('cuentas')
export class CuentasController {
  constructor(private readonly service: CuentasService) {}

  @Get('por-cobrar')
  @ApiOperation({ summary: 'Ventas a crédito con saldo, por cliente y por antigüedad' })
  porCobrar(@Request() req: any, @Query('sucursalId') sucursalId?: string) {
    return this.service.porCobrar(req.user, sucursalId);
  }

  @Post('abonos')
  @ApiOperation({ summary: 'Registrar un abono a una venta a crédito' })
  abonar(@Body() dto: AbonoDto, @Request() req: any) {
    return this.service.abonar(dto, req.user);
  }

  @Patch('abonos/:id/anular')
  @Roles('Administrador', 'Encargado')
  anularAbono(@Param('id', ParseLooseUuidPipe) id: string, @Request() req: any) {
    return this.service.anularAbono(id, req.user);
  }

  @Get('por-pagar')
  @Roles('Administrador', 'Encargado')
  @ApiOperation({ summary: 'Facturas de compra y gastos por pagar, por vencimiento' })
  porPagar() {
    return this.service.porPagar();
  }

  @Patch('facturas-compra/:id/pagar')
  @Roles('Administrador', 'Encargado')
  pagarFactura(@Param('id', ParseLooseUuidPipe) id: string, @Body() dto: PagoProveedorDto) {
    return this.service.pagarFacturaCompra(id, dto);
  }
}
