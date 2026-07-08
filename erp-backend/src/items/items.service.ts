import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateItemDto } from './dto/create-item.dto';
import { UpdateItemDto } from './dto/update-item.dto';

@Injectable()
export class ItemsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateItemDto) {
    const exists = await this.prisma.item.findUnique({ where: { codigoSku: dto.codigoSku } });
    if (exists) throw new ConflictException(`El SKU "${dto.codigoSku}" ya existe`);

    return this.prisma.item.create({ data: dto });
  }

  findAll(soloActivos = true) {
    return this.prisma.item.findMany({
      where: soloActivos ? { estado: 'Activo' } : undefined,
      orderBy: { nombre: 'asc' },
    });
  }

  async findOne(id: string) {
    const item = await this.prisma.item.findUnique({ where: { id } });
    if (!item) throw new NotFoundException('Ítem no encontrado');
    return item;
  }

  async update(id: string, dto: UpdateItemDto) {
    await this.findOne(id);
    return this.prisma.item.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.item.update({ where: { id }, data: { estado: 'Inactivo' } });
  }
}
