import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { MedioPago, TipoDevolucion, TipoTransaccion } from '@prisma/client';

export class CreateDetalleDto {
  @ApiProperty({ example: 'uuid-del-item' })
  @IsUUID('loose')
  itemId: string;

  @ApiProperty({ example: 2 })
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0.001)
  @Max(1_000_000)
  cantidad: number;

  @ApiPropertyOptional({
    example: 3490,
    description: 'Precio que vio el cliente (IVA incluido). En ventas lo fija el servidor; si difiere se rechaza.',
  })
  @IsNumber()
  @Min(0)
  @Max(1_000_000_000)
  @IsOptional()
  precioUnitario?: number;

  @ApiPropertyOptional({ example: 0 })
  @IsNumber()
  @Min(0)
  @IsOptional()
  descuentoLinea?: number;
}

export class PagoDto {
  @ApiProperty({ enum: ['Efectivo', 'Tarjeta', 'Transferencia'] })
  @IsIn(['Efectivo', 'Tarjeta', 'Transferencia'])
  medioPago: MedioPago;

  @ApiProperty({ example: 5000 })
  @IsNumber({ maxDecimalPlaces: 0 })
  @Min(1)
  monto: number;
}

export class CreateTransactionDto {
  @ApiProperty({ example: 'uuid-de-sucursal' })
  @IsString()
  sucursalId: string;

  @ApiPropertyOptional({ description: 'Ignorado: el usuario se toma del token' })
  @IsString()
  @IsOptional()
  usuarioId?: string;

  @ApiPropertyOptional({ example: 'uuid-de-cliente' })
  @IsUUID('loose')
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
  @IsIn([33, 39])
  @IsOptional()
  tipoDocumento?: number;

  @ApiPropertyOptional({ description: 'ID de la venta original (obligatorio en devoluciones y notas de crédito)' })
  @IsUUID('loose')
  @IsOptional()
  transaccionOrigenId?: string;

  @ApiPropertyOptional({ enum: TipoDevolucion })
  @IsEnum(TipoDevolucion)
  @IsOptional()
  tipoDevolucion?: TipoDevolucion;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(300)
  @IsOptional()
  observaciones?: string;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(200)
  @IsOptional()
  motivoMerma?: string;

  @ApiPropertyOptional({ type: [PagoDto], description: 'Venta pagada con más de un medio; las partes deben sumar el total.' })
  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(3)
  @ValidateNested({ each: true })
  @Type(() => PagoDto)
  @IsOptional()
  pagos?: PagoDto[];

  @ApiProperty({ type: [CreateDetalleDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => CreateDetalleDto)
  detalles: CreateDetalleDto[];
}
