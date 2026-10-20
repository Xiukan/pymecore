import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsEnum, IsInt, IsNumber, IsOptional, IsString, Matches, Max, Min, MinLength } from 'class-validator';
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
