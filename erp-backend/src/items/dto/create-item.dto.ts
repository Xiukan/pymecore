import { IsBoolean, IsNumber, IsOptional, IsString, Max, Min, MinLength } from 'class-validator';

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

  /** Cambio de sujeto parcial: % del neto que el comprador retiene de IVA. */
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(19)
  @IsOptional()
  retencionIvaPct?: number;

  /** Humedad tolerada al recibir de productores; sobre ella se castigan los kilos. */
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(99)
  @IsOptional()
  humedadBasePct?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  precioCompra?: number;
}
