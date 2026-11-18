import { BadRequestException } from '@nestjs/common'
import { leerDteRecibido, normalizarRut } from './dte-recibido'
import { dteSintetico as dteXml } from '../../test/fixtures/dte-sintetico'

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
