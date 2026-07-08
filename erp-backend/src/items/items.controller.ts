import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { CreateItemDto } from './dto/create-item.dto';
import { UpdateItemDto } from './dto/update-item.dto';
import { ItemsService } from './items.service';

@ApiTags('Items')
@ApiBearerAuth('JWT')
@Controller('items')
export class ItemsController {
  constructor(private readonly service: ItemsService) {}

  @Post()
  @Roles('Administrador', 'Encargado')
  @ApiOperation({ summary: 'Crear ítem del catálogo' })
  create(@Body() dto: CreateItemDto) {
    return this.service.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'Listar ítems activos (todos=true para incluir inactivos)' })
  @ApiQuery({ name: 'todos', required: false, type: Boolean })
  findAll(@Query('todos') todos?: string) {
    return this.service.findAll(todos !== 'true');
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener ítem por ID' })
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Patch(':id')
  @Roles('Administrador', 'Encargado')
  @ApiOperation({ summary: 'Actualizar ítem' })
  update(@Param('id') id: string, @Body() dto: UpdateItemDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @Roles('Administrador')
  @ApiOperation({ summary: 'Desactivar ítem (soft delete)' })
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
