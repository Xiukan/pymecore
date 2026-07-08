import { useEffect, useRef, useState } from 'react'
import { useAuth } from '@/context/AuthContext'
import { getItems, getStock, getSucursales, createTransaccion, getEntidadByRut, createEntidad, getOfertas, ejecutarSync } from '@/api'
import { useOnlineStatus } from '@/hooks/useOnlineStatus'
import { validarRut, calcularDv, rutConDv, formatRut, RUT_DEFAULT } from '@/utils/rut'
import { generarPdfBoleta } from '@/utils/pdfBoleta'
import type { Entidad, Item, Oferta, StockLocal, Sucursal } from '@/types'

interface LineaVenta {
  itemId: string; nombre: string; precioUnitario: number; cantidad: number; stockMax: number
}

const EMOJIS: [RegExp, string][] = [
  [/(monitor|pc|computa|notebook)/i, '🖥️'],
  [/(teclado)/i, '⌨️'],
  [/(mouse|raton)/i, '🖱️'],
  [/(cable|hdmi)/i, '🔌'],
  [/(memoria|ram|disco|ssd|nvme)/i, '💾'],
  [/(licencia|software|erp)/i, '💿'],
  [/(servic|instal|config)/i, '🛠️'],
  [/(carne|lomo|posta|asado|filete)/i, '🥩'],
  [/(pollo|ave)/i, '🐔'],
  [/(cerdo|chuleta|tocino)/i, '🥓'],
  [/(pescado|atun|salmon)/i, '🐟'],
  [/(pan|harina)/i, '🍞'],
  [/(leche|yogur|queso)/i, '🥛'],
  [/(agua|bebida|refresco)/i, '🥤'],
  [/(azucar|arroz|fideos|aceite)/i, '🌾'],
]

function emojiProducto(nombre: string) {
  for (const [re, emoji] of EMOJIS) if (re.test(nombre)) return emoji
  return '📦'
}

type PasoCliente = 'inicio' | 'buscar' | 'registrar' | 'ok'

export default function VentasPage() {
  const { user } = useAuth()
  const online = useOnlineStatus()
  const [sucursales, setSucursales] = useState<Sucursal[]>([])
  const [sucursalId, setSucursalId] = useState(user?.sucursalId ?? '')
  const [items, setItems] = useState<Item[]>([])
  const [ofertaMap, setOfertaMap] = useState<Map<string, number>>(new Map())
  const [stockMap, setStockMap] = useState<Map<string, number>>(new Map())
  const [lineas, setLineas] = useState<LineaVenta[]>([])
  const [busqueda, setBusqueda] = useState('')
  const [tipoDoc, setTipoDoc] = useState<39 | 33>(39)
  const [loading, setLoading] = useState(false)
  const [mensaje, setMensaje] = useState<{ tipo: 'ok' | 'err'; texto: string } | null>(null)
  const [ultimaVenta, setUltimaVenta] = useState<any>(null)
  const busquedaRef = useRef<HTMLInputElement>(null)

  // Estado cliente/RUT
  const [pasoCliente, setPasoCliente] = useState<PasoCliente>('inicio')
  const [rutInput, setRutInput] = useState('')
  const [rutError, setRutError] = useState('')
  const [clienteBuscado, setClienteBuscado] = useState<Entidad | null>(null)
  const [buscandoRut, setBuscandoRut] = useState(false)
  const [regNombre, setRegNombre] = useState('')
  const [regApellido, setRegApellido] = useState('')
  const [regEmail, setRegEmail] = useState('')
  const [regDireccion, setRegDireccion] = useState('')
  const [registrando, setRegistrando] = useState(false)
  const [entidadId, setEntidadId] = useState<string | undefined>()
  const [rutFinal, setRutFinal] = useState(RUT_DEFAULT)
  const [razonSocial, setRazonSocial] = useState('CLIENTE FINAL')

  useEffect(() => {
    if (user?.rol === 'Administrador') {
      getSucursales().then((r) => {
        setSucursales(r.data)
        if (!user.sucursalId && r.data.length > 0) setSucursalId(r.data[0].id)
      })
    }
    getItems().then((r) => setItems(r.data.filter((i) => i.estado === 'Activo')))
    getOfertas(true).then((r) => {
      const map = new Map<string, number>()
      r.data.forEach((o: Oferta) => map.set(o.itemId, Number(o.precioOferta)))
      setOfertaMap(map)
    })
  }, [user])

  useEffect(() => {
    if (!sucursalId) return
    getStock(sucursalId).then((r) => {
      const map = new Map<string, number>()
      r.data.forEach((s: StockLocal) => map.set(s.itemId, parseFloat(s.stockActual)))
      setStockMap(map)
    })
  }, [sucursalId])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'F2') { e.preventDefault(); busquedaRef.current?.focus(); busquedaRef.current?.select() }
      if (e.key === 'F3') { e.preventDefault(); if (lineas.length > 0) handleCobrar() }
      if (e.key === 'Escape') { e.preventDefault(); if (window.confirm('¿Vaciar la venta?')) setLineas([]) }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [lineas])

  // Calcular DV mientras escribe
  const handleRutChange = (valor: string) => {
    const limpio = valor.replace(/[^0-9kK.\-]/g, '')
    setRutInput(limpio)
    setRutError('')
  }

  const buscarCliente = async () => {
    const limpio = rutInput.replace(/[.\-]/g, '').toUpperCase()
    if (!limpio) { setRutError('Ingresa un RUT'); return }

    let rutFormateado: string
    if (limpio.length >= 2 && !limpio.includes('-')) {
      const cuerpo = limpio.replace(/[kK]/g, '')
      const dvCalculado = calcularDv(cuerpo)
      rutFormateado = `${cuerpo}-${dvCalculado}`
    } else {
      rutFormateado = limpio
    }

    if (!validarRut(rutFormateado)) {
      const cuerpo = limpio.replace(/[kK-]/g, '')
      const dvEsperado = calcularDv(cuerpo)
      setRutError(`RUT inválido. Dígito verificador correcto: ${dvEsperado.toUpperCase()}`)
      return
    }

    setBuscandoRut(true)
    setRutError('')
    try {
      const { data } = await getEntidadByRut(rutFormateado)
      if (data) {
        setClienteBuscado(data)
        setEntidadId(data.id)
        setRutFinal(rutFormateado)
        setRazonSocial(data.nombreRazonSocial)
        setPasoCliente('ok')
      } else {
        setPasoCliente('registrar')
        setRutFinal(rutFormateado)
      }
    } catch {
      setPasoCliente('registrar')
      setRutFinal(rutFormateado)
    } finally {
      setBuscandoRut(false)
    }
  }

  const usarSinRut = () => {
    setRutFinal(RUT_DEFAULT)
    setRazonSocial('CLIENTE FINAL')
    setEntidadId(undefined)
    setPasoCliente('ok')
  }

  const registrarCliente = async () => {
    if (!regNombre.trim()) { setRutError('El nombre es obligatorio'); return }
    setRegistrando(true)
    try {
      const { data } = await createEntidad({
        tipoEntidad: 'CLIENTE',
        rut: rutFinal,
        nombreRazonSocial: `${regNombre.trim()} ${regApellido.trim()}`.trim(),
        email: regEmail || undefined,
        direccion: regDireccion || undefined,
      })
      setClienteBuscado(data)
      setEntidadId(data.id)
      setRazonSocial(data.nombreRazonSocial)
      setPasoCliente('ok')
    } catch (e: any) {
      setRutError(e?.response?.data?.message ?? 'Error al registrar')
    } finally {
      setRegistrando(false)
    }
  }

  const resetCliente = () => {
    setPasoCliente('inicio')
    setRutInput('')
    setRutError('')
    setClienteBuscado(null)
    setEntidadId(undefined)
    setRegNombre(''); setRegApellido(''); setRegEmail(''); setRegDireccion('')
    setRutFinal(RUT_DEFAULT)
    setRazonSocial('CLIENTE FINAL')
  }

  const precioEfectivo = (item: Item) =>
    ofertaMap.has(item.id) ? ofertaMap.get(item.id)! : parseFloat(item.precioVenta)

  const agregarItem = (item: Item) => {
    const stock = stockMap.get(item.id) ?? 0
    if (stock <= 0) return
    const precio = precioEfectivo(item)
    setLineas((prev) => {
      const existe = prev.find((l) => l.itemId === item.id)
      if (existe) {
        if (existe.cantidad >= stock) { alert(`Stock máximo: ${stock}`); return prev }
        return prev.map((l) => l.itemId === item.id ? { ...l, cantidad: l.cantidad + 1 } : l)
      }
      return [...prev, { itemId: item.id, nombre: item.nombre, precioUnitario: precio, cantidad: 1, stockMax: stock }]
    })
  }

  const cambiarCantidad = (itemId: string, delta: number) => {
    setLineas((prev) => prev.flatMap((l) => {
      if (l.itemId !== itemId) return [l]
      const nueva = l.cantidad + delta
      if (nueva <= 0) return []
      if (nueva > l.stockMax) { alert(`Stock máximo: ${l.stockMax}`); return [l] }
      return [{ ...l, cantidad: nueva }]
    }))
  }

  const eliminarLinea = (itemId: string) => setLineas((p) => p.filter((l) => l.itemId !== itemId))
  const total = lineas.reduce((s, l) => s + l.precioUnitario * l.cantidad, 0)

  const handleCobrar = async () => {
    if (!sucursalId || lineas.length === 0) return
    if (pasoCliente === 'inicio') {
      setPasoCliente('buscar')
      return
    }
    if (!window.confirm(`¿Confirmar cobro de $${Math.round(total).toLocaleString('es-CL')}?`)) return
    setLoading(true)
    setMensaje(null)
    try {
      const res = await createTransaccion({
        sucursalId,
        usuarioId: user!.id,
        entidadId,
        tipoTransaccion: 'VENTA',
        medioPago: 'Efectivo',
        rutReceptor: rutFinal,
        razonSocialReceptor: razonSocial,
        tipoDocumento: tipoDoc,
        detalles: lineas.map((l) => ({ itemId: l.itemId, cantidad: l.cantidad, precioUnitario: l.precioUnitario })),
      })
      const dte = (res.data as any)?.dte
      const folio = dte?.folio ?? (res.data as any)?.numeroFactura ?? '?'
      setUltimaVenta({ dte, transaccion: res.data, lineas: [...lineas], rutFinal, razonSocial, tipoDoc })
      setLineas([])
      setBusqueda('')
      const estadoSii = online ? 'enviada al SII' : 'pendiente de envío (sin conexión)'
      setMensaje({ tipo: 'ok', texto: `${tipoDoc === 39 ? 'Boleta' : 'Factura'} N° ${folio} emitida — ${estadoSii}` })
      if (online) ejecutarSync(sucursalId).catch(() => {})
      resetCliente()
      getStock(sucursalId).then((r) => {
        const map = new Map<string, number>()
        r.data.forEach((s: StockLocal) => map.set(s.itemId, parseFloat(s.stockActual)))
        setStockMap(map)
      })
    } catch (err: unknown) {
      const msg = (err as any).response?.data?.message ?? 'Error al procesar'
      setMensaje({ tipo: 'err', texto: Array.isArray(msg) ? msg.join(', ') : msg })
    } finally {
      setLoading(false)
    }
  }

  const descargarUltimoPdf = () => {
    if (!ultimaVenta) return
    const { dte, transaccion, lineas: ls, rutFinal: rut, razonSocial: rs, tipoDoc: td } = ultimaVenta
    generarPdfBoleta({
      folio: dte?.folio ?? parseInt(transaccion.numeroFactura ?? '0'),
      tipoDoc: td,
      fecha: new Date().toLocaleDateString('es-CL'),
      rutEmisor: '76.000.000-1',
      razonSocialEmisor: 'PYMECORE SPA',
      rutReceptor: rut,
      razonSocialReceptor: rs,
      medioPago: 'Efectivo',
      sucursal: '',
      detalles: ls.map((l: LineaVenta) => ({ nombre: l.nombre, cantidad: l.cantidad, precio: l.precioUnitario, subtotal: l.precioUnitario * l.cantidad })),
      montoTotal: Math.round(ls.reduce((s: number, l: LineaVenta) => s + l.precioUnitario * l.cantidad, 0)),
      metadatosSii: dte ?? transaccion.metadatosSii,
    })
  }

  const itemsFiltrados = items.filter((i) => {
    if (!busqueda) return true
    const b = busqueda.toLowerCase()
    return i.nombre.toLowerCase().includes(b) || i.codigoSku.toLowerCase().includes(b)
  })

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 400px', gap: 16, minHeight: 'calc(100vh - 48px)' }}>

      {/* PANEL IZQUIERDO */}
      <div style={{ background: 'white', borderRadius: 16, padding: 18, boxShadow: '0 4px 12px rgba(0,0,0,0.06)', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <h1 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: '#1a202c' }}>Punto de Venta</h1>
          {user?.rol === 'Administrador' && sucursales.length > 0 && (
            <select value={sucursalId} onChange={(e) => setSucursalId(e.target.value)}
              style={{ marginLeft: 'auto', border: '1px solid #e2e8f0', borderRadius: 8, padding: '6px 10px', fontSize: 13 }}>
              {sucursales.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
            </select>
          )}
        </div>

        <div style={{ position: 'relative' }}>
          <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>🔍</span>
          <input
            ref={busquedaRef}
            type="text"
            placeholder="Buscar producto... (F2)"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            style={{ width: '100%', padding: '13px 16px 13px 44px', border: '2px solid #e2e8f0', borderRadius: 12, fontSize: '1rem', outline: 'none', boxSizing: 'border-box' }}
            onFocus={(e) => (e.target.style.borderColor = '#3182ce')}
            onBlur={(e) => (e.target.style.borderColor = '#e2e8f0')}
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10, overflowY: 'auto', maxHeight: '62vh', padding: 2 }}>
          {itemsFiltrados.map((item) => {
            const stock = stockMap.get(item.id) ?? 0
            const sinStock = stock <= 0
            const stockBajo = !sinStock && stock <= 5
            return (
              <div
                key={item.id}
                onClick={() => !sinStock && agregarItem(item)}
                style={{ background: sinStock ? '#f7fafc' : 'white', border: '2px solid #e2e8f0', borderRadius: 14, padding: '14px 10px', cursor: sinStock ? 'not-allowed' : 'pointer', textAlign: 'center', position: 'relative', opacity: sinStock ? 0.45 : 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, transition: 'all .15s', userSelect: 'none' }}
                onMouseEnter={(e) => { if (!sinStock) { (e.currentTarget as HTMLDivElement).style.borderColor = '#48bb78'; (e.currentTarget as HTMLDivElement).style.boxShadow = '0 4px 12px rgba(72,187,120,0.2)' } }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = '#e2e8f0'; (e.currentTarget as HTMLDivElement).style.boxShadow = 'none' }}
              >
                {sinStock && <span style={{ position: 'absolute', top: 5, right: 5, background: '#e53e3e', color: 'white', fontSize: 9, padding: '2px 6px', borderRadius: 8, fontWeight: 700 }}>SIN STOCK</span>}
                {stockBajo && <span style={{ position: 'absolute', top: 5, right: 5, background: '#d69e2e', color: 'white', fontSize: 9, padding: '2px 6px', borderRadius: 8, fontWeight: 700 }}>POCO: {stock}</span>}
                <span style={{ fontSize: '2.2rem' }}>{emojiProducto(item.nombre)}</span>
                <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#2d3748', lineHeight: 1.2 }}>{item.nombre}</span>
                {ofertaMap.has(item.id) ? (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
                    <span style={{ color: '#e53e3e', fontWeight: 800, fontSize: '0.95rem' }}>${ofertaMap.get(item.id)!.toLocaleString('es-CL')}</span>
                    <span style={{ color: '#a0aec0', fontSize: '0.75rem', textDecoration: 'line-through' }}>${parseFloat(item.precioVenta).toLocaleString('es-CL')}</span>
                    <span style={{ background: '#e53e3e', color: 'white', fontSize: 8, padding: '1px 5px', borderRadius: 6, fontWeight: 700 }}>OFERTA</span>
                  </div>
                ) : (
                  <span style={{ color: '#38a169', fontWeight: 800, fontSize: '0.95rem' }}>${parseFloat(item.precioVenta).toLocaleString('es-CL')}</span>
                )}
                {!sinStock && !stockBajo && <span style={{ fontSize: 10, color: '#a0aec0' }}>Stock: {stock}</span>}
              </div>
            )
          })}
          {itemsFiltrados.length === 0 && (
            <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: 40, color: '#a0aec0' }}>
              <div style={{ fontSize: '2.5rem', opacity: 0.5 }}>📦</div>
              <p style={{ margin: '8px 0 0' }}>Sin resultados</p>
            </div>
          )}
        </div>

        <p style={{ margin: 0, fontSize: 11, color: '#a0aec0', textAlign: 'center' }}>
          <kbd style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 4, padding: '1px 5px', fontFamily: 'monospace', fontSize: 10 }}>F2</kbd> buscar ·&nbsp;
          <kbd style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 4, padding: '1px 5px', fontFamily: 'monospace', fontSize: 10 }}>F3</kbd> cobrar ·&nbsp;
          <kbd style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 4, padding: '1px 5px', fontFamily: 'monospace', fontSize: 10 }}>Esc</kbd> vaciar
        </p>
      </div>

      {/* PANEL DERECHO */}
      <div style={{ background: 'white', borderRadius: 16, padding: 20, boxShadow: '0 4px 12px rgba(0,0,0,0.06)', display: 'flex', flexDirection: 'column', gap: 12, position: 'sticky', top: 16, maxHeight: 'calc(100vh - 32px)', overflowY: 'auto' }}>

        <div style={{ borderBottom: '2px solid #f7fafc', paddingBottom: 12 }}>
          <h2 style={{ margin: 0, fontSize: '1.1rem', color: '#2d3748' }}>🛒 Venta actual</h2>
          <p style={{ margin: '4px 0 0', fontSize: 12, color: '#a0aec0' }}>
            {lineas.length === 0 ? 'Sin productos' : `${lineas.length} productos · ${lineas.reduce((s, l) => s + l.cantidad, 0)} unidades`}
          </p>
        </div>

        {/* Carrito */}
        <div style={{ flex: 1, overflowY: 'auto', maxHeight: '28vh', display: 'flex', flexDirection: 'column' }}>
          {lineas.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '20px 0', color: '#a0aec0' }}>
              <div style={{ fontSize: '2rem', opacity: 0.4 }}>🛒</div>
              <p style={{ margin: '8px 0 0', fontSize: 13 }}>Toca un producto para empezar</p>
            </div>
          ) : lineas.map((l) => (
            <div key={l.itemId} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', borderBottom: '1px solid #f7fafc' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#2d3748', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.nombre}</div>
                <div style={{ fontSize: 11, color: '#a0aec0' }}>${l.precioUnitario.toLocaleString('es-CL')} c/u</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: '#f7fafc', padding: '2px 6px', borderRadius: 20 }}>
                <button onClick={() => cambiarCantidad(l.itemId, -1)} style={{ border: 'none', background: 'white', width: 24, height: 24, borderRadius: '50%', cursor: 'pointer', fontWeight: 700, fontSize: '0.9rem', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>−</button>
                <span style={{ fontWeight: 700, minWidth: 18, textAlign: 'center', fontSize: 13 }}>{l.cantidad}</span>
                <button onClick={() => cambiarCantidad(l.itemId, 1)} style={{ border: 'none', background: 'white', width: 24, height: 24, borderRadius: '50%', cursor: 'pointer', fontWeight: 700, fontSize: '0.9rem', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>+</button>
              </div>
              <span style={{ fontWeight: 700, color: '#38a169', fontSize: 12, minWidth: 65, textAlign: 'right' }}>${(l.precioUnitario * l.cantidad).toLocaleString('es-CL')}</span>
              <button onClick={() => eliminarLinea(l.itemId)} style={{ border: 'none', background: 'none', color: '#fc8181', cursor: 'pointer', fontSize: '0.9rem', padding: 2 }}>✕</button>
            </div>
          ))}
        </div>

        {/* Total */}
        <div style={{ background: '#f7fafc', borderRadius: 12, padding: '10px 14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: 800, fontSize: '1rem', color: '#2d3748' }}>TOTAL</span>
            <span style={{ fontWeight: 800, fontSize: '1.5rem', color: '#38a169' }}>${Math.round(total).toLocaleString('es-CL')}</span>
          </div>
        </div>

        {/* Tipo documento */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {([39, 33] as const).map((t) => (
            <div key={t} onClick={() => setTipoDoc(t)}
              style={{ padding: '8px', border: `2px solid ${tipoDoc === t ? '#38a169' : '#e2e8f0'}`, borderRadius: 10, textAlign: 'center', cursor: 'pointer', fontSize: 12, fontWeight: 600, background: tipoDoc === t ? '#f0fff4' : 'white', color: tipoDoc === t ? '#276749' : '#718096', transition: 'all .15s' }}>
              {t === 39 ? '📄 Boleta' : '🧾 Factura'}
            </div>
          ))}
        </div>

        {/* Sección cliente */}
        <div style={{ border: '1px solid #e2e8f0', borderRadius: 12, padding: 12 }}>
          {pasoCliente === 'inicio' && (
            <div>
              <p style={{ margin: 0, fontSize: 12, color: '#718096', fontWeight: 600 }}>Cliente</p>
              <p style={{ margin: '4px 0 8px', fontSize: 12, color: '#a0aec0' }}>Sin cliente asignado (se usará RUT por defecto)</p>
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={() => setPasoCliente('buscar')} style={{ flex: 1, padding: '7px 10px', border: '1px solid #3182ce', borderRadius: 8, background: 'white', color: '#3182ce', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                  Buscar por RUT
                </button>
                <button onClick={usarSinRut} style={{ flex: 1, padding: '7px 10px', border: '1px solid #e2e8f0', borderRadius: 8, background: 'white', color: '#718096', fontSize: 12, cursor: 'pointer' }}>
                  Sin RUT
                </button>
              </div>
            </div>
          )}

          {pasoCliente === 'buscar' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: '#2d3748' }}>Ingresa el RUT</p>
              <p style={{ margin: 0, fontSize: 11, color: '#a0aec0' }}>El dígito verificador se calcula automáticamente</p>
              <div style={{ display: 'flex', gap: 6 }}>
                <input
                  type="text"
                  value={rutInput}
                  onChange={(e) => handleRutChange(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && buscarCliente()}
                  placeholder="12345678 o 12345678-9"
                  autoFocus
                  style={{ flex: 1, padding: '8px 10px', border: '2px solid #e2e8f0', borderRadius: 8, fontSize: 13, outline: 'none' }}
                />
                <button onClick={buscarCliente} disabled={buscandoRut}
                  style={{ padding: '8px 12px', background: '#3182ce', color: 'white', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                  {buscandoRut ? '...' : 'Buscar'}
                </button>
              </div>
              {rutInput.replace(/[.\-kK]/g, '').length >= 7 && (
                <p style={{ margin: 0, fontSize: 11, color: '#718096' }}>
                  DV calculado: <strong>{calcularDv(rutInput.replace(/[.\-kK]/g, '')).toUpperCase()}</strong>
                  {' · '}RUT completo: <strong>{rutConDv(rutInput.replace(/[.\-kK]/g, ''))}</strong>
                </p>
              )}
              {rutError && <p style={{ margin: 0, fontSize: 11, color: '#e53e3e' }}>{rutError}</p>}
              <button onClick={usarSinRut} style={{ marginTop: 2, background: 'none', border: 'none', color: '#a0aec0', fontSize: 11, cursor: 'pointer', textAlign: 'left' }}>
                → Continuar sin RUT ({RUT_DEFAULT})
              </button>
            </div>
          )}

          {pasoCliente === 'registrar' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: '#2d3748' }}>
                RUT {rutFinal} no registrado. Registrar cliente:
              </p>
              <input type="text" value={regNombre} onChange={(e) => setRegNombre(e.target.value)} placeholder="Nombre *" style={{ padding: '7px 10px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 12 }} />
              <input type="text" value={regApellido} onChange={(e) => setRegApellido(e.target.value)} placeholder="Apellido" style={{ padding: '7px 10px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 12 }} />
              {tipoDoc === 33 && (
                <>
                  <input type="text" value={regDireccion} onChange={(e) => setRegDireccion(e.target.value)} placeholder="Dirección empresa *" style={{ padding: '7px 10px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 12 }} />
                  <input type="email" value={regEmail} onChange={(e) => setRegEmail(e.target.value)} placeholder="Email empresa" style={{ padding: '7px 10px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 12 }} />
                </>
              )}
              {!tipoDoc || tipoDoc === 39 ? (
                <input type="email" value={regEmail} onChange={(e) => setRegEmail(e.target.value)} placeholder="Email (opcional)" style={{ padding: '7px 10px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 12 }} />
              ) : null}
              {rutError && <p style={{ margin: 0, fontSize: 11, color: '#e53e3e' }}>{rutError}</p>}
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={registrarCliente} disabled={registrando}
                  style={{ flex: 1, padding: '7px', background: '#38a169', color: 'white', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                  {registrando ? 'Registrando...' : 'Registrar y continuar'}
                </button>
                <button onClick={usarSinRut}
                  style={{ flex: 1, padding: '7px', border: '1px solid #e2e8f0', borderRadius: 8, background: 'white', color: '#718096', fontSize: 12, cursor: 'pointer' }}>
                  Sin datos
                </button>
              </div>
            </div>
          )}

          {pasoCliente === 'ok' && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: '#276749' }}>✓ {razonSocial}</p>
                <p style={{ margin: 0, fontSize: 11, color: '#a0aec0' }}>{rutFinal}</p>
              </div>
              <button onClick={resetCliente} style={{ background: 'none', border: 'none', color: '#a0aec0', fontSize: 11, cursor: 'pointer' }}>Cambiar</button>
            </div>
          )}
        </div>

        {mensaje && (
          <div style={{ padding: '10px 14px', borderRadius: 10, fontSize: 13, fontWeight: 500, background: mensaje.tipo === 'ok' ? '#f0fff4' : '#fff5f5', color: mensaje.tipo === 'ok' ? '#276749' : '#c53030', border: `1px solid ${mensaje.tipo === 'ok' ? '#c6f6d5' : '#fed7d7'}` }}>
            {mensaje.texto}
            {mensaje.tipo === 'ok' && ultimaVenta && (
              <button onClick={descargarUltimoPdf} style={{ marginLeft: 10, background: 'none', border: 'none', color: '#276749', textDecoration: 'underline', cursor: 'pointer', fontSize: 12 }}>
                Descargar PDF
              </button>
            )}
          </div>
        )}

        <button
          onClick={handleCobrar}
          disabled={loading || lineas.length === 0 || !sucursalId}
          style={{
            width: '100%', padding: '18px',
            background: lineas.length === 0 || loading ? '#e2e8f0' : 'linear-gradient(135deg, #38a169, #48bb78)',
            color: lineas.length === 0 || loading ? '#a0aec0' : 'white',
            border: 'none', borderRadius: 14, fontSize: '1.2rem', fontWeight: 800,
            cursor: lineas.length === 0 || loading ? 'not-allowed' : 'pointer',
            boxShadow: lineas.length > 0 ? '0 6px 16px rgba(56,161,105,0.3)' : 'none',
            transition: 'all .2s', letterSpacing: 1, textTransform: 'uppercase',
          }}
        >
          {loading ? 'Procesando...' : pasoCliente === 'inicio' && lineas.length > 0 ? '💳 Identificar cliente (F3)' : '💰 Cobrar (F3)'}
        </button>

        {lineas.length > 0 && (
          <button
            onClick={() => { if (window.confirm('¿Vaciar la venta?')) { setLineas([]); resetCliente() } }}
            style={{ width: '100%', padding: 8, background: 'white', color: '#718096', border: '1px dashed #e2e8f0', borderRadius: 8, fontSize: 12, cursor: 'pointer' }}
          >
            🗑️ Vaciar venta
          </button>
        )}
      </div>
    </div>
  )
}
