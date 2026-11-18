import { MedioPago, Prisma } from '@prisma/client';
import { peso, ZERO } from '../utils/money.util';

type Monto = Prisma.Decimal;

export const CUENTA = {
  CAJA: '1101',
  BANCO: '1102',
  TARJETAS: '1103',
  CLIENTES: '1104',
  IVA_CREDITO: '1105',
  MERCADERIAS: '1106',
  ANTICIPOS_PRODUCTORES: '1107',
  ANTICIPOS_PERSONAL: '1108',
  ACTIVO_FIJO: '1201',
  DEPRECIACION_ACUMULADA: '1202',
  PROVEEDORES: '2101',
  IVA_DEBITO: '2102',
  RETENCIONES: '2103',
  REMUNERACIONES_POR_PAGAR: '2104',
  RECIBIDO_POR_FACTURAR: '2105',
  VENTAS: '4101',
  DEVOLUCIONES: '4102',
  OTROS_INGRESOS: '4103',
  COSTO_VENTAS: '5101',
  MERMAS: '5102',
  DEPRECIACION: '5104',
  MANO_OBRA: '5105',
  DIFERENCIAS_CAJA: '5106',
} as const;

export interface Linea {
  cuenta: string;
  debe: Monto;
  haber: Monto;
}

export interface Borrador {
  fecha: string;
  glosa: string;
  origenTipo: string;
  origenId: string;
  lineas: Linea[];
}

export const debe = (cuenta: string, monto: Monto): Linea => ({ cuenta, debe: peso(monto), haber: ZERO });
export const haber = (cuenta: string, monto: Monto): Linea => ({ cuenta, debe: ZERO, haber: peso(monto) });

/** Quita líneas en cero y junta las de una misma cuenta y lado. */
export function compactar(lineas: Linea[]): Linea[] {
  const mapa = new Map<string, Linea>();
  for (const l of lineas) {
    if (l.debe.isZero() && l.haber.isZero()) continue;
    const clave = `${l.cuenta}|${l.debe.isZero() ? 'H' : 'D'}`;
    const previa = mapa.get(clave);
    mapa.set(clave, previa ? { cuenta: l.cuenta, debe: previa.debe.add(l.debe), haber: previa.haber.add(l.haber) } : l);
  }
  return [...mapa.values()];
}

export function cuadra(lineas: Linea[]) {
  const d = lineas.reduce((s, l) => s.add(l.debe), ZERO);
  const h = lineas.reduce((s, l) => s.add(l.haber), ZERO);
  return d.eq(h);
}

/** Cuenta donde entra o sale el dinero según el medio de pago. */
export function cuentaMedio(medio: MedioPago | null | undefined): string {
  switch (medio) {
    case 'Efectivo':
      return CUENTA.CAJA;
    case 'Tarjeta':
      return CUENTA.TARJETAS;
    case 'Credito':
      return CUENTA.CLIENTES;
    default:
      return CUENTA.BANCO;
  }
}

function borrador(fecha: string, glosa: string, origenTipo: string, origenId: string, lineas: Linea[]): Borrador | null {
  const compactas = compactar(lineas);
  if (compactas.length === 0) return null;
  if (!cuadra(compactas)) throw new Error(`Asiento descuadrado: ${origenTipo} ${origenId}`);
  return { fecha, glosa, origenTipo, origenId, lineas: compactas };
}

export interface VentaContable {
  id: string;
  fecha: string;
  tipo: 'VENTA' | 'DEVOLUCION' | 'NOTA_CREDITO' | 'MERMA';
  folio: string | null;
  medioPago: MedioPago;
  total: Monto;
  iva: Monto;
  costo: Monto;
  /** Partes del cobro cuando se pagó con más de un medio; si falta, todo va por medioPago. */
  pagos?: { medio: MedioPago; monto: Monto }[];
}

export function asientoVenta(v: VentaContable): Borrador | null {
  const neto = v.total.sub(v.iva);
  const cobros = v.pagos?.length ? v.pagos : [{ medio: v.medioPago, monto: v.total }];
  if (v.tipo === 'MERMA') {
    return borrador(v.fecha, 'Merma de mercadería', 'MERMA', v.id, [debe(CUENTA.MERMAS, v.costo), haber(CUENTA.MERCADERIAS, v.costo)]);
  }
  if (v.tipo === 'VENTA') {
    return borrador(v.fecha, `Venta${v.folio ? ` N° ${v.folio}` : ''}`, 'VENTA', v.id, [
      ...cobros.map((c) => debe(cuentaMedio(c.medio), c.monto)),
      haber(CUENTA.VENTAS, neto),
      haber(CUENTA.IVA_DEBITO, v.iva),
      debe(CUENTA.COSTO_VENTAS, v.costo),
      haber(CUENTA.MERCADERIAS, v.costo),
    ]);
  }
  return borrador(v.fecha, v.tipo === 'DEVOLUCION' ? 'Devolución de cliente' : 'Nota de crédito', v.tipo, v.id, [
    debe(CUENTA.DEVOLUCIONES, neto),
    debe(CUENTA.IVA_DEBITO, v.iva),
    haber(cuentaMedio(v.medioPago), v.total),
    debe(CUENTA.MERCADERIAS, v.costo),
    haber(CUENTA.COSTO_VENTAS, v.costo),
  ]);
}

export function asientoRecepcion(r: { id: string; fecha: string; folioOc: number; valor: Monto }) {
  return borrador(r.fecha, `Mercadería recibida OC ${r.folioOc}`, 'RECEPCION', r.id, [
    debe(CUENTA.MERCADERIAS, r.valor),
    haber(CUENTA.RECIBIDO_POR_FACTURAR, r.valor),
  ]);
}

export function asientoFacturaCompra(f: { id: string; fecha: string; folio: string; neto: Monto; iva: Monto; total: Monto }) {
  return borrador(f.fecha, `Factura de compra N° ${f.folio}`, 'FACTURA_COMPRA', f.id, [
    debe(CUENTA.RECIBIDO_POR_FACTURAR, f.neto),
    debe(CUENTA.IVA_CREDITO, f.iva),
    haber(CUENTA.PROVEEDORES, f.total),
  ]);
}

/** Pago a un proveedor (factura o gasto) desde caja o banco. */
export function asientoPagoProveedor(p: { origenTipo: string; id: string; fecha: string; glosa: string; monto: Monto; medio: MedioPago | null }) {
  const salida = p.medio === 'Efectivo' ? CUENTA.CAJA : CUENTA.BANCO;
  return borrador(p.fecha, p.glosa, p.origenTipo, p.id, [debe(CUENTA.PROVEEDORES, p.monto), haber(salida, p.monto)]);
}

/**
 * Gasto: el costo va a la cuenta de su categoría; el IVA recuperable (total − costo) al
 * crédito fiscal; la retención de honorarios se debe al SII y el resto al proveedor.
 */
export function asientoGasto(g: { id: string; fecha: string; descripcion: string; cuenta: string; monto: Monto; total: Monto; retencion: Monto }) {
  return borrador(g.fecha, g.descripcion, 'GASTO', g.id, [
    debe(g.cuenta, g.monto),
    debe(CUENTA.IVA_CREDITO, g.total.sub(g.monto)),
    haber(CUENTA.PROVEEDORES, g.total.sub(g.retencion)),
    haber(CUENTA.RETENCIONES, g.retencion),
  ]);
}

export function asientoAbono(a: { id: string; fecha: string; monto: Monto; medio: MedioPago }) {
  return borrador(a.fecha, 'Abono de cliente', 'ABONO', a.id, [debe(cuentaMedio(a.medio), a.monto), haber(CUENTA.CLIENTES, a.monto)]);
}

/** Faltante de caja es gasto; sobrante, otro ingreso. */
export function asientoCierreCaja(c: { id: string; fecha: string; diferencia: Monto }) {
  const d = c.diferencia;
  const lineas = d.isNeg()
    ? [debe(CUENTA.DIFERENCIAS_CAJA, d.abs()), haber(CUENTA.CAJA, d.abs())]
    : [debe(CUENTA.CAJA, d), haber(CUENTA.OTROS_INGRESOS, d)];
  return borrador(c.fecha, 'Diferencia en cierre de caja', 'CIERRE_CAJA', c.id, lineas);
}

export function asientoManual(a: { fecha: string; glosa: string; lineas: Linea[] }) {
  if (a.lineas.length < 2) throw new Error('Un asiento necesita al menos dos líneas.');
  const compactas = compactar(a.lineas);
  if (!cuadra(compactas)) throw new Error('El debe y el haber no suman lo mismo.');
  return compactas;
}

/** Fecha contable (AAAA-MM-DD): hora local para timestamps; las columnas DATE vienen en UTC. */
export const fechaLocal = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const fechaUtc = (d: Date) => d.toISOString().slice(0, 10);
