import { Body, Controller, Get, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { CreateUnidadDto, UpdateEmpresaDto } from './dto/empresa.dto';
import { EmpresaService } from './empresa.service';

@ApiTags('Empresa')
@ApiBearerAuth('JWT')
@Controller()
export class EmpresaController {
  constructor(private readonly service: EmpresaService) {}

  @Get('empresa')
  @ApiOperation({ summary: 'Datos del emisor y parámetros de negocio' })
  get() {
    return this.service.get();
  }

  @Patch('empresa')
  @Roles('Administrador')
  @ApiOperation({ summary: 'Actualizar datos del emisor y parámetros' })
  update(@Body() dto: UpdateEmpresaDto) {
    return this.service.update(dto);
  }

  @Get('unidades')
  @ApiOperation({ summary: 'Catálogo de unidades de medida' })
  unidades() {
    return this.service.unidades();
  }

  @Post('unidades')
  @Roles('Administrador', 'Encargado')
  @ApiOperation({ summary: 'Agregar unidad de medida' })
  crearUnidad(@Body() dto: CreateUnidadDto) {
    return this.service.crearUnidad(dto);
  }
}
