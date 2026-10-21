export type Rol = 'Administrador' | 'Encargado' | 'Vendedor'

export interface Pantalla {
  to: string
  label: string
  descripcion: string
  ayuda: string[]
  roles: Rol[] | null
}

export interface Seccion {
  titulo: string
  pantallas: Pantalla[]
}

const GESTION: Rol[] = ['Administrador', 'Encargado']
const ADMIN: Rol[] = ['Administrador']

export const SECCIONES: Seccion[] = [
  {
    titulo: 'Día a día',
    pantallas: [
      {
        to: '/ventas',
        label: 'Vender',
        descripcion: 'Cobra a un cliente y entrega la boleta o factura.',
        ayuda: ['Toca los productos que lleva el cliente.', 'Elige cómo paga.', 'Presiona Cobrar.'],
        roles: null,
      },
      {
        to: '/caja',
        label: 'Caja',
        descripcion: 'Abre la caja al empezar el día y ciérrala al terminar para saber si cuadra el dinero.',
        ayuda: ['Al abrir, anota cuánto efectivo hay en el cajón.', 'Al cerrar, cuenta el efectivo y anótalo: el sistema te dice si sobra o falta.'],
        roles: null,
      },
      {
        to: '/devoluciones',
        label: 'Devoluciones',
        descripcion: 'Cuando un cliente devuelve un producto que compró.',
        ayuda: ['Busca la venta por su número de boleta o factura.', 'Marca lo que devuelve y confirma.'],
        roles: null,
      },
      {
        to: '/historial',
        label: 'Ventas hechas',
        descripcion: 'Revisa las ventas anteriores y vuelve a imprimir documentos.',
        ayuda: ['Filtra por fecha o busca por número.'],
        roles: null,
      },
    ],
  },
  {
    titulo: 'Productos',
    pantallas: [
      {
        to: '/inventario',
        label: 'Productos y stock',
        descripcion: 'Lo que tienes para vender y cuánto queda de cada cosa.',
        ayuda: ['Los productos en rojo se están acabando.', 'Usa Ajustar si contaste y el número no coincide.'],
        roles: null,
      },
      {
        to: '/compras',
        label: 'Compras',
        descripcion: 'Registra lo que le compras a tus proveedores y la mercadería que llega.',
        ayuda: ['1. Haz el pedido al proveedor.', '2. Cuando llegue, marca lo recibido: el stock sube solo.', '3. Anota la factura del proveedor.'],
        roles: GESTION,
      },
      {
        to: '/productores',
        label: 'Compras a productores',
        descripcion: 'Recibe fruta, grano o ganado de productores: pesaje, descuentos por humedad o impurezas y pago por kilo.',
        ayuda: [
          'Elige productor y producto, anota el peso bruto y la tara de la romana.',
          'Si el productor no tiene factura, el sistema prepara tu factura de compra y retiene el IVA.',
          'Los anticipos que le diste se descuentan solos al pagarle.',
        ],
        roles: GESTION,
      },
      {
        to: '/lotes',
        label: 'Lotes y vencimientos',
        descripcion: 'De dónde vino cada partida, cuándo vence y a qué clientes se vendió.',
        ayuda: ['Los lotes en rojo ya vencieron; en naranjo vencen en menos de 30 días.', 'Toca un lote para ver su recorrido completo.'],
        roles: null,
      },
      {
        to: '/precios',
        label: 'Precios y ofertas',
        descripcion: 'Cambia precios y crea descuentos por tiempo limitado.',
        ayuda: ['Los precios incluyen IVA.', 'Una oferta se aplica sola en la caja mientras esté vigente.'],
        roles: GESTION,
      },
      {
        to: '/mermas',
        label: 'Pérdidas',
        descripcion: 'Anota productos que se perdieron, vencieron o se dañaron (mermas).',
        ayuda: ['Indica el producto, la cantidad y el motivo.', 'Se descuenta del stock y se cuenta como pérdida.'],
        roles: GESTION,
      },
      {
        to: '/despachos',
        label: 'Mover entre locales',
        descripcion: 'Envía mercadería de un local a otro con su guía de despacho.',
        ayuda: ['Crea la guía en el local que envía.', 'El local que recibe la marca como recibida.'],
        roles: GESTION,
      },
    ],
  },
  {
    titulo: 'Dinero',
    pantallas: [
      {
        to: '/gastos',
        label: 'Gastos',
        descripcion: 'Anota lo que gasta el negocio: luz, arriendo, combustible, sueldos, etc.',
        ayuda: ['Elige el tipo de gasto y el monto total.', 'Si tienes factura, el sistema separa el IVA solo.'],
        roles: GESTION,
      },
      {
        to: '/cuentas',
        label: 'Me deben y debo',
        descripcion: 'Clientes que te compraron fiado y facturas de proveedores por pagar.',
        ayuda: ['Registra un abono cuando un cliente te paga una deuda.', 'Los montos atrasados aparecen primero.'],
        roles: null,
      },
      {
        to: '/clientes',
        label: 'Clientes',
        descripcion: 'Datos de tus clientes y cuánto crédito les das.',
        ayuda: ['Necesitas el RUT para emitir factura o vender fiado.'],
        roles: null,
      },
      {
        to: '/documentos',
        label: 'Boletas y facturas',
        descripcion: 'Busca cualquier boleta, factura o nota de crédito emitida.',
        ayuda: ['Escribe el número del documento.'],
        roles: null,
      },
    ],
  },
  {
    titulo: 'Informes',
    pantallas: [
      {
        to: '/reportes',
        label: 'Cómo va el negocio',
        descripcion: 'Gráficos de ventas, ganancias y productos más vendidos.',
        ayuda: ['Elige el período arriba.', 'Resultado = lo que ganaste vendiendo menos pérdidas y gastos.'],
        roles: null,
      },
      {
        to: '/contabilidad',
        label: 'Contabilidad',
        descripcion: 'Ganancias y pérdidas, balance y libros contables. Se llenan solos con lo que registras.',
        ayuda: [
          'Ganancias y pérdidas te dice si el negocio ganó plata en el período.',
          'El contador encuentra aquí el balance de 8 columnas, el libro diario y el mayor.',
          'Cierra cada mes cuando lo declares al SII para que nadie lo modifique.',
        ],
        roles: ADMIN,
      },
      {
        to: '/libros',
        label: 'Impuestos (IVA)',
        descripcion: 'Lo que debes declarar al SII cada mes.',
        ayuda: ['Elige el mes.', 'Entrega estos totales a tu contador o úsalos para el F29.'],
        roles: ADMIN,
      },
    ],
  },
  {
    titulo: 'Ajustes',
    pantallas: [
      {
        to: '/usuarios',
        label: 'Personas que usan el sistema',
        descripcion: 'Crea cuentas para tus trabajadores y define qué pueden hacer.',
        ayuda: ['Vendedor: solo vende. Encargado: también compra y ajusta stock. Administrador: todo.'],
        roles: ADMIN,
      },
      {
        to: '/configuracion',
        label: 'Datos de la empresa',
        descripcion: 'RUT, razón social, dirección y otros datos que salen en tus documentos.',
        ayuda: ['Revisa estos datos antes de emitir tu primera factura.'],
        roles: ADMIN,
      },
    ],
  },
]

export function seccionesPara(rol: string | undefined): Seccion[] {
  return SECCIONES.map((s) => ({
    ...s,
    pantallas: s.pantallas.filter((p) => !p.roles || p.roles.includes(rol as Rol)),
  })).filter((s) => s.pantallas.length > 0)
}

export function pantallaDe(ruta: string): Pantalla | undefined {
  return SECCIONES.flatMap((s) => s.pantallas).find((p) => ruta === p.to || ruta.startsWith(`${p.to}/`))
}
