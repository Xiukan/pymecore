import { BadRequestException } from '@nestjs/common'
import * as forge from 'node-forge'
import { leerDteRecibido, normalizarRut } from './dte-recibido'

// Llave de prueba que hace las veces del CAF: el timbre se firma igual que el SII (SHA1withRSA sobre el DD).
const llave = forge.pki.rsa.generateKeyPair({ bits: 512, e: 3 })
const b64 = (n: forge.jsbn.BigInteger) => Buffer.from(n.toString(16).padStart(2, '0'), 'hex').toString('base64')

function dteXml(opts: { totales?: string; detalle?: string; dd?: (dd: string) => string; tipo?: string; raiz?: 'envio' | 'dte' } = {}) {
  const dd =
    `<DD><RE>76543210-3</RE><TD>33</TD><F>1776</F><FE>2026-08-18</FE><RR>77094287-K</RR>` +
    `<RSR>CLIENTE</RSR><MNT>11900</MNT><IT1>Producto</IT1>` +
    `<CAF version="1.0"><DA><RE>76543210-3</RE><RSAPK><M>${b64(llave.publicKey.n)}</M><E>${b64(llave.publicKey.e)}</E></RSAPK></DA></CAF>` +
    `<TSTED>2026-08-18T12:00:00</TSTED></DD>`
  const md = forge.md.sha1.create()
  md.update(dd)
  const frmt = Buffer.from(llave.privateKey.sign(md), 'binary').toString('base64')
  const dte =
    `<DTE xmlns="http://www.sii.cl/SiiDte" version="1.0"><Documento ID="T33F1776"><Encabezado>` +
    `<IdDoc><TipoDTE>${opts.tipo ?? '33'}</TipoDTE><Folio>1776</Folio><FchEmis>2026-08-18</FchEmis><FchVenc>2026-09-17</FchVenc></IdDoc>` +
    `<Emisor><RUTEmisor>76543210-3</RUTEmisor><RznSoc>Proveedor SpA</RznSoc><DirOrigen>Calle 1</DirOrigen><CmnaOrigen>Talca</CmnaOrigen></Emisor>` +
    `<Receptor><RUTRecep>77094287-K</RUTRecep></Receptor>` +
    (opts.totales ?? `<Totales><MntNeto>10000</MntNeto><TasaIVA>19</TasaIVA><IVA>1900</IVA><MntTotal>11900</MntTotal></Totales>`) +
    `</Encabezado>` +
    (opts.detalle ?? `<Detalle><NroLinDet>1</NroLinDet><NmbItem>Producto</NmbItem><QtyItem>10</QtyItem><PrcItem>1000</PrcItem><MontoItem>10000</MontoItem></Detalle>`) +
    `<Referencia><NroLinRef>1</NroLinRef><TpoDocRef>801</TpoDocRef><FolioRef>42</FolioRef></Referencia>` +
    `<TED version="1.0">\n  ${(opts.dd ?? ((x) => x))(dd).replace(/></g, '>\n    <')}\n  <FRMT algoritmo="SHA1withRSA">${frmt}</FRMT></TED>` +
    `</Documento></DTE>`
  return opts.raiz === 'dte'
    ? `<?xml version="1.0" encoding="ISO-8859-1"?>${dte}`
    : `<?xml version="1.0" encoding="ISO-8859-1"?><EnvioDTE xmlns="http://www.sii.cl/SiiDte" version="1.0"><SetDTE ID="S1">${dte}</SetDTE></EnvioDTE>`
}

describe('DTE recibido', () => {
  it('lee un EnvioDTE: cabecera, totales, detalle y referencia a la OC', () => {
    const d = leerDteRecibido(dteXml())
    expect(d).toMatchObject({ tipoDte: 33, folio: '1776', fechaEmision: '2026-08-18', fechaVencimiento: '2026-09-17', rutReceptor: '77094287-K', referenciaOc: '42' })
    expect(d.emisor).toMatchObject({ rut: '76543210-3', razonSocial: 'Proveedor SpA' })
    expect(d.montoTotal.toString()).toBe('11900')
    expect(d.lineas[0]).toMatchObject({ nombre: 'Producto', cantidad: '10', precio: '1000', monto: '10000' })
  })

  it('acepta también un DTE suelto', () => {
    expect(leerDteRecibido(dteXml({ raiz: 'dte' })).folio).toBe('1776')
  })

  it('verifica el timbre con la llave del CAF aunque el XML venga indentado', () => {
    const d = leerDteRecibido(dteXml())
    expect(d.timbreValido).toBe(true)
    expect(d.observaciones.some((o) => o.includes('timbre'))).toBe(false)
  })

  it('detecta un timbre alterado', () => {
    const d = leerDteRecibido(dteXml({ dd: (dd) => dd.replace('<MNT>11900</MNT>', '<MNT>99999</MNT>') }))
    expect(d.timbreValido).toBe(false)
    expect(d.observaciones.some((o) => o.includes('timbre'))).toBe(true)
  })

  it('sin firma XMLDSig queda observada, no rechazada', () => {
    const d = leerDteRecibido(dteXml())
    expect(d.firmaValida).toBe(false)
    expect(d.observaciones.some((o) => o.includes('firma digital'))).toBe(true)
  })

  it('observa totales e IVA que no cuadran y líneas de resumen', () => {
    const d = leerDteRecibido(
      dteXml({
        totales: `<Totales><MntNeto>10000</MntNeto><TasaIVA>19</TasaIVA><IVA>1800</IVA><ImptoReten><TipoImp>28</TipoImp><MontoImp>1</MontoImp></ImptoReten><MntTotal>11000</MntTotal></Totales>`,
        detalle: `<Detalle><NroLinDet>1</NroLinDet><NmbItem>A</NmbItem><MontoItem>10000</MontoItem></Detalle><Detalle><NroLinDet>2</NroLinDet><NmbItem>TOTAL</NmbItem><MontoItem>11000</MontoItem></Detalle>`,
      }),
    )
    expect(d.otrosImpuestos).toEqual([{ tipo: '28', tasa: undefined, monto: '1' }])
    expect(d.observaciones.join(' ')).toMatch(/IVA informado \(1800\)/)
    expect(d.observaciones.join(' ')).toMatch(/impuestos específicos/)
    expect(d.observaciones.join(' ')).toMatch(/Las líneas suman 21000/)
  })

  it('rechaza lo que no es un DTE soportado', () => {
    expect(() => leerDteRecibido('<x>')).toThrow(BadRequestException)
    expect(() => leerDteRecibido('<?xml version="1.0"?><Otro/>')).toThrow(BadRequestException)
    expect(() => leerDteRecibido(dteXml({ tipo: '52' }))).toThrow(/no soportado/)
    expect(() => leerDteRecibido(dteXml({ totales: '<Totales><MntNeto>1</MntNeto></Totales>' }))).toThrow(/MntTotal/)
    expect(() => leerDteRecibido('x'.repeat(600 * 1024))).toThrow(/tamaño/)
  })

  it('normaliza el RUT para comparar receptor y proveedor', () => {
    expect(normalizarRut('77.094.287-k')).toBe('77094287-K')
  })
})
