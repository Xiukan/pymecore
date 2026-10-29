export type Rol = 'Administrador' | 'Encargado' | 'Vendedor'

export interface Pantalla {
  to: string
  label: string
  descripcion: string
  ayuda: string[]
  roles: Rol[] | null
  /** Se muestra si la empresa tiene activo alguno de estos módulos (sin valor: siempre). */
  modulos?: string[]
  /** Tiene ayuda pero no aparece en el menú (se llega desde otra pantalla). */
  oculta?: boolean
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
        to: '/pedidos',
        label: 'Cotizaciones y pedidos',
        descripcion: 'Prepara cotizaciones para clientes, imprímelas y conviértelas en venta cuando las acepten.',
        ayuda: ['Crea la cotización con el cliente y los productos: se usan sus precios.', 'Cuando el cliente acepte, márcala y luego "Vender" emite la factura.'],
        roles: null,
        modulos: ['pedidos'],
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
        modulos: ['devoluciones'],
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
        modulos: ['productores'],
      },
      {
        to: '/lotes',
        label: 'Vencimientos',
        descripcion: 'Qué insumos están por vencer, cuáles vencieron y cuáles no tienen fecha registrada.',
        ayuda: [
          '"Próximo a vencer" aparece a 3 días o menos (se cambia en Datos de la empresa).',
          '"Sin dato" significa que ese stock no tiene fecha: regístrala con "Registrar vencimiento".',
          'Toca un lote para ver de dónde vino y a quién se vendió.',
        ],
        roles: null,
      },
      {
        to: '/conteo',
        label: 'Conteo físico',
        descripcion: 'Cuenta lo que hay en bodega y el sistema corrige el stock, registrando faltantes y sobrantes.',
        ayuda: ['Anota lo que contaste de cada producto (deja vacío lo que no contaste).', 'Revisa las diferencias y presiona Aplicar.'],
        roles: GESTION,
        oculta: true,
      },
      {
        to: '/precios',
        label: 'Precios y ofertas',
        descripcion: 'Cambia precios y crea descuentos por tiempo limitado.',
        ayuda: ['Los precios incluyen IVA.', 'Una oferta se aplica sola en la caja mientras esté vigente.'],
        roles: GESTION,
        modulos: ['ofertas'],
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
        modulos: ['despachos'],
      },
    ],
  },
  {
    titulo: 'Campo',
    pantallas: [
      {
        to: '/campo',
        label: 'Mi campo',
        descripcion: 'Predios y cuarteles, cuaderno de aplicaciones, cosecha y cuánto te cuesta producir cada kilo.',
        ayuda: [
          'Anota cada aplicación en el cuaderno de campo: el sistema no deja cosechar mientras dure la carencia.',
          'Al cosechar, los kilos entran a bodega como lote con su costo.',
          'En Costos compara lo gastado con lo presupuestado para la temporada.',
        ],
        roles: GESTION,
        modulos: ['campo'],
      },
      {
        to: '/trabajadores',
        label: 'Trabajadores de temporada',
        descripcion: 'Jornadas, tratos, anticipos y pagos del personal de temporada y de contratistas.',
        ayuda: [
          'Anota cada día lo trabajado: por día o por kilos/cajas.',
          'Al pagar, los anticipos se descuentan solos.',
          'Revisa que los contratistas tengan su certificado F30-1 al día.',
        ],
        roles: GESTION,
        modulos: ['campo'],
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
        modulos: ['gastos'],
      },
      {
        to: '/finanzas',
        label: 'Bancos y flujo de caja',
        descripcion: 'Cuánta plata tendrás las próximas semanas, conciliación de la cartola del banco y activos fijos.',
        ayuda: [
          'En "¿Me alcanza la plata?" ves semana a semana lo que vas a cobrar y pagar.',
          'Sube la cartola del banco en CSV y marca a qué corresponde cada movimiento.',
          'Registra tractores, bodegas y equipos: la depreciación se calcula sola.',
        ],
        roles: ADMIN,
        modulos: ['finanzas'],
      },
      {
        to: '/cuentas',
        label: 'Me deben y debo',
        descripcion: 'Clientes que te compraron fiado y facturas de proveedores por pagar.',
        ayuda: ['Registra un abono cuando un cliente te paga una deuda.', 'Los montos atrasados aparecen primero.'],
        roles: null,
        modulos: ['clientes'],
      },
      {
        to: '/clientes',
        label: 'Clientes',
        descripcion: 'Datos de tus clientes y cuánto crédito les das.',
        ayuda: ['Necesitas el RUT para emitir factura o vender fiado.'],
        roles: null,
        modulos: ['clientes'],
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
        modulos: ['reportes'],
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
        modulos: ['contabilidad'],
      },
      {
        to: '/libros',
        label: 'Impuestos (IVA)',
        descripcion: 'Lo que debes declarar al SII cada mes.',
        ayuda: ['Elige el mes.', 'Entrega estos totales a tu contador o úsalos para el F29.'],
        roles: ADMIN,
        modulos: ['contabilidad'],
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

export const MODULOS: { id: string; nombre: string; descripcion: string }[] = [
  { id: 'ofertas', nombre: 'Precios y ofertas', descripcion: 'Descuentos por tiempo limitado y listas de precios por cliente.' },
  { id: 'devoluciones', nombre: 'Devoluciones', descripcion: 'Devoluciones y notas de crédito contra la venta original.' },
  { id: 'clientes', nombre: 'Clientes y fiado', descripcion: 'Ficha de clientes, venta a crédito y cobranza.' },
  { id: 'gastos', nombre: 'Gastos', descripcion: 'Gastos generales del negocio con su IVA y pago.' },
  { id: 'reportes', nombre: 'Reportes', descripcion: 'Gráficos de ventas, márgenes y productos.' },
  { id: 'pedidos', nombre: 'Cotizaciones y pedidos', descripcion: 'Preparar cotizaciones y convertirlas en venta.' },
  { id: 'contabilidad', nombre: 'Contabilidad e impuestos', descripcion: 'Balance, estado de resultados, libros, F29 y cierre de mes.' },
  { id: 'finanzas', nombre: 'Bancos y flujo de caja', descripcion: 'Conciliación bancaria, flujo proyectado y activos fijos.' },
  { id: 'productores', nombre: 'Compras a productores', descripcion: 'Recepción en kilos, castigos y factura de compra.' },
  { id: 'campo', nombre: 'Campo', descripcion: 'Cuarteles, cuaderno de campo, cosecha y trabajadores de temporada.' },
  { id: 'despachos', nombre: 'Varios locales', descripcion: 'Mover mercadería entre sucursales con guía de despacho.' },
]

/** Pantallas del menú según el rol y los módulos activos (sin módulos cargados, se muestran todas). */
export function seccionesPara(rol: string | undefined, modulos?: string[]): Seccion[] {
  return SECCIONES.map((s) => ({
    ...s,
    pantallas: s.pantallas.filter(
      (p) => !p.oculta && (!p.roles || p.roles.includes(rol as Rol)) && (!p.modulos || !modulos || p.modulos.some((m) => modulos.includes(m))),
    ),
  })).filter((s) => s.pantallas.length > 0)
}

export function pantallaDe(ruta: string): Pantalla | undefined {
  return SECCIONES.flatMap((s) => s.pantallas).find((p) => ruta === p.to || ruta.startsWith(`${p.to}/`))
}
