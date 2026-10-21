import { Body, Controller, Get, Param, Patch, Post, Query, Request } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { EstadoPago } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { ParseLooseUuidPipe } from '../utils/parse-uuid.pipe';
import { CategoriaGastoDto, CreateGastoDto, PagarGastoDto } from './dto/gastos.dto';
import { GastosService } from './gastos.service';

@ApiTags('Gastos')
@ApiBearerAuth('JWT')
@Roles('Administrador', 'Encargado')
@Controller('gastos')
export class GastosController {
  constructor(private readonly service: GastosService) {}

  @Post()
  @ApiOperation({ summary: 'Registrar un gasto de la empresa o de una sucursal' })
  crear(@Body() dto: CreateGastoDto, @Request() req: any) {
    return this.service.crear(dto, req.user);
  }

  @Get()
  @ApiOperation({ summary: 'Gastos vigentes con resumen por categoría y monto por pagar' })
  @ApiQuery({ name: 'desde', required: false })
  @ApiQuery({ name: 'hasta', required: false })
  @ApiQuery({ name: 'categoriaId', required: false })
  @ApiQuery({ name: 'estadoPago', required: false, enum: EstadoPago })
  @ApiQuery({ name: 'sucursalId', required: false })
  listar(
    @Request() req: any,
    @Query('desde') desde?: string,
    @Query('hasta') hasta?: string,
    @Query('categoriaId') categoriaId?: string,
    @Query('estadoPago') estadoPago?: EstadoPago,
    @Query('sucursalId') sucursalId?: string,
  ) {
    return this.service.listar(req.user, {
      desde: /^\d{4}-\d{2}-\d{2}$/.test(desde ?? '') ? desde : undefined,
      hasta: /^\d{4}-\d{2}-\d{2}$/.test(hasta ?? '') ? hasta : undefined,
      categoriaId,
      estadoPago: estadoPago && Object.values(EstadoPago).includes(estadoPago) ? estadoPago : undefined,
      sucursalId,
    });
  }

  @Get('categorias')
  @ApiOperation({ summary: 'Catálogo de categorías de gasto' })
  categorias() {
    return this.service.categorias();
  }

  @Post('categorias')
  @Roles('Administrador')
  crearCategoria(@Body() dto: CategoriaGastoDto) {
    return this.service.crearCategoria(dto);
  }

  @Patch('categorias/:id')
  @Roles('Administrador')
  actualizarCategoria(@Param('id', ParseLooseUuidPipe) id: string, @Body() dto: CategoriaGastoDto) {
    return this.service.actualizarCategoria(id, dto);
  }

  @Patch(':id/pagar')
  @ApiOperation({ summary: 'Marcar el gasto como pagado' })
  pagar(@Param('id', ParseLooseUuidPipe) id: string, @Body() dto: PagarGastoDto, @Request() req: any) {
    return this.service.pagar(id, dto, req.user);
  }

  @Patch(':id/anular')
  @ApiOperation({ summary: 'Anular el gasto (si vino de un DTE, el DTE vuelve a la bandeja)' })
  anular(@Param('id', ParseLooseUuidPipe) id: string, @Request() req: any) {
    return this.service.anular(id, req.user);
  }
}
