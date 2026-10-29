import { EstadoDte } from '@prisma/client';
import { validarRut } from '../utils/rut.util';

export interface DteParaSii {
  folio: number | null;
  tipoDoc: number;
  rutReceptor: string;
  montoTotal: number;
  firmado: boolean;
}

export interface RespuestaSii {
  estado: Exclude<EstadoDte, 'PENDIENTE_ENVIO_SII'>;
  glosa: string;
}

/**
 * Puerto SiiGateway con su adaptador simulado (DA-03): aplica las validaciones que el SII
 * hace al recibir un DTE y responde ACEPTADO o RECHAZADO. No se conecta al SII real.
 */
export function enviarAlSiiSimulado(dte: DteParaSii): RespuestaSii {
  if (!dte.folio) return { estado: 'RECHAZADO', glosa: 'DTE sin folio asignado' };
  if (!dte.firmado) return { estado: 'RECHAZADO', glosa: 'Firma o timbre inválidos' };
  if (!/^\d{7,8}-[\dkK]$/.test(dte.rutReceptor) || !validarRut(dte.rutReceptor)) {
    return { estado: 'RECHAZADO', glosa: `RUT receptor inválido (${dte.rutReceptor})` };
  }
  if (!(dte.montoTotal > 0)) return { estado: 'RECHAZADO', glosa: 'Monto total debe ser mayor a cero' };
  return { estado: 'ACEPTADO', glosa: 'DTE recibido conforme (SII simulado)' };
}

/** Datos del DTE guardados al timbrar la venta (metadatosSii). */
export function dteDeVenta(v: { numeroFactura: string | null; montoTotal: unknown; metadatosSii: unknown }, rutPorDefecto: string): DteParaSii {
  const meta = (v.metadatosSii ?? {}) as { tipoDoc?: number; rutReceptor?: string; xmlFirmado?: string; esMock?: boolean };
  const esMock = meta.esMock || String(meta.xmlFirmado ?? '').includes('<DTE_MOCK');
  return {
    folio: v.numeroFactura ? Number(v.numeroFactura) : null,
    tipoDoc: meta.tipoDoc ?? 39,
    rutReceptor: (meta.rutReceptor ?? rutPorDefecto).replace(/\./g, ''),
    montoTotal: Number(v.montoTotal),
    firmado: !!meta.xmlFirmado && !esMock,
  };
}
