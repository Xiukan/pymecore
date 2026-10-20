import { useEffect, useState } from 'react'
import { abrirCaja, cerrarCaja, getCajaActual } from '@/api'
import type { SesionCaja } from '@/types'

const clp = (v: string | number) => {
  const n = Math.round(Number(v))
  return `${n < 0 ? '-' : ''}$${Math.abs(n).toLocaleString('es-CL')}`
}
const mensajeError = (e: any) => {
  const msg = e?.response?.data?.message ?? 'No se pudo completar la operación'
  return Array.isArray(msg) ? msg.join(', ') : msg
}

/** Estado de caja del cajero en el POS: apertura con fondo, arqueo en curso y cierre con informe Z. */
export default function CajaPos({ sucursalId, version, onCambio }: { sucursalId: string; version: number; onCambio: (abierta: boolean) => void }) {
  const [caja, setCaja] = useState<SesionCaja | null>(null)
  const [cargada, setCargada] = useState(false)
  const [fondo, setFondo] = useState('')
  const [cierre, setCierre] = useState<null | { contado: string; observaciones: string }>(null)
  const [informe, setInforme] = useState<SesionCaja | null>(null)
  const [error, setError] = useState('')

  const cargar = () =>
    getCajaActual()
      .then((r) => setCaja(r.data || null))
      .catch(() => setCaja(null))
      .finally(() => setCargada(true))

  useEffect(() => { cargar() }, [version])
  const abiertaAqui = !!caja && caja.sucursalId === sucursalId
  useEffect(() => { onCambio(abiertaAqui) }, [abiertaAqui])

  const abrir = async () => {
    setError('')
    try {
      await abrirCaja({ sucursalId, montoApertura: Number(fondo || 0) })
      setFondo('')
      cargar()
    } catch (e) {
      setError(mensajeError(e))
    }
  }

  const cerrar = async () => {
    if (!caja || !cierre) return
    setError('')
    try {
      const { data } = await cerrarCaja(caja.id, { efectivoContado: Number(cierre.contado || 0), observaciones: cierre.observaciones || undefined })
      setInforme(data)
      setCierre(null)
      cargar()
    } catch (e) {
      setError(mensajeError(e))
    }
  }

  if (!cargada) return null

  return (
    <div style={{ border: '1px solid #e2e8f0', borderRadius: 12, padding: 10, fontSize: 12 }}>
      {abiertaAqui ? (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <span>
            <b style={{ color: '#276749' }}>● Caja abierta</b> · fondo {clp(caja!.montoApertura)} · efectivo esperado{' '}
            <b>{clp(caja!.resumen?.efectivoEsperado ?? caja!.montoApertura)}</b>
          </span>
          <button onClick={() => setCierre({ contado: '', observaciones: '' })} style={{ border: '1px solid #e53e3e', color: '#e53e3e', background: 'white', borderRadius: 8, padding: '4px 10px', cursor: 'pointer' }}>
            Cerrar caja
          </button>
        </div>
      ) : caja ? (
        <p style={{ margin: 0, color: '#c05621' }}>Tienes una caja abierta en otra sucursal ({caja.sucursal?.nombre}). Ciérrala allí para vender aquí.</p>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <b style={{ color: '#c53030' }}>● Caja cerrada</b>
          <input type="number" min="0" placeholder="Fondo inicial" value={fondo} onChange={(e) => setFondo(e.target.value)}
            style={{ flex: 1, border: '1px solid #e2e8f0', borderRadius: 8, padding: '5px 8px' }} />
          <button onClick={abrir} style={{ background: '#38a169', color: 'white', border: 'none', borderRadius: 8, padding: '6px 12px', cursor: 'pointer' }}>
            Abrir caja
          </button>
        </div>
      )}
      {error && <p style={{ margin: '6px 0 0', color: '#c53030' }}>{error}</p>}

      {(cierre || informe) && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
          <div style={{ background: 'white', borderRadius: 14, padding: 20, width: 380, fontSize: 13 }}>
            {cierre && caja && (
              <>
                <h3 style={{ marginTop: 0 }}>Cierre de caja</h3>
                <ResumenTabla sesion={caja} />
                <p>Efectivo esperado: <b>{clp(caja.resumen?.efectivoEsperado ?? caja.montoApertura)}</b></p>
                <input type="number" min="0" placeholder="Efectivo contado" value={cierre.contado} onChange={(e) => setCierre({ ...cierre, contado: e.target.value })}
                  style={{ width: '100%', border: '1px solid #e2e8f0', borderRadius: 8, padding: 8, boxSizing: 'border-box' }} />
                <input placeholder="Observaciones (opcional)" maxLength={300} value={cierre.observaciones} onChange={(e) => setCierre({ ...cierre, observaciones: e.target.value })}
                  style={{ width: '100%', border: '1px solid #e2e8f0', borderRadius: 8, padding: 8, marginTop: 8, boxSizing: 'border-box' }} />
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
                  <button onClick={() => setCierre(null)} style={{ background: 'white', border: 'none', cursor: 'pointer' }}>Cancelar</button>
                  <button onClick={cerrar} disabled={cierre.contado === ''} style={{ background: '#e53e3e', color: 'white', border: 'none', borderRadius: 8, padding: '6px 14px', cursor: 'pointer' }}>Cerrar caja</button>
                </div>
              </>
            )}
            {informe && (
              <>
                <h3 style={{ marginTop: 0 }}>Informe Z</h3>
                <ResumenTabla sesion={informe} />
                <p>Esperado {clp(informe.efectivoEsperado ?? 0)} · Contado {clp(informe.efectivoContado ?? 0)}</p>
                <p style={{ fontWeight: 700, color: Number(informe.diferencia) === 0 ? '#276749' : '#c53030' }}>
                  Diferencia {Number(informe.diferencia) > 0 ? '+' : ''}{clp(informe.diferencia ?? 0)}
                </p>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                  <button onClick={() => window.print()} style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 8, padding: '6px 12px', cursor: 'pointer' }}>Imprimir</button>
                  <button onClick={() => setInforme(null)} style={{ background: '#3182ce', color: 'white', border: 'none', borderRadius: 8, padding: '6px 14px', cursor: 'pointer' }}>Listo</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export function ResumenTabla({ sesion }: { sesion: SesionCaja }) {
  const filas = sesion.resumen?.porMedio ?? []
  if (filas.length === 0) return <p style={{ color: '#a0aec0' }}>Sin movimientos.</p>
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 8 }}>
      <thead>
        <tr style={{ color: '#718096', textAlign: 'left' }}><th>Medio</th><th style={{ textAlign: 'right' }}>Ventas</th><th style={{ textAlign: 'right' }}>Reembolsos</th></tr>
      </thead>
      <tbody>
        {filas.map((f) => (
          <tr key={f.medio}>
            <td>{f.medio}</td>
            <td style={{ textAlign: 'right' }}>{f.ventas} · {clp(f.montoVentas)}</td>
            <td style={{ textAlign: 'right' }}>{f.reembolsos} · {clp(f.montoReembolsos)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
