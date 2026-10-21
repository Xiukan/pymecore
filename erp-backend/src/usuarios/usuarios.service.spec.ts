import { BadRequestException } from '@nestjs/common'
import { UsuariosService } from './usuarios.service'

describe('último administrador', () => {
  const admin = { id: 'a1', rol: 'Administrador', estado: 'Activo' }
  const crear = (otrosAdmins: number) => {
    const prisma = {
      usuario: {
        findUnique: jest.fn().mockResolvedValue(admin),
        count: jest.fn().mockResolvedValue(otrosAdmins),
        update: jest.fn().mockResolvedValue(admin),
      },
    }
    return { service: new UsuariosService(prisma as any), prisma }
  }

  it('no se puede desactivar, degradar ni eliminar si es el único', async () => {
    const { service, prisma } = crear(0)
    await expect(service.update('a1', { estado: 'Inactivo' })).rejects.toThrow(BadRequestException)
    await expect(service.update('a1', { rol: 'Vendedor' })).rejects.toThrow(BadRequestException)
    await expect(service.remove('a1')).rejects.toThrow(BadRequestException)
    expect(prisma.usuario.update).not.toHaveBeenCalled()
  })

  it('sí se puede si hay otro administrador activo, y otros cambios no se bloquean', async () => {
    const { service, prisma } = crear(1)
    await service.update('a1', { estado: 'Inactivo' })
    expect(prisma.usuario.update).toHaveBeenCalled()
    const solo = crear(0)
    await solo.service.update('a1', { nombreCompleto: 'Nuevo nombre' })
    expect(solo.prisma.usuario.update).toHaveBeenCalled()
  })
})
