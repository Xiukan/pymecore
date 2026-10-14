import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { EstadoDteRecibido, Prisma } from '@prisma/client';
import { createHash } from 'crypto';
import { UsuarioSesion } from '../auth/sucursal-scope';
import { EmpresaService } from '../empresa/empresa.service';
import { PrismaService } from '../prisma/prisma.service';
import { leerDteRecibido, normalizarRut, TIPOS_SOPORTADOS } from './dte-recibido';

const SIN_XML = {
  id: true, tipoDte: true, folio: true, rutEmisor: true, razonSocialEmisor: true, fechaEmision: true,
  fechaVencimiento: true, montoNeto: true, montoExento: true, iva: true, otrosImpuestos: true, montoTotal: true,
  referenciaOc: true, detalle: true, observaciones: true, timbreValido: true, firmaValida: true, sha256: true,
  estado: true, motivoDescarte: true, facturaCompraId: true, gastoId: true, creadoEn: true,
  proveedor: { select: { id: true, rut: true, nombreRazonSocial: true } },
  usuario: { select: { nombreCompleto: true } },
} satisfies Prisma.DteRecibidoSelect;

@Injectable()
export class DteRecibidosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly empresa: EmpresaService,
  ) {}

  async importar(xml: string, user: UsuarioSesion) {
    const dte = leerDteRecibido(xml);
    const empresa = await this.empresa.get();
    // Validar al proveedor no basta: un mismo proveedor emite para muchos clientes.
    if (normalizarRut(dte.rutReceptor) !== normalizarRut(empresa.rut)) {
      throw new BadRequestException(
        `El DTE está dirigido al RUT ${dte.rutReceptor}, no a la empresa (${empresa.rut}). Revise el RUT en Configuración.`,
      );
    }
    const rutEmisor = normalizarRut(dte.emisor.rut);
    const repetido = await this.prisma.dteRecibido.findUnique({
      where: { rutEmisor_tipoDte_folio: { rutEmisor, tipoDte: dte.tipoDte, folio: dte.folio } },
      select: { id: true },
    });
    if (repetido) {
      throw new ConflictException(`El DTE ${TIPOS_SOPORTADOS[dte.tipoDte]} N° ${dte.folio} de ${dte.emisor.rut} ya fue cargado.`);
    }

    return this.prisma.$transaction(async (tx) => {
      let proveedor = await tx.entidad.findFirst({ where: { rut: rutEmisor, tipoEntidad: 'PROVEEDOR' } });
      const observaciones = [...dte.observaciones];
      if (!proveedor) {
        proveedor = await tx.entidad.create({
          data: {
            tipoEntidad: 'PROVEEDOR',
            rut: rutEmisor,
            nombreRazonSocial: dte.emisor.razonSocial.slice(0, 150),
            direccion: [dte.emisor.direccion, dte.emisor.comuna].filter(Boolean).join(', ') || undefined,
          },
        });
        observaciones.push(`Se creó el proveedor ${proveedor.nombreRazonSocial} a partir del DTE.`);
      } else if (proveedor.estado !== 'Activo') {
        observaciones.push('El proveedor está inactivo en el sistema.');
      }
      const otros = dte.otrosImpuestos.reduce((s, o) => s.add(o.monto), new Prisma.Decimal(0));
      return tx.dteRecibido.create({
        data: {
          tipoDte: dte.tipoDte,
          folio: dte.folio,
          rutEmisor,
          razonSocialEmisor: dte.emisor.razonSocial.slice(0, 120),
          fechaEmision: new Date(dte.fechaEmision),
          fechaVencimiento: dte.fechaVencimiento ? new Date(dte.fechaVencimiento) : null,
          montoNeto: dte.montoNeto,
          montoExento: dte.montoExento,
          iva: dte.iva,
          otrosImpuestos: otros,
          montoTotal: dte.montoTotal,
          referenciaOc: dte.referenciaOc?.slice(0, 20),
          detalle: { lineas: dte.lineas, otrosImpuestos: dte.otrosImpuestos } as unknown as Prisma.InputJsonValue,
          observaciones,
          timbreValido: dte.timbreValido,
          firmaValida: dte.firmaValida,
          xml,
          sha256: createHash('sha256').update(xml, 'utf8').digest('hex'),
          proveedorId: proveedor.id,
          usuarioId: user.id,
        },
        select: SIN_XML,
      });
    });
  }

  listar(estado?: EstadoDteRecibido) {
    return this.prisma.dteRecibido.findMany({
      where: estado ? { estado } : undefined,
      select: SIN_XML,
      orderBy: [{ fechaEmision: 'desc' }, { creadoEn: 'desc' }],
    });
  }

  async detalle(id: string) {
    const dte = await this.prisma.dteRecibido.findUnique({ where: { id }, select: { ...SIN_XML, xml: true } });
    if (!dte) throw new NotFoundException('DTE no encontrado');
    return dte;
  }

  /**
   * Servicios y otros gastos sin OC (telefonía, arriendos, etc.). El gasto se registra por el
   * neto + exento: el IVA es crédito fiscal y los otros impuestos se revisan aparte.
   */
  async registrarGasto(id: string, dto: { categoria: string; descripcion?: string }, user: UsuarioSesion) {
    return this.prisma.$transaction(async (tx) => {
      const dte = await this.tomarPendiente(tx, id);
      const gasto = await tx.gastoOperacional.create({
        data: {
          usuarioId: user.id,
          categoria: dto.categoria.trim(),
          descripcion: (dto.descripcion?.trim() || `${dte.razonSocialEmisor} · ${TIPOS_SOPORTADOS[dte.tipoDte]} N° ${dte.folio}`).slice(0, 200),
          monto: dte.montoNeto.add(dte.montoExento),
          fechaRegistro: dte.fechaEmision,
        },
      });
      return tx.dteRecibido.update({
        where: { id },
        data: { estado: 'GASTO', gastoId: gasto.id },
        select: SIN_XML,
      });
    });
  }

  async descartar(id: string, motivo: string) {
    return this.prisma.$transaction(async (tx) => {
      await this.tomarPendiente(tx, id);
      return tx.dteRecibido.update({
        where: { id },
        data: { estado: 'DESCARTADO', motivoDescarte: motivo.trim() },
        select: SIN_XML,
      });
    });
  }

  /** Bloquea el DTE y exige que siga pendiente: dos destinos simultáneos no pueden ganar ambos. */
  async tomarPendiente(tx: Prisma.TransactionClient, id: string) {
    await tx.$queryRaw`SELECT id FROM dte_recibidos WHERE id = ${id}::uuid FOR UPDATE`;
    const dte = await tx.dteRecibido.findUnique({ where: { id } });
    if (!dte) throw new NotFoundException('DTE no encontrado');
    if (dte.estado !== 'PENDIENTE') throw new BadRequestException('El DTE ya tiene un destino (OC, gasto o descarte).');
    return dte;
  }
}
