import { UnprocessableEntityException } from '@nestjs/common';
import { DteParaSii } from '../sii/sii-gateway';

export interface VentaDeLote {
  ventaId: string;
  secuencia: number;
  creadaEn: string;
  total: number;
  items: { itemId: string; nombre: string; cantidad: number; precioUnitario: number; subtotal: number }[];
  dte: DteParaSii;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Valida la forma del lote antes de tocar la base (422 LOTE_INVALIDO). */
export function validarLote(cuerpo: unknown): VentaDeLote[] {
  const lote = (cuerpo as { lote?: unknown })?.lote;
  const error = (detalle: string) => new UnprocessableEntityException({ codigo: 'LOTE_INVALIDO', message: `Lote inválido: ${detalle}` });
  if (!Array.isArray(lote) || lote.length === 0 || lote.length > 500) throw error('debe traer entre 1 y 500 ventas');
  const vistos = new Set<string>();
  for (const v of lote as VentaDeLote[]) {
    if (!v || typeof v.ventaId !== 'string' || !UUID.test(v.ventaId)) throw error('ventaId debe ser un UUID');
    if (vistos.has(v.ventaId)) throw error(`venta ${v.ventaId} repetida en el lote`);
    vistos.add(v.ventaId);
    if (!Number.isInteger(v.secuencia) || v.secuencia < 1) throw error('secuencia debe ser un entero positivo');
    if (typeof v.creadaEn !== 'string' || Number.isNaN(Date.parse(v.creadaEn))) throw error('creadaEn debe ser una fecha');
    if (typeof v.total !== 'number' || v.total < 0) throw error('total inválido');
    if (!Array.isArray(v.items) || !v.dte || typeof v.dte.rutReceptor !== 'string') throw error('faltan ítems o DTE');
  }
  return lote as VentaDeLote[];
}
