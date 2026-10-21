import { BadRequestException } from '@nestjs/common';
import { Prisma, TipoCuenta } from '@prisma/client';
import { ZERO } from '../utils/money.util';

type Monto = Prisma.Decimal;

export interface SumaCuenta {
  codigo: string;
  nombre: string;
  tipo: TipoCuenta;
  debe: Monto;
  haber: Monto;
}

const BALANCE: TipoCuenta[] = ['ACTIVO', 'PASIVO', 'PATRIMONIO'];

/** Balance de 8 columnas: sumas, saldos, inventario y resultados; el resultado cuadra ambos lados. */
export function balanceOchoColumnas(cuentas: SumaCuenta[]) {
  const filas = cuentas
    .filter((c) => !c.debe.isZero() || !c.haber.isZero())
    .sort((a, b) => a.codigo.localeCompare(b.codigo))
    .map((c) => {
      const saldo = c.debe.sub(c.haber);
      const deudor = saldo.isPos() ? saldo : ZERO;
      const acreedor = saldo.isNeg() ? saldo.abs() : ZERO;
      const esBalance = BALANCE.includes(c.tipo);
      return {
        codigo: c.codigo,
        nombre: c.nombre,
        debe: c.debe,
        haber: c.haber,
        deudor,
        acreedor,
        activo: esBalance ? deudor : ZERO,
        pasivo: esBalance ? acreedor : ZERO,
        perdida: esBalance ? ZERO : deudor,
        ganancia: esBalance ? ZERO : acreedor,
      };
    });
  const suma = (k: keyof (typeof filas)[number]) => filas.reduce((s, f) => s.add(f[k] as Monto), ZERO);
  const totales = {
    debe: suma('debe'),
    haber: suma('haber'),
    deudor: suma('deudor'),
    acreedor: suma('acreedor'),
    activo: suma('activo'),
    pasivo: suma('pasivo'),
    perdida: suma('perdida'),
    ganancia: suma('ganancia'),
  };
  const resultado = totales.ganancia.sub(totales.perdida);
  return { filas, totales, resultado };
}

const COSTOS = ['5101', '5102'];

/** Estado de resultados: ingresos netos, costo de lo vendido y gastos, en lenguaje simple. */
export function estadoResultados(cuentas: SumaCuenta[]) {
  const linea = (c: SumaCuenta, signo: 1 | -1) => ({
    codigo: c.codigo,
    nombre: c.nombre,
    monto: signo === 1 ? c.haber.sub(c.debe) : c.debe.sub(c.haber),
  });
  const conMovimiento = cuentas.filter((c) => !c.debe.isZero() || !c.haber.isZero());
  const ingresos = conMovimiento.filter((c) => c.tipo === 'INGRESO').map((c) => linea(c, 1));
  const costos = conMovimiento.filter((c) => c.tipo === 'GASTO' && COSTOS.includes(c.codigo)).map((c) => linea(c, -1));
  const gastos = conMovimiento.filter((c) => c.tipo === 'GASTO' && !COSTOS.includes(c.codigo)).map((c) => linea(c, -1));
  const total = (l: { monto: Monto }[]) => l.reduce((s, x) => s.add(x.monto), ZERO);
  const totalIngresos = total(ingresos);
  const margen = totalIngresos.sub(total(costos));
  return {
    ingresos,
    costos,
    gastos,
    totalIngresos,
    totalCostos: total(costos),
    margen,
    totalGastos: total(gastos),
    resultado: margen.sub(total(gastos)),
  };
}

/** Movimientos de una cuenta con saldo corrido (deudor positivo). */
export function mayor(saldoInicial: Monto, movimientos: { fecha: string; glosa: string; debe: Monto; haber: Monto }[]) {
  let saldo = saldoInicial;
  const filas = movimientos.map((m) => {
    saldo = saldo.add(m.debe).sub(m.haber);
    return { ...m, saldo };
  });
  return { saldoInicial, filas, saldoFinal: saldo };
}

export function validarMes(mes: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) throw new BadRequestException('Indique el mes como AAAA-MM.');
  const [a, m] = mes.split('-').map(Number);
  return { a, m };
}

/** Meses AAAA-MM entre dos fechas AAAA-MM-DD, ambos incluidos. */
export function mesesEntre(desde: string, hasta: string): string[] {
  const meses: string[] = [];
  let [a, m] = desde.slice(0, 7).split('-').map(Number);
  const fin = hasta.slice(0, 7);
  for (let i = 0; i < 240; i++) {
    const mes = `${a}-${String(m).padStart(2, '0')}`;
    if (mes > fin) break;
    meses.push(mes);
    m === 12 ? ((a += 1), (m = 1)) : (m += 1);
  }
  return meses;
}
