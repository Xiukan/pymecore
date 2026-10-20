import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { EstadoPago, Prisma, TipoDocumentoGasto } from '@prisma/client';
import { esAdmin, exigirSucursal, sucursalDe, UsuarioSesion } from '../auth/sucursal-scope';
import { normalizarRut } from '../compras/dte-recibido';
import { EmpresaService } from '../empresa/empresa.service';
import { PrismaService } from '../prisma/prisma.service';
import { peso, ZERO } from '../utils/money.util';
import { CategoriaGastoDto, CreateGastoDto, PagarGastoDto } from './dto/gastos.dto';

const INCLUDE = {
  categoria: { select: { id: true, nombre: true, ivaRecuperable: true } },
  sucursal: { select: { id: true, nombre: true } },
  proveedor: { select: { id: true, rut: true, nombreRazonSocial: true } },
  usuario: { select: { nombreCompleto: true } },
  dte: { select: { id: true, tipoDte: true, folio: true } },
} satisfies Prisma.GastoOperacionalInclude;

export interface MontosGasto {
  montoNeto: Prisma.Decimal;
  iva: Prisma.Decimal;
  retencion: Prisma.Decimal;
  total: Prisma.Decimal;
  /** Costo para el resultado. */
  monto: Prisma.Decimal;
}

/**
 * Montos según el respaldo:
 * - factura: se ingresa el neto; el IVA es crédito fiscal si la categoría lo permite.
 * - boleta / sin documento: se ingresa el total; no hay IVA recuperable.
 * - boleta de honorarios: se ingresa el bruto; la retención se paga al SII y al
 *   prestador el líquido, pero el costo es el bruto.
 */
export function calcularGasto(
  tipo: TipoDocumentoGasto,
  monto: Prisma.Decimal.Value,
  ivaRecuperable: boolean,
  parametros: { tasaIva: Prisma.Decimal.Value; tasaRetencionHonorarios: Prisma.Decimal.Value },
): MontosGasto {
  const base = peso(monto);
  if (tipo === 'FACTURA') {
    const iva = peso(base.mul(parametros.tasaIva).div(100));
    const total = base.add(iva);
    return { montoNeto: base, iva, retencion: ZERO, total, monto: ivaRecuperable ? base : total };
  }
  if (tipo === 'BOLETA_HONORARIOS') {
    const retencion = peso(base.mul(parametros.tasaRetencionHonorarios).div(100));
    return { montoNeto: base, iva: ZERO, retencion, total: base, monto: base };
  }
  return { montoNeto: base, iva: ZERO, retencion: ZERO, total: base, monto: base };
}

@Injectable()
export class GastosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly empresa: EmpresaService,
  ) {}

  async crear(dto: CreateGastoDto, user: UsuarioSesion) {
    if (!esAdmin(user) && dto.sucursalId !== user.sucursalId) {
      throw new ForbiddenException('Solo puedes registrar gastos de tu sucursal.');
    }
    const categoria = await this.prisma.categoriaGasto.findUnique({ where: { id: dto.categoriaId } });
    if (!categoria || !categoria.activa) throw new BadRequestException('La categoría no existe o está inactiva.');
    const empresa = await this.empresa.get();
    const montos = calcularGasto(dto.tipoDocumento, dto.monto, categoria.ivaRecuperable, empresa);

    const conDocumento = dto.tipoDocumento === 'FACTURA' || dto.tipoDocumento === 'BOLETA_HONORARIOS';
    if (conDocumento && (!dto.proveedorId || !dto.numeroDocumento?.trim())) {
      throw new BadRequestException('Una factura o boleta de honorarios requiere proveedor y número de documento.');
    }
    if (dto.tipoDocumento === 'SIN_DOCUMENTO' && montos.total.gt(empresa.topeGastoSinDocumento)) {
      throw new BadRequestException(
        `Un gasto sin documento no puede superar $${empresa.topeGastoSinDocumento.toLocaleString('es-CL')} (tope en Configuración).`,
      );
    }
    const fecha = new Date(dto.fecha);
    const manana = new Date();
    manana.setDate(manana.getDate() + 1);
    if (fecha > manana) throw new BadRequestException('La fecha del gasto no puede ser futura.');
    if (dto.fechaVencimiento && new Date(dto.fechaVencimiento) < fecha) {
      throw new BadRequestException('El vencimiento no puede ser anterior a la fecha del gasto.');
    }

    return this.prisma.$transaction(async (tx) => {
      const numero = dto.numeroDocumento?.trim() || null;
      if (dto.proveedorId) {
        // El bloqueo del proveedor ordena registros simultáneos del mismo documento.
        await tx.$queryRaw`SELECT id FROM entidades WHERE id = ${dto.proveedorId}::uuid FOR UPDATE`;
        const proveedor = await tx.entidad.findUnique({ where: { id: dto.proveedorId } });
        if (!proveedor || proveedor.tipoEntidad !== 'PROVEEDOR') throw new BadRequestException('El proveedor no existe.');
        if (numero) {
          const repetido = await tx.gastoOperacional.findFirst({
            where: { proveedorId: proveedor.id, tipoDocumento: dto.tipoDocumento, numeroDocumento: numero, estado: 'VIGENTE' },
            select: { id: true },
          });
          if (repetido) throw new BadRequestException('Ese documento del proveedor ya está registrado como gasto.');
          if (dto.tipoDocumento === 'FACTURA') {
            const enBandeja = await tx.dteRecibido.findFirst({
              where: { rutEmisor: normalizarRut(proveedor.rut), folio: numero, tipoDte: { in: [33, 34] } },
              select: { id: true },
            });
            if (enBandeja) {
              throw new BadRequestException('Esa factura está en la bandeja de DTE recibidos; regístrela como gasto desde allí.');
            }
          }
        }
      }
      return tx.gastoOperacional.create({
        data: {
          usuarioId: user.id,
          categoriaId: categoria.id,
          sucursalId: dto.sucursalId ?? null,
          proveedorId: dto.proveedorId ?? null,
          descripcion: dto.descripcion.trim(),
          tipoDocumento: dto.tipoDocumento,
          numeroDocumento: numero,
          ...montos,
          fechaRegistro: fecha,
          fechaVencimiento: dto.fechaVencimiento ? new Date(dto.fechaVencimiento) : fecha,
          estadoPago: dto.medioPago ? 'PAGADO' : 'POR_PAGAR',
          medioPago: dto.medioPago ?? null,
          fechaPago: dto.medioPago ? fecha : null,
        },
        include: INCLUDE,
      });
    });
  }

  async listar(
    user: UsuarioSesion,
    filtros: { desde?: string; hasta?: string; categoriaId?: string; estadoPago?: EstadoPago; sucursalId?: string },
  ) {
    const sucursalId = sucursalDe(user, filtros.sucursalId);
    const where: Prisma.GastoOperacionalWhereInput = {
      estado: 'VIGENTE',
      ...(sucursalId && { sucursalId }),
      ...(filtros.categoriaId && { categoriaId: filtros.categoriaId }),
      ...(filtros.estadoPago && { estadoPago: filtros.estadoPago }),
      ...((filtros.desde || filtros.hasta) && {
        // La fecha del gasto es un día calendario guardado a medianoche UTC: se filtra en UTC.
        fechaRegistro: {
          ...(filtros.desde && { gte: new Date(`${filtros.desde}T00:00:00Z`) }),
          ...(filtros.hasta && { lte: new Date(`${filtros.hasta}T23:59:59.999Z`) }),
        },
      }),
    };
    const gastos = await this.prisma.gastoOperacional.findMany({
      where,
      include: INCLUDE,
      orderBy: [{ fechaRegistro: 'desc' }, { creadoEn: 'desc' }],
    });
    const porCategoria = new Map<string, Prisma.Decimal>();
    let costo = ZERO;
    let porPagar = ZERO;
    for (const g of gastos) {
      costo = costo.add(g.monto);
      if (g.estadoPago === 'POR_PAGAR') porPagar = porPagar.add(g.total.sub(g.retencion));
      porCategoria.set(g.categoria.nombre, (porCategoria.get(g.categoria.nombre) ?? ZERO).add(g.monto));
    }
    return {
      gastos,
      resumen: {
        costo,
        porPagar,
        porCategoria: [...porCategoria.entries()]
          .map(([categoria, monto]) => ({ categoria, monto }))
          .sort((a, b) => b.monto.comparedTo(a.monto)),
      },
    };
  }

  async pagar(id: string, dto: PagarGastoDto, user: UsuarioSesion) {
    const gasto = await this.obtener(id, user);
    const { count } = await this.prisma.gastoOperacional.updateMany({
      where: { id: gasto.id, estado: 'VIGENTE', estadoPago: 'POR_PAGAR' },
      data: {
        estadoPago: 'PAGADO',
        medioPago: dto.medioPago,
        fechaPago: dto.fechaPago ? new Date(dto.fechaPago) : new Date(),
      },
    });
    if (count !== 1) throw new BadRequestException('El gasto ya está pagado o anulado.');
    return this.prisma.gastoOperacional.findUniqueOrThrow({ where: { id }, include: INCLUDE });
  }

  async anular(id: string, user: UsuarioSesion) {
    const gasto = await this.obtener(id, user);
    return this.prisma.$transaction(async (tx) => {
      const { count } = await tx.gastoOperacional.updateMany({
        where: { id: gasto.id, estado: 'VIGENTE' },
        data: { estado: 'ANULADO' },
      });
      if (count !== 1) throw new BadRequestException('El gasto ya está anulado.');
      // Un gasto nacido de un DTE recibido devuelve el documento a la bandeja.
      await tx.dteRecibido.updateMany({ where: { gastoId: id }, data: { estado: 'PENDIENTE', gastoId: null } });
      return tx.gastoOperacional.findUniqueOrThrow({ where: { id }, include: INCLUDE });
    });
  }

  categorias() {
    return this.prisma.categoriaGasto.findMany({ orderBy: { nombre: 'asc' } });
  }

  crearCategoria(dto: CategoriaGastoDto) {
    return this.prisma.categoriaGasto.create({
      data: { nombre: dto.nombre.trim(), ivaRecuperable: dto.ivaRecuperable ?? true },
    });
  }

  actualizarCategoria(id: string, dto: Partial<CategoriaGastoDto>) {
    return this.prisma.categoriaGasto.update({
      where: { id },
      data: { ...(dto.nombre && { nombre: dto.nombre.trim() }), ivaRecuperable: dto.ivaRecuperable, activa: dto.activa },
    });
  }

  private async obtener(id: string, user: UsuarioSesion) {
    const gasto = await this.prisma.gastoOperacional.findUnique({ where: { id } });
    if (!gasto) throw new NotFoundException('Gasto no encontrado');
    if (gasto.sucursalId) exigirSucursal(user, gasto.sucursalId);
    else if (!esAdmin(user)) throw new NotFoundException('Gasto no encontrado');
    return gasto;
  }
}
