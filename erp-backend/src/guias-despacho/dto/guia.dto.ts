import { IsArray, IsNumber, IsOptional, IsString, IsUUID, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class DetalleGuiaDto {
  @IsUUID()
  itemId: string;

  @IsNumber()
  @Min(0.001)
  cantidad: number;
}

export class CreateGuiaDto {
  @IsUUID()
  sucursalOrigenId: string;

  @IsUUID()
  sucursalDestinoId: string;

  @IsString()
  @IsOptional()
  notas?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DetalleGuiaDto)
  detalles: DetalleGuiaDto[];
}
