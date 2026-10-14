import { Body, Controller, Get, Param, Patch, Post, Query, Request } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { EstadoDteRecibido, EstadoOrdenCompra } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { ParseLooseUuidPipe } from '../utils/parse-uuid.pipe';
import { ComprasService } from './compras.service';
import { DteRecibidosService } from './dte-recibidos.service';
import {
  CreateFacturaCompraDto,
  CreateOrdenCompraDto,
  CreateRecepcionDto,
  DescartarDteDto,
  GastoDteDto,
  ImportarDteDto,
} from './dto/compras.dto';

@ApiTags('Compras')
@ApiBearerAuth('JWT')
@Roles('Administrador', 'Encargado')
@Controller('compras')
export class ComprasController {
  constructor(
    private readonly service: ComprasService,
    private readonly dtes: DteRecibidosService,
  ) {}

  @Post('ordenes')
  @ApiOperation({ summary: 'Emitir orden de compra a un proveedor' })
  crear(@Body() dto: CreateOrdenCompraDto, @Request() req: any) {
    return this.service.crearOrden(dto, req.user);
  }

  @Get('ordenes')
  @ApiOperation({ summary: 'Listar órdenes de compra con su avance' })
  @ApiQuery({ name: 'sucursalId', required: false })
  @ApiQuery({ name: 'estado', required: false, enum: EstadoOrdenCompra })
  listar(@Request() req: any, @Query('sucursalId') sucursalId?: string, @Query('estado') estado?: EstadoOrdenCompra) {
    return this.service.listar(req.user, {
      sucursalId,
      estado: estado && Object.values(EstadoOrdenCompra).includes(estado) ? estado : undefined,
    });
  }

  @Get('ordenes/:id')
  @ApiOperation({ summary: 'Detalle de la orden con recepciones, facturas y avance por línea' })
  detalle(@Param('id', ParseLooseUuidPipe) id: string, @Request() req: any) {
    return this.service.detalle(id, req.user);
  }

  @Post('ordenes/:id/recepciones')
  @ApiOperation({ summary: 'Recibir mercadería: suma stock y recalcula el costo promedio' })
  recibir(@Param('id', ParseLooseUuidPipe) id: string, @Body() dto: CreateRecepcionDto, @Request() req: any) {
    return this.service.recibir(id, dto, req.user);
  }

  @Post('ordenes/:id/facturas')
  @ApiOperation({ summary: 'Registrar la factura del proveedor contra lo recibido' })
  facturar(@Param('id', ParseLooseUuidPipe) id: string, @Body() dto: CreateFacturaCompraDto, @Request() req: any) {
    return this.service.registrarFactura(id, dto, req.user);
  }

  @Patch('ordenes/:id/cerrar')
  @ApiOperation({ summary: 'Cerrar la orden: no admite más recepciones' })
  cerrar(@Param('id', ParseLooseUuidPipe) id: string, @Request() req: any) {
    return this.service.cerrar(id, req.user);
  }

  @Patch('ordenes/:id/anular')
  @ApiOperation({ summary: 'Anular la orden (sin recepciones ni facturas vigentes)' })
  anular(@Param('id', ParseLooseUuidPipe) id: string, @Request() req: any) {
    return this.service.anular(id, req.user);
  }

  @Patch('recepciones/:id/anular')
  @ApiOperation({ summary: 'Anular recepción: descuenta stock y revierte el costo' })
  anularRecepcion(@Param('id', ParseLooseUuidPipe) id: string, @Request() req: any) {
    return this.service.anularRecepcion(id, req.user);
  }

  @Patch('facturas/:id/anular')
  @ApiOperation({ summary: 'Anular factura de proveedor' })
  anularFactura(@Param('id', ParseLooseUuidPipe) id: string, @Request() req: any) {
    return this.service.anularFactura(id, req.user);
  }

  @Post('dte')
  @ApiOperation({ summary: 'Cargar un DTE recibido de un proveedor (verifica timbre y firma)' })
  importarDte(@Body() dto: ImportarDteDto, @Request() req: any) {
    return this.dtes.importar(dto.xml, req.user);
  }

  @Get('dte')
  @ApiOperation({ summary: 'Bandeja de DTE recibidos' })
  @ApiQuery({ name: 'estado', required: false, enum: EstadoDteRecibido })
  listarDte(@Query('estado') estado?: EstadoDteRecibido) {
    return this.dtes.listar(estado && Object.values(EstadoDteRecibido).includes(estado) ? estado : undefined);
  }

  @Get('dte/:id')
  @ApiOperation({ summary: 'DTE recibido con su XML original' })
  detalleDte(@Param('id', ParseLooseUuidPipe) id: string) {
    return this.dtes.detalle(id);
  }

  @Post('dte/:id/gasto')
  @ApiOperation({ summary: 'Registrar el DTE como gasto operacional (servicios sin OC)' })
  gastoDte(@Param('id', ParseLooseUuidPipe) id: string, @Body() dto: GastoDteDto, @Request() req: any) {
    return this.dtes.registrarGasto(id, dto, req.user);
  }

  @Patch('dte/:id/descartar')
  @ApiOperation({ summary: 'Descartar un DTE que no corresponde registrar' })
  descartarDte(@Param('id', ParseLooseUuidPipe) id: string, @Body() dto: DescartarDteDto) {
    return this.dtes.descartar(id, dto.motivo);
  }
}
