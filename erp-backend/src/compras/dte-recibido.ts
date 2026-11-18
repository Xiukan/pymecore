import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { DOMParser, Element, Node } from '@xmldom/xmldom';
import * as forge from 'node-forge';
import { SignedXml } from 'xml-crypto';

const D = Prisma.Decimal;
const DSIG = 'http://www.w3.org/2000/09/xmldsig#';
export const MAX_XML_BYTES = 512 * 1024;
/** Facturas afecta/exenta y notas de débito/crédito: lo que una pyme recibe de proveedores. */
export const TIPOS_SOPORTADOS: Record<number, string> = {
  33: 'Factura electrónica',
  34: 'Factura no afecta o exenta',
  56: 'Nota de débito',
  61: 'Nota de crédito',
};

export interface LineaDte {
  linea: number;
  nombre: string;
  descripcion?: string;
  cantidad?: string;
  unidad?: string;
  precio?: string;
  exento: boolean;
  monto: string;
}

export interface OtroImpuesto {
  tipo: string;
  tasa?: string;
  monto: string;
}

export interface DteRecibidoParseado {
  tipoDte: number;
  folio: string;
  fechaEmision: string;
  fechaVencimiento?: string;
  emisor: { rut: string; razonSocial: string; giro?: string; direccion?: string; comuna?: string };
  rutReceptor: string;
  montoNeto: Prisma.Decimal;
  montoExento: Prisma.Decimal;
  tasaIva?: Prisma.Decimal;
  iva: Prisma.Decimal;
  otrosImpuestos: OtroImpuesto[];
  montoTotal: Prisma.Decimal;
  referenciaOc?: string;
  lineas: LineaDte[];
  timbreValido: boolean;
  firmaValida: boolean;
  observaciones: string[];
}

/** RUT comparable: sin puntos ni espacios, DV en mayúscula (76.000.000-k → 76000000-K). */
export const normalizarRut = (rut: string) => rut.replace(/[.\s]/g, '').toUpperCase();

const local = (n: Node) => (n as Element).localName ?? (n as Element).nodeName;
const hijos = (el: Element | undefined, nombre: string): Element[] =>
  el ? Array.from(el.childNodes).filter((n): n is Element => n.nodeType === 1 && local(n) === nombre) : [];
const hijo = (el: Element | undefined, nombre: string) => hijos(el, nombre)[0];
const texto = (el: Element | undefined, nombre: string) => hijo(el, nombre)?.textContent?.trim() || undefined;

function monto(el: Element | undefined, nombre: string, obligatorio = false): Prisma.Decimal {
  const v = texto(el, nombre);
  if (v === undefined) {
    if (obligatorio) throw new BadRequestException(`El DTE no informa ${nombre}.`);
    return new D(0);
  }
  if (!/^-?\d+(\.\d+)?$/.test(v)) throw new BadRequestException(`${nombre} no es un monto válido: ${v}`);
  return new D(v);
}

/**
 * Lee un DTE recibido (EnvioDTE del proveedor o DTE suelto). Lo que impide registrarlo
 * lanza error; lo que solo amerita revisión queda en `observaciones`.
 */
export function leerDteRecibido(xml: string): DteRecibidoParseado {
  if (Buffer.byteLength(xml, 'utf8') > MAX_XML_BYTES) throw new BadRequestException('El XML supera el tamaño máximo (512 KB).');
  const errores: string[] = [];
  let doc: ReturnType<DOMParser['parseFromString']>;
  try {
    doc = new DOMParser({ onError: (nivel, msg) => nivel !== 'warning' && errores.push(msg) }).parseFromString(xml, 'text/xml');
  } catch {
    // xmldom 0.9 lanza ParseError ante XML mal formado.
    throw new BadRequestException('El archivo no es un XML válido.');
  }
  if (errores.length || !doc.documentElement) throw new BadRequestException('El archivo no es un XML válido.');

  const raiz = doc.documentElement;
  const dtes =
    local(raiz) === 'DTE' ? [raiz] : hijos(hijo(raiz, 'SetDTE'), 'DTE');
  if (dtes.length === 0) throw new BadRequestException('El XML no contiene un DTE.');
  if (dtes.length > 1) throw new BadRequestException('El envío trae varios DTE; cárguelos de a uno.');
  const dte = dtes[0];
  const documento = hijo(dte, 'Documento');
  const encabezado = hijo(documento, 'Encabezado');
  const idDoc = hijo(encabezado, 'IdDoc');
  const emisor = hijo(encabezado, 'Emisor');
  const receptor = hijo(encabezado, 'Receptor');
  const totales = hijo(encabezado, 'Totales');
  if (!documento || !idDoc || !emisor || !receptor || !totales) {
    throw new BadRequestException('El DTE no tiene la estructura del SII (Documento, IdDoc, Emisor, Receptor, Totales).');
  }

  const tipoDte = Number(texto(idDoc, 'TipoDTE'));
  if (!TIPOS_SOPORTADOS[tipoDte]) throw new BadRequestException(`Tipo de DTE ${texto(idDoc, 'TipoDTE')} no soportado.`);
  const folio = texto(idDoc, 'Folio');
  if (!folio || !/^\d{1,10}$/.test(folio)) throw new BadRequestException('El DTE no informa un folio válido.');
  const fechaEmision = texto(idDoc, 'FchEmis');
  if (!fechaEmision || !/^\d{4}-\d{2}-\d{2}$/.test(fechaEmision)) throw new BadRequestException('El DTE no informa la fecha de emisión.');
  const rutEmisor = texto(emisor, 'RUTEmisor');
  const rutReceptor = texto(receptor, 'RUTRecep');
  if (!rutEmisor || !rutReceptor) throw new BadRequestException('El DTE no informa RUT de emisor o receptor.');

  const montoNeto = monto(totales, 'MntNeto');
  const montoExento = monto(totales, 'MntExe');
  const iva = monto(totales, 'IVA');
  const montoTotal = monto(totales, 'MntTotal', true);
  const tasa = texto(totales, 'TasaIVA');
  const otrosImpuestos = hijos(totales, 'ImptoReten').map((i) => ({
    tipo: texto(i, 'TipoImp') ?? '?',
    tasa: texto(i, 'TasaImp'),
    monto: monto(i, 'MontoImp').toString(),
  }));
  const lineas: LineaDte[] = hijos(documento, 'Detalle').map((d) => ({
    linea: Number(texto(d, 'NroLinDet')),
    nombre: texto(d, 'NmbItem') ?? '',
    descripcion: texto(d, 'DscItem'),
    cantidad: texto(d, 'QtyItem'),
    unidad: texto(d, 'UnmdItem'),
    precio: texto(d, 'PrcItem'),
    exento: texto(d, 'IndExe') !== undefined,
    monto: monto(d, 'MontoItem').toString(),
  }));
  const referenciaOc = hijos(documento, 'Referencia').find((r) => texto(r, 'TpoDocRef') === '801');

  const observaciones: string[] = [];
  if (tasa && montoNeto.gt(0)) {
    const ivaEsperado = montoNeto.mul(tasa).div(100).toDecimalPlaces(0, D.ROUND_HALF_UP);
    if (!ivaEsperado.eq(iva)) observaciones.push(`El IVA informado (${iva}) no es el ${tasa}% del neto (${ivaEsperado}).`);
  }
  const otros = otrosImpuestos.reduce((s, o) => s.add(o.monto), new D(0));
  const suma = montoNeto.add(montoExento).add(iva).add(otros);
  if (!suma.eq(montoTotal)) {
    observaciones.push(
      `El total (${montoTotal}) no es neto + exento + IVA + otros impuestos (${suma})` +
        (otrosImpuestos.length ? '; incluye impuestos específicos o retenciones que deben revisarse.' : '.'),
    );
  }
  const sumaLineas = lineas.reduce((s, l) => s.add(l.monto), new D(0));
  if (!sumaLineas.eq(montoNeto.add(montoExento))) {
    observaciones.push(`Las líneas suman ${sumaLineas} y el neto + exento es ${montoNeto.add(montoExento)} (líneas informativas o de resumen).`);
  }

  const timbreValido = verificarTimbre(xml, dte);
  const firmaValida = verificarFirma(xml, dte);
  if (!timbreValido) observaciones.push('El timbre electrónico (TED) no se pudo verificar con la llave del CAF.');
  if (!firmaValida) {
    observaciones.push(
      'La firma digital del documento no se pudo verificar: el XML fue modificado después de firmarse ' +
        '(p. ej. caracteres reemplazados al descargarlo). Pida el XML original al proveedor o valídelo en el SII.',
    );
  }

  return {
    tipoDte,
    folio,
    fechaEmision,
    fechaVencimiento: texto(idDoc, 'FchVenc'),
    emisor: {
      rut: rutEmisor,
      razonSocial: texto(emisor, 'RznSoc') ?? rutEmisor,
      giro: texto(emisor, 'GiroEmis'),
      direccion: texto(emisor, 'DirOrigen'),
      comuna: texto(emisor, 'CmnaOrigen'),
    },
    rutReceptor,
    montoNeto,
    montoExento,
    tasaIva: tasa ? new D(tasa) : undefined,
    iva,
    otrosImpuestos,
    montoTotal,
    referenciaOc: referenciaOc ? texto(referenciaOc, 'FolioRef') : undefined,
    lineas,
    timbreValido,
    firmaValida,
    observaciones,
  };
}

/**
 * TED: el DD se firma con la llave privada del CAF y SHA1withRSA, sobre el DD sin espacios
 * entre etiquetas. La llave pública viene en el mismo CAF (RSAPK, autorizado por el SII).
 */
function verificarTimbre(xml: string, dte: Element): boolean {
  try {
    const bruto = xml.slice(xml.indexOf('<TED'), xml.indexOf('</TED>'));
    const dd = bruto.slice(bruto.indexOf('<DD>'), bruto.indexOf('</DD>') + 5).replace(/>\s+</g, '><').trim();
    const rsapk = dte.getElementsByTagName('RSAPK')[0];
    const frmt = dte.getElementsByTagName('FRMT')[0];
    if (!dd || !rsapk || !frmt || frmt.getAttribute('algoritmo') !== 'SHA1withRSA') return false;
    const entero = (b64: string) => new forge.jsbn.BigInteger(Buffer.from(b64.trim(), 'base64').toString('hex'), 16);
    const llave = forge.pki.setRsaPublicKey(entero(texto(rsapk, 'M') ?? ''), entero(texto(rsapk, 'E') ?? ''));
    const md = forge.md.sha1.create();
    md.update(Buffer.from(dd, 'latin1').toString('binary'));
    return llave.verify(md.digest().bytes(), Buffer.from((frmt.textContent ?? '').replace(/\s/g, ''), 'base64').toString('binary'));
  } catch {
    return false;
  }
}

/** XMLDSig del Documento con el certificado incluido en KeyInfo (RSA-SHA1, como exige el SII). */
function verificarFirma(xml: string, dte: Element): boolean {
  try {
    const firma = Array.from(dte.childNodes).find((n): n is Element => n.nodeType === 1 && local(n) === 'Signature');
    if (!firma) return false;
    const cert = firma.getElementsByTagNameNS(DSIG, 'X509Certificate')[0]?.textContent?.replace(/\s/g, '');
    if (!cert) return false;
    const pem = `-----BEGIN CERTIFICATE-----\n${cert.match(/.{1,64}/g)!.join('\n')}\n-----END CERTIFICATE-----`;
    const sx = new SignedXml({ publicCert: pem, getCertFromKeyInfo: () => pem });
    sx.loadSignature(firma as unknown as Parameters<SignedXml["loadSignature"]>[0]);
    return sx.checkSignature(xml);
  } catch {
    return false;
  }
}
