import { Body, Controller, ForbiddenException, Get, Param, Patch, Post, Query, Request } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { esAdmin, exigirSucursal, sucursalDe } from '../auth/sucursal-scope';
import { ParseLooseUuidPipe } from '../utils/parse-uuid.pipe';
import { CreateGuiaDto } from './dto/guia.dto';
import { GuiasDespachoService } from './guias-despacho.service';

@ApiTags('Guias Despacho')
@ApiBearerAuth('JWT')
@Controller('guias-despacho')
export class GuiasDespachoController {
  constructor(private readonly service: GuiasDespachoService) {}

  @Post()
  @Roles('Administrador', 'Encargado')
  @ApiOperation({ summary: 'Crear guía de despacho entre sucursales' })
  create(@Body() dto: CreateGuiaDto, @Request() req: any) {
    if (!esAdmin(req.user) && req.user.sucursalId !== dto.sucursalOrigenId) {
      throw new ForbiddenException('Solo puedes despachar desde tu sucursal.');
    }
    return this.service.create(dto, req.user.id);
  }

  @Get()
  @ApiOperation({ summary: 'Listar guías (filtrar por sucursalId)' })
  findAll(@Request() req: any, @Query('sucursalId') sucursalId?: string) {
    return this.service.findAll(sucursalDe(req.user, sucursalId));
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener guía por ID' })
  async findOne(@Param('id', ParseLooseUuidPipe) id: string, @Request() req: any) {
    const guia = await this.service.findOne(id);
    exigirSucursal(req.user, guia.sucursalOrigenId, guia.sucursalDestinoId);
    return guia;
  }

  @Patch(':id/recibir')
  @Roles('Administrador', 'Encargado')
  @ApiOperation({ summary: 'Marcar guía como recibida (aplica stock en destino)' })
  async recibir(@Param('id', ParseLooseUuidPipe) id: string, @Request() req: any) {
    const guia = await this.service.findOne(id);
    exigirSucursal(req.user, guia.sucursalOrigenId, guia.sucursalDestinoId);
    if (!esAdmin(req.user) && req.user.sucursalId !== guia.sucursalDestinoId) {
      throw new ForbiddenException('La guía la recibe la sucursal de destino.');
    }
    return this.service.recibir(id);
  }

  @Patch(':id/anular')
  @Roles('Administrador')
  @ApiOperation({ summary: 'Anular guía (devuelve stock al origen)' })
  anular(@Param('id', ParseLooseUuidPipe) id: string) {
    return this.service.anular(id);
  }
}
