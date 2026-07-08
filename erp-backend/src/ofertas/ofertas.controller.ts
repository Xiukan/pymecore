import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { CreateOfertaDto, UpdateOfertaDto } from './dto/oferta.dto';
import { OfertasService } from './ofertas.service';

@ApiTags('Ofertas')
@ApiBearerAuth('JWT')
@Controller('ofertas')
export class OfertasController {
  constructor(private readonly service: OfertasService) {}

  @Post()
  @Roles('Administrador', 'Encargado')
  @ApiOperation({ summary: 'Crear oferta de precio' })
  create(@Body() dto: CreateOfertaDto) {
    return this.service.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'Listar ofertas (soloActivas=true para vigentes)' })
  findAll(@Query('soloActivas') soloActivas?: string) {
    return this.service.findAll(soloActivas === 'true');
  }

  @Get('vigente/:itemId')
  @ApiOperation({ summary: 'Obtener oferta vigente de un ítem' })
  findVigente(@Param('itemId') itemId: string) {
    return this.service.findVigente(itemId);
  }

  @Patch(':id')
  @Roles('Administrador', 'Encargado')
  @ApiOperation({ summary: 'Actualizar oferta' })
  update(@Param('id') id: string, @Body() dto: UpdateOfertaDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @Roles('Administrador')
  @ApiOperation({ summary: 'Eliminar oferta' })
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
