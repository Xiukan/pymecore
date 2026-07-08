import { IsBoolean, IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { EstadoGeneral } from '@prisma/client';

export class UpdateItemDto {
  @IsString()
  @IsOptional()
  nombre?: string;

  @IsString()
  @IsOptional()
  unidadMedida?: string;

  @IsNumber()
  @Min(0)
  @IsOptional()
  precioVenta?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  costoPromedio?: number;

  @IsBoolean()
  @IsOptional()
  afectoIva?: boolean;

  @IsNumber()
  @Min(0)
  @IsOptional()
  precioCompra?: number;

  @IsEnum(EstadoGeneral)
  @IsOptional()
  estado?: EstadoGeneral;
}
