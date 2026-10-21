import { DocumentoProductor, MedioPago } from '@prisma/client';
import { IsDateString, IsEnum, IsIn, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength } from 'class-validator';

export class CreateRecepcionProductorDto {
  @IsUUID('loose')
  productorId: string;

  @IsUUID('loose')
  sucursalId: string;

  @IsUUID('loose')
  itemId: string;

  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0.001)
  @Max(1_000_000)
  pesoBruto: number;

  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  @Max(1_000_000)
  tara: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(99)
  @IsOptional()
  humedadPct?: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(99)
  @IsOptional()
  impurezasPct?: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(10_000_000)
  precioKilo: number;

  @IsEnum(DocumentoProductor)
  tipoDocumento: DocumentoProductor;

  /** Obligatorio con factura del productor; con factura de compra se usa el folio interno. */
  @IsString()
  @MaxLength(30)
  @IsOptional()
  folioDocumento?: string;

  @IsDateString({ strict: true })
  @IsOptional()
  fechaVencimiento?: string;

  @IsString()
  @MaxLength(300)
  @IsOptional()
  observaciones?: string;
}

const MEDIOS = ['Efectivo', 'Transferencia'];

export class PagoProductorDto {
  @IsIn(MEDIOS)
  medioPago: MedioPago;

  @IsDateString({ strict: true })
  @IsOptional()
  fechaPago?: string;
}

export class CreateAnticipoDto {
  @IsUUID('loose')
  productorId: string;

  @IsNumber({ maxDecimalPlaces: 0 })
  @Min(1)
  monto: number;

  @IsIn(MEDIOS)
  medioPago: MedioPago;

  @IsDateString({ strict: true })
  @IsOptional()
  fecha?: string;

  @IsString()
  @MinLength(3)
  @MaxLength(200)
  descripcion: string;
}
