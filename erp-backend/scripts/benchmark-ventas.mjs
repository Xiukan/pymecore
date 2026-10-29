// RNF-REN-01: 50 ventas contra el backend del local y su latencia p95 (meta ≤ 2 s).
// La venta no llama a internet (la nube y el SII se contactan después, desde la cola), así
// que mide el caso sin conexión. Uso: node scripts/benchmark-ventas.mjs http://localhost:3000
const API = process.argv[2] ?? 'http://localhost:3000'
const N = Number(process.env.BENCH_VENTAS ?? 50)
const CONCURRENCIA = Number(process.env.BENCH_CONCURRENCIA ?? 5)
const META_MS = 2000

const json = async (r) => { const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(`${r.status} ${JSON.stringify(d)}`); return d }
const { accessToken, user } = await json(await fetch(`${API}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: 'admin1234' }) }))
const h = { 'content-type': 'application/json', authorization: `Bearer ${accessToken}` }
const sucursalId = user.sucursalId ?? (await json(await fetch(`${API}/sucursales`, { headers: h })))[0].id
const caja = await json(await fetch(`${API}/caja/actual`, { headers: h })).catch(() => null)
if (!caja?.id) await json(await fetch(`${API}/caja/abrir`, { method: 'POST', headers: h, body: JSON.stringify({ sucursalId, montoApertura: 0 }) }))
const stock = await json(await fetch(`${API}/stock?sucursalId=${sucursalId}`, { headers: h }))
const item = stock.find((s) => Number(s.stockActual) >= N)
if (!item) throw new Error(`Ningún producto tiene ${N} unidades en stock para la prueba`)

const tiempos = []
let siguiente = 0
async function trabajador() {
  while (siguiente < N) {
    siguiente++
    const t0 = performance.now()
    await json(await fetch(`${API}/transactions`, { method: 'POST', headers: h, body: JSON.stringify({ sucursalId, tipoTransaccion: 'VENTA', medioPago: 'Efectivo', detalles: [{ itemId: item.itemId, cantidad: 1 }] }) }))
    tiempos.push(performance.now() - t0)
  }
}
await Promise.all(Array.from({ length: CONCURRENCIA }, trabajador))
tiempos.sort((a, b) => a - b)
const p = (q) => Math.round(tiempos[Math.min(tiempos.length - 1, Math.ceil(q * tiempos.length) - 1)])
const r = { ventas: tiempos.length, concurrencia: CONCURRENCIA, p50_ms: p(0.5), p95_ms: p(0.95), max_ms: Math.round(tiempos.at(-1)), meta_p95_ms: META_MS }
console.log(`Benchmark ventas: ${r.ventas} ventas (concurrencia ${r.concurrencia}) · p50 ${r.p50_ms} ms · p95 ${r.p95_ms} ms · máx ${r.max_ms} ms · meta p95 ≤ ${META_MS} ms → ${r.p95_ms <= META_MS ? 'CUMPLE' : 'NO CUMPLE'}`)
process.exit(r.p95_ms <= META_MS ? 0 : 1)
