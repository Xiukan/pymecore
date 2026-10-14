import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcrypt';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}

async function main() {
  console.log('Seeding PYMECORE...');

  const sucursal = await prisma.sucursal.upsert({
    where: { id: '00000000-0000-0000-0000-000000000001' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000001',
      nombre: 'Casa Matriz Santiago',
      direccion: 'Av. Providencia 1234, Santiago',
    },
  });

  // Administrador sin sucursal asignada (acceso global)
  await prisma.usuario.upsert({
    where: { username: 'admin' },
    update: { passwordHash: await hashPassword('admin1234'), sucursalId: null },
    create: {
      nombreCompleto: 'Administrador Principal',
      username: 'admin',
      passwordHash: await hashPassword('admin1234'),
      rol: 'Administrador',
    },
  });

  // Vendedor asignado a la sucursal creada
  await prisma.usuario.upsert({
    where: { username: 'vendedor1' },
    update: { passwordHash: await hashPassword('vend1234'), sucursalId: sucursal.id },
    create: {
      nombreCompleto: 'Juan Pérez',
      username: 'vendedor1',
      passwordHash: await hashPassword('vend1234'),
      rol: 'Vendedor',
      sucursalId: sucursal.id,
    },
  });

  // Parámetros de la empresa: solo se crean si faltan, nunca se pisan los editados.
  await prisma.empresa.upsert({
    where: { id: 1 },
    update: {},
    create: {
      id: 1,
      rut: '76.000.000-1',
      razonSocial: 'EMPRESA PRUEBA SPA',
      giro: 'TECNOLOGIA',
      direccion: 'AV. TESIS 123',
      comuna: 'VILLA ALEGRE',
    },
  });
  for (const [codigo, nombre] of [
    ['UN', 'Unidad'], ['KG', 'Kilogramo'], ['GR', 'Gramo'], ['LT', 'Litro'], ['ML', 'Mililitro'],
    ['MT', 'Metro'], ['M2', 'Metro cuadrado'], ['CJ', 'Caja'], ['PAQ', 'Paquete'], ['DOC', 'Docena'],
  ]) {
    await prisma.unidadMedida.upsert({ where: { codigo }, update: {}, create: { codigo, nombre } });
  }

  const items = await Promise.all([
    prisma.item.upsert({
      where: { codigoSku: 'ITEM-001' },
      update: {},
      create: {
        codigoSku: 'ITEM-001',
        nombre: 'Café Molido 250g',
        unidadMedida: 'UN',
        precioVenta: 3490,
        costoPromedio: 1800,
        afectoIva: true,
      },
    }),
    prisma.item.upsert({
      where: { codigoSku: 'ITEM-002' },
      update: {},
      create: {
        codigoSku: 'ITEM-002',
        nombre: 'Azúcar 1kg',
        unidadMedida: 'UN',
        precioVenta: 1290,
        costoPromedio: 700,
        afectoIva: true,
      },
    }),
    prisma.item.upsert({
      where: { codigoSku: 'ITEM-003' },
      update: {},
      create: {
        codigoSku: 'ITEM-003',
        nombre: 'Agua Mineral 500ml',
        unidadMedida: 'UN',
        precioVenta: 590,
        costoPromedio: 200,
        afectoIva: false,
      },
    }),
  ]);

  for (const item of items) {
    await prisma.stockLocal.upsert({
      where: { sucursalId_itemId: { sucursalId: sucursal.id, itemId: item.id } },
      update: {},
      create: {
        sucursalId: sucursal.id,
        itemId: item.id,
        stockActual: 100,
        stockMinimo: 10,
      },
    });
  }

  await prisma.entidad.upsert({
    where: { id: '00000000-0000-0000-0000-000000000002' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000002',
      tipoEntidad: 'CLIENTE',
      rut: '12345678-9',
      nombreRazonSocial: 'Empresa Demo SpA',
      telefono: '+56912345678',
      email: 'contacto@demo.cl',
      direccion: 'Calle Falsa 123, Providencia',
    },
  });

  await prisma.entidad.upsert({
    where: { id: '00000000-0000-0000-0000-000000000003' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000003',
      tipoEntidad: 'PROVEEDOR',
      rut: '76543210-3',
      nombreRazonSocial: 'Distribuidora Demo Ltda',
      email: 'ventas@distribuidorademo.cl',
    },
  });

  console.log(`Sucursal:  ${sucursal.nombre}`);
  console.log(`Usuarios:  admin, vendedor1`);
  console.log(`Items:     ${items.map((i) => i.codigoSku).join(', ')}`);
  console.log(`Stock:     100 unidades por item en casa matriz`);
  console.log(`Cliente:   Empresa Demo SpA (12345678-9)`);
  console.log(`Proveedor: Distribuidora Demo Ltda (76543210-3)`);
  console.log('Seed completado.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
