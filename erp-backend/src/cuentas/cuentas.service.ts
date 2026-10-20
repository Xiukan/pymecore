import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CajaService } from '../caja/caja.service';
import { exigirSucursal, sucursalDe, UsuarioSesion } from '../auth/sucursal-scope';
import { PrismaService } from '../prisma/prisma.service';
import { TX_OPCIONES } from '../utils/transacciones';
import { sumarDias, sumarPorTramo } from './antiguedad';
import { AbonoDto, PagoProveedorDto } from './dto/cuentas.dto';

type Db = Prisma.TransactionClient | PrismaService;
const D = Prisma.Decimal;

export interface DocumentoPorCobrar {
  transaccionId: string;
  folio: string | null;
  fecha: Date;
  vencimiento: Date;
  total: Prisma.Decimal;
  saldo: Prisma.Decimal;
  cliente: { id: string | null; rut?: string; nombre?: string };
}

@Injectable()
export class CuentasService {
  constructor(private readonly prisma: PrismaService) {}

  /** Saldo de una venta a crédito: total − abonos vigentes − devoluciones imputadas a la deuda. */
  static async saldoVenta(db: Db, transaccionId: string) {
    const venta = await db.transaccion.findUniqueOrThrow({ where: { id: transaccionId } });
    const [abonos, rebajas] = await Promise.all([
      db.abonoCliente.aggregate({ where: { transaccionId, estado: 'VIGENTE' }, _sum: { monto: true } }),
      db.transaccion.aggregate({
        where: { transaccionOrigenId: transaccionId, estado: 'Activa', medioPago: 'Credito', tipoTransaccion: { in: ['DEVOLUCION', 'NOTA_CREDITO'] } },
        _sum: { montoTotal: true },
      }),
    ]);
    return venta.montoTotal.sub(abonos._sum.monto ?? 0).sub(rebajas._sum.montoTotal ?? 0);
  }

  /** Deuda vigente del cliente: suma de saldos de sus ventas a crédito activas. */
  static async deudaCliente(db: Db, entidadId: string) {
    const ventas = await db.transaccion.findMany({
      where: { entidadId, medioPago: 'Credito', tipoTransaccion: 'VENTA', estado: 'Activa' },
      select: { id: true },
    });
    let deuda = new D(0);
    for (const v of ventas) deuda = deuda.add(await CuentasService.saldoVenta(db, v.id));
    return deuda;
  }

  /** Documentos con saldo, por cliente, con su tramo de antigüedad. */
  async porCobrar(user: UsuarioSesion, sucursalId?: string) {
    const sucursal = sucursalDe(user, sucursalId);
    const ventas = await this.prisma.transaccion.findMany({
      where: { medioPago: 'Credito', tipoTransaccion: 'VENTA', estado: 'Activa', ...(sucursal && { sucursalId: sucursal }) },
      include: { entidad: true },
      orderBy: { fechaRegistro: 'asc' },
    });
    const hoy = new Date();
    const documentos: DocumentoPorCobrar[] = [];
    for (const v of ventas) {
      const saldo = await CuentasService.saldoVenta(this.prisma, v.id);
      if (saldo.lte(0)) continue;
      const vencimiento = sumarDias(v.fechaRegistro, v.entidad?.diasCredito ?? 0);
      documentos.push({
        transaccionId: v.id,
        folio: v.numeroFactura,
        fecha: v.fechaRegistro,
        vencimiento,
        total: v.montoTotal,
        saldo,
        cliente: { id: v.entidadId, rut: v.entidad?.rut, nombre: v.entidad?.nombreRazonSocial },
      });
    }
    const clientes = new Map<string, { cliente: DocumentoPorCobrar['cliente']; documentos: DocumentoPorCobrar[] }>();
    for (const d of documentos) {
      const c = clientes.get(d.cliente.id!) ?? { cliente: d.cliente, documentos: [] };
      c.documentos.push(d);
      clientes.set(d.cliente.id!, c);
    }
    return {
      porTramo: sumarPorTramo(documentos, hoy),
      clientes: [...clientes.values()].map((c) => ({
        ...c,
        saldo: c.documentos.reduce((s, d) => s.add(d.saldo), new D(0)),
        porTramo: sumarPorTramo(c.documentos, hoy),
      })),
    };
  }

  async abonar(dto: AbonoDto, user: UsuarioSesion) {
    return this.prisma.$transaction(async (tx) => {
      // Bloquea la venta: dos abonos simultáneos no pueden superar el saldo.
      await tx.$queryRaw`SELECT id FROM transacciones WHERE id = ${dto.transaccionId}::uuid FOR UPDATE`;
      const venta = await tx.transaccion.findUnique({ where: { id: dto.transaccionId } });
      if (!venta || venta.tipoTransaccion !== 'VENTA' || venta.medioPago !== 'Credito' || venta.estado !== 'Activa') {
        throw new NotFoundException('Venta a crédito no encontrada');
      }
      exigirSucursal(user, venta.sucursalId);
      const saldo = await CuentasService.saldoVenta(tx, venta.id);
      if (new D(dto.monto).gt(saldo)) throw new BadRequestException(`El abono supera el saldo pendiente ($${saldo}).`);
      let sesionCajaId: string | null = null;
      if (dto.medioPago === 'Efectivo') {
        sesionCajaId = await CajaService.sesionParaMovimiento(tx, user.id, venta.sucursalId);
        if (!sesionCajaId) throw new BadRequestException('Abra la caja para recibir un abono en efectivo.');
      }
      return tx.abonoCliente.create({
        data: { transaccionId: venta.id, usuarioId: user.id, sesionCajaId, monto: dto.monto, medioPago: dto.medioPago },
      });
    }, TX_OPCIONES);
  }

  async anularAbono(id: string, user: UsuarioSesion) {
    const abono = await this.prisma.abonoCliente.findUnique({ where: { id }, include: { transaccion: true, sesionCaja: true } });
    if (!abono) throw new NotFoundException('Abono no encontrado');
    exigirSucursal(user, abono.transaccion.sucursalId);
    if (abono.sesionCaja && abono.sesionCaja.estado === 'CERRADA') {
      throw new BadRequestException('El abono en efectivo pertenece a una caja ya cerrada; regístrelo como ajuste.');
    }
    const { count } = await this.prisma.abonoCliente.updateMany({ where: { id, estado: 'VIGENTE' }, data: { estado: 'ANULADO' } });
    if (count !== 1) throw new BadRequestException('El abono ya está anulado.');
    return this.prisma.abonoCliente.findUniqueOrThrow({ where: { id } });
  }

  /** Facturas de compra y gastos pendientes de pago, por vencimiento. */
  async porPagar() {
    const [facturas, gastos] = await Promise.all([
      this.prisma.facturaCompra.findMany({
        where: { estado: 'VIGENTE', estadoPago: 'POR_PAGAR' },
        include: { proveedor: { select: { rut: true, nombreRazonSocial: true } } },
      }),
      this.prisma.gastoOperacional.findMany({
        where: { estado: 'VIGENTE', estadoPago: 'POR_PAGAR' },
        include: { proveedor: { select: { rut: true, nombreRazonSocial: true } }, categoria: { select: { nombre: true } } },
      }),
    ]);
    const documentos = [
      ...facturas.map((f) => ({
        tipo: 'FACTURA_COMPRA' as const,
        id: f.id,
        documento: `Factura ${f.folio}`,
        proveedor: f.proveedor.nombreRazonSocial,
        rut: f.proveedor.rut,
        vencimiento: f.fechaVencimiento ?? f.fechaEmision,
        saldo: f.montoTotal,
      })),
      ...gastos.map((g) => ({
        tipo: 'GASTO' as const,
        id: g.id,
        documento: `${g.categoria.nombre}${g.numeroDocumento ? ` N° ${g.numeroDocumento}` : ''}`,
        proveedor: g.proveedor?.nombreRazonSocial ?? g.descripcion,
        rut: g.proveedor?.rut ?? '',
        vencimiento: g.fechaVencimiento ?? g.fechaRegistro,
        // Honorarios: al prestador se le paga el líquido; la retención va al SII en el F29.
        saldo: g.total.sub(g.retencion),
      })),
    ].sort((a, b) => a.vencimiento.getTime() - b.vencimiento.getTime());
    return { porTramo: sumarPorTramo(documentos, new Date()), documentos };
  }

  async pagarFacturaCompra(id: string, dto: PagoProveedorDto) {
    const { count } = await this.prisma.facturaCompra.updateMany({
      where: { id, estado: 'VIGENTE', estadoPago: 'POR_PAGAR' },
      data: { estadoPago: 'PAGADO', medioPago: dto.medioPago, fechaPago: dto.fechaPago ? new Date(dto.fechaPago) : new Date() },
    });
    if (count !== 1) throw new BadRequestException('La factura no existe, está anulada o ya fue pagada.');
    return this.prisma.facturaCompra.findUniqueOrThrow({ where: { id } });
  }
}
