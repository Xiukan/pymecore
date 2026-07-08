import { IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class AdjustStockDto {
  @IsNumber()
  @Min(0)
  stockActual: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  stockMinimo?: number;
}

export class CreateStockDto {
  @IsString()
  sucursalId: string;

  @IsString()
  itemId: string;

  @IsNumber()
  @Min(0)
  stockActual: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  stockMinimo?: number;
}
