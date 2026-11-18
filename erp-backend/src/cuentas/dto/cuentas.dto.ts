import { MedioPago } from '@prisma/client';
import { IsDateString, IsIn, IsNumber, IsOptional, IsUUID, Max, Min } from 'class-validator';

export class AbonoDto {
  @IsUUID('loose')
  transaccionId: string;

  @IsNumber({ maxDecimalPlaces: 0 })
  @Min(1)
  @Max(1_000_000_000)
  monto: number;

  @IsIn([MedioPago.Efectivo, MedioPago.Tarjeta, MedioPago.Transferencia])
  medioPago: MedioPago;
}

export class PagoProveedorDto {
  @IsIn([MedioPago.Efectivo, MedioPago.Tarjeta, MedioPago.Transferencia])
  medioPago: MedioPago;

  @IsDateString()
  @IsOptional()
  fechaPago?: string;
}
