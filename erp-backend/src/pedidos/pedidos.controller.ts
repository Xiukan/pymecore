import { Body, Controller, Get, Param, Patch, Post, Query, Request } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ParseLooseUuidPipe } from '../utils/parse-uuid.pipe';
import { CreatePedidoDto, VenderPedidoDto } from './dto/pedidos.dto';
import { PedidosService } from './pedidos.service';

@ApiTags('Pedidos')
@ApiBearerAuth('JWT')
@Controller('pedidos')
export class PedidosController {
  constructor(private readonly service: PedidosService) {}

  @Post()
  @ApiOperation({ summary: 'Crear cotización (o pedido ya aceptado) con los precios del cliente' })
  crear(@Body() dto: CreatePedidoDto, @Request() req: any) {
    return this.service.crear(dto, req.user);
  }

  @Get()
  listar(@Request() req: any, @Query('estado') estado?: string, @Query('sucursalId') sucursalId?: string) {
    return this.service.listar(req.user, estado, sucursalId);
  }

  @Get(':id')
  obtener(@Param('id', ParseLooseUuidPipe) id: string, @Request() req: any) {
    return this.service.obtener(id, req.user);
  }

  @Patch(':id/confirmar')
  confirmar(@Param('id', ParseLooseUuidPipe) id: string, @Request() req: any) {
    return this.service.confirmar(id, req.user);
  }

  @Patch(':id/anular')
  anular(@Param('id', ParseLooseUuidPipe) id: string, @Request() req: any) {
    return this.service.anular(id, req.user);
  }

  @Post(':id/vender')
  @ApiOperation({ summary: 'Convertir en venta (requiere caja abierta)' })
  vender(@Param('id', ParseLooseUuidPipe) id: string, @Body() dto: VenderPedidoDto, @Request() req: any) {
    return this.service.vender(id, dto, req.user);
  }
}
