import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsEnum, IsInt, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';
import { EsRut } from '../../utils/es-rut.decorator';
import { EstadoGeneral, TipoEntidad } from '@prisma/client';

export class UpdateEntidadDto {
  @IsEnum(TipoEntidad)
  @IsOptional()
  tipoEntidad?: TipoEntidad;

  @IsString()
  @EsRut()
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

  @ApiPropertyOptional({ description: 'Monto máximo adeudado en ventas a crédito (0 = sin crédito)' })
  @IsNumber({ maxDecimalPlaces: 0 })
  @Min(0)
  @Max(1_000_000_000)
  @IsOptional()
  cupoCredito?: number;

  @ApiPropertyOptional({ description: 'Plazo de pago de las ventas a crédito, en días' })
  @IsInt()
  @Min(0)
  @Max(365)
  @IsOptional()
  diasCredito?: number;
}
