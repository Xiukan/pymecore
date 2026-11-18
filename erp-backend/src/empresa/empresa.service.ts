import { ConflictException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUnidadDto, UpdateEmpresaDto } from './dto/empresa.dto';

@Injectable()
export class EmpresaService {
  constructor(private readonly prisma: PrismaService) {}

  /** Fila única creada por la migración; si falta, la instalación está incompleta. */
  get() {
    return this.prisma.empresa.findUniqueOrThrow({ where: { id: 1 } });
  }

  update(dto: UpdateEmpresaDto) {
    return this.prisma.empresa.update({ where: { id: 1 }, data: dto });
  }

  unidades() {
    return this.prisma.unidadMedida.findMany({ orderBy: { nombre: 'asc' } });
  }

  async crearUnidad(dto: CreateUnidadDto) {
    const codigo = dto.codigo.toUpperCase();
    const existe = await this.prisma.unidadMedida.findUnique({ where: { codigo } });
    if (existe) throw new ConflictException(`La unidad "${codigo}" ya existe`);
    return this.prisma.unidadMedida.create({ data: { codigo, nombre: dto.nombre.trim() } });
  }
}
