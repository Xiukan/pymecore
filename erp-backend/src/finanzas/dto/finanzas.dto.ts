import { MedioPago } from '@prisma/client';
import { IsBoolean, IsDateString, IsIn, IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

export class CuentaBancariaDto {
  @IsString() @MinLength(2) @MaxLength(60) banco: string;
  @IsString() @MinLength(3) @MaxLength(30) numero: string;
  @IsString() @MaxLength(60) @IsOptional() alias?: string;
  @IsNumber({ maxDecimalPlaces: 0 }) @IsOptional() saldoInicial?: number;
  @IsDateString({ strict: true }) fechaSaldoInicial: string;
  @IsBoolean() @IsOptional() activa?: boolean;
}

export class ImportarCartolaDto {
  @IsString() @MinLength(10) @MaxLength(2_000_000) contenido: string;
}

export class ConciliarDto {
  /** Documento que explica el movimiento (PAGO_FACTURA, ABONO, ...) o, si no hay, una cuenta contable. */
  @IsString() @MaxLength(30) @IsOptional() tipo?: string;
  @IsString() @MaxLength(80) @IsOptional() id?: string;
  @IsString() @MaxLength(10) @IsOptional() cuentaCodigo?: string;
}

export class ActivoDto {
  @IsString() @MinLength(2) @MaxLength(120) nombre: string;
  @IsString() @MinLength(2) @MaxLength(60) categoria: string;
  @IsDateString({ strict: true }) fechaCompra: string;
  @IsNumber({ maxDecimalPlaces: 0 }) @Min(1) valorCompra: number;
  @IsNumber({ maxDecimalPlaces: 0 }) @Min(0) @IsOptional() ivaCredito?: number;
  @IsNumber({ maxDecimalPlaces: 0 }) @Min(0) @IsOptional() valorResidual?: number;
  @IsInt() @Min(1) @Max(600) vidaUtilMeses: number;
  /** Efectivo o Transferencia si se pagó; vacío si se debe al proveedor. */
  @IsIn(['Efectivo', 'Transferencia']) @IsOptional() medioPago?: MedioPago;
}

export class BajaActivoDto {
  @IsDateString({ strict: true }) fecha: string;
}
