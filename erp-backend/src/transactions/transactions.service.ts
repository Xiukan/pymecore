import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'crypto';
import { isUUID } from 'class-validator';
import { Item, MedioPago, Prisma, TipoTransaccion } from '@prisma/client';
import { CajaService } from '../caja/caja.service';
import { PrismaService } from '../prisma/prisma.service';
import { EmpresaService } from '../empresa/empresa.service';
import { SiiIntegrationService } from '../sii/sii-integration.service';
import { reclamarFolio } from '../utils/folios.util';
import { calcularDocumento, dec, peso, share, ZERO } from '../utils/money.util';
import { CreateTransactionDto } from './dto/create-transaction.dto';

type Tx = Prisma.TransactionClient;

const RETORNOS: TipoTransaccion[] = [TipoTransaccion.DEVOLUCION, TipoTransaccion.NOTA_CREDITO];
const OPERACION = 'transactions.create:v1';
const MEDIOS_VENTA: MedioPago[] = [MedioPago.Efectivo, MedioPago.Tarjeta, MedioPago.Transferencia];
/** Ventas del mismo producto esperan el bloqueo de su fila de stock: se da margen sobre el límite por defecto (5 s). */
const TX_OPCIONES = { maxWait: 10_000, timeout: 15_000 };

/** JSON con claves ordenadas: el mismo contenido produce siempre la misma huella. */
function canonico(valor: unknown): string {
  if (Array.isArray(valor)) return `[${valor.map(canonico).join(',')}]`;
  if (valor && typeof valor === 'object') {
    return `{${Object.keys(valor)
      .filter((k) => (valor as Record<string, unknown>)[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonico((valor as Record<string, unknown>)[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(valor);
}

const esConflictoIdempotencia = (err: unknown) =>
  err instanceof Prisma.PrismaClientKnownRequestError &&
  err.code === 'P2002' &&
  JSON.stringify(err.meta ?? {}).includes('clave');

interface LineaPreparada {
  itemId: string;
  cantidad: Prisma.Decimal;
  costoUnitario: Prisma.Decimal;
  precioUnitario: Prisma.Decimal;
  descuentoLinea: Prisma.Decimal;
  montoIva: Prisma.Decimal;
  subtotal: Prisma.Decimal;
}

/** MntNeto e IVA del DTE a partir del IVA ya repartido en las líneas. */
export function desglose(t: { montoTotal: Prisma.Decimal; detalles: { montoIva: Prisma.Decimal }[] }) {
  const iva = t.detalles.reduce((s, d) => s.add(d.montoIva), ZERO);
  return { iva: Number(iva), montoNeto: Number(t.montoTotal.sub(iva)) };
}

@Injectable()
export class TransactionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sii: SiiIntegrationService,
    private readonly empresa: EmpresaService,
  ) {}

  /**
   * Con `clave` (cabecera Idempotency-Key) un reintento devuelve el documento ya creado
   * en vez de cobrar y descontar stock otra vez.
   */
  async create(dto: CreateTransactionDto, usuarioId: string, clave?: string, rol = 'Administrador') {
    if (clave === undefined) return this.registrar(dto, usuarioId, undefined, rol);
    if (!isUUID(clave)) throw new BadRequestException('Idempotency-Key debe ser un UUID.');
    const huella = createHash('sha256').update(canonico({ ...dto, usuarioId: undefined })).digest('hex');

    const previa = await this.repetida(usuarioId, clave, huella);
    if (previa) return previa;
    try {
      return await this.registrar(dto, usuarioId, { clave, huella }, rol);
    } catch (err) {
      // Otra petición con la misma clave ganó la reserva: se devuelve su resultado.
      if (esConflictoIdempotencia(err)) {
        const ganadora = await this.repetida(usuarioId, clave, huella);
        if (ganadora) return ganadora;
      }
      throw err;
    }
  }

  private async repetida(usuarioId: string, clave: string, huella: string) {
    const op = await this.prisma.operacionIdempotente.findUnique({
      where: { usuarioId_operacion_clave: { usuarioId, operacion: OPERACION, clave } },
    });
    if (!op) return null;
    if (op.huella !== huella) {
      throw new ConflictException('Este envío ya se usó con otros datos. Revise la operación original.');
    }
    const t = await this.prisma.transaccion.findUniqueOrThrow({
      where: { id: op.transaccionId! },
      include: { detalles: true },
    });
    const meta = t.metadatosSii as Record<string, unknown> | null;
    const dte = meta?.xmlFirmado ? meta : null;
    return { ...t, dte, pendiente: !dte, folio: t.numeroFactura ? Number(t.numeroFactura) : undefined, repetida: true };
  }

  private async registrar(
    dto: CreateTransactionDto,
    usuarioId: string,
    idem?: { clave: string; huella: string },
    rol = 'Administrador',
  ) {
    const itemIds = dto.detalles.map((d) => d.itemId);
    if (new Set(itemIds).size !== itemIds.length) {
      throw new BadRequestException('El documento repite un ítem; agrupe las cantidades en una sola línea.');
    }
    if (dto.tipoTransaccion === TipoTransaccion.VENTA && !MEDIOS_VENTA.includes(dto.medioPago as MedioPago)) {
      throw new BadRequestException('Indique el medio de pago de la venta (efectivo, tarjeta o transferencia).');
    }
    if (dto.tipoTransaccion === TipoTransaccion.COMPRA) {
      throw new BadRequestException('Las compras se registran en el módulo de Compras (orden, recepción y factura).');
    }
    if (dto.tipoTransaccion === TipoTransaccion.MERMA && !dto.motivoMerma?.trim()) {
      throw new BadRequestException('Indique el motivo de la merma.');
    }
    const esRetorno = RETORNOS.includes(dto.tipoTransaccion);
    if (esRetorno && !dto.transaccionOrigenId) {
      throw new BadRequestException('Las devoluciones y notas de crédito requieren la venta de origen.');
    }

    const items = await this.prisma.item.findMany({
      where: { id: { in: itemIds }, ...(esRetorno ? {} : { estado: 'Activo' }) },
    });
    if (items.length !== itemIds.length) {
      throw new NotFoundException('Uno o más ítems no existen o están inactivos');
    }
    const itemMap = new Map(items.map((i) => [i.id, i]));
    const empresa = await this.empresa.get();

    const transaccion = await this.prisma.$transaction(async (tx) => {
      // La reserva va primero: una segunda petición con la misma clave espera aquí y luego falla por unicidad.
      if (idem) {
        await tx.operacionIdempotente.create({
          data: { usuarioId, operacion: OPERACION, clave: idem.clave, huella: idem.huella },
        });
      }
      // Caja: toda venta y todo reembolso en efectivo quedan en la sesión abierta del cajero.
      const mueveCaja = dto.tipoTransaccion === TipoTransaccion.VENTA || (esRetorno && dto.medioPago === 'Efectivo');
      const sesionCajaId = await CajaService.sesionParaMovimiento(tx, usuarioId, dto.sucursalId);
      if (mueveCaja && !sesionCajaId) {
        throw new BadRequestException('Abra la caja en esta sucursal antes de cobrar o reembolsar en efectivo.');
      }

      const lineas = esRetorno
        ? await this.prepararRetorno(tx, dto, usuarioId, rol)
        : await this.prepararDocumento(tx, dto, itemMap, empresa.tasaIva);

      if (dto.tipoTransaccion === TipoTransaccion.VENTA || dto.tipoTransaccion === TipoTransaccion.MERMA) {
        for (const l of lineas) await this.descontarStock(tx, dto.sucursalId, l, itemMap.get(l.itemId)!);
      }
      if (esRetorno) {
        for (const l of lineas) {
          await tx.stockLocal.upsert({
            where: { sucursalId_itemId: { sucursalId: dto.sucursalId, itemId: l.itemId } },
            update: { stockActual: { increment: l.cantidad } },
            create: { sucursalId: dto.sucursalId, itemId: l.itemId, stockActual: l.cantidad },
          });
        }
      }

      const montoTotal = lineas.reduce((s, l) => s.add(l.subtotal), ZERO);
      const esVenta = dto.tipoTransaccion === TipoTransaccion.VENTA;
      const tipoDoc = dto.tipoDocumento ?? 39;
      const creada = await tx.transaccion.create({
        data: {
          sucursalId: dto.sucursalId,
          usuarioId,
          entidadId: dto.entidadId,
          tipoTransaccion: dto.tipoTransaccion,
          medioPago: dto.medioPago,
          descuentoGlobal: esRetorno ? ZERO : peso(dto.descuentoGlobal ?? 0),
          montoTotal,
          // Una venta queda pendiente de SII hasta que su DTE se envía; nunca nace sincronizada.
          sincronizacion: esVenta ? 'PENDIENTE' : 'SINCRONIZADO',
          transaccionOrigenId: dto.transaccionOrigenId,
          sesionCajaId: mueveCaja ? sesionCajaId : null,
          tipoDevolucion: dto.tipoDevolucion,
          observaciones: dto.observaciones,
          motivoMerma: dto.motivoMerma,
          detalles: { createMany: { data: lineas } },
        },
        include: { detalles: true },
      });
      if (idem) {
        await tx.operacionIdempotente.update({
          where: { usuarioId_operacion_clave: { usuarioId, operacion: OPERACION, clave: idem.clave } },
          data: { transaccionId: creada.id },
        });
      }
      if (!esVenta) return { creada, folio: null as number | null, tipoDoc };

      const folio = await reclamarFolio(tx, tipoDoc, creada.id);
      if (folio === null) {
        await tx.transaccion.update({
          where: { id: creada.id },
          data: { metadatosSii: { sinFolio: true, tipoDoc } },
        });
      } else {
        await tx.transaccion.update({ where: { id: creada.id }, data: { numeroFactura: String(folio) } });
      }
      return { creada, folio, tipoDoc };
    }, TX_OPCIONES);

    const { creada, folio, tipoDoc } = transaccion;
    if (dto.tipoTransaccion !== TipoTransaccion.VENTA) return creada;
    if (folio === null) return { ...creada, dte: null, pendiente: true };

    let dte: Awaited<ReturnType<SiiIntegrationService['emitirDTE']>>;
    try {
      dte = this.sii.emitirDTE({
        folio,
        tipoDoc,
        emisor: empresa,
        rutReceptor: dto.rutReceptor ?? empresa.rutConsumidorFinal,
        razonSocialReceptor: dto.razonSocialReceptor ?? empresa.nombreConsumidorFinal,
        fechaEmision: new Date().toISOString().substring(0, 10),
        montoTotal: Number(creada.montoTotal),
        ...desglose(creada),
        primerItem: itemMap.get(creada.detalles[0]?.itemId)?.nombre ?? 'Item',
        detalles: creada.detalles.map((d) => ({
          nombre: itemMap.get(d.itemId)?.nombre ?? 'Item',
          cantidad: Number(d.cantidad),
          precio: Number(d.precioUnitario),
          subtotal: Number(d.subtotal),
        })),
      });
    } catch {
      await this.prisma.transaccion.update({
        where: { id: creada.id },
        data: { metadatosSii: { folio, tipoDoc, pendienteDte: true } },
      });
      return { ...creada, numeroFactura: String(folio), dte: null, pendiente: true, folio };
    }

    await this.prisma.transaccion.update({
      where: { id: creada.id },
      data: { metadatosSii: dte as any },
    });
    return { ...creada, numeroFactura: String(folio), dte };
  }

  /** Venta: precio vigente del servidor. Merma: valorizada a costo. */
  private async prepararDocumento(
    tx: Tx,
    dto: CreateTransactionDto,
    itemMap: Map<string, Item>,
    tasaIva: Prisma.Decimal,
  ) {
    const ahora = new Date();
    const ofertas = await tx.oferta.findMany({
      where: {
        itemId: { in: [...itemMap.keys()] },
        activo: true,
        fechaInicio: { lte: ahora },
        fechaFin: { gte: ahora },
      },
    });
    const precioOferta = new Map<string, Prisma.Decimal>();
    for (const o of ofertas) {
      const actual = precioOferta.get(o.itemId);
      if (!actual || o.precioOferta.lt(actual)) precioOferta.set(o.itemId, o.precioOferta);
    }

    const base = dto.detalles.map((d) => {
      const item = itemMap.get(d.itemId)!;
      let precio: Prisma.Decimal;
      if (dto.tipoTransaccion === TipoTransaccion.VENTA) {
        precio = precioOferta.get(item.id) ?? item.precioVenta;
        if (d.precioUnitario !== undefined && !dec(d.precioUnitario).eq(precio)) {
          throw new BadRequestException(
            `El precio de "${item.nombre}" cambió a $${precio.toString()}. Actualice el carrito antes de cobrar.`,
          );
        }
      } else {
        precio = item.costoPromedio;
      }
      return { item, cantidad: dec(d.cantidad), precio, descuento: dec(d.descuentoLinea ?? 0) };
    });

    const calculo = this.calcular(
      base.map((b) => ({
        cantidad: b.cantidad,
        precioUnitario: b.precio,
        descuentoLinea: b.descuento,
        afectoIva: dto.tipoTransaccion !== TipoTransaccion.MERMA && b.item.afectoIva,
      })),
      dto.descuentoGlobal ?? 0,
      tasaIva,
    );
    if (dto.tipoTransaccion === TipoTransaccion.VENTA && calculo.montoTotal.lte(0)) {
      throw new BadRequestException('El total de la venta debe ser mayor a cero.');
    }
    return base.map<LineaPreparada>((b, i) => ({
      itemId: b.item.id,
      cantidad: b.cantidad,
      costoUnitario: b.item.costoPromedio,
      precioUnitario: b.precio,
      ...calculo.detalle[i],
    }));
  }

  /** Devolución / NC: contra líneas reales de la venta, sin superar lo vendido ni su monto. */
  private async prepararRetorno(tx: Tx, dto: CreateTransactionDto, usuarioId: string, rol: string) {
    // Serializa los retornos concurrentes de una misma venta.
    await tx.$queryRaw`SELECT id FROM transacciones WHERE id = ${dto.transaccionOrigenId}::uuid FOR UPDATE`;
    const origen = await tx.transaccion.findUnique({
      where: { id: dto.transaccionOrigenId },
      include: { detalles: true },
    });
    if (!origen || origen.tipoTransaccion !== TipoTransaccion.VENTA || origen.estado !== 'Activa') {
      throw new BadRequestException('La venta de origen no existe o no está activa.');
    }
    if (origen.sucursalId !== dto.sucursalId) {
      throw new BadRequestException('La devolución debe registrarse en la sucursal de la venta.');
    }
    // Separación de funciones: quien cobró no se autoriza a sí mismo el reembolso.
    if (rol === 'Vendedor' && origen.usuarioId === usuarioId) {
      throw new ForbiddenException('La devolución de tu propia venta debe registrarla otro usuario o un Encargado.');
    }

    const previos = await tx.transaccionDetalle.groupBy({
      by: ['itemId'],
      where: {
        transaccion: {
          transaccionOrigenId: origen.id,
          estado: 'Activa',
          tipoTransaccion: { in: RETORNOS },
        },
      },
      _sum: { cantidad: true, subtotal: true, montoIva: true },
    });
    const devuelto = new Map(previos.map((p) => [p.itemId, p._sum]));

    return dto.detalles.map<LineaPreparada>((d) => {
      const linea = origen.detalles.find((o) => o.itemId === d.itemId);
      if (!linea) throw new BadRequestException('Hay ítems que no pertenecen a la venta de origen.');
      const ya = devuelto.get(d.itemId);
      const qtyRestante = linea.cantidad.sub(ya?.cantidad ?? ZERO);
      const cantidad = dec(d.cantidad);
      if (cantidad.gt(qtyRestante)) {
        throw new BadRequestException(
          `No se puede devolver ${cantidad} unidades: vendidas ${linea.cantidad}, ya devueltas ${ya?.cantidad ?? 0}.`,
        );
      }
      const subtotalRestante = linea.subtotal.sub(ya?.subtotal ?? ZERO);
      const ivaRestante = linea.montoIva.sub(ya?.montoIva ?? ZERO);
      return {
        itemId: linea.itemId,
        cantidad,
        costoUnitario: linea.costoUnitario,
        precioUnitario: linea.precioUnitario,
        descuentoLinea: share(linea.descuentoLinea, cantidad, linea.cantidad),
        montoIva: share(ivaRestante, cantidad, qtyRestante),
        subtotal: share(subtotalRestante, cantidad, qtyRestante),
      };
    });
  }

  private calcular(...args: Parameters<typeof calcularDocumento>) {
    try {
      return calcularDocumento(...args);
    } catch (err) {
      if (err instanceof RangeError) throw new BadRequestException(err.message);
      throw err;
    }
  }

  /** Descuento condicionado: nunca deja stock negativo aunque lleguen ventas simultáneas. */
  private async descontarStock(tx: Tx, sucursalId: string, linea: LineaPreparada, item: Item) {
    const { count } = await tx.stockLocal.updateMany({
      where: { sucursalId, itemId: linea.itemId, stockActual: { gte: linea.cantidad } },
      data: { stockActual: { decrement: linea.cantidad } },
    });
    if (count === 1) return;
    const stock = await tx.stockLocal.findUnique({
      where: { sucursalId_itemId: { sucursalId, itemId: linea.itemId } },
    });
    if (!stock) throw new NotFoundException(`Sin registro de stock para el ítem ${item.nombre}`);
    throw new BadRequestException(
      `Stock insuficiente para "${item.nombre}". Disponible: ${stock.stockActual}`,
    );
  }

  findAll(sucursalId?: string) {
    return this.prisma.transaccion.findMany({
      where: sucursalId ? { sucursalId } : undefined,
      include: { detalles: { include: { item: true } }, entidad: true },
      orderBy: { fechaRegistro: 'desc' },
    });
  }

  findOne(id: string) {
    return this.prisma.transaccion.findUniqueOrThrow({
      where: { id },
      include: { detalles: { include: { item: true } }, entidad: true, usuario: true },
    });
  }

  async findByFolio(folio: string) {
    const tx = await this.prisma.transaccion.findFirst({
      where: { numeroFactura: folio },
      include: { detalles: { include: { item: true } }, entidad: true, usuario: true },
    });
    if (!tx) throw new NotFoundException(`No existe boleta con folio "${folio}"`);
    return tx;
  }
}
