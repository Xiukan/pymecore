import { IsOptional, IsString, MinLength } from 'class-validator';

export class CreateSucursalDto {
  @IsString()
  @MinLength(2)
  nombre: string;

  @IsString()
  @IsOptional()
  direccion?: string;
}
