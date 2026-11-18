import * as forge from 'node-forge'

// Llave de prueba que hace las veces del CAF: el timbre se firma como lo hace el emisor
// (SHA1withRSA sobre el DD). No hay firma XMLDSig: queda como "no verificable".
const llave = forge.pki.rsa.generateKeyPair({ bits: 512, e: 3 })
const b64 = (n: forge.jsbn.BigInteger) => Buffer.from(n.toString(16).padStart(2, '0'), 'hex').toString('base64')

export interface OpcionesDte {
  folio?: string
  tipo?: string
  rutEmisor?: string
  rutReceptor?: string
  razonSocial?: string
  fecha?: string
  totales?: string
  detalle?: string
  referenciaOc?: string
  dd?: (dd: string) => string
  raiz?: 'envio' | 'dte'
}

export function dteSintetico(o: OpcionesDte = {}) {
  const folio = o.folio ?? '1776'
  const rutEmisor = o.rutEmisor ?? '76543210-3'
  const rutReceptor = o.rutReceptor ?? '77094287-K'
  const fecha = o.fecha ?? '2026-08-18'
  const dd =
    `<DD><RE>${rutEmisor}</RE><TD>${o.tipo ?? '33'}</TD><F>${folio}</F><FE>${fecha}</FE><RR>${rutReceptor}</RR>` +
    `<RSR>CLIENTE</RSR><MNT>11900</MNT><IT1>Producto</IT1>` +
    `<CAF version="1.0"><DA><RE>${rutEmisor}</RE><RSAPK><M>${b64(llave.publicKey.n)}</M><E>${b64(llave.publicKey.e)}</E></RSAPK></DA></CAF>` +
    `<TSTED>${fecha}T12:00:00</TSTED></DD>`
  const md = forge.md.sha1.create()
  md.update(dd)
  const frmt = Buffer.from(llave.privateKey.sign(md), 'binary').toString('base64')
  const dte =
    `<DTE xmlns="http://www.sii.cl/SiiDte" version="1.0"><Documento ID="T33F${folio}"><Encabezado>` +
    `<IdDoc><TipoDTE>${o.tipo ?? '33'}</TipoDTE><Folio>${folio}</Folio><FchEmis>${fecha}</FchEmis><FchVenc>2026-09-17</FchVenc></IdDoc>` +
    `<Emisor><RUTEmisor>${rutEmisor}</RUTEmisor><RznSoc>${o.razonSocial ?? 'Proveedor SpA'}</RznSoc><DirOrigen>Calle 1</DirOrigen><CmnaOrigen>Talca</CmnaOrigen></Emisor>` +
    `<Receptor><RUTRecep>${rutReceptor}</RUTRecep></Receptor>` +
    (o.totales ?? `<Totales><MntNeto>10000</MntNeto><TasaIVA>19</TasaIVA><IVA>1900</IVA><MntTotal>11900</MntTotal></Totales>`) +
    `</Encabezado>` +
    (o.detalle ?? `<Detalle><NroLinDet>1</NroLinDet><NmbItem>Producto</NmbItem><QtyItem>10</QtyItem><PrcItem>1000</PrcItem><MontoItem>10000</MontoItem></Detalle>`) +
    `<Referencia><NroLinRef>1</NroLinRef><TpoDocRef>801</TpoDocRef><FolioRef>${o.referenciaOc ?? '42'}</FolioRef></Referencia>` +
    `<TED version="1.0">\n  ${(o.dd ?? ((x) => x))(dd).replace(/></g, '>\n    <')}\n  <FRMT algoritmo="SHA1withRSA">${frmt}</FRMT></TED>` +
    `</Documento></DTE>`
  return o.raiz === 'dte'
    ? `<?xml version="1.0" encoding="ISO-8859-1"?>${dte}`
    : `<?xml version="1.0" encoding="ISO-8859-1"?><EnvioDTE xmlns="http://www.sii.cl/SiiDte" version="1.0"><SetDTE ID="S1">${dte}</SetDTE></EnvioDTE>`
}
