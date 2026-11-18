#!/usr/bin/env bash
# Prueba de humo de la demo (docker-compose.demo.yml): vende en el local, corta la nube,
# vende durante el corte, reconecta y verifica que todas las ventas llegan una sola vez.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
DC="docker compose -f docker-compose.demo.yml"
EDGE=http://localhost:3000
NUBE=http://localhost:3100
CORTE=${CORTE:-5}
INST='-H x-instalacion-id:7d0b9a52-3c1e-4f6a-9d2b-5e8f1a4c0001 -H x-instalacion-secreto:secreto-de-la-instalacion-demo'
j() { node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const o=JSON.parse(d);console.log($1)})"; }

for i in $(seq 1 90); do curl -sf $EDGE/health >/dev/null && curl -sf $NUBE/health >/dev/null && break; sleep 2; done
T=$(curl -sf -XPOST $EDGE/auth/login -H 'content-type: application/json' -d '{"username":"admin","password":"admin1234"}' | j o.accessToken)
A="Authorization: Bearer $T"
SUC=$(curl -sf $EDGE/sucursales -H "$A" | j 'o[0].id')
ITEM=$(curl -sf "$EDGE/stock?sucursalId=$SUC" -H "$A" | j "o.find(s=>Number(s.stockActual)>=$CORTE).itemId")
curl -sf -XPOST $EDGE/sync/ejecutar -H "$A" >/dev/null   # obtiene la licencia
curl -s -XPOST $EDGE/caja/abrir -H "$A" -H 'content-type: application/json' -d "{\"sucursalId\":\"$SUC\",\"montoApertura\":0}" >/dev/null || true
vender() { curl -sf -XPOST $EDGE/transactions -H "$A" -H 'content-type: application/json' -d "{\"sucursalId\":\"$SUC\",\"tipoTransaccion\":\"VENTA\",\"medioPago\":\"Efectivo\",\"detalles\":[{\"itemId\":\"$ITEM\",\"cantidad\":1}]}" | j o.id; }
antes=$(curl -sf $NUBE/sync/ventas-nube $INST | j o.length)

echo "1) Corte de internet: se detiene la nube"
$DC stop cloud >/dev/null
for i in $(seq 1 "$CORTE"); do vender >/dev/null; done
echo "   $CORTE ventas registradas sin conexión; en cola: $(curl -sf $EDGE/sync/estado -H "$A" | j o.pendientes)"

echo "2) Vuelve internet"
$DC start cloud >/dev/null
for i in $(seq 1 60); do curl -sf $NUBE/health >/dev/null && break; sleep 1; done
inicio=$(date +%s)
curl -sf -XPOST $EDGE/sync/ejecutar -H "$A" >/dev/null
despues=$(curl -sf $NUBE/sync/ventas-nube $INST | j o.length)
ids=$(curl -sf $NUBE/sync/ventas-nube $INST | j 'new Set(o.map(v=>v.id)).size')
pend=$(curl -sf $EDGE/sync/estado -H "$A" | j o.pendientes)
echo "   en la nube: $((despues - antes)) de $CORTE nuevas · únicas: $ids de $despues · pendientes en el local: $pend · $(( $(date +%s) - inicio )) s"
[ $((despues - antes)) -eq "$CORTE" ] && [ "$ids" -eq "$despues" ] && [ "$pend" -eq 0 ] && echo "HUMO: OK" || { echo "HUMO: FALLA"; exit 1; }
