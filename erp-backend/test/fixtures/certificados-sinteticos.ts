import * as fs from 'fs'
import * as forge from 'node-forge'
import * as os from 'os'
import * as path from 'path'

/**
 * Certificado (.p12) y CAF de prueba generados al vuelo: las pruebas firman DTE de verdad
 * sin depender del material del SII, que no se versiona (ADR-03). Se crean una vez por máquina.
 */
export function certificadosSinteticos() {
  const dir = path.join(os.tmpdir(), 'pymecore-sii-pruebas')
  const caf = path.join(dir, 'CAF_sintetico.xml')
  const p12 = path.join(dir, 'certificado_sintetico.p12')
  const clave = 'clave-sintetica-de-pruebas'
  if (!fs.existsSync(caf) || !fs.existsSync(p12)) {
    fs.mkdirSync(dir, { recursive: true })
    const llaveCaf = forge.pki.rsa.generateKeyPair({ bits: 1024, e: 0x10001 })
    const b64 = (n: forge.jsbn.BigInteger) => forge.util.encode64(forge.util.hexToBytes(n.toString(16).padStart(2, '0')))
    fs.writeFileSync(
      caf,
      `<?xml version="1.0"?><AUTORIZACION><CAF version="1.0"><DA><RE>76000000-0</RE><RS>PRUEBA</RS><TD>39</TD><RNG><D>1</D><H>100000</H></RNG>` +
        `<FA>2026-01-01</FA><RSAPK><M>${b64((llaveCaf.publicKey as forge.pki.rsa.PublicKey).n)}</M><E>${b64((llaveCaf.publicKey as forge.pki.rsa.PublicKey).e)}</E></RSAPK><IDK>100</IDK></DA>` +
        `<FRMA algoritmo="SHA1withRSA">sintetico</FRMA></CAF><RSASK>${forge.pki.privateKeyToPem(llaveCaf.privateKey)}</RSASK></AUTORIZACION>`,
    )
    const llave = forge.pki.rsa.generateKeyPair({ bits: 1024, e: 0x10001 })
    const cert = forge.pki.createCertificate()
    cert.publicKey = llave.publicKey
    cert.serialNumber = '01'
    cert.validity.notBefore = new Date(Date.now() - 86_400_000)
    cert.validity.notAfter = new Date(Date.now() + 365 * 86_400_000)
    const nombre = [{ name: 'commonName', value: 'PymeCore pruebas' }]
    cert.setSubject(nombre)
    cert.setIssuer(nombre)
    cert.sign(llave.privateKey, forge.md.sha256.create())
    const asn1 = forge.pkcs12.toPkcs12Asn1(llave.privateKey, [cert], clave, { algorithm: '3des' })
    fs.writeFileSync(p12, Buffer.from(forge.asn1.toDer(asn1).getBytes(), 'binary'))
  }
  return { caf, p12, clave }
}
