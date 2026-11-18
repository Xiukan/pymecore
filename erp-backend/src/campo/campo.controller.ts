import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, Request } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { ParseLooseUuidPipe } from '../utils/parse-uuid.pipe';
import { CampoService } from './campo.service';
import {
  AnticipoTrabajadorDto,
  AplicacionDto,
  CosechaDto,
  CuartelDto,
  F30Dto,
  LaborDto,
  LiquidacionDto,
  PredioDto,
  PresupuestoDto,
  TemporadaDto,
  TrabajadorDto,
} from './dto/campo.dto';

const fecha = (v?: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v ?? '') ? v : undefined);

@ApiTags('Campo')
@ApiBearerAuth('JWT')
@Roles('Administrador', 'Encargado')
@Controller('campo')
export class CampoController {
  constructor(private readonly service: CampoService) {}

  @Get('predios')
  @ApiOperation({ summary: 'Predios con sus cuarteles' })
  predios() {
    return this.service.predios();
  }

  @Post('predios')
  crearPredio(@Body() dto: PredioDto) {
    return this.service.crearPredio(dto);
  }

  @Patch('predios/:id')
  actualizarPredio(@Param('id', ParseLooseUuidPipe) id: string, @Body() dto: PredioDto) {
    return this.service.actualizarPredio(id, dto);
  }

  @Post('cuarteles')
  crearCuartel(@Body() dto: CuartelDto) {
    return this.service.crearCuartel(dto);
  }

  @Patch('cuarteles/:id')
  actualizarCuartel(@Param('id', ParseLooseUuidPipe) id: string, @Body() dto: CuartelDto) {
    return this.service.actualizarCuartel(id, dto);
  }

  @Get('cuarteles/:id')
  @ApiOperation({ summary: 'Ficha del cuartel con su carencia vigente' })
  estadoCuartel(@Param('id', ParseLooseUuidPipe) id: string) {
    return this.service.estadoCuartel(id);
  }

  @Get('temporadas')
  temporadas() {
    return this.service.temporadas();
  }

  @Post('temporadas')
  crearTemporada(@Body() dto: TemporadaDto) {
    return this.service.crearTemporada(dto);
  }

  @Get('aplicaciones')
  aplicaciones(@Query('cuartelId') cuartelId?: string, @Query('temporadaId') temporadaId?: string) {
    return this.service.aplicaciones({ cuartelId, temporadaId });
  }

  @Post('aplicaciones')
  @ApiOperation({ summary: 'Registrar una aplicación en el cuaderno de campo (descuenta el producto de bodega)' })
  aplicar(@Body() dto: AplicacionDto, @Request() req: any) {
    return this.service.aplicar(dto, req.user);
  }

  @Patch('aplicaciones/:id/anular')
  anularAplicacion(@Param('id', ParseLooseUuidPipe) id: string, @Request() req: any) {
    return this.service.anularAplicacion(id, req.user);
  }

  @Get('carencias')
  @ApiOperation({ summary: 'Cuarteles que hoy no se pueden cosechar' })
  carencias() {
    return this.service.carencias();
  }

  @Get('cosechas')
  cosechas(@Query('temporadaId') temporadaId?: string) {
    return this.service.cosechas(temporadaId);
  }

  @Post('cosechas')
  @ApiOperation({ summary: 'Registrar cosecha: bloquea si hay carencia; entra a stock como lote con el costo del cuartel' })
  cosechar(@Body() dto: CosechaDto, @Request() req: any) {
    return this.service.cosechar(dto, req.user);
  }

  @Patch('cosechas/:id/anular')
  anularCosecha(@Param('id', ParseLooseUuidPipe) id: string, @Request() req: any) {
    return this.service.anularCosecha(id, req.user);
  }

  @Get('costos/:temporadaId')
  @ApiOperation({ summary: 'Costo por cuartel en la temporada: real vs presupuesto, por hectárea y por kilo' })
  costos(@Param('temporadaId', ParseLooseUuidPipe) temporadaId: string) {
    return this.service.informeCostos(temporadaId);
  }

  @Put('presupuestos/:temporadaId')
  @Roles('Administrador')
  presupuesto(@Param('temporadaId', ParseLooseUuidPipe) temporadaId: string, @Body() dto: PresupuestoDto) {
    return this.service.guardarPresupuesto(temporadaId, dto);
  }

  @Get('trabajadores')
  trabajadores() {
    return this.service.trabajadores();
  }

  @Post('trabajadores')
  crearTrabajador(@Body() dto: TrabajadorDto) {
    return this.service.crearTrabajador(dto);
  }

  @Patch('trabajadores/:id')
  actualizarTrabajador(@Param('id', ParseLooseUuidPipe) id: string, @Body() dto: TrabajadorDto) {
    return this.service.actualizarTrabajador(id, dto);
  }

  @Get('labores')
  labores(@Query('trabajadorId') trabajadorId?: string, @Query('desde') desde?: string, @Query('hasta') hasta?: string, @Query('pendientes') pendientes?: string) {
    return this.service.labores({ trabajadorId, desde: fecha(desde), hasta: fecha(hasta), pendientes: pendientes === 'true' });
  }

  @Post('labores')
  @ApiOperation({ summary: 'Registrar jornada o trato' })
  registrarLabor(@Body() dto: LaborDto) {
    return this.service.registrarLabor(dto);
  }

  @Delete('labores/:id')
  eliminarLabor(@Param('id', ParseLooseUuidPipe) id: string) {
    return this.service.eliminarLabor(id);
  }

  @Get('anticipos')
  anticipos() {
    return this.service.anticiposTrabajador();
  }

  @Post('anticipos')
  anticipo(@Body() dto: AnticipoTrabajadorDto) {
    return this.service.anticipoTrabajador(dto);
  }

  @Get('liquidaciones')
  liquidaciones(@Query('desde') desde?: string, @Query('hasta') hasta?: string) {
    return this.service.liquidaciones(fecha(desde), fecha(hasta));
  }

  @Post('liquidaciones')
  @ApiOperation({ summary: 'Pagar labores pendientes descontando anticipos' })
  liquidar(@Body() dto: LiquidacionDto) {
    return this.service.liquidar(dto);
  }

  @Get('contratistas/alertas')
  @ApiOperation({ summary: 'Contratistas con certificado F30-1 vencido o sin registrar' })
  alertasContratistas() {
    return this.service.alertasContratistas();
  }

  @Patch('contratistas/:id/f30')
  f30(@Param('id', ParseLooseUuidPipe) id: string, @Body() dto: F30Dto) {
    return this.service.actualizarF30(id, dto.f30Vigencia);
  }
}
