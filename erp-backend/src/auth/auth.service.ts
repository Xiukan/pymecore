import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async login(dto: LoginDto) {
    const user = await this.prisma.usuario.findUnique({
      where: { username: dto.username },
    });

    if (!user || user.estado === 'Inactivo') {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    const passwordValid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordValid) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    const payload = { sub: user.id, username: user.username, rol: user.rol, sucursalId: user.sucursalId };
    const token = this.jwt.sign(payload);

    return {
      accessToken: token,
      user: {
        id: user.id,
        username: user.username,
        nombreCompleto: user.nombreCompleto,
        rol: user.rol,
        sucursalId: user.sucursalId,
      },
    };
  }

  async me(userId: string) {
    return this.prisma.usuario.findUnique({
      where: { id: userId },
      select: { id: true, username: true, nombreCompleto: true, rol: true, estado: true },
    });
  }
}
