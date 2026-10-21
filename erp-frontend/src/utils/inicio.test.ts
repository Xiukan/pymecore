import { describe, expect, it } from 'vitest'
import { pantallaDe, seccionesPara, SECCIONES } from '@/navegacion'
import { accionesPara, frasesDelDia, morosos, saludo } from './inicio'

const rutas = (rol: string) => seccionesPara(rol).flatMap((s) => s.pantallas.map((p) => p.to))

describe('navegación', () => {
  it('el vendedor no ve pantallas de gestión ni de administración', () => {
    const r = rutas('Vendedor')
    expect(r).toContain('/ventas')
    expect(r).not.toContain('/compras')
    expect(r).not.toContain('/libros')
    expect(r).not.toContain('/usuarios')
  })

  it('el encargado ve compras y gastos pero no impuestos ni usuarios', () => {
    const r = rutas('Encargado')
    expect(r).toEqual(expect.arrayContaining(['/compras', '/gastos', '/mermas']))
    expect(r).not.toContain('/libros')
    expect(r).not.toContain('/configuracion')
  })

  it('el administrador ve todo y no quedan secciones vacías para nadie', () => {
    expect(rutas('Administrador')).toHaveLength(SECCIONES.flatMap((s) => s.pantallas).filter((p) => !p.oculta).length)
    for (const rol of ['Administrador', 'Encargado', 'Vendedor'])
      expect(seccionesPara(rol).every((s) => s.pantallas.length > 0)).toBe(true)
  })

  it('cada pantalla explica para qué sirve y cómo se usa', () => {
    for (const p of SECCIONES.flatMap((s) => s.pantallas)) {
      expect(p.descripcion.length).toBeGreaterThan(10)
      expect(p.ayuda.length).toBeGreaterThan(0)
    }
  })

  it('encuentra la pantalla por ruta, incluidas subrutas', () => {
    expect(pantallaDe('/gastos')?.label).toBe('Gastos')
    expect(pantallaDe('/compras/123')?.label).toBe('Compras')
    expect(pantallaDe('/')).toBeUndefined()
  })
})

describe('inicio', () => {
  it('ofrece solo accesos permitidos al rol, con Vender destacado', () => {
    const v = accionesPara('Vendedor').map((a) => a.to)
    expect(v).toContain('/ventas')
    expect(v).not.toContain('/gastos')
    expect(accionesPara('Administrador').find((a) => a.principal)?.to).toBe('/ventas')
  })

  it('saluda según la hora', () => {
    expect(saludo(8)).toBe('Buenos días')
    expect(saludo(15)).toBe('Buenas tardes')
    expect(saludo(22)).toBe('Buenas noches')
  })

  it('avisa caja cerrada, productos por acabarse y día en pérdida', () => {
    const f = frasesDelDia({ kpis: { numVentas: 3, resultado: -1500 }, caja: null, alertas: 2 })
    expect(f.map((x) => x.texto)).toEqual([
      'La caja está cerrada. Ábrela para empezar a vender.',
      '2 productos se están acabando.',
      'Por ahora el día va en pérdida (-$1.500), contando gastos y mermas.',
    ])
    expect(f.every((x) => x.tono === 'alerta')).toBe(true)
  })

  it('con caja abierta y ganancia todo es informativo; mientras carga no dice nada de la caja', () => {
    const f = frasesDelDia({ kpis: { numVentas: 1, resultado: 2000 }, caja: { montoApertura: '10000' }, alertas: 0 })
    expect(f.map((x) => x.texto)).toEqual([
      'La caja está abierta (partió con $10.000).',
      'Después de gastos y mermas, el día va ganando $2.000.',
    ])
    expect(frasesDelDia({ kpis: { numVentas: 0, resultado: 0 }, caja: undefined, alertas: 1 }).map((x) => x.texto)).toEqual([
      '1 producto se está acabando.',
      'Todavía no hay ventas hoy.',
    ])
  })

  it('avisa lotes por vencer con enlace a la pantalla de lotes', () => {
    const f = frasesDelDia({ kpis: null, caja: undefined, alertas: 0, lotesPorVencer: 2 })
    expect(f).toEqual([{ texto: '2 lotes vencen en los próximos 30 días o ya vencieron.', tono: 'alerta', to: '/lotes', accion: 'Ver lotes' }])
  })

  it('los módulos apagados desaparecen del menú y del inicio; las pantallas base siempre están', () => {
    const r = seccionesPara('Administrador', ['contabilidad']).flatMap((s) => s.pantallas.map((p) => p.to))
    expect(r).toContain('/contabilidad')
    expect(r).toContain('/ventas')
    expect(r).not.toContain('/campo')
    expect(r).not.toContain('/productores')
    expect(r).not.toContain('/conteo')
    expect(seccionesPara('Administrador', ['campo']).flatMap((s) => s.pantallas.map((p) => p.to))).toContain('/lotes')
    expect(pantallaDe('/conteo')?.label).toBe('Conteo físico')
  })

  it('cuenta clientes con documentos vencidos y avisa para cobrar', () => {
    const m = morosos([
      { documentos: [{ vencimiento: '2026-10-01', saldo: '1000' }, { vencimiento: '2026-11-01', saldo: '500' }] },
      { documentos: [{ vencimiento: '2026-12-01', saldo: '9000' }] },
    ], '2026-10-21')
    expect(m).toEqual({ cantidad: 1, monto: 1000 })
    expect(frasesDelDia({ kpis: null, caja: undefined, alertas: 0, clientesMorosos: m })[0]).toMatchObject({ texto: '1 cliente tiene pagos atrasados por $1.000.', to: '/cuentas' })
  })
})
