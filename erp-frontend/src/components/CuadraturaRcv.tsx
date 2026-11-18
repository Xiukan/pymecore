import { useState } from 'react'
import { cuadrarRcv } from '@/api'
import { mensajeError } from '@/utils/contabilidad'
import { clp } from '@/utils/formato'

type Resultado = Awaited<ReturnType<typeof cuadrarRcv>>['data']

/** Sube el detalle del Registro de Compras del SII y muestra lo que no calza con el libro. */
export default function CuadraturaRcv({ mes }: { mes: string }) {
  const [r, setR] = useState<Resultado | null>(null)
  const [error, setError] = useState('')
  const subir = async (archivo?: File) => {
    if (!archivo) return
    setError('')
    try {
      setR((await cuadrarRcv(mes, await archivo.text())).data)
    } catch (e) {
      setError(mensajeError(e))
    }
  }
  const lista = (titulo: string, filas: { folio: string; razonSocial: string; tipoDte: number; total: number; totalSistema?: number }[], ayuda: string) =>
    filas.length > 0 && (
      <div>
        <p className="font-medium">{titulo} ({filas.length})</p>
        <p className="text-gray-500 text-xs">{ayuda}</p>
        {filas.map((f) => (
          <p key={`${f.tipoDte}${f.folio}${f.razonSocial}`} className="flex justify-between">
            <span>Tipo {f.tipoDte} N° {f.folio} · {f.razonSocial}</span>
            <span>{clp(f.total)}{f.totalSistema !== undefined ? ` (sistema ${clp(f.totalSistema)})` : ''}</span>
          </p>
        ))}
      </div>
    )
  return (
    <section className="bg-white rounded-xl border border-gray-200 p-5 space-y-3 text-sm">
      <div className="flex flex-wrap justify-between items-center gap-2">
        <div>
          <h2 className="font-semibold text-gray-700">Cuadrar con el SII (RCV)</h2>
          <p className="text-gray-500">Descarga el detalle del Registro de Compras del mes en sii.cl (CSV) y súbelo aquí.</p>
        </div>
        <label className="px-4 py-2 rounded-lg border border-gray-300 cursor-pointer">
          Subir RCV
          <input type="file" accept=".csv,text/csv,text/plain" className="hidden" onChange={(e) => { subir(e.target.files?.[0]); e.target.value = '' }} />
        </label>
      </div>
      {error && <p className="text-red-600">{error}</p>}
      {r && (
        <div className="space-y-3">
          <p className={r.soloEnSii.length + r.soloEnSistema.length + r.diferencias.length === 0 ? 'text-green-700' : 'text-amber-800'}>
            {r.cuadrados} documento(s) cuadran.{r.soloEnSii.length + r.soloEnSistema.length + r.diferencias.length === 0 ? ' Todo calza con el SII.' : ''}
          </p>
          {lista('Están en el SII pero no en el sistema', r.soloEnSii, 'Facturas que te emitieron y no registraste: impórtalas o regístralas como gasto.')}
          {lista('Están en el sistema pero no en el SII', r.soloEnSistema, 'Revisa el folio o RUT; las facturas de compra (46) emitidas por ti también deben aparecer en el SII.')}
          {lista('Montos distintos', r.diferencias, 'Corrige el monto registrado.')}
        </div>
      )}
    </section>
  )
}
