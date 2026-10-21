import { CategoriaCosto, MedioPago, TipoLabor, TipoTrabajador } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
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
import { EsRut } from '../../utils/es-rut.decorator';

export class PredioDto {
  @IsString() @MinLength(2) @MaxLength(80) nombre: string;
  @IsString() @MaxLength(60) @IsOptional() comuna?: string;
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @IsOptional() hectareas?: number;
  @IsBoolean() @IsOptional() activo?: boolean;
}

export class CuartelDto {
  @IsUUID('loose') predioId: string;
  @IsString() @MinLength(1) @MaxLength(80) nombre: string;
  @IsString() @MinLength(2) @MaxLength(60) cultivo: string;
  @IsString() @MaxLength(60) @IsOptional() variedad?: string;
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) hectareas: number;
  @IsBoolean() @IsOptional() activo?: boolean;
}

export class TemporadaDto {
  @IsString() @MinLength(4) @MaxLength(30) nombre: string;
  @IsDateString({ strict: true }) fechaInicio: string;
  @IsDateString({ strict: true }) fechaFin: string;
}

export class AplicacionDto {
  @IsUUID('loose') cuartelId: string;
  @IsUUID('loose') temporadaId: string;
  @IsUUID('loose') itemId: string;
  @IsUUID('loose') sucursalId: string;
  @IsDateString({ strict: true }) fecha: string;
  @IsString() @MinLength(2) @MaxLength(120) objetivo: string;
  @IsNumber({ maxDecimalPlaces: 3 }) @Min(0.001) dosisPorHa: number;
  @IsInt() @Min(0) @Max(365) carenciaDias: number;
  @IsInt() @Min(0) @Max(720) @IsOptional() reingresoHoras?: number;
  @IsString() @MinLength(2) @MaxLength(100) aplicador: string;
  @IsString() @MaxLength(60) @IsOptional() metodo?: string;
}

export class CosechaDto {
  @IsUUID('loose') cuartelId: string;
  @IsUUID('loose') temporadaId: string;
  @IsUUID('loose') itemId: string;
  @IsUUID('loose') sucursalId: string;
  @IsNumber({ maxDecimalPlaces: 3 }) @Min(0.001) @Max(10_000_000) kilos: number;
  @IsDateString({ strict: true }) @IsOptional() fechaVencimiento?: string;
}

export class PresupuestoLineaDto {
  @IsUUID('loose') cuartelId: string;
  @IsEnum(CategoriaCosto) categoria: CategoriaCosto;
  @IsNumber({ maxDecimalPlaces: 0 }) @Min(0) monto: number;
}

export class PresupuestoDto {
  @ValidateNested({ each: true })
  @Type(() => PresupuestoLineaDto)
  @ArrayMaxSize(500)
  lineas: PresupuestoLineaDto[];
}

export class TrabajadorDto {
  @EsRut() rut: string;
  @IsString() @MinLength(3) @MaxLength(120) nombre: string;
  @IsEnum(TipoTrabajador) @IsOptional() tipo?: TipoTrabajador;
  @IsUUID('loose') @IsOptional() contratistaId?: string;
  @IsNumber({ maxDecimalPlaces: 0 }) @Min(0) @IsOptional() valorJornada?: number;
  @IsBoolean() @IsOptional() activo?: boolean;
}

export class LaborDto {
  @IsUUID('loose') trabajadorId: string;
  @IsUUID('loose') @IsOptional() cuartelId?: string;
  @IsUUID('loose') @IsOptional() temporadaId?: string;
  @IsDateString({ strict: true }) fecha: string;
  @IsEnum(TipoLabor) tipo: TipoLabor;
  @IsString() @MinLength(2) @MaxLength(80) descripcion: string;
  @IsNumber({ maxDecimalPlaces: 3 }) @Min(0.001) @Max(100_000) cantidad: number;
  @IsIn(['DIA', 'HORA', 'KG', 'CAJA', 'BIN', 'PLANTA', 'UN']) unidad: string;
  /** Si falta en una jornada, se usa el valor de jornada del trabajador. */
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @IsOptional() tarifa?: number;
}

const MEDIOS = ['Efectivo', 'Transferencia'];

export class AnticipoTrabajadorDto {
  @IsUUID('loose') trabajadorId: string;
  @IsNumber({ maxDecimalPlaces: 0 }) @Min(1) monto: number;
  @IsIn(MEDIOS) medioPago: MedioPago;
  @IsDateString({ strict: true }) @IsOptional() fecha?: string;
}

export class LiquidacionDto {
  @IsUUID('loose') trabajadorId: string;
  @IsDateString({ strict: true }) hasta: string;
  @IsIn(MEDIOS) medioPago: MedioPago;
}

export class F30Dto {
  @IsDateString({ strict: true }) @IsOptional() f30Vigencia?: string | null;
}
