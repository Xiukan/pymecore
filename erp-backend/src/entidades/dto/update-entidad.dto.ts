import { IsEmail, IsEnum, IsOptional, IsString, Matches } from 'class-validator';
import { EstadoGeneral, TipoEntidad } from '@prisma/client';

export class UpdateEntidadDto {
  @IsEnum(TipoEntidad)
  @IsOptional()
  tipoEntidad?: TipoEntidad;

  @IsString()
  @Matches(/^\d{7,8}-[\dkK]$/, { message: 'RUT inválido. Formato esperado: 12345678-9' })
  @IsOptional()
  rut?: string;

  @IsString()
  @IsOptional()
  nombreRazonSocial?: string;

  @IsString()
  @IsOptional()
  telefono?: string;

  @IsEmail()
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  direccion?: string;

  @IsEnum(EstadoGeneral)
  @IsOptional()
  estado?: EstadoGeneral;
}
