import { resumenMermas, vendidaEnAlerta } from './mermas'

const m = (fecha: string, itemId: string, cantidad: number, valor: number) => ({ fecha, itemId, nombre: itemId, cantidad, valor })

describe('mermas por vencimiento (PBI-06, H-01)', () => {
  it('suma perdido y salvado por producto y por mes, y la tasa de pérdida', () => {
    const r = resumenMermas([m('2026-10-05', 'semilla', 2, 3000), m('2026-11-02', 'semilla', 1, 1500)], [m('2026-11-01', 'semilla', 4, 6000), m('2026-11-03', 'abono', 1, 1500)])
    expect([r.perdido, r.salvado, r.tasaPerdida]).toEqual([4500, 7500, 37.5])
    expect(r.porProducto[0]).toMatchObject({ itemId: 'semilla', perdido: 4500, unidadesPerdidas: 3, salvado: 6000, unidadesSalvadas: 4 })
    expect(r.porMes).toEqual([{ mes: '2026-10', perdido: 3000, salvado: 0 }, { mes: '2026-11', perdido: 1500, salvado: 7500 }])
  })

  it('sin movimientos no hay tasa (no se inventa una cifra)', () => {
    expect(resumenMermas([], []).tasaPerdida).toBeNull()
  })

  it('cuenta como salvada solo la venta dentro de la ventana de alerta', () => {
    expect(vendidaEnAlerta('2026-11-15', '2026-11-17', 3)).toBe(true)
    expect(vendidaEnAlerta('2026-11-17', '2026-11-17', 3)).toBe(true)
    expect(vendidaEnAlerta('2026-11-10', '2026-11-17', 3)).toBe(false)
    expect(vendidaEnAlerta('2026-11-18', '2026-11-17', 3)).toBe(false)
  })
})
