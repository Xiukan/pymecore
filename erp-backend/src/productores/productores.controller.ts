import { Body, Controller, Get, Param, Patch, Post, Query, Request } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { ParseLooseUuidPipe } from '../utils/parse-uuid.pipe';
import { CreateAnticipoDto, CreateRecepcionProductorDto, PagoProductorDto } from './dto/productores.dto';
import { ProductoresService } from './productores.service';

@ApiTags('Productores')
@ApiBearerAuth('JWT')
@Roles('Administrador', 'Encargado')
@Controller('productores')
export class ProductoresController {
  constructor(private readonly service: ProductoresService) {}

  @Post('recepciones')
  @ApiOperation({ summary: 'Recibir producto de un productor: pesaje, castigos, stock, lote y liquidación' })
  recibir(@Body() dto: CreateRecepcionProductorDto, @Request() req: any) {
    return this.service.recibir(dto, req.user);
  }

  @Get('recepciones')
  @ApiQuery({ name: 'productorId', required: false })
  @ApiQuery({ name: 'sucursalId', required: false })
  @ApiQuery({ name: 'estadoPago', required: false })
  listar(@Request() req: any, @Query('productorId') productorId?: string, @Query('sucursalId') sucursalId?: string, @Query('estadoPago') estadoPago?: string) {
    return this.service.listar(req.user, { productorId, sucursalId, estadoPago });
  }

  @Patch('recepciones/:id/anular')
  anular(@Param('id', ParseLooseUuidPipe) id: string, @Request() req: any) {
    return this.service.anular(id, req.user);
  }

  @Post('recepciones/:id/pagar')
  @ApiOperation({ summary: 'Pagar la recepción descontando anticipos pendientes' })
  pagar(@Param('id', ParseLooseUuidPipe) id: string, @Body() dto: PagoProductorDto, @Request() req: any) {
    return this.service.pagar(id, dto, req.user);
  }

  @Get('anticipos')
  anticipos() {
    return this.service.anticipos();
  }

  @Post('anticipos')
  @ApiOperation({ summary: 'Adelantar dinero a un productor' })
  crearAnticipo(@Body() dto: CreateAnticipoDto, @Request() req: any) {
    return this.service.crearAnticipo(dto, req.user);
  }

  @Patch('anticipos/:id/anular')
  anularAnticipo(@Param('id', ParseLooseUuidPipe) id: string) {
    return this.service.anularAnticipo(id);
  }

  @Get(':id/cuenta')
  @ApiOperation({ summary: 'Estado de cuenta del productor' })
  cuenta(@Param('id', ParseLooseUuidPipe) id: string) {
    return this.service.cuenta(id);
  }
}
