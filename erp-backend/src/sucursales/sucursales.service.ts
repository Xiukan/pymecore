import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSucursalDto } from './dto/create-sucursal.dto';

@Injectable()
export class SucursalesService {
  constructor(private readonly prisma: PrismaService) {}

  create(dto: CreateSucursalDto) {
    return this.prisma.sucursal.create({ data: dto });
  }

  findAll() {
    return this.prisma.sucursal.findMany({ orderBy: { nombre: 'asc' } });
  }

  async findOne(id: string) {
    const sucursal = await this.prisma.sucursal.findUnique({
      where: { id },
      include: { _count: { select: { stockLocal: true, transacciones: true } } },
    });
    if (!sucursal) throw new NotFoundException('Sucursal no encontrada');
    return sucursal;
  }

  async update(id: string, dto: Partial<CreateSucursalDto>) {
    await this.findOne(id);
    return this.prisma.sucursal.update({ where: { id }, data: dto });
  }
}
