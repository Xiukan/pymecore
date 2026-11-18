import { Prisma } from '@prisma/client';

type Db = Pick<Prisma.TransactionClient, 'oferta' | 'entidad' | 'precioLista'>;

/** Rige el menor entre la oferta vigente y el precio del cliente (su lista, o el precio normal). */
export function elegirPrecio(base: Prisma.Decimal, lista?: Prisma.Decimal, ofertas: Prisma.Decimal[] = []) {
  const candidatos = [lista ?? base, ...ofertas];
  return candidatos.reduce((min, p) => (p.lt(min) ? p : min));
}

/** Precio de venta (IVA incluido) de cada ítem para el cliente, hoy. */
export async function preciosVigentes(db: Db, items: { id: string; precioVenta: Prisma.Decimal }[], entidadId?: string | null) {
  const ahora = new Date();
  const itemIds = items.map((i) => i.id);
  const [ofertas, entidad] = await Promise.all([
    db.oferta.findMany({ where: { itemId: { in: itemIds }, activo: true, fechaInicio: { lte: ahora }, fechaFin: { gte: ahora } } }),
    entidadId ? db.entidad.findUnique({ where: { id: entidadId }, select: { listaPrecio: { select: { id: true, activa: true } } } }) : null,
  ]);
  const lista = entidad?.listaPrecio?.activa ? entidad.listaPrecio.id : null;
  const deLista = lista ? await db.precioLista.findMany({ where: { listaId: lista, itemId: { in: itemIds } } }) : [];
  return new Map(
    items.map((i) => [
      i.id,
      elegirPrecio(
        i.precioVenta,
        deLista.find((p) => p.itemId === i.id)?.precio,
        ofertas.filter((o) => o.itemId === i.id).map((o) => o.precioOferta),
      ),
    ]),
  );
}
