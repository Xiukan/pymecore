import { cuadrarRcv, leerRcv } from './rcv'

const CSV = `Nro;Tipo Doc;Tipo Compra;RUT Proveedor;Razon Social;Folio;Fecha Docto;Fecha Recepcion;Fecha Acuse;Monto Exento;Monto Neto;Monto IVA Recuperable;Monto Iva No Recuperable;Codigo IVA No Rec.;Monto Total
1;33;Del Giro;76543210-3;Proveedor SpA;1776;18/10/2026;19/10/2026 10:00:00;;0;10000;1900;0;;11900
2;33;Del Giro;76111111-6;Otro Ltda;55;20/10/2026;20/10/2026 11:00:00;;0;5000;950;0;;5950
3;61;Del Giro;76543210-3;Proveedor SpA;9;21/10/2026;21/10/2026 11:00:00;;0;100;19;0;;119`

describe('RCV', () => {
  it('lee el detalle del registro de compras del SII', () => {
    const r = leerRcv(CSV)
    expect(r).toHaveLength(3)
    expect(r[0]).toEqual({ tipoDte: 33, rut: '76543210-3', razonSocial: 'Proveedor SpA', folio: '1776', fecha: '2026-10-18', neto: 10000, iva: 1900, total: 11900 })
  })

  it('cuadra contra el libro: faltantes de cada lado y diferencias de monto', () => {
    const rcv = leerRcv(CSV)
    const libro = [
      { tipoDte: 33, rut: '76.543.210-3', razonSocial: 'x', folio: '01776', fecha: '2026-10-18', neto: 10000, iva: 1900, total: 11900 },
      { tipoDte: 33, rut: '76111111-6', razonSocial: 'x', folio: '55', fecha: '2026-10-20', neto: 5000, iva: 950, total: 6000 },
      { tipoDte: 46, rut: '11111111-1', razonSocial: 'Productor', folio: '3', fecha: '2026-10-20', neto: 1, iva: 0, total: 1 },
    ]
    const c = cuadrarRcv(rcv, libro)
    expect(c.cuadrados).toBe(1)
    expect(c.soloEnSii.map((d) => d.folio)).toEqual(['9'])
    expect(c.soloEnSistema.map((d) => d.tipoDte)).toEqual([46])
    expect(c.diferencias.map((d) => [d.folio, d.total, d.totalSistema])).toEqual([['55', 5950, 6000]])
  })

  it('rechaza archivos que no son el RCV', () => {
    expect(() => leerRcv('a;b\n1;2')).toThrow(/Registro de Compras/)
  })
})
