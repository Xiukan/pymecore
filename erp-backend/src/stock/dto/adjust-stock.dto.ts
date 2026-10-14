import { IsNumber, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';

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
