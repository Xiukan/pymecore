import { IsBoolean, IsDateString, IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class CreateOfertaDto {
  @IsUUID()
  itemId: string;

  @IsNumber()
  @Min(0)
  precioOferta: number;

  @IsString()
  @IsOptional()
  descripcion?: string;

  @IsDateString()
  fechaInicio: string;

  @IsDateString()
  fechaFin: string;
}

export class UpdateOfertaDto {
  @IsNumber()
  @Min(0)
  @IsOptional()
  precioOferta?: number;

  @IsString()
  @IsOptional()
  descripcion?: string;

  @IsDateString()
  @IsOptional()
  fechaInicio?: string;

  @IsDateString()
  @IsOptional()
  fechaFin?: string;

  @IsBoolean()
  @IsOptional()
  activo?: boolean;
}
