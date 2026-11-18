export interface MovimientoValorizado {
  fecha: string;
  itemId: string;
  nombre: string;
  cantidad: number;
  valor: number;
}

/**
 * Indicador de H-01: lo perdido por vencimiento (bajas) frente a lo salvado (vendido dentro de
 * la ventana de alerta antes de vencer), por producto y por mes, valorizado a costo.
 */
export function resumenMermas(bajas: MovimientoValorizado[], salvadas: MovimientoValorizado[]) {
  const total = (l: MovimientoValorizado[]) => Math.round(l.reduce((s, m) => s + m.valor, 0));
  const productos = new Map<string, { itemId: string; nombre: string; perdido: number; unidadesPerdidas: number; salvado: number; unidadesSalvadas: number }>();
  const meses = new Map<string, { mes: string; perdido: number; salvado: number }>();
  const sumar = (m: MovimientoValorizado, campo: 'perdido' | 'salvado') => {
    const p = productos.get(m.itemId) ?? { itemId: m.itemId, nombre: m.nombre, perdido: 0, unidadesPerdidas: 0, salvado: 0, unidadesSalvadas: 0 };
    p[campo] += m.valor;
    if (campo === 'perdido') p.unidadesPerdidas += m.cantidad;
    else p.unidadesSalvadas += m.cantidad;
    productos.set(m.itemId, p);
    const mes = m.fecha.slice(0, 7);
    const x = meses.get(mes) ?? { mes, perdido: 0, salvado: 0 };
    x[campo] += m.valor;
    meses.set(mes, x);
  };
  bajas.forEach((m) => sumar(m, 'perdido'));
  salvadas.forEach((m) => sumar(m, 'salvado'));
  const perdido = total(bajas);
  const salvado = total(salvadas);
  const redondear = <T extends { perdido: number; salvado: number }>(x: T) => ({ ...x, perdido: Math.round(x.perdido), salvado: Math.round(x.salvado) });
  return {
    perdido,
    salvado,
    // Proporción de lo que llegó a la ventana de alerta que igual terminó perdido.
    tasaPerdida: perdido + salvado > 0 ? Math.round((perdido / (perdido + salvado)) * 1000) / 10 : null,
    porProducto: [...productos.values()].map(redondear).sort((a, b) => b.perdido - a.perdido),
    porMes: [...meses.values()].map(redondear).sort((a, b) => a.mes.localeCompare(b.mes)),
  };
}

/** ¿La venta ocurrió dentro de la ventana de alerta (umbral días antes de vencer, sin pasar la fecha)? */
export function vendidaEnAlerta(fechaVenta: string, vencimiento: string, umbral: number) {
  const dias = Math.round((Date.parse(`${vencimiento}T00:00:00Z`) - Date.parse(`${fechaVenta}T00:00:00Z`)) / 86_400_000);
  return dias >= 0 && dias <= umbral;
}
