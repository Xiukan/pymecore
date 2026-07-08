import { IsBoolean, IsNumber, IsOptional, IsString, Min, MinLength } from 'class-validator';

export class CreateItemDto {
  @IsString()
  @MinLength(1)
  codigoSku: string;

  @IsString()
  @MinLength(1)
  nombre: string;

  @IsString()
  unidadMedida: string;

  @IsNumber()
  @Min(0)
  precioVenta: number;

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
}
