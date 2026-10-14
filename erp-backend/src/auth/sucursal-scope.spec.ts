import { ForbiddenException, NotFoundException } from '@nestjs/common'
import { exigirSucursal, sucursalDe } from './sucursal-scope'

const admin = { id: 'a', rol: 'Administrador', sucursalId: null }
const vendedor = { id: 'v', rol: 'Vendedor', sucursalId: 'suc-a' }

describe('alcance por sucursal', () => {
  it('el administrador consulta cualquier sucursal', () => {
    expect(sucursalDe(admin, 'suc-b')).toBe('suc-b')
    expect(() => exigirSucursal(admin, 'suc-b')).not.toThrow()
  })

  it('el resto queda fijo en su sucursal aunque pida otra', () => {
    expect(sucursalDe(vendedor, 'suc-b')).toBe('suc-a')
    expect(() => exigirSucursal(vendedor, 'suc-b')).toThrow(NotFoundException)
    expect(() => exigirSucursal(vendedor, 'suc-b', 'suc-a')).not.toThrow()
  })

  it('un usuario sin sucursal no consulta nada', () => {
    expect(() => sucursalDe({ ...vendedor, sucursalId: null })).toThrow(ForbiddenException)
  })
})
