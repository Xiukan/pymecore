import { ArrayMaxSize, ArrayMinSize, IsArray, IsNumber, IsOptional, IsString, IsUUID, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class DetalleGuiaDto {
  @IsUUID('loose')
  itemId: string;

  @IsNumber()
  @Min(0.001)
  cantidad: number;
}

export class CreateGuiaDto {
  @IsUUID('loose')
  sucursalOrigenId: string;

  @IsUUID('loose')
  sucursalDestinoId: string;

  @IsString()
  @IsOptional()
  notas?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => DetalleGuiaDto)
  detalles: DetalleGuiaDto[];
}
