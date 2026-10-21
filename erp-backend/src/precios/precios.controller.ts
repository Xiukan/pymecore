import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { ParseLooseUuidPipe } from '../utils/parse-uuid.pipe';
import { AsignarListaDto, ListaPrecioDto, PreciosListaDto } from './dto/precios.dto';
import { preciosVigentes } from './precios';

@ApiTags('Precios')
@ApiBearerAuth('JWT')
@Controller('precios')
export class PreciosController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('vigentes')
  @ApiOperation({ summary: 'Precio que se cobrará a un cliente por cada producto (oferta o lista, el menor)' })
  async vigentes(@Query('entidadId') entidadId?: string) {
    const items = await this.prisma.item.findMany({ where: { estado: 'Activo' }, select: { id: true, precioVenta: true } });
    const mapa = await preciosVigentes(this.prisma, items, entidadId || null);
    return Object.fromEntries([...mapa.entries()].map(([k, v]) => [k, v.toString()]));
  }

  @Get('listas')
  listas() {
    return this.prisma.listaPrecio.findMany({
      include: { precios: true, clientes: { select: { id: true, rut: true, nombreRazonSocial: true } } },
      orderBy: { nombre: 'asc' },
    });
  }

  @Post('listas')
  @Roles('Administrador', 'Encargado')
  crear(@Body() dto: ListaPrecioDto) {
    return this.prisma.listaPrecio.create({ data: { ...dto, nombre: dto.nombre.trim() } });
  }

  @Patch('listas/:id')
  @Roles('Administrador', 'Encargado')
  actualizar(@Param('id', ParseLooseUuidPipe) id: string, @Body() dto: ListaPrecioDto) {
    return this.prisma.listaPrecio.update({ where: { id }, data: dto });
  }

  @Put('listas/:id/precios')
  @Roles('Administrador', 'Encargado')
  @ApiOperation({ summary: 'Fija precios especiales (IVA incluido); precio 0 los quita' })
  async precios(@Param('id', ParseLooseUuidPipe) id: string, @Body() dto: PreciosListaDto) {
    if (!(await this.prisma.listaPrecio.findUnique({ where: { id } }))) throw new NotFoundException('Lista no encontrada');
    return this.prisma.$transaction(async (tx) => {
      for (const p of dto.precios) {
        if (p.precio === 0) await tx.precioLista.deleteMany({ where: { listaId: id, itemId: p.itemId } });
        else
          await tx.precioLista.upsert({
            where: { listaId_itemId: { listaId: id, itemId: p.itemId } },
            update: { precio: p.precio },
            create: { listaId: id, itemId: p.itemId, precio: p.precio },
          });
      }
      return tx.precioLista.findMany({ where: { listaId: id } });
    });
  }

  @Patch('clientes/:id/lista')
  @Roles('Administrador', 'Encargado')
  @ApiOperation({ summary: 'Asigna (o quita) la lista de precios de un cliente' })
  async asignar(@Param('id', ParseLooseUuidPipe) id: string, @Body() dto: AsignarListaDto) {
    const e = await this.prisma.entidad.findUnique({ where: { id } });
    if (!e || e.tipoEntidad !== 'CLIENTE') throw new BadRequestException('Solo los clientes tienen lista de precios.');
    return this.prisma.entidad.update({ where: { id }, data: { listaPrecioId: dto.listaPrecioId ?? null } });
  }
}
