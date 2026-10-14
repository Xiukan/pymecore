import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

const MAX_LINEAS = 200;

export class DetalleOrdenDto {
  @IsUUID('loose')
  itemId: string;

  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0.001)
  @Max(1_000_000)
  cantidad: number;

  @ApiProperty({ description: 'Costo unitario neto (sin IVA)' })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1_000_000_000)
  costoUnitario: number;
}

export class CreateOrdenCompraDto {
  @IsUUID('loose')
  proveedorId: string;

  @ApiProperty({ description: 'Sucursal que recibirá la mercadería' })
  @IsUUID('loose')
  sucursalId: string;

  @ApiPropertyOptional({ example: '2026-10-20' })
  @IsDateString()
  @IsOptional()
  fechaEntrega?: string;

  @IsString()
  @MaxLength(300)
  @IsOptional()
  notas?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_LINEAS)
  @ValidateNested({ each: true })
  @Type(() => DetalleOrdenDto)
  detalles: DetalleOrdenDto[];
}

export class LineaRecepcionDto {
  @IsUUID('loose')
  detalleId: string;

  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0.001)
  @Max(1_000_000)
  cantidad: number;
}

export class CreateRecepcionDto {
  @ApiPropertyOptional({ description: 'N° de guía de despacho del proveedor' })
  @IsString()
  @MaxLength(50)
  @IsOptional()
  guiaDespacho?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_LINEAS)
  @ValidateNested({ each: true })
  @Type(() => LineaRecepcionDto)
  detalles: LineaRecepcionDto[];
}

export class LineaFacturaDto extends LineaRecepcionDto {
  @ApiProperty({ description: 'Costo unitario neto facturado; debe coincidir con la OC' })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1_000_000_000)
  costoUnitario: number;
}

export class CreateFacturaCompraDto {
  @IsString()
  @MinLength(1)
  @MaxLength(30)
  folio: string;

  @IsDateString()
  fechaEmision: string;

  @IsDateString()
  @IsOptional()
  fechaVencimiento?: string;

  @ApiPropertyOptional({ description: 'DTE de la bandeja de recibidos que respalda esta factura' })
  @IsUUID('loose')
  @IsOptional()
  dteId?: string;

  @ApiPropertyOptional({ description: 'Total impreso en la factura; si se informa debe cuadrar con el detalle' })
  @IsNumber({ maxDecimalPlaces: 0 })
  @Min(0)
  @IsOptional()
  montoTotal?: number;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_LINEAS)
  @ValidateNested({ each: true })
  @Type(() => LineaFacturaDto)
  detalles: LineaFacturaDto[];
}

export class ImportarDteDto {
  @ApiProperty({ description: 'Contenido del XML del DTE o EnvioDTE recibido' })
  @IsString()
  @MinLength(1)
  @MaxLength(600_000)
  xml: string;
}

export class GastoDteDto {
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  categoria: string;

  @IsString()
  @MaxLength(200)
  @IsOptional()
  descripcion?: string;
}

export class DescartarDteDto {
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  motivo: string;
}
