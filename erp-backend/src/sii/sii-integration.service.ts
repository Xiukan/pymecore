import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as forge from 'node-forge';
import { SignedXml } from 'xml-crypto';
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';

export interface DteData {
  folio: number;
  tipoDoc: number;
  rutEmisor: string;
  rutReceptor: string;
  razonSocialReceptor: string;
  fechaEmision: string;
  montoTotal: number;
  primerItem: string;
  detalles: { nombre: string; cantidad: number; precio: number; subtotal: number }[];
}

export interface DteResult {
  folio: number;
  tipoDoc: number;
  rutEmisor: string;
  fechaEmision: string;
  montoTotal: number;
  xmlFirmado: string;
  xmlBase64: string;
}

@Injectable()
export class SiiIntegrationService {
  private readonly logger = new Logger(SiiIntegrationService.name);
  private readonly certsDir = path.join(process.cwd(), 'sii-certs');
  private readonly rutEmisor = '76.000.000-1';
  private readonly p12Password = 'tesis123';

  emitirDTE(datos: DteData): DteResult {
    try {
      const { cafPrivKeyPem, daXml } = this.parseCaf();
      const ted = this.generarTED(datos, cafPrivKeyPem, daXml);
      const dteXml = this.generarXMLDTE(datos, ted);
      const { privateKeyPem, certPem } = this.loadP12();
      const xmlFirmado = this.firmarDTE(dteXml, privateKeyPem, certPem, datos.folio, datos.tipoDoc);

      this.logger.log(`DTE folio ${datos.folio} tipo ${datos.tipoDoc} emitido correctamente`);
      return {
        folio: datos.folio,
        tipoDoc: datos.tipoDoc,
        rutEmisor: datos.rutEmisor,
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
      `<RE>${datos.rutEmisor}</RE>` +
      `<TD>${datos.tipoDoc}</TD>` +
      `<F>${datos.folio}</F>` +
      `<FE>${datos.fechaEmision}</FE>` +
      `<RR>${datos.rutReceptor}</RR>` +
      `<RSR>${datos.razonSocialReceptor.substring(0, 40)}</RSR>` +
      `<MNT>${Math.round(datos.montoTotal)}</MNT>` +
      `<IT1>${datos.primerItem.substring(0, 40)}</IT1>` +
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
          `<NmbItem>${d.nombre}</NmbItem>` +
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
      `<Emisor><RUTEmisor>${datos.rutEmisor}</RUTEmisor><RznSoc>EMPRESA PRUEBA SPA</RznSoc><Giro>TECNOLOGIA</Giro><DirOrigen>AV. TESIS 123</DirOrigen><CmnaOrigen>VILLA ALEGRE</CmnaOrigen></Emisor>` +
      `<Receptor><RUTRecep>${datos.rutReceptor}</RUTRecep><RznSocRecep>${datos.razonSocialReceptor}</RznSocRecep><DirRecep>DIR</DirRecep><CmnaRecep>CMNA</CmnaRecep></Receptor>` +
      `<Totales><MntTotal>${Math.round(datos.montoTotal)}</MntTotal></Totales>` +
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
    const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, this.p12Password);

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
      rutEmisor: datos.rutEmisor,
      fechaEmision: datos.fechaEmision,
      montoTotal: datos.montoTotal,
      xmlFirmado: mockXml,
      xmlBase64: Buffer.from(mockXml).toString('base64'),
    };
  }
}
