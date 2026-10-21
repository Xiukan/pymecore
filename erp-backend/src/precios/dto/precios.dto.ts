import { Type } from 'class-transformer';
import { ArrayMaxSize, IsBoolean, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';

export class ListaPrecioDto {
  @IsString() @MinLength(2) @MaxLength(60) nombre: string;
  @IsBoolean() @IsOptional() activa?: boolean;
}

export class PrecioListaDto {
  @IsUUID('loose') itemId: string;
  /** null o 0 quita el precio especial del producto. */
  @IsNumber({ maxDecimalPlaces: 0 }) @Min(0) @Max(1_000_000_000) precio: number;
}

export class PreciosListaDto {
  @ValidateNested({ each: true })
  @Type(() => PrecioListaDto)
  @ArrayMaxSize(2000)
  precios: PrecioListaDto[];
}

export class AsignarListaDto {
  @IsUUID('loose') @IsOptional() listaPrecioId?: string | null;
}
