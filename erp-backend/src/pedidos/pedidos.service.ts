import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { EstadoPedido, Prisma } from '@prisma/client';
import { esAdmin, exigirSucursal, sucursalDe, UsuarioSesion } from '../auth/sucursal-scope';
import { EmpresaService } from '../empresa/empresa.service';
import { preciosVigentes } from '../precios/precios';
import { PrismaService } from '../prisma/prisma.service';
import { TransactionsService } from '../transactions/transactions.service';
import { calcularDocumento } from '../utils/money.util';
import { CreatePedidoDto, VenderPedidoDto } from './dto/pedidos.dto';

const INCLUDE = {
  entidad: { select: { id: true, rut: true, nombreRazonSocial: true, direccion: true, email: true, telefono: true } },
  sucursal: { select: { nombre: true } },
  usuario: { select: { nombreCompleto: true } },
  detalles: { include: { item: { select: { nombre: true, codigoSku: true, unidadMedida: true } } } },
  transaccion: { select: { id: true, numeroFactura: true } },
} satisfies Prisma.PedidoInclude;

@Injectable()
export class PedidosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly empresa: EmpresaService,
    private readonly ventas: TransactionsService,
  ) {}

  async crear(dto: CreatePedidoDto, user: UsuarioSesion) {
    if (!esAdmin(user) && dto.sucursalId !== user.sucursalId) throw new ForbiddenException('Solo puedes cotizar en tu sucursal.');
    if (new Set(dto.detalles.map((d) => d.itemId)).size !== dto.detalles.length) throw new BadRequestException('El pedido repite un producto.');
    const cliente = await this.prisma.entidad.findUnique({ where: { id: dto.entidadId } });
    if (!cliente || cliente.tipoEntidad !== 'CLIENTE') throw new BadRequestException('Elige un cliente.');
    const items = await this.prisma.item.findMany({ where: { id: { in: dto.detalles.map((d) => d.itemId) }, estado: 'Activo' } });
    if (items.length !== dto.detalles.length) throw new BadRequestException('Algún producto no existe o está inactivo.');
    const precios = await preciosVigentes(this.prisma, items, cliente.id);
    const { tasaIva } = await this.empresa.get();
    const lineas = dto.detalles.map((d) => ({ ...d, item: items.find((i) => i.id === d.itemId)!, precio: precios.get(d.itemId)! }));
    const calculo = calcularDocumento(
      lineas.map((l) => ({ cantidad: l.cantidad, precioUnitario: l.precio, descuentoLinea: 0, afectoIva: l.item.afectoIva })),
      0,
      tasaIva,
    );
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('pedidos_folio'))`;
      const ultimo = await tx.pedido.findFirst({ orderBy: { folio: 'desc' }, select: { folio: true } });
      return tx.pedido.create({
        data: {
          folio: (ultimo?.folio ?? 0) + 1,
          entidadId: cliente.id,
          sucursalId: dto.sucursalId,
          usuarioId: user.id,
          estado: dto.confirmado ? 'PEDIDO' : 'COTIZACION',
          validoHasta: dto.validoHasta ? new Date(dto.validoHasta) : null,
          fechaEntrega: dto.fechaEntrega ? new Date(dto.fechaEntrega) : null,
          observaciones: dto.observaciones,
          total: calculo.montoTotal,
          detalles: {
            createMany: { data: lineas.map((l, i) => ({ itemId: l.itemId, cantidad: l.cantidad, precioUnitario: l.precio, subtotal: calculo.detalle[i].subtotal })) },
          },
        },
        include: INCLUDE,
      });
    });
  }

  listar(user: UsuarioSesion, estado?: string, sucursalId?: string) {
    const sucursal = sucursalDe(user, sucursalId);
    return this.prisma.pedido.findMany({
      where: { ...(sucursal && { sucursalId: sucursal }), ...(Object.values(EstadoPedido).includes(estado as EstadoPedido) && { estado: estado as EstadoPedido }) },
      include: INCLUDE,
      orderBy: { folio: 'desc' },
      take: 300,
    });
  }

  async obtener(id: string, user: UsuarioSesion) {
    const p = await this.prisma.pedido.findUnique({ where: { id }, include: INCLUDE });
    if (!p) throw new NotFoundException('Pedido no encontrado');
    exigirSucursal(user, p.sucursalId);
    return p;
  }

  private async cambiar(id: string, user: UsuarioSesion, desde: EstadoPedido[], hacia: EstadoPedido, mensaje: string) {
    const p = await this.obtener(id, user);
    const { count } = await this.prisma.pedido.updateMany({ where: { id: p.id, estado: { in: desde } }, data: { estado: hacia } });
    if (count !== 1) throw new BadRequestException(mensaje);
    return this.obtener(id, user);
  }

  confirmar(id: string, user: UsuarioSesion) {
    return this.cambiar(id, user, ['COTIZACION'], 'PEDIDO', 'Solo una cotización se confirma.');
  }

  anular(id: string, user: UsuarioSesion) {
    return this.cambiar(id, user, ['COTIZACION', 'PEDIDO'], 'ANULADO', 'El pedido ya se vendió o está anulado.');
  }

  /**
   * Emite la venta con los precios vigentes de hoy (si cambiaron desde la cotización, se cobra
   * el actual). El pedido se reserva antes para que dos cajeros no lo vendan a la vez.
   */
  async vender(id: string, dto: VenderPedidoDto, user: UsuarioSesion) {
    const p = await this.obtener(id, user);
    const { count } = await this.prisma.pedido.updateMany({ where: { id, estado: { in: ['COTIZACION', 'PEDIDO'] } }, data: { estado: 'VENDIDO' } });
    if (count !== 1) throw new BadRequestException('El pedido ya se vendió o está anulado.');
    try {
      const venta = await this.ventas.create(
        {
          sucursalId: p.sucursalId,
          entidadId: p.entidadId,
          tipoTransaccion: 'VENTA',
          medioPago: dto.medioPago,
          tipoDocumento: dto.tipoDocumento ?? 33,
          rutReceptor: p.entidad.rut,
          razonSocialReceptor: p.entidad.nombreRazonSocial,
          observaciones: `Pedido N° ${p.folio}`,
          detalles: p.detalles.map((d) => ({ itemId: d.itemId, cantidad: Number(d.cantidad) })),
        },
        user.id,
        undefined,
        user.rol,
      );
      await this.prisma.pedido.update({ where: { id }, data: { transaccionId: venta.id } });
      return { pedido: await this.obtener(id, user), venta };
    } catch (e) {
      await this.prisma.pedido.update({ where: { id }, data: { estado: p.estado } });
      throw e;
    }
  }
}
