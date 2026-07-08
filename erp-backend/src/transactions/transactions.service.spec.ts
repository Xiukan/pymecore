import { BadRequestException, NotFoundException } from '@nestjs/common'
import { Test, TestingModule } from '@nestjs/testing'
import { TipoTransaccion } from '@prisma/client'
import { TransactionsService } from './transactions.service'
import { PrismaService } from '../prisma/prisma.service'
import { SiiIntegrationService } from '../sii/sii-integration.service'

// AUTO-0002: Descuento atómico de stock al registrar una venta
describe('TransactionsService — descuento de stock', () => {
  let service: TransactionsService
  let prisma: jest.Mocked<PrismaService>

  const SUCURSAL_ID = 'sucursal-001'
  const ITEM_ID = 'item-001'
  const ITEM_MOCK = {
    id: ITEM_ID,
    codigoSku: 'ITEM-001',
    nombre: 'Café Molido 250g',
    precioVenta: 3490,
    costoPromedio: 1800,
    afectoIva: true,
    estado: 'Activo',
  }

  const buildDto = (cantidad: number) => ({
    sucursalId: SUCURSAL_ID,
    usuarioId: 'user-001',
    tipoTransaccion: TipoTransaccion.VENTA,
    medioPago: 'Efectivo',
    detalles: [{ itemId: ITEM_ID, cantidad, precioUnitario: 3490 }],
  })

  beforeEach(async () => {
    const txClient = {
      item: { findMany: jest.fn() },
      stockLocal: {
        findUnique: jest.fn(),
        update: jest.fn(),
        create: jest.fn(),
      },
      transaccion: { create: jest.fn() },
    }

    const prismaMock = {
      item: { findMany: jest.fn() },
      folioDisponible: { findFirst: jest.fn(), update: jest.fn() },
      transaccion: { update: jest.fn() },
      $transaction: jest.fn().mockImplementation((cb: (tx: any) => any) => cb(txClient)),
      _txClient: txClient,
    }

    const siiMock = { emitirDTE: jest.fn().mockReturnValue({ folio: 1, tipoDoc: 39 }) }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TransactionsService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: SiiIntegrationService, useValue: siiMock },
      ],
    }).compile()

    service = module.get<TransactionsService>(TransactionsService)
    prisma = module.get(PrismaService)

    // Setup por defecto para item válido
    const tx = (prisma as any)._txClient
    tx.item.findMany.mockResolvedValue([ITEM_MOCK])
    prisma.item.findMany.mockResolvedValue([ITEM_MOCK])
    tx.transaccion.create.mockResolvedValue({
      id: 'tx-001',
      detalles: [],
      montoTotal: 3490,
    })
    prisma.folioDisponible.findFirst.mockResolvedValue({
      id: 'folio-001',
      numero: 1,
      tipoDoc: 39,
      usado: false,
    })
    prisma.folioDisponible.update.mockResolvedValue({})
    prisma.transaccion.update.mockResolvedValue({})
  })

  it('descuenta exactamente las unidades vendidas del stock', async () => {
    const tx = (prisma as any)._txClient
    tx.stockLocal.findUnique.mockResolvedValue({ stockActual: 10 })
    tx.stockLocal.update.mockResolvedValue({ stockActual: 3 })

    await service.create(buildDto(7) as any)

    expect(tx.stockLocal.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { stockActual: { decrement: 7 } },
      }),
    )
  })

  it('lanza BadRequestException cuando el stock es insuficiente', async () => {
    const tx = (prisma as any)._txClient
    tx.stockLocal.findUnique.mockResolvedValue({ stockActual: 3 })

    await expect(service.create(buildDto(5) as any)).rejects.toThrow(BadRequestException)
  })

  it('lanza NotFoundException cuando el ítem no existe o está inactivo', async () => {
    prisma.item.findMany.mockResolvedValue([])
    const tx = (prisma as any)._txClient
    tx.item.findMany.mockResolvedValue([])

    await expect(service.create(buildDto(1) as any)).rejects.toThrow(NotFoundException)
  })

  it('lanza NotFoundException cuando no hay registro de stock para el ítem', async () => {
    const tx = (prisma as any)._txClient
    tx.stockLocal.findUnique.mockResolvedValue(null)

    await expect(service.create(buildDto(1) as any)).rejects.toThrow(NotFoundException)
  })
})
