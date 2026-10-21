import { MedioPago } from '@prisma/client';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsBoolean, IsDateString, IsIn, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min, ValidateNested } from 'class-validator';

export class PedidoDetalleDto {
  @IsUUID('loose') itemId: string;
  @IsNumber({ maxDecimalPlaces: 3 }) @Min(0.001) @Max(1_000_000) cantidad: number;
}

export class CreatePedidoDto {
  @IsUUID('loose') entidadId: string;
  @IsUUID('loose') sucursalId: string;
  /** true: el cliente ya lo aceptó y queda como pedido; false: cotización. */
  @IsBoolean() @IsOptional() confirmado?: boolean;
  @IsDateString({ strict: true }) @IsOptional() validoHasta?: string;
  @IsDateString({ strict: true }) @IsOptional() fechaEntrega?: string;
  @IsString() @MaxLength(300) @IsOptional() observaciones?: string;

  @ValidateNested({ each: true })
  @Type(() => PedidoDetalleDto)
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  detalles: PedidoDetalleDto[];
}

export class VenderPedidoDto {
  @IsIn(['Efectivo', 'Tarjeta', 'Transferencia', 'Credito']) medioPago: MedioPago;
  @IsIn([33, 39]) @IsOptional() tipoDocumento?: number;
}
