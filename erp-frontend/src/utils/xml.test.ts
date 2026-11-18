import { describe, expect, it } from 'vitest'
import { leerXml } from './xml'

describe('lectura de XML de DTE', () => {
  it('respeta ISO-8859-1 declarado en el prólogo', async () => {
    const texto = '<?xml version="1.0" encoding="ISO-8859-1"?><RznSoc>COMPAÑÍA</RznSoc>'
    const bytes = Uint8Array.from(texto, (c) => c.charCodeAt(0))
    expect(await leerXml(new File([bytes], 'dte.xml'))).toBe(texto)
  })

  it('sin prólogo asume UTF-8', async () => {
    const texto = '<RznSoc>COMPAÑÍA</RznSoc>'
    expect(await leerXml(new File([new TextEncoder().encode(texto)], 'dte.xml'))).toBe(texto)
  })
})
