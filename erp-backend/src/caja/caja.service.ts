import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { MedioPago, Prisma, TipoTransaccion } from '@prisma/client';
import { esAdmin, exigirSucursal, sucursalDe, UsuarioSesion } from '../auth/sucursal-scope';
import { PrismaService } from '../prisma/prisma.service';
import { TX_OPCIONES } from '../utils/transacciones';
import { AbrirCajaDto, CerrarCajaDto } from './dto/caja.dto';

type Db = Prisma.TransactionClient | PrismaService;
const D = Prisma.Decimal;
const RETORNOS: TipoTransaccion[] = ['DEVOLUCION', 'NOTA_CREDITO'];

export interface LineaResumen {
  medio: MedioPago;
  ventas: number;
  montoVentas: string;
  reembolsos: number;
  montoReembolsos: string;
}

export interface ResumenCaja {
  porMedio: LineaResumen[];
  totalVentas: string;
  /** Pagos de clientes a crédito recibidos en efectivo durante la sesión. */
  abonosEfectivo: string;
  efectivoEsperado: string;
}

/** Arqueo: fondo inicial + ventas en efectivo − reembolsos en efectivo + abonos en efectivo de la sesión. */
export function resumir(
  montoApertura: Prisma.Decimal.Value,
  movimientos: { tipoTransaccion: TipoTransaccion; medioPago: MedioPago; montoTotal: Prisma.Decimal.Value }[],
  abonosEfectivo: Prisma.Decimal.Value = 0,
): ResumenCaja {
  const porMedio = new Map<MedioPago, { ventas: number; montoVentas: Prisma.Decimal; reembolsos: number; montoReembolsos: Prisma.Decimal }>();
  let totalVentas = new D(0);
  for (const m of movimientos) {
    const fila = porMedio.get(m.medioPago) ?? { ventas: 0, montoVentas: new D(0), reembolsos: 0, montoReembolsos: new D(0) };
    if (m.tipoTransaccion === 'VENTA') {
      fila.ventas++;
      fila.montoVentas = fila.montoVentas.add(m.montoTotal);
      totalVentas = totalVentas.add(m.montoTotal);
    } else if (RETORNOS.includes(m.tipoTransaccion)) {
      fila.reembolsos++;
      fila.montoReembolsos = fila.montoReembolsos.add(m.montoTotal);
    }
    porMedio.set(m.medioPago, fila);
  }
  const efectivo = porMedio.get('Efectivo');
  const esperado = new D(montoApertura).add(efectivo?.montoVentas ?? 0).sub(efectivo?.montoReembolsos ?? 0).add(abonosEfectivo);
  return {
    porMedio: [...porMedio.entries()].map(([medio, f]) => ({
      medio,
      ventas: f.ventas,
      montoVentas: f.montoVentas.toString(),
      reembolsos: f.reembolsos,
      montoReembolsos: f.montoReembolsos.toString(),
    })),
    totalVentas: totalVentas.toString(),
    abonosEfectivo: new D(abonosEfectivo).toString(),
    efectivoEsperado: esperado.toString(),
  };
}

@Injectable()
export class CajaService {
  constructor(private readonly prisma: PrismaService) {}

  async abrir(dto: AbrirCajaDto, user: UsuarioSesion) {
    if (!esAdmin(user) && user.sucursalId !== dto.sucursalId) {
      throw new ForbiddenException('Solo puedes abrir caja en tu sucursal.');
    }
    try {
      return await this.prisma.sesionCaja.create({
        data: { sucursalId: dto.sucursalId, usuarioId: user.id, montoApertura: dto.montoApertura },
      });
    } catch (err) {
      // Índice único parcial: una sola caja abierta por cajero.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('Ya tienes una caja abierta; ciérrala antes de abrir otra.');
      }
      throw err;
    }
  }

  async actual(user: UsuarioSesion) {
    const sesion = await this.prisma.sesionCaja.findFirst({
      where: { usuarioId: user.id, estado: 'ABIERTA' },
      include: { sucursal: { select: { nombre: true } } },
    });
    if (!sesion) return null;
    return { ...sesion, resumen: await this.calcular(this.prisma, sesion.id, sesion.montoApertura) };
  }

  async cerrar(id: string, dto: CerrarCajaDto, user: UsuarioSesion) {
    return this.prisma.$transaction(async (tx) => {
      // El bloqueo exclusivo espera a las ventas en curso (que toman la sesión en modo compartido).
      await tx.$queryRaw`SELECT id FROM sesiones_caja WHERE id = ${id}::uuid FOR UPDATE`;
      const sesion = await tx.sesionCaja.findUnique({ where: { id } });
      if (!sesion) throw new NotFoundException('Sesión de caja no encontrada');
      const propia = sesion.usuarioId === user.id;
      if (!propia) {
        if (user.rol === 'Vendedor') throw new ForbiddenException('Solo el cajero o un Encargado cierra esta caja.');
        exigirSucursal(user, sesion.sucursalId);
      }
      if (sesion.estado !== 'ABIERTA') throw new BadRequestException('La caja ya está cerrada.');
      const resumen = await this.calcular(tx, id, sesion.montoApertura);
      const esperado = new D(resumen.efectivoEsperado);
      return tx.sesionCaja.update({
        where: { id },
        data: {
          estado: 'CERRADA',
          cerradaEn: new Date(),
          efectivoEsperado: esperado,
          efectivoContado: dto.efectivoContado,
          diferencia: new D(dto.efectivoContado).sub(esperado),
          observaciones: dto.observaciones?.trim() || null,
          resumen: resumen as unknown as Prisma.InputJsonValue,
        },
        include: { sucursal: { select: { nombre: true } }, usuario: { select: { nombreCompleto: true } } },
      });
    }, TX_OPCIONES);
  }

  listar(user: UsuarioSesion, filtros: { sucursalId?: string; desde?: string; hasta?: string }) {
    const sucursalId = sucursalDe(user, filtros.sucursalId);
    return this.prisma.sesionCaja.findMany({
      where: {
        ...(sucursalId && { sucursalId }),
        ...(user.rol === 'Vendedor' && { usuarioId: user.id }),
        ...((filtros.desde || filtros.hasta) && {
          abiertaEn: {
            ...(filtros.desde && { gte: new Date(`${filtros.desde}T00:00:00`) }),
            ...(filtros.hasta && { lte: new Date(`${filtros.hasta}T23:59:59.999`) }),
          },
        }),
      },
      include: { sucursal: { select: { nombre: true } }, usuario: { select: { nombreCompleto: true } } },
      orderBy: { abiertaEn: 'desc' },
      take: 200,
    });
  }

  /**
   * Sesión abierta del cajero en la sucursal, bloqueada en modo compartido para que no se
   * cierre mientras la venta se registra. Devuelve null si no hay caja abierta.
   */
  static async sesionParaMovimiento(tx: Prisma.TransactionClient, usuarioId: string, sucursalId: string) {
    const filas = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM sesiones_caja
       WHERE usuario_id = ${usuarioId}::uuid AND sucursal_id = ${sucursalId}::uuid AND estado = 'ABIERTA'
       FOR SHARE`;
    return filas[0]?.id ?? null;
  }

  private async calcular(db: Db, sesionId: string, montoApertura: Prisma.Decimal) {
    const movimientos = await db.transaccion.findMany({
      where: { sesionCajaId: sesionId, estado: 'Activa' },
      select: { tipoTransaccion: true, medioPago: true, montoTotal: true },
    });
    const abonos = await db.abonoCliente.aggregate({
      where: { sesionCajaId: sesionId, estado: 'VIGENTE', medioPago: 'Efectivo' },
      _sum: { monto: true },
    });
    return resumir(montoApertura, movimientos, abonos._sum.monto ?? 0);
  }
}
