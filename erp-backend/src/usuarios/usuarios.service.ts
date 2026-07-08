import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUsuarioDto } from './dto/create-usuario.dto';
import { UpdateUsuarioDto } from './dto/update-usuario.dto';

const SELECT = {
  id: true, username: true, nombreCompleto: true,
  rol: true, estado: true, sucursalId: true, creadoEn: true,
  sucursal: { select: { nombre: true } },
};

@Injectable()
export class UsuariosService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateUsuarioDto) {
    const exists = await this.prisma.usuario.findUnique({ where: { username: dto.username } });
    if (exists) throw new ConflictException(`El username "${dto.username}" ya existe`);

    const passwordHash = await bcrypt.hash(dto.password, 10);
    return this.prisma.usuario.create({
      data: {
        username: dto.username,
        passwordHash,
        nombreCompleto: dto.nombreCompleto,
        rol: dto.rol as any,
        sucursalId: dto.sucursalId ?? null,
      },
      select: SELECT,
    });
  }

  findAll() {
    return this.prisma.usuario.findMany({
      orderBy: { nombreCompleto: 'asc' },
      select: SELECT,
    });
  }

  async findOne(id: string) {
    const u = await this.prisma.usuario.findUnique({ where: { id }, select: SELECT });
    if (!u) throw new NotFoundException('Usuario no encontrado');
    return u;
  }

  async update(id: string, dto: UpdateUsuarioDto) {
    await this.findOne(id);
    const data: Record<string, unknown> = {};
    if (dto.nombreCompleto !== undefined) data.nombreCompleto = dto.nombreCompleto;
    if (dto.rol !== undefined) data.rol = dto.rol;
    if (dto.estado !== undefined) data.estado = dto.estado;
    if (dto.sucursalId !== undefined) data.sucursalId = dto.sucursalId;
    if (dto.password) data.passwordHash = await bcrypt.hash(dto.password, 10);

    return this.prisma.usuario.update({ where: { id }, data, select: SELECT });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.usuario.update({
      where: { id },
      data: { estado: 'Inactivo' },
      select: SELECT,
    });
  }
}
