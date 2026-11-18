import { IsDateString, IsIn, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';

export class RegistrarLoteDto {
  @IsUUID('loose') itemId: string;
  @IsUUID('loose') sucursalId: string;
  @IsNumber({ maxDecimalPlaces: 3 }) @Min(0.001) @Max(10_000_000) cantidad: number;
  @IsDateString({ strict: true }) fechaVencimiento: string;
  @IsString() @MaxLength(30) @IsOptional() codigo?: string;
}

export class BajaLoteDto {
  /** VENCIDO exige que el lote ya haya vencido; DANADO sirve para bajas antes de la fecha. */
  @IsIn(['VENCIDO', 'DANADO']) motivo: 'VENCIDO' | 'DANADO';
  /** Vacío = todo lo que queda del lote. */
  @IsNumber({ maxDecimalPlaces: 3 }) @Min(0.001) @IsOptional() cantidad?: number;
  @IsString() @MaxLength(150) @IsOptional() observacion?: string;
}
