import { IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';

export class AbrirCajaDto {
  @IsUUID('loose')
  sucursalId: string;

  @IsNumber({ maxDecimalPlaces: 0 })
  @Min(0)
  @Max(100_000_000)
  montoApertura: number;
}

export class CerrarCajaDto {
  @IsNumber({ maxDecimalPlaces: 0 })
  @Min(0)
  @Max(1_000_000_000)
  efectivoContado: number;

  @IsString()
  @MaxLength(300)
  @IsOptional()
  observaciones?: string;
}
