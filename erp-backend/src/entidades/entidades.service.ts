import { Injectable, NotFoundException } from '@nestjs/common';
import { TipoEntidad } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateEntidadDto } from './dto/create-entidad.dto';
import { UpdateEntidadDto } from './dto/update-entidad.dto';

@Injectable()
export class EntidadesService {
  constructor(private readonly prisma: PrismaService) {}

  create(dto: CreateEntidadDto) {
    return this.prisma.entidad.create({ data: dto });
  }

  findByRut(rut: string) {
    return this.prisma.entidad.findFirst({
      where: { rut, estado: 'Activo' },
    });
  }

  findAll(tipo?: TipoEntidad, soloActivos = true) {
    return this.prisma.entidad.findMany({
      where: {
        ...(tipo && { tipoEntidad: tipo }),
        ...(soloActivos && { estado: 'Activo' }),
      },
      orderBy: { nombreRazonSocial: 'asc' },
    });
  }

  async findOne(id: string) {
    const entidad = await this.prisma.entidad.findUnique({ where: { id } });
    if (!entidad) throw new NotFoundException('Entidad no encontrada');
    return entidad;
  }

  async update(id: string, dto: UpdateEntidadDto) {
    await this.findOne(id);
    return this.prisma.entidad.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.entidad.update({ where: { id }, data: { estado: 'Inactivo' } });
  }
}
