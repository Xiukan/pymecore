import { Prisma } from '@prisma/client';

// Política de montos en CLP (equivalente a core/money.py de APS): Decimal, pesos
// enteros y ROUND_HALF_UP. Los precios de venta incluyen IVA (boleta), por lo que
// el IVA se desglosa una sola vez sobre el total afecto del documento.
const D = Prisma.Decimal;
export type Decimal = Prisma.Decimal;

export const ZERO = new D(0);

export const dec = (v: Prisma.Decimal.Value) => new D(v);
export const peso = (v: Prisma.Decimal.Value) => new D(v).toDecimalPlaces(0, D.ROUND_HALF_UP);

/** Parte proporcional en pesos: peso(total × parte / todo). */
export function share(total: Prisma.Decimal.Value, part: Prisma.Decimal.Value, whole: Prisma.Decimal.Value) {
  const w = new D(whole);
  if (w.lte(0)) return ZERO;
  return peso(new D(total).mul(part).div(w));
}

/** Reparte `amount` entre pesos proporcionales a `weights`; el residuo va al mayor peso. */
export function allocate(amount: Prisma.Decimal.Value, weights: Prisma.Decimal[]): Prisma.Decimal[] {
  const total = weights.reduce((s, w) => s.add(w), ZERO);
  if (total.lte(0)) return weights.map(() => ZERO);
  const parts = weights.map((w) => share(amount, w, total));
  const residuo = new D(amount).sub(parts.reduce((s, p) => s.add(p), ZERO));
  const mayor = weights.reduce((iMax, w, i) => (w.gt(weights[iMax]) ? i : iMax), 0);
  parts[mayor] = parts[mayor].add(residuo);
  return parts;
}

export interface LineaBruta {
  cantidad: Prisma.Decimal.Value;
  precioUnitario: Prisma.Decimal.Value;
  descuentoLinea: Prisma.Decimal.Value;
  afectoIva: boolean;
}

export interface LineaCalculada {
  descuentoLinea: Prisma.Decimal;
  montoIva: Prisma.Decimal;
  subtotal: Prisma.Decimal;
}

/**
 * Totales de un documento con precios brutos. El descuento global se reparte entre
 * las líneas antes de desglosar el IVA, así las líneas siempre suman el total.
 */
export function calcularDocumento(
  lineas: LineaBruta[],
  descuentoGlobal: Prisma.Decimal.Value,
  tasaIvaPct: Prisma.Decimal.Value,
) {
  const tasa = new D(tasaIvaPct).div(100);
  const brutos = lineas.map((l) => {
    const bruto = peso(new D(l.cantidad).mul(l.precioUnitario));
    const descuento = peso(l.descuentoLinea);
    if (descuento.gt(bruto)) throw new RangeError('El descuento de una línea supera su monto.');
    return bruto.sub(descuento);
  });
  const totalLineas = brutos.reduce((s, b) => s.add(b), ZERO);
  const global = peso(descuentoGlobal);
  if (global.gt(totalLineas)) throw new RangeError('El descuento global supera el total del documento.');

  const descuentosGlobales = allocate(global, brutos);
  const totales = brutos.map((b, i) => b.sub(descuentosGlobales[i]));

  const afectos = totales.map((t, i) => (lineas[i].afectoIva ? t : ZERO));
  const totalAfecto = afectos.reduce((s, t) => s.add(t), ZERO);
  const neto = peso(totalAfecto.div(tasa.add(1)));
  const ivas = allocate(totalAfecto.sub(neto), afectos);

  const detalle: LineaCalculada[] = totales.map((t, i) => ({
    descuentoLinea: peso(lineas[i].descuentoLinea).add(descuentosGlobales[i]),
    montoIva: ivas[i],
    subtotal: t,
  }));
  return {
    detalle,
    montoNeto: totales.reduce((s, t) => s.add(t), ZERO).sub(totalAfecto.sub(neto)),
    montoIva: totalAfecto.sub(neto),
    montoTotal: totales.reduce((s, t) => s.add(t), ZERO),
    descuentoGlobal: global,
  };
}

export interface LineaNeta {
  cantidad: Prisma.Decimal.Value;
  costoUnitario: Prisma.Decimal.Value;
  afectoIva: boolean;
}

/**
 * Documentos de compra: costos netos y el IVA se suma sobre el neto afecto del documento
 * (no por línea), como exige la factura electrónica.
 */
export function calcularDocumentoNeto(lineas: LineaNeta[], tasaIvaPct: Prisma.Decimal.Value) {
  const subtotales = lineas.map((l) => peso(new D(l.cantidad).mul(l.costoUnitario)));
  const montoNeto = subtotales.reduce((s, t) => s.add(t), ZERO);
  const netoAfecto = subtotales.reduce((s, t, i) => (lineas[i].afectoIva ? s.add(t) : s), ZERO);
  const montoIva = peso(netoAfecto.mul(tasaIvaPct).div(100));
  return { subtotales, montoNeto, montoIva, montoTotal: montoNeto.add(montoIva) };
}
