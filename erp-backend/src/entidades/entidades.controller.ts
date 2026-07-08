import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { TipoEntidad } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { CreateEntidadDto } from './dto/create-entidad.dto';
import { UpdateEntidadDto } from './dto/update-entidad.dto';
import { EntidadesService } from './entidades.service';

@ApiTags('Entidades')
@ApiBearerAuth('JWT')
@Controller('entidades')
export class EntidadesController {
  constructor(private readonly service: EntidadesService) {}

  @Post()
  @Roles('Administrador', 'Encargado', 'Vendedor')
  @ApiOperation({ summary: 'Crear cliente o proveedor' })
  create(@Body() dto: CreateEntidadDto) {
    return this.service.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'Listar entidades (filtrar por tipo=CLIENTE|PROVEEDOR)' })
  @ApiQuery({ name: 'tipo', required: false, enum: TipoEntidad })
  @ApiQuery({ name: 'todos', required: false, type: Boolean })
  findAll(@Query('tipo') tipo?: TipoEntidad, @Query('todos') todos?: string) {
    return this.service.findAll(tipo, todos !== 'true');
  }

  @Get('rut/:rut')
  @ApiOperation({ summary: 'Buscar entidad por RUT' })
  findByRut(@Param('rut') rut: string) {
    return this.service.findByRut(rut);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener entidad por ID' })
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Patch(':id')
  @Roles('Administrador', 'Encargado')
  @ApiOperation({ summary: 'Actualizar cliente o proveedor' })
  update(@Param('id') id: string, @Body() dto: UpdateEntidadDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @Roles('Administrador')
  @ApiOperation({ summary: 'Desactivar entidad (soft delete)' })
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
