import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsEnum, IsNumber, IsOptional, IsString, IsUUID, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { MedioPago, TipoDevolucion, TipoTransaccion } from '@prisma/client';

export class CreateDetalleDto {
  @ApiProperty({ example: 'uuid-del-item' })
  @IsString()
  itemId: string;

  @ApiProperty({ example: 2 })
  @IsNumber()
  @Min(0.001)
  cantidad: number;

  @ApiProperty({ example: 3490 })
  @IsNumber()
  @Min(0)
  precioUnitario: number;

  @ApiPropertyOptional({ example: 0 })
  @IsNumber()
  @Min(0)
  @IsOptional()
  descuentoLinea?: number;
}

export class CreateTransactionDto {
  @ApiProperty({ example: 'uuid-de-sucursal' })
  @IsString()
  sucursalId: string;

  @ApiProperty({ example: 'uuid-de-usuario' })
  @IsString()
  usuarioId: string;

  @ApiPropertyOptional({ example: 'uuid-de-cliente' })
  @IsString()
  @IsOptional()
  entidadId?: string;

  @ApiProperty({ enum: TipoTransaccion, example: TipoTransaccion.VENTA })
  @IsEnum(TipoTransaccion)
  tipoTransaccion: TipoTransaccion;

  @ApiPropertyOptional({ enum: MedioPago, example: MedioPago.Efectivo })
  @IsEnum(MedioPago)
  @IsOptional()
  medioPago?: MedioPago;

  @ApiPropertyOptional({ example: 0 })
  @IsNumber()
  @Min(0)
  @IsOptional()
  descuentoGlobal?: number;

  @ApiPropertyOptional({ example: '55.555.555-5' })
  @IsString()
  @IsOptional()
  rutReceptor?: string;

  @ApiPropertyOptional({ example: 'CLIENTE FINAL' })
  @IsString()
  @IsOptional()
  razonSocialReceptor?: string;

  @ApiPropertyOptional({ example: 39, description: '39=Boleta, 33=Factura' })
  @IsNumber()
  @IsOptional()
  tipoDocumento?: number;

  @ApiPropertyOptional({ description: 'ID de la transacción original (para devoluciones)' })
  @IsUUID()
  @IsOptional()
  transaccionOrigenId?: string;

  @ApiPropertyOptional({ enum: TipoDevolucion })
  @IsEnum(TipoDevolucion)
  @IsOptional()
  tipoDevolucion?: TipoDevolucion;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  observaciones?: string;

  @ApiProperty({ type: [CreateDetalleDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateDetalleDto)
  detalles: CreateDetalleDto[];
}
