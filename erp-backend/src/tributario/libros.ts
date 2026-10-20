import { Prisma } from '@prisma/client';

const D = Prisma.Decimal;
const cero = () => new D(0);

export interface FilaLibro {
  fecha: string;
  tipoDte: number;
  folio: string;
  rut: string;
  razonSocial: string;
  neto: Prisma.Decimal;
  exento: Prisma.Decimal;
  iva: Prisma.Decimal;
  otros: Prisma.Decimal;
  total: Prisma.Decimal;
  /** Solo compras: si el IVA da derecho a crédito fiscal. */
  ivaRecuperable?: boolean;
  origen?: string;
}

/** Las notas de crédito (61) restan en los totales del libro. */
const signo = (tipoDte: number) => (tipoDte === 61 ? -1 : 1);

export function totalesPorTipo(filas: FilaLibro[]) {
  const porTipo = new Map<number, { documentos: number; neto: Prisma.Decimal; exento: Prisma.Decimal; iva: Prisma.Decimal; otros: Prisma.Decimal; total: Prisma.Decimal }>();
  for (const f of filas) {
    const t = porTipo.get(f.tipoDte) ?? { documentos: 0, neto: cero(), exento: cero(), iva: cero(), otros: cero(), total: cero() };
    t.documentos++;
    t.neto = t.neto.add(f.neto);
    t.exento = t.exento.add(f.exento);
    t.iva = t.iva.add(f.iva);
    t.otros = t.otros.add(f.otros);
    t.total = t.total.add(f.total);
    porTipo.set(f.tipoDte, t);
  }
  return [...porTipo.entries()].sort(([a], [b]) => a - b).map(([tipoDte, t]) => ({ tipoDte, ...t }));
}

/**
 * Resumen mensual tipo F29: débito = IVA de ventas − NC emitidas; crédito = IVA recuperable de
 * compras − NC recibidas. Si el crédito supera al débito queda remanente para el mes siguiente.
 */
export function resumenIva(ventas: FilaLibro[], compras: FilaLibro[], retencionHonorarios: Prisma.Decimal.Value) {
  const debito = ventas.reduce((s, f) => s.add(f.iva.mul(signo(f.tipoDte))), cero());
  const credito = compras.filter((f) => f.ivaRecuperable !== false).reduce((s, f) => s.add(f.iva.mul(signo(f.tipoDte))), cero());
  const ivaNoRecuperable = compras.filter((f) => f.ivaRecuperable === false).reduce((s, f) => s.add(f.iva.mul(signo(f.tipoDte))), cero());
  const diferencia = debito.sub(credito);
  const retencion = new D(retencionHonorarios);
  const ivaAPagar = D.max(diferencia, 0);
  return {
    ventasNetas: ventas.reduce((s, f) => s.add(f.neto.add(f.exento).mul(signo(f.tipoDte))), cero()),
    comprasNetas: compras.reduce((s, f) => s.add(f.neto.add(f.exento).mul(signo(f.tipoDte))), cero()),
    debito,
    credito,
    ivaNoRecuperable,
    ivaAPagar,
    remanente: D.max(diferencia.neg(), 0),
    retencionHonorarios: retencion,
    totalAPagar: ivaAPagar.add(retencion),
  };
}
