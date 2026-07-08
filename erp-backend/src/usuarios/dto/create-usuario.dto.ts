import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, MinLength, IsIn, IsOptional } from 'class-validator';

export class CreateUsuarioDto {
  @ApiProperty() @IsString() username: string;
  @ApiProperty() @IsString() @MinLength(6) password: string;
  @ApiProperty() @IsString() nombreCompleto: string;
  @ApiProperty({ enum: ['Administrador', 'Encargado', 'Vendedor'] })
  @IsIn(['Administrador', 'Encargado', 'Vendedor']) rol: string;
  @ApiPropertyOptional() @IsOptional() @IsString() sucursalId?: string;
}
