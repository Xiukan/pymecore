import { dteDeVenta, enviarAlSiiSimulado } from './sii-gateway'

const base = { folio: 10, tipoDoc: 39, rutReceptor: '66666666-6', montoTotal: 3490, firmado: true }

describe('SII simulado (AC-04)', () => {
  it('acepta un DTE válido', () => {
    expect(enviarAlSiiSimulado(base).estado).toBe('ACEPTADO')
  })

  it('rechaza RUT receptor inválido, sin folio, sin firma o monto cero, con glosa', () => {
    expect(enviarAlSiiSimulado({ ...base, rutReceptor: '12345678-9' })).toEqual({ estado: 'RECHAZADO', glosa: 'RUT receptor inválido (12345678-9)' })
    expect(enviarAlSiiSimulado({ ...base, folio: null }).estado).toBe('RECHAZADO')
    expect(enviarAlSiiSimulado({ ...base, firmado: false }).estado).toBe('RECHAZADO')
    expect(enviarAlSiiSimulado({ ...base, montoTotal: 0 }).estado).toBe('RECHAZADO')
  })

  it('arma el DTE desde la venta timbrada', () => {
    expect(dteDeVenta({ numeroFactura: '7', montoTotal: '1000', metadatosSii: { tipoDoc: 33, rutReceptor: '12.345.678-5', xmlFirmado: '<DTE/>' } }, '66666666-6'))
      .toEqual({ folio: 7, tipoDoc: 33, rutReceptor: '12345678-5', montoTotal: 1000, firmado: true })
    expect(dteDeVenta({ numeroFactura: null, montoTotal: 1, metadatosSii: { esMock: true, xmlFirmado: '<DTE_MOCK/>' } }, '66666666-6').firmado).toBe(false)
  })
})
