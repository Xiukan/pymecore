import { IsDateString, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';

export class RegistrarLoteDto {
  @IsUUID('loose') itemId: string;
  @IsUUID('loose') sucursalId: string;
  @IsNumber({ maxDecimalPlaces: 3 }) @Min(0.001) @Max(10_000_000) cantidad: number;
  @IsDateString({ strict: true }) fechaVencimiento: string;
  @IsString() @MaxLength(30) @IsOptional() codigo?: string;
}
