import { IsEmail, IsEnum, IsOptional, IsString, Matches, MinLength } from 'class-validator';
import { TipoEntidad } from '@prisma/client';

export class CreateEntidadDto {
  @IsEnum(TipoEntidad)
  tipoEntidad: TipoEntidad;

  @IsString()
  @Matches(/^\d{7,8}-[\dkK]$/, { message: 'RUT inválido. Formato esperado: 12345678-9' })
  rut: string;

  @IsString()
  @MinLength(2)
  nombreRazonSocial: string;

  @IsString()
  @IsOptional()
  telefono?: string;

  @IsEmail()
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  direccion?: string;
}
