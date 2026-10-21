import { useEffect, useState } from 'react'
import { getEstadoCuenta } from '@/api'
import { useEmpresa } from '@/hooks/useEmpresa'
import { clp } from '@/utils/formato'

type Estado = Awaited<ReturnType<typeof getEstadoCuenta>>['data']
const dia = (f: string) => new Date(f).toLocaleDateString('es-CL')

/** Estado de cuenta imprimible para enviar al cliente. */
export default function EstadoCuenta({ clienteId, onCerrar }: { clienteId: string; onCerrar: () => void }) {
  const empresa = useEmpresa()
  const [e, setE] = useState<Estado | null>(null)
  useEffect(() => { getEstadoCuenta(clienteId).then((r) => setE(r.data)) }, [clienteId])
  if (!e) return null
  return (
    <div className="fixed inset-0 bg-black/40 flex items-start justify-center z-50 p-4 overflow-y-auto print:static print:bg-white print:p-0" onClick={onCerrar}>
      <div className="bg-white rounded-xl p-6 w-full max-w-2xl text-sm space-y-3 print:shadow-none" onClick={(x) => x.stopPropagation()}>
        <div className="flex justify-between">
          <div>
            <p className="font-semibold">{empresa?.razonSocial}</p>
            <p className="text-gray-500">{empresa?.rut} · {empresa?.direccion}</p>
          </div>
          <div className="text-right">
            <p className="font-semibold">ESTADO DE CUENTA</p>
            <p className="text-gray-500">al {new Date().toLocaleDateString('es-CL')}</p>
          </div>
        </div>
        <p><b>{e.cliente.nombre}</b> · RUT {e.cliente.rut} · crédito a {e.cliente.diasCredito} días</p>
        <table className="w-full">
          <thead className="text-gray-500 text-xs uppercase"><tr><th className="text-left py-1">Fecha</th><th className="text-left">Detalle</th><th className="text-right">Cargo</th><th className="text-right">Abono</th><th className="text-right">Saldo</th></tr></thead>
          <tbody>
            {e.movimientos.map((m, i) => (
              <tr key={i} className="border-t border-gray-100">
                <td className="py-1">{dia(m.fecha)}</td>
                <td>{m.detalle}{m.vence ? <span className="text-gray-400"> (vence {dia(m.vence)})</span> : ''}</td>
                <td className="text-right">{Number(m.cargo) ? clp(m.cargo) : ''}</td>
                <td className="text-right">{Number(m.abono) ? clp(m.abono) : ''}</td>
                <td className="text-right">{clp(m.saldo)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="text-right space-y-0.5">
          <p className="text-lg">Saldo pendiente: <b>{clp(e.saldo)}</b></p>
          {Number(e.vencido) > 0 && <p className="text-red-700">Vencido: {clp(e.vencido)}</p>}
          <p className="text-gray-500">Cupo disponible: {clp(e.cupoDisponible)}</p>
        </div>
        <div className="flex justify-end gap-2 print:hidden">
          <button onClick={onCerrar} className="px-4 py-2 rounded-lg border border-gray-300">Cerrar</button>
          <button onClick={() => window.print()} className="px-4 py-2 rounded-lg bg-blue-600 text-white">Imprimir o guardar PDF</button>
        </div>
      </div>
    </div>
  )
}
