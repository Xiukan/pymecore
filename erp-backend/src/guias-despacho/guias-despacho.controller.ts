import { Body, Controller, Get, Param, Patch, Post, Query, Request } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
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
    return this.service.create(dto, req.user.sub);
  }

  @Get()
  @ApiOperation({ summary: 'Listar guías (filtrar por sucursalId)' })
  findAll(@Query('sucursalId') sucursalId?: string) {
    return this.service.findAll(sucursalId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener guía por ID' })
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Patch(':id/recibir')
  @Roles('Administrador', 'Encargado')
  @ApiOperation({ summary: 'Marcar guía como recibida (aplica stock en destino)' })
  recibir(@Param('id') id: string) {
    return this.service.recibir(id);
  }

  @Patch(':id/anular')
  @Roles('Administrador')
  @ApiOperation({ summary: 'Anular guía (devuelve stock al origen)' })
  anular(@Param('id') id: string) {
    return this.service.anular(id);
  }
}
