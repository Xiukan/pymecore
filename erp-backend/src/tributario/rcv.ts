import { BadRequestException } from '@nestjs/common';
import { normalizarRut } from '../compras/dte-recibido';

export interface DocumentoRcv {
  tipoDte: number;
  rut: string;
  razonSocial: string;
  folio: string;
  fecha: string;
  neto: number;
  iva: number;
  total: number;
}

const normal = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const numero = (v: string | undefined) => Math.round(Number((v ?? '0').replace(/\./g, '').replace(',', '.')) || 0);

/** Detalle del Registro de Compras descargado del SII (CSV con ";"). */
export function leerRcv(texto: string): DocumentoRcv[] {
  const lineas = texto.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim());
  if (lineas.length < 2) throw new BadRequestException('El archivo del RCV no tiene documentos.');
  const cab = lineas[0].split(';').map(normal);
  const col = (n: string) => cab.findIndex((c) => c === n || c.startsWith(n));
  const i = {
    tipo: col('tipo doc'),
    rut: col('rut proveedor'),
    razon: col('razon social'),
    folio: col('folio'),
    fecha: col('fecha docto'),
    neto: col('monto neto'),
    iva: col('monto iva recuperable'),
    total: col('monto total'),
  };
  if (Object.values(i).some((x) => x < 0)) {
    throw new BadRequestException('No parece el detalle del Registro de Compras del SII (faltan columnas como "Tipo Doc", "RUT Proveedor", "Folio" o "Monto Total").');
  }
  return lineas.slice(1).map((l) => {
    const c = l.split(';');
    const f = c[i.fecha]?.trim() ?? '';
    const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(f);
    return {
      tipoDte: Number(c[i.tipo]),
      rut: normalizarRut(c[i.rut] ?? ''),
      razonSocial: c[i.razon]?.trim() ?? '',
      folio: String(Number(c[i.folio]) || c[i.folio]?.trim()),
      fecha: m ? `${m[3]}-${m[2]}-${m[1]}` : f,
      neto: numero(c[i.neto]),
      iva: numero(c[i.iva]),
      total: numero(c[i.total]),
    };
  });
}

const clave = (d: { tipoDte: number; rut: string; folio: string }) => `${d.tipoDte}|${normalizarRut(d.rut)}|${String(Number(d.folio) || d.folio)}`;

/** Compara el RCV con el libro de compras: lo que falta en cada lado y los montos que no coinciden. */
export function cuadrarRcv(rcv: DocumentoRcv[], libro: DocumentoRcv[]) {
  const enLibro = new Map(libro.map((d) => [clave(d), d]));
  const enRcv = new Map(rcv.map((d) => [clave(d), d]));
  const diferencias = rcv
    .filter((d) => enLibro.has(clave(d)) && enLibro.get(clave(d))!.total !== d.total)
    .map((d) => ({ ...d, totalSistema: enLibro.get(clave(d))!.total }));
  return {
    soloEnSii: rcv.filter((d) => !enLibro.has(clave(d))),
    soloEnSistema: libro.filter((d) => !enRcv.has(clave(d))),
    diferencias,
    cuadrados: rcv.length - diferencias.length - rcv.filter((d) => !enLibro.has(clave(d))).length,
  };
}
