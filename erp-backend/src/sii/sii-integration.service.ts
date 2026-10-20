import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as forge from 'node-forge';
import { SignedXml } from 'xml-crypto';
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';

export interface Emisor {
  rut: string;
  razonSocial: string;
  giro: string;
  direccion: string;
  comuna: string;
}

export interface DteData {
  folio: number;
  tipoDoc: number;
  emisor: Emisor;
  rutReceptor: string;
  razonSocialReceptor: string;
  direccionReceptor?: string | null;
  fechaEmision: string;
  montoTotal: number;
  /** Desglose del total (precios con IVA incluido). */
  montoNeto?: number;
  iva?: number;
  primerItem: string;
  detalles: { nombre: string; cantidad: number; precio: number; subtotal: number }[];
}

/** Texto que viene de usuarios o del catálogo: sin escapar rompería el XML o inyectaría nodos. */
const xml = (valor: string | number) =>
  String(valor)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

export interface DteResult {
  folio: number;
  tipoDoc: number;
  rutEmisor: string;
  fechaEmision: string;
  montoTotal: number;
  xmlFirmado: string;
  xmlBase64: string;
  /** true cuando no se pudo firmar y el XML es un sustituto: no es un DTE válido. */
  esMock?: boolean;
}

@Injectable()
export class SiiIntegrationService {
  private readonly logger = new Logger(SiiIntegrationService.name);
  private readonly certsDir = path.join(process.cwd(), 'sii-certs');
  private caf?: { cafPrivKeyPem: string; daXml: string };
  private p12?: { privateKeyPem: string; certPem: string };

  emitirDTE(datos: DteData): DteResult {
    try {
      // El CAF y el .p12 se descifran una vez: hacerlo en cada venta bloqueaba el event loop
      // y alargaba las transacciones de las ventas concurrentes hasta su vencimiento.
      this.caf ??= this.parseCaf();
      this.p12 ??= this.loadP12();
      const { cafPrivKeyPem, daXml } = this.caf;
      const ted = this.generarTED(datos, cafPrivKeyPem, daXml);
      const dteXml = this.generarXMLDTE(datos, ted);
      const { privateKeyPem, certPem } = this.p12;
      const xmlFirmado = this.firmarDTE(dteXml, privateKeyPem, certPem, datos.folio, datos.tipoDoc);

      this.logger.log(`DTE folio ${datos.folio} tipo ${datos.tipoDoc} emitido correctamente`);
      return {
        folio: datos.folio,
        tipoDoc: datos.tipoDoc,
        rutEmisor: datos.emisor.rut,
        fechaEmision: datos.fechaEmision,
        montoTotal: datos.montoTotal,
        xmlFirmado,
        xmlBase64: Buffer.from(xmlFirmado).toString('base64'),
      };
    } catch (err) {
      this.logger.warn(`DTE real falló (${(err as Error).message}), usando mock`);
      return this.emitirMock(datos);
    }
  }

  private parseCaf(): { cafPrivKeyPem: string; daXml: string } {
    const cafRaw = fs.readFileSync(path.join(this.certsDir, 'CAF_Prueba.xml'), 'utf8');
    const doc = new DOMParser().parseFromString(cafRaw, 'text/xml');

    const rsask = (doc.getElementsByTagName('RSASK')[0].textContent ?? '').trim();
    const keyBody = rsask
      .replace('-----BEGIN RSA PRIVATE KEY-----', '')
      .replace('-----END RSA PRIVATE KEY-----', '')
      .replace(/[\r\n\s]/g, '');
    const cafPrivKeyPem =
      `-----BEGIN RSA PRIVATE KEY-----\n` +
      (keyBody.match(/.{1,64}/g) ?? []).join('\n') +
      `\n-----END RSA PRIVATE KEY-----`;

    const daNode = doc.getElementsByTagName('DA')[0];
    const daXml = new XMLSerializer()
      .serializeToString(daNode)
      .replace(/<\?xml[^>]*\?>/g, '')
      .replace(/\n|\r/g, '');

    return { cafPrivKeyPem, daXml };
  }

  private generarTED(datos: DteData, cafPrivKeyPem: string, daXml: string): string {
    const tsted = new Date().toISOString().substring(0, 19);

    const dd =
      `<DD>` +
      `<RE>${xml(datos.emisor.rut)}</RE>` +
      `<TD>${datos.tipoDoc}</TD>` +
      `<F>${datos.folio}</F>` +
      `<FE>${datos.fechaEmision}</FE>` +
      `<RR>${xml(datos.rutReceptor)}</RR>` +
      `<RSR>${xml(datos.razonSocialReceptor.substring(0, 40))}</RSR>` +
      `<MNT>${Math.round(datos.montoTotal)}</MNT>` +
      `<IT1>${xml(datos.primerItem.substring(0, 40))}</IT1>` +
      daXml +
      `<TSTED>${tsted}</TSTED>` +
      `</DD>`;

    const sign = crypto.createSign('SHA1');
    sign.update(Buffer.from(dd, 'latin1'));
    const sig = sign.sign(cafPrivKeyPem);

    return `<TED version="1.0">${dd}<FRMT algoritmo="SHA1withRSA">${sig.toString('base64')}</FRMT></TED>`;
  }

  private generarXMLDTE(datos: DteData, tedXml: string): string {
    const id = `F${datos.folio}T${datos.tipoDoc}`;
    const tmst = new Date().toISOString().substring(0, 19);

    const detalles = datos.detalles
      .map(
        (d, i) =>
          `<Detalle>` +
          `<NroLinDet>${i + 1}</NroLinDet>` +
          `<NmbItem>${xml(d.nombre)}</NmbItem>` +
          `<QtyItem>${d.cantidad}</QtyItem>` +
          `<PrcItem>${Math.round(d.precio)}</PrcItem>` +
          `<MntItem>${Math.round(d.subtotal)}</MntItem>` +
          `</Detalle>`,
      )
      .join('');

    return (
      `<DTE xmlns="http://www.sii.cl/SiiDte" version="1.0">` +
      `<Documento ID="${id}">` +
      `<Encabezado>` +
      `<IdDoc><TipoDTE>${datos.tipoDoc}</TipoDTE><Folio>${datos.folio}</Folio><FchEmis>${datos.fechaEmision}</FchEmis></IdDoc>` +
      `<Emisor><RUTEmisor>${xml(datos.emisor.rut)}</RUTEmisor><RznSoc>${xml(datos.emisor.razonSocial)}</RznSoc>` +
      `<Giro>${xml(datos.emisor.giro)}</Giro><DirOrigen>${xml(datos.emisor.direccion)}</DirOrigen>` +
      `<CmnaOrigen>${xml(datos.emisor.comuna)}</CmnaOrigen></Emisor>` +
      `<Receptor><RUTRecep>${xml(datos.rutReceptor)}</RUTRecep><RznSocRecep>${xml(datos.razonSocialReceptor)}</RznSocRecep>` +
      (datos.direccionReceptor ? `<DirRecep>${xml(datos.direccionReceptor)}</DirRecep>` : '') +
      `</Receptor>` +
      `<Totales>` +
      (datos.montoNeto !== undefined ? `<MntNeto>${Math.round(datos.montoNeto)}</MntNeto>` : '') +
      (datos.iva !== undefined ? `<IVA>${Math.round(datos.iva)}</IVA>` : '') +
      `<MntTotal>${Math.round(datos.montoTotal)}</MntTotal></Totales>` +
      `</Encabezado>` +
      detalles +
      tedXml +
      `<TmstFirma>${tmst}</TmstFirma>` +
      `</Documento>` +
      `</DTE>`
    );
  }

  private loadP12(): { privateKeyPem: string; certPem: string } {
    const p12Der = fs.readFileSync(path.join(this.certsDir, 'mi_certificado.p12'));
    const p12Asn1 = forge.asn1.fromDer(
      forge.util.createBuffer(p12Der.toString('binary')),
    );
    const password = process.env.SII_P12_PASSWORD;
    if (!password) throw new Error('Falta SII_P12_PASSWORD');
    const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, password);

    const keyBags = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag });
    const keyBag = keyBags[forge.pki.oids.pkcs8ShroudedKeyBag]?.[0];
    if (!keyBag?.key) throw new Error('Llave privada no encontrada en P12');
    const privateKeyPem = forge.pki.privateKeyToPem(keyBag.key);

    const certBags = p12.getBags({ bagType: forge.pki.oids.certBag });
    const certBag = certBags[forge.pki.oids.certBag]?.[0];
    if (!certBag?.cert) throw new Error('Certificado no encontrado en P12');
    const certPem = forge.pki.certificateToPem(certBag.cert);

    return { privateKeyPem, certPem };
  }

  private firmarDTE(
    xml: string,
    privateKeyPem: string,
    certPem: string,
    folio: number,
    tipoDoc: number,
  ): string {
    const documentoId = `F${folio}T${tipoDoc}`;

    const sig = new SignedXml({
      privateKey: privateKeyPem,
      publicCert: certPem,
      canonicalizationAlgorithm: 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315',
      signatureAlgorithm: 'http://www.w3.org/2000/09/xmldsig#rsa-sha1',
    });

    sig.addReference({
      xpath: `//*[@ID='${documentoId}']`,
      transforms: ['http://www.w3.org/2000/09/xmldsig#enveloped-signature'],
      digestAlgorithm: 'http://www.w3.org/2000/09/xmldsig#sha1',
      uri: `#${documentoId}`,
    });

    sig.computeSignature(xml, {
      location: { reference: '//*[local-name()="DTE"]', action: 'append' },
    });

    return sig.getSignedXml();
  }

  private emitirMock(datos: DteData): DteResult {
    const mockXml =
      `<?xml version="1.0"?><DTE_MOCK folio="${datos.folio}" tipo="${datos.tipoDoc}" total="${Math.round(datos.montoTotal)}"/>`;
    return {
      folio: datos.folio,
      tipoDoc: datos.tipoDoc,
      rutEmisor: datos.emisor.rut,
      fechaEmision: datos.fechaEmision,
      montoTotal: datos.montoTotal,
      xmlFirmado: mockXml,
      xmlBase64: Buffer.from(mockXml).toString('base64'),
      esMock: true,
    };
  }
}
