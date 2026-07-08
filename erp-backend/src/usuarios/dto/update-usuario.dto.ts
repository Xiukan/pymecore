import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, MinLength, IsIn, IsOptional } from 'class-validator';

export class UpdateUsuarioDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MinLength(6) password?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() nombreCompleto?: string;
  @ApiPropertyOptional({ enum: ['Administrador', 'Encargado', 'Vendedor'] })
  @IsOptional() @IsIn(['Administrador', 'Encargado', 'Vendedor']) rol?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() sucursalId?: string | null;
  @ApiPropertyOptional({ enum: ['Activo', 'Inactivo'] })
  @IsOptional() @IsIn(['Activo', 'Inactivo']) estado?: string;
}
