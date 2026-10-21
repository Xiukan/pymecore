import { BadRequestException } from '@nestjs/common';
import { createHash } from 'crypto';

export interface LineaCartola {
  fecha: string;
  descripcion: string;
  monto: number;
  huella: string;
}

const sinTildes = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** "1.234.567", "-1.234,50", "1234" → número (formato chileno). */
export function leerMonto(v: string): number {
  const t = v.replace(/\$|\s/g, '');
  if (!t) return 0;
  const n = Number(t.replace(/\./g, '').replace(',', '.'));
  if (Number.isNaN(n)) throw new BadRequestException(`Monto ilegible en la cartola: "${v}".`);
  return Math.round(n);
}

/** dd/mm/aaaa, dd-mm-aaaa o aaaa-mm-dd → aaaa-mm-dd. */
export function leerFecha(v: string): string {
  const t = v.trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(t);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(t);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  throw new BadRequestException(`Fecha ilegible en la cartola: "${v}".`);
}

function columnas(linea: string, sep: string): string[] {
  const out: string[] = [];
  let actual = '';
  let comillas = false;
  for (const c of linea) {
    if (c === '"') comillas = !comillas;
    else if (c === sep && !comillas) {
      out.push(actual);
      actual = '';
    } else actual += c;
  }
  out.push(actual);
  return out.map((x) => x.trim());
}

/**
 * Cartola en CSV como la exportan los bancos: encabezado con fecha, descripción (o detalle/glosa)
 * y monto, o bien cargo y abono por separado. Separador ";" o ",". Los movimientos repetidos
 * en el mismo archivo se distinguen por su orden para que la huella no choque.
 */
export function leerCartola(texto: string): LineaCartola[] {
  const lineas = texto.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim());
  if (lineas.length < 2) throw new BadRequestException('La cartola no tiene movimientos.');
  const sep = (lineas[0].match(/;/g)?.length ?? 0) >= (lineas[0].match(/,/g)?.length ?? 0) ? ';' : ',';
  const cab = columnas(lineas[0], sep).map(sinTildes);
  const idx = (...nombres: string[]) => cab.findIndex((c) => nombres.some((n) => c.includes(n)));
  const iFecha = idx('fecha');
  const iDesc = idx('descripcion', 'detalle', 'glosa', 'concepto');
  const iMonto = idx('monto', 'importe');
  const iCargo = idx('cargo', 'debito', 'giro');
  const iAbono = idx('abono', 'credito', 'deposito');
  if (iFecha < 0 || iDesc < 0 || (iMonto < 0 && (iCargo < 0 || iAbono < 0))) {
    throw new BadRequestException('La cartola debe tener columnas Fecha, Descripción y Monto (o Cargo y Abono).');
  }
  const vistas = new Map<string, number>();
  return lineas.slice(1).flatMap((l) => {
    const c = columnas(l, sep);
    if (!c[iFecha]) return [];
    const monto = iMonto >= 0 ? leerMonto(c[iMonto] ?? '') : leerMonto(c[iAbono] ?? '') - Math.abs(leerMonto(c[iCargo] ?? ''));
    if (monto === 0) return [];
    const fecha = leerFecha(c[iFecha]);
    const descripcion = (c[iDesc] ?? '').slice(0, 200);
    const base = `${fecha}|${descripcion}|${monto}`;
    const n = (vistas.get(base) ?? 0) + 1;
    vistas.set(base, n);
    return [{ fecha, descripcion, monto, huella: createHash('sha256').update(`${base}|${n}`).digest('hex') }];
  });
}
