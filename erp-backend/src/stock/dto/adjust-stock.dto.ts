import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsNumber, IsOptional, IsString, IsUUID, MaxLength, Min, ValidateNested } from 'class-validator';

export class AdjustStockDto {
  @IsNumber()
  @Min(0)
  stockActual: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  stockMinimo?: number;

  @IsString()
  @MaxLength(200)
  @IsOptional()
  motivo?: string;
}

export class CreateStockDto {
  @IsUUID('loose')
  sucursalId: string;

  @IsUUID('loose')
  itemId: string;

  @IsNumber()
  @Min(0)
  stockActual: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  stockMinimo?: number;
}

export class LineaConteoDto {
  @IsUUID('loose')
  itemId: string;

  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  contado: number;
}

export class ConteoDto {
  @IsUUID('loose')
  sucursalId: string;

  @ValidateNested({ each: true })
  @Type(() => LineaConteoDto)
  @ArrayMinSize(1)
  @ArrayMaxSize(5000)
  lineas: LineaConteoDto[];

  @IsString()
  @MaxLength(150)
  @IsOptional()
  observaciones?: string;
}
