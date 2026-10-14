import { BadRequestException, NotFoundException } from '@nestjs/common'
import { Test, TestingModule } from '@nestjs/testing'
import { Prisma, TipoTransaccion } from '@prisma/client'
import { TransactionsService } from './transactions.service'
import { PrismaService } from '../prisma/prisma.service'
import { SiiIntegrationService } from '../sii/sii-integration.service'

const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v)

// AUTO-0002: Descuento atómico de stock al registrar una venta
describe('TransactionsService', () => {
  let service: TransactionsService
  let tx: any
  let prisma: any

  const SUCURSAL_ID = 'sucursal-001'
  const ITEM_ID = 'item-001'
  const ITEM_MOCK = {
    id: ITEM_ID,
    codigoSku: 'ITEM-001',
    nombre: 'Café Molido 250g',
    precioVenta: D(3490),
    costoPromedio: D(1800),
    afectoIva: true,
    estado: 'Activo',
  }

  const buildDto = (cantidad: number, extra: Record<string, unknown> = {}) => ({
    sucursalId: SUCURSAL_ID,
    tipoTransaccion: TipoTransaccion.VENTA,
    medioPago: 'Efectivo',
    detalles: [{ itemId: ITEM_ID, cantidad, precioUnitario: 3490 }],
    ...extra,
  })

  beforeEach(async () => {
    tx = {
      oferta: { findMany: jest.fn().mockResolvedValue([]) },
      stockLocal: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUnique: jest.fn(),
        upsert: jest.fn(),
      },
      transaccion: {
        create: jest.fn().mockImplementation(({ data }) => ({
          id: 'tx-001',
          ...data,
          detalles: data.detalles.createMany.data,
        })),
        update: jest.fn(),
        findUnique: jest.fn(),
      },
      transaccionDetalle: { groupBy: jest.fn().mockResolvedValue([]) },
      $queryRaw: jest.fn().mockResolvedValue([{ numero: 1 }]),
    }
    prisma = {
      item: { findMany: jest.fn().mockResolvedValue([ITEM_MOCK]) },
      transaccion: { update: jest.fn() },
      $transaction: jest.fn().mockImplementation((cb: (t: any) => any) => cb(tx)),
    }
    const siiMock = { emitirDTE: jest.fn().mockReturnValue({ folio: 1, tipoDoc: 39 }) }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TransactionsService,
        { provide: PrismaService, useValue: prisma },
        { provide: SiiIntegrationService, useValue: siiMock },
      ],
    }).compile()
    service = module.get(TransactionsService)
  })

  it('descuenta stock con una actualización condicionada a que alcance', async () => {
    await service.create(buildDto(7) as any, 'user-001')

    expect(tx.stockLocal.updateMany).toHaveBeenCalledWith({
      where: { sucursalId: SUCURSAL_ID, itemId: ITEM_ID, stockActual: { gte: D(7) } },
      data: { stockActual: { decrement: D(7) } },
    })
  })

  it('lanza BadRequestException cuando el stock es insuficiente', async () => {
    tx.stockLocal.updateMany.mockResolvedValue({ count: 0 })
    tx.stockLocal.findUnique.mockResolvedValue({ stockActual: D(3) })

    await expect(service.create(buildDto(5) as any, 'user-001')).rejects.toThrow(BadRequestException)
  })

  it('lanza NotFoundException cuando el ítem no existe o está inactivo', async () => {
    prisma.item.findMany.mockResolvedValue([])

    await expect(service.create(buildDto(1) as any, 'user-001')).rejects.toThrow(NotFoundException)
  })

  it('lanza NotFoundException cuando no hay registro de stock para el ítem', async () => {
    tx.stockLocal.updateMany.mockResolvedValue({ count: 0 })
    tx.stockLocal.findUnique.mockResolvedValue(null)

    await expect(service.create(buildDto(1) as any, 'user-001')).rejects.toThrow(NotFoundException)
  })

  it('rechaza un precio distinto al vigente del servidor', async () => {
    const dto = buildDto(1, { detalles: [{ itemId: ITEM_ID, cantidad: 1, precioUnitario: 1 }] })

    await expect(service.create(dto as any, 'user-001')).rejects.toThrow(BadRequestException)
    expect(tx.transaccion.create).not.toHaveBeenCalled()
  })

  it('aplica la oferta vigente más baja', async () => {
    tx.oferta.findMany.mockResolvedValue([
      { itemId: ITEM_ID, precioOferta: D(3200) },
      { itemId: ITEM_ID, precioOferta: D(2990) },
    ])
    const venta: any = await service.create(
      buildDto(2, { detalles: [{ itemId: ITEM_ID, cantidad: 2, precioUnitario: 2990 }] }) as any,
      'user-001',
    )

    expect(venta.montoTotal).toEqual(D(5980))
  })

  it('registra el usuario del token, no el del cuerpo', async () => {
    await service.create(buildDto(1, { usuarioId: 'otro' }) as any, 'user-001')

    expect(tx.transaccion.create.mock.calls[0][0].data.usuarioId).toBe('user-001')
  })

  it('guarda montos en pesos enteros con IVA incluido en el precio', async () => {
    const venta: any = await service.create(buildDto(3) as any, 'user-001')
    const [linea] = venta.detalles

    expect(venta.montoTotal).toEqual(D(10470))
    expect(linea.subtotal).toEqual(D(10470))
    expect(linea.montoIva).toEqual(D(1672))
    expect(venta.sincronizacion).toBe('PENDIENTE')
  })

  it('rechaza un descuento global mayor al total', async () => {
    await expect(
      service.create(buildDto(1, { descuentoGlobal: 100000 }) as any, 'user-001'),
    ).rejects.toThrow(BadRequestException)
  })

  describe('devoluciones y notas de crédito', () => {
    const origen = {
      id: 'venta-1',
      tipoTransaccion: TipoTransaccion.VENTA,
      estado: 'Activa',
      sucursalId: SUCURSAL_ID,
      detalles: [
        {
          itemId: ITEM_ID,
          cantidad: D(3),
          precioUnitario: D(3490),
          costoUnitario: D(1800),
          descuentoLinea: D(0),
          montoIva: D(1672),
          subtotal: D(10470),
        },
      ],
    }
    const devolucion = (cantidad: number, extra: Record<string, unknown> = {}) => ({
      sucursalId: SUCURSAL_ID,
      tipoTransaccion: TipoTransaccion.NOTA_CREDITO,
      transaccionOrigenId: 'venta-1',
      detalles: [{ itemId: ITEM_ID, cantidad }],
      ...extra,
    })

    beforeEach(() => tx.transaccion.findUnique.mockResolvedValue(origen))

    it('exige la venta de origen', async () => {
      await expect(
        service.create(devolucion(1, { transaccionOrigenId: undefined }) as any, 'user-001'),
      ).rejects.toThrow(BadRequestException)
    })

    it('valoriza con la línea original y repone stock', async () => {
      const nc: any = await service.create(devolucion(1) as any, 'user-001')

      expect(nc.montoTotal).toEqual(D(3490))
      expect(tx.stockLocal.upsert).toHaveBeenCalled()
    })

    it('no permite devolver más de lo vendido menos lo ya devuelto', async () => {
      tx.transaccionDetalle.groupBy.mockResolvedValue([
        { itemId: ITEM_ID, _sum: { cantidad: D(2), subtotal: D(6980), montoIva: D(1114) } },
      ])

      await expect(service.create(devolucion(2) as any, 'user-001')).rejects.toThrow(BadRequestException)
    })

    it('la última unidad devuelve el remanente exacto del monto', async () => {
      tx.transaccionDetalle.groupBy.mockResolvedValue([
        { itemId: ITEM_ID, _sum: { cantidad: D(2), subtotal: D(6980), montoIva: D(1114) } },
      ])
      const nc: any = await service.create(devolucion(1) as any, 'user-001')

      expect(nc.detalles[0].subtotal).toEqual(D(3490))
      expect(nc.detalles[0].montoIva).toEqual(D(558))
    })

    it('rechaza ítems que no estaban en la venta', async () => {
      tx.transaccion.findUnique.mockResolvedValue({ ...origen, detalles: [] })

      await expect(service.create(devolucion(1) as any, 'user-001')).rejects.toThrow(BadRequestException)
    })
  })
})
