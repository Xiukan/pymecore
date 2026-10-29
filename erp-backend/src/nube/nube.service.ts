import { Injectable } from '@nestjs/common';
import { firmarLease, LEASE_HORAS } from '../lease/lease';
import { PrismaService } from '../prisma/prisma.service';
import { enviarAlSiiSimulado } from '../sii/sii-gateway';
import { TX_OPCIONES } from '../utils/transacciones';
import { VentaDeLote } from './lote';

export interface Instalacion {
  id: string;
  tenantId: string;
}

@Injectable()
export class NubeService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * RecibirLote (ADR-02): cada venta se aplica una sola vez por su UUID, dentro de una
   * transacción por lote. Las nuevas se envían al SII (simulado); las repetidas solo informan
   * su estado guardado. Un reenvío del mismo lote no crea duplicados.
   */
  async recibirLote(lote: VentaDeLote[], inst: Instalacion) {
    return this.prisma.$transaction(async (tx) => {
      const ids = lote.map((v) => v.ventaId);
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'lote:' + inst.tenantId}))`;
      const previas = await tx.ventaNube.findMany({ where: { id: { in: ids } }, select: { id: true, tenantId: true, estadoDte: true, glosaSii: true } });
      const yaEstan = new Map(previas.map((p) => [p.id, p]));
      const nuevas = lote.filter((v) => !yaEstan.has(v.ventaId)).sort((a, b) => a.secuencia - b.secuencia);
      const respuestas = new Map<string, { estado: string; glosa: string | null }>();
      for (const v of nuevas) {
        const sii = enviarAlSiiSimulado(v.dte);
        await tx.ventaNube.create({
          data: {
            id: v.ventaId,
            tenantId: inst.tenantId,
            instalacionId: inst.id,
            secuencia: v.secuencia,
            creadaEn: new Date(v.creadaEn),
            total: v.total,
            payload: v as object,
            estadoDte: sii.estado,
            glosaSii: sii.glosa,
          },
        });
        respuestas.set(v.ventaId, { estado: sii.estado, glosa: sii.glosa });
      }
      for (const p of previas) {
        // Un UUID de otra PYME no se revela: se informa como duplicado sin estado.
        respuestas.set(p.id, p.tenantId === inst.tenantId ? { estado: p.estadoDte, glosa: p.glosaSii } : { estado: 'PENDIENTE_ENVIO_SII', glosa: null });
      }
      return {
        aceptadas: nuevas.map((v) => v.ventaId),
        duplicadas: previas.map((p) => p.id),
        dte: ids.map((id) => ({ ventaId: id, ...respuestas.get(id)! })),
      };
    }, TX_OPCIONES);
  }

  /** Emite una licencia de 24 h para el local (AC-07). */
  renovarLease(inst: Instalacion) {
    const secreto = process.env.LEASE_SECRET;
    if (!secreto) throw new Error('Falta LEASE_SECRET en la nube');
    const iat = Math.floor(Date.now() / 1000);
    const exp = iat + LEASE_HORAS * 3600;
    return { token: firmarLease({ instalacionId: inst.id, tenantId: inst.tenantId, iat, exp }, secreto), venceEn: new Date(exp * 1000).toISOString() };
  }

  /** Ventas consolidadas de la PYME (consulta de verificación). */
  ventas(tenantId: string) {
    return this.prisma.ventaNube.findMany({ where: { tenantId }, orderBy: { secuencia: 'asc' }, select: { id: true, secuencia: true, total: true, estadoDte: true, glosaSii: true, recibidaEn: true } });
  }
}
