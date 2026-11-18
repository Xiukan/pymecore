import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CategoriaCosto, MedioPago, TipoDocumentoGasto } from '@prisma/client';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateGastoDto {
  @IsUUID('loose')
  categoriaId: string;

  @ApiPropertyOptional({ description: 'Campo: cuartel al que se imputa el gasto (requiere temporada)' })
  @IsUUID('loose')
  @IsOptional()
  cuartelId?: string;

  @IsUUID('loose')
  @IsOptional()
  temporadaId?: string;

  @IsEnum(CategoriaCosto)
  @IsOptional()
  categoriaCosto?: CategoriaCosto;

  @ApiPropertyOptional({ description: 'Sucursal a la que se imputa; vacío = gasto de la empresa' })
  @IsUUID('loose')
  @IsOptional()
  sucursalId?: string;

  @IsUUID('loose')
  @IsOptional()
  proveedorId?: string;

  @IsString()
  @MinLength(3)
  @MaxLength(200)
  descripcion: string;

  @IsEnum(TipoDocumentoGasto)
  tipoDocumento: TipoDocumentoGasto;

  @IsString()
  @MaxLength(30)
  @IsOptional()
  numeroDocumento?: string;

  @ApiProperty({
    description:
      'Factura: monto neto. Boleta o sin documento: total pagado. Boleta de honorarios: monto bruto.',
  })
  @IsNumber({ maxDecimalPlaces: 0 })
  @Min(1)
  @Max(1_000_000_000)
  monto: number;

  @IsDateString()
  fecha: string;

  @IsDateString()
  @IsOptional()
  fechaVencimiento?: string;

  @ApiPropertyOptional({ description: 'Si se informa, el gasto queda pagado con ese medio' })
  @IsEnum(MedioPago)
  @IsOptional()
  medioPago?: MedioPago;
}

export class PagarGastoDto {
  @IsEnum(MedioPago)
  medioPago: MedioPago;

  @IsDateString()
  @IsOptional()
  fechaPago?: string;
}

export class CategoriaGastoDto {
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  nombre: string;

  @IsBoolean()
  @IsOptional()
  ivaRecuperable?: boolean;

  @IsBoolean()
  @IsOptional()
  activa?: boolean;
}
