import { ServiceUnavailableException } from '@nestjs/common'
import { AppController } from './app.controller'

describe('health', () => {
  it('responde ok cuando la base contesta', async () => {
    const prisma = { $queryRaw: jest.fn().mockResolvedValue([1]) }
    await expect(new AppController(prisma as any).health()).resolves.toEqual({ status: 'ok' })
  })

  it('responde 503 cuando la base no contesta', async () => {
    const prisma = { $queryRaw: jest.fn().mockRejectedValue(new Error('down')) }
    await expect(new AppController(prisma as any).health()).rejects.toThrow(ServiceUnavailableException)
  })
})
