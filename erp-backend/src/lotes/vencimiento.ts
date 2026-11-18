export type EstadoVencimiento = 'VENCIDO' | 'PROXIMO_A_VENCER' | 'OK' | 'SIN_DATO';

/**
 * AlertaVencimiento (AC-05, AC-06): a `umbral` días o menos → "Próximo a vencer"; ya pasado →
 * "Vencido"; sin fecha → "Sin dato" (nunca una alerta falsa). Fechas como días calendario.
 */
export function estadoVencimiento(fecha: Date | null, hoy: string, umbral: number): { estado: EstadoVencimiento; diasRestantes: number | null } {
  if (!fecha) return { estado: 'SIN_DATO', diasRestantes: null };
  const dias = Math.round((Date.UTC(fecha.getUTCFullYear(), fecha.getUTCMonth(), fecha.getUTCDate()) - Date.parse(`${hoy}T00:00:00Z`)) / 86_400_000);
  if (dias < 0) return { estado: 'VENCIDO', diasRestantes: dias };
  if (dias <= umbral) return { estado: 'PROXIMO_A_VENCER', diasRestantes: dias };
  return { estado: 'OK', diasRestantes: dias };
}
