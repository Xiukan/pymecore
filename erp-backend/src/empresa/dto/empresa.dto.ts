import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsNumber, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';

const RUT = /^\d{1,2}\.?\d{3}\.?\d{3}-[\dkK]$/;

export class UpdateEmpresaDto {
  @ApiPropertyOptional({ example: '76.000.000-1' })
  @Matches(RUT, { message: 'RUT inválido' })
  @IsOptional()
  rut?: string;

  @ApiPropertyOptional() @IsString() @MinLength(1) @MaxLength(100) @IsOptional() razonSocial?: string;
  @ApiPropertyOptional() @IsString() @MinLength(1) @MaxLength(80) @IsOptional() giro?: string;
  @ApiPropertyOptional() @IsString() @MinLength(1) @MaxLength(120) @IsOptional() direccion?: string;
  @ApiPropertyOptional() @IsString() @MinLength(1) @MaxLength(60) @IsOptional() comuna?: string;

  @ApiPropertyOptional({ example: 19 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  @IsOptional()
  tasaIva?: number;

  @ApiPropertyOptional({ example: 30, description: 'Días para cambio o devolución de una venta' })
  @IsInt()
  @Min(0)
  @Max(365)
  @IsOptional()
  diasCambio?: number;

  @ApiPropertyOptional({ example: '66.666.666-6' })
  @Matches(RUT, { message: 'RUT inválido' })
  @IsOptional()
  rutConsumidorFinal?: string;

  @ApiPropertyOptional() @IsString() @MinLength(1) @MaxLength(100) @IsOptional() nombreConsumidorFinal?: string;

  @ApiPropertyOptional({ example: 50000, description: 'Monto máximo de un gasto sin documento' })
  @IsInt()
  @Min(0)
  @Max(10_000_000)
  @IsOptional()
  topeGastoSinDocumento?: number;

  @ApiPropertyOptional({ example: 15.25, description: 'Retención de boletas de honorarios (%)' })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  @IsOptional()
  tasaRetencionHonorarios?: number;
}

export class CreateUnidadDto {
  @Matches(/^[A-Za-z0-9]{1,20}$/, { message: 'Código de 1 a 20 letras o números' })
  codigo: string;

  @IsString()
  @MinLength(1)
  @MaxLength(50)
  nombre: string;
}
