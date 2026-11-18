import { Type } from 'class-transformer';
import { ArrayMinSize, IsDateString, IsNumber, IsOptional, IsString, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';

export class LineaAsientoDto {
  @IsString()
  @MaxLength(10)
  cuenta: string;

  @IsNumber({ maxDecimalPlaces: 0 })
  @Min(0)
  @IsOptional()
  debe?: number;

  @IsNumber({ maxDecimalPlaces: 0 })
  @Min(0)
  @IsOptional()
  haber?: number;
}

export class AsientoManualDto {
  @IsDateString({ strict: true })
  fecha: string;

  @IsString()
  @MinLength(3)
  @MaxLength(200)
  glosa: string;

  @ValidateNested({ each: true })
  @Type(() => LineaAsientoDto)
  @ArrayMinSize(2)
  lineas: LineaAsientoDto[];
}
