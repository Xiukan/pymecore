// RNF-REN-01: ventas contra el backend del local y su latencia p95 (meta ≤ 2 s), repetido
// BENCH_REPETICIONES veces para ver la variabilidad. Para el escenario comprometido se corre
// contra el local (MODO=edge) con la nube detenida: ver scripts/humo-demo.sh y el README.
// Uso: node scripts/benchmark-ventas.mjs http://localhost:3000
const API = process.argv[2] ?? 'http://localhost:3000'
const N = Number(process.env.BENCH_VENTAS ?? 50)
const REPETICIONES = Number(process.env.BENCH_REPETICIONES ?? 3)
const CONCURRENCIA = Number(process.env.BENCH_CONCURRENCIA ?? 5)
const META_MS = 2000

const json = async (r) => { const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(`${r.status} ${JSON.stringify(d)}`); return d }
const { accessToken, user } = await json(await fetch(`${API}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: 'admin1234' }) }))
const h = { 'content-type': 'application/json', authorization: `Bearer ${accessToken}` }
const sucursalId = user.sucursalId ?? (await json(await fetch(`${API}/sucursales`, { headers: h })))[0].id
const caja = await json(await fetch(`${API}/caja/actual`, { headers: h })).catch(() => null)
if (!caja?.id) await json(await fetch(`${API}/caja/abrir`, { method: 'POST', headers: h, body: JSON.stringify({ sucursalId, montoApertura: 0 }) }))
const stock = await json(await fetch(`${API}/stock?sucursalId=${sucursalId}`, { headers: h }))
const item = stock.find((s) => Number(s.stockActual) >= N * REPETICIONES)
if (!item) throw new Error(`Ningún producto tiene ${N * REPETICIONES} unidades en stock para la prueba`)
// Un intento de envío actualiza la conectividad real antes de medir.
await fetch(`${API}/sync/ejecutar`, { method: "POST", headers: h }).catch(() => null)
const estado = await json(await fetch(`${API}/sync/estado`, { headers: h })).catch(() => null)

async function corrida() {
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
return { p50: p(0.5), p95: p(0.95), max: Math.round(tiempos.at(-1)) }
}

const corridas = []
for (let i = 0; i < REPETICIONES; i++) {
  const c = await corrida()
  corridas.push(c)
  console.log(`  corrida ${i + 1}: p50 ${c.p50} ms · p95 ${c.p95} ms · máx ${c.max} ms`)
}
const p95s = corridas.map((c) => c.p95)
const media = Math.round(p95s.reduce((a, b) => a + b, 0) / p95s.length)
const desv = Math.round(Math.sqrt(p95s.reduce((a, b) => a + (b - media) ** 2, 0) / p95s.length))
const peor = Math.max(...p95s)
const entorno = estado ? `modo ${estado.modo}, nube ${estado.conectividad}` : 'modo desconocido'
console.log(`Benchmark ventas: ${REPETICIONES}×${N} ventas (concurrencia ${CONCURRENCIA}, ${entorno}) · p95 medio ${media} ms ± ${desv} · peor p95 ${peor} ms · meta ≤ ${META_MS} ms → ${peor <= META_MS ? 'CUMPLE' : 'NO CUMPLE'}`)
process.exit(peor <= META_MS ? 0 : 1)
