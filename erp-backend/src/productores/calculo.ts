import { DocumentoProductor, Prisma } from '@prisma/client';
import { peso, ZERO } from '../utils/money.util';

const D = Prisma.Decimal;

export interface Pesaje {
  pesoBruto: Prisma.Decimal.Value;
  tara: Prisma.Decimal.Value;
  humedadPct?: Prisma.Decimal.Value;
  impurezasPct?: Prisma.Decimal.Value;
  precioKilo: Prisma.Decimal.Value;
}

export interface Parametros {
  tipoDocumento: DocumentoProductor;
  tasaIva: Prisma.Decimal.Value;
  /** Humedad tolerada del producto: sobre ella cada punto descuenta 1 % de los kilos. */
  humedadBasePct: Prisma.Decimal.Value;
  /** Cambio de sujeto parcial: % del neto que el comprador retiene de IVA (solo con factura del productor). */
  retencionIvaPct: Prisma.Decimal.Value;
}

/**
 * Liquidación de una entrega: kilos limpios = neto de romana × (1 − castigo %), redondeado al
 * kilo. Con factura de compra (DTE 46) el comprador retiene todo el IVA y paga al productor
 * solo el neto; con factura del productor retiene la parte del cambio de sujeto.
 */
export function liquidar(p: Pesaje, par: Parametros) {
  const pesoNeto = new D(p.pesoBruto).sub(p.tara);
  if (pesoNeto.lte(0)) throw new RangeError('La tara debe ser menor que el peso bruto.');
  const humedad = new D(p.humedadPct ?? 0);
  const impurezas = new D(p.impurezasPct ?? 0);
  const castigoPct = D.max(humedad.sub(par.humedadBasePct), 0).add(impurezas);
  if (castigoPct.gte(100)) throw new RangeError('El castigo no puede ser de 100 % o más.');
  const kilosPagables = pesoNeto.mul(new D(100).sub(castigoPct)).div(100).toDecimalPlaces(0, D.ROUND_HALF_UP);
  const montoNeto = peso(kilosPagables.mul(p.precioKilo));
  const iva = peso(montoNeto.mul(par.tasaIva).div(100));
  const retencionIva =
    par.tipoDocumento === 'FACTURA_COMPRA' ? iva : D.min(peso(montoNeto.mul(par.retencionIvaPct).div(100)), iva);
  const montoTotal = montoNeto.add(iva);
  return { pesoNeto, castigoPct, kilosPagables, montoNeto, iva, retencionIva, montoTotal, montoAPagar: montoTotal.sub(retencionIva) };
}

/** Anticipos a descontar de un pago, del más antiguo al más nuevo, sin pasarse del monto. */
export function aplicarAnticipos(monto: Prisma.Decimal, saldos: { id: string; saldo: Prisma.Decimal }[]) {
  let resto = monto;
  const aplicaciones: { anticipoId: string; monto: Prisma.Decimal }[] = [];
  for (const a of saldos) {
    if (resto.lte(0)) break;
    const parte = D.min(a.saldo, resto);
    if (parte.lte(0)) continue;
    aplicaciones.push({ anticipoId: a.id, monto: parte });
    resto = resto.sub(parte);
  }
  return { aplicaciones, aplicado: monto.sub(resto), aPagar: resto.isNeg() ? ZERO : resto };
}
