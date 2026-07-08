import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { CreateSucursalDto } from './dto/create-sucursal.dto';
import { SucursalesService } from './sucursales.service';

@ApiTags('Sucursales')
@ApiBearerAuth('JWT')
@Controller('sucursales')
export class SucursalesController {
  constructor(private readonly service: SucursalesService) {}

  @Post()
  @Roles('Administrador')
  @ApiOperation({ summary: 'Crear sucursal' })
  create(@Body() dto: CreateSucursalDto) {
    return this.service.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'Listar todas las sucursales' })
  findAll() {
    return this.service.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalle de una sucursal con conteo de stock y transacciones' })
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Patch(':id')
  @Roles('Administrador')
  @ApiOperation({ summary: 'Actualizar sucursal' })
  update(@Param('id') id: string, @Body() dto: CreateSucursalDto) {
    return this.service.update(id, dto);
  }
}
