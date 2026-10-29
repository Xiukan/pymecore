#!/usr/bin/env bash
# Ejecuta todas las pruebas de PYMECORE con un solo comando y deja el resultado en
# resumen_pruebas.txt. Levanta una base PostgreSQL desechable en Docker, así que no
# toca la base de desarrollo. Requisitos: docker, node 20+, pnpm y curl.
set -uo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND="$RAIZ/erp-backend"
FRONTEND="$RAIZ/erp-frontend"
RESUMEN="$RAIZ/resumen_pruebas.txt"
LOGS="$RAIZ/.pruebas-logs"
CONTENEDOR="pymecore-pruebas-pg"
PUERTO_DB=55499
PUERTO_API=3199
PUERTO_WEB=4199
DB_URL_BASE="postgresql://pruebas:pruebas@127.0.0.1:$PUERTO_DB"

mkdir -p "$LOGS"
declare -a RESULTADOS=()
fallas=0
PIDS=()

liberar_puerto() {
  local pid
  pid=$(ss -ltnp 2>/dev/null | grep ":$1 " | grep -o 'pid=[0-9]*' | cut -d= -f2 | head -1)
  [ -n "$pid" ] && kill "$pid" 2>/dev/null
}

limpiar() {
  for p in "${PIDS[@]:-}"; do [ -n "$p" ] && kill "$p" 2>/dev/null; done
  liberar_puerto $PUERTO_API
  liberar_puerto $PUERTO_WEB
  docker rm -f "$CONTENEDOR" >/dev/null 2>&1
}
trap limpiar EXIT

esperar() { # url, segundos
  for _ in $(seq 1 "$2"); do curl -sf -o /dev/null "$1" && return 0; sleep 1; done
  return 1
}

# Corre una suite, guarda su salida y extrae el conteo de pruebas.
suite() { # nombre, directorio, comando...
  local nombre="$1" dir="$2"; shift 2
  local log="$LOGS/$(echo "$nombre" | tr ' /' '__').log"
  echo "▶ $nombre"
  local inicio=$SECONDS
  (cd "$dir" && "$@") >"$log" 2>&1
  local codigo=$? dur=$((SECONDS - inicio))
  local conteo
  conteo=$(grep -E "^Tests:|Tests +[0-9]+|[0-9]+ passed|[0-9]+ failed|^RESULTADO:|^Benchmark" "$log" | tail -2 | tr -s ' ' | tr '\n' ' ')
  if [ $codigo -eq 0 ]; then
    echo "  ✔ PASA ($conteo${dur}s)"
    RESULTADOS+=("PASA   | $nombre | $conteo| ${dur}s")
  else
    echo "  ✘ FALLA ($conteo) — ver $log"
    RESULTADOS+=("FALLA  | $nombre | $conteo| ${dur}s | log: ${log#$RAIZ/}")
    fallas=$((fallas + 1))
  fi
}

echo "== PYMECORE: pruebas automatizadas =="

suite "Escaneo de secretos (RNF-SEC-02)" "$RAIZ" ./scripts/escanear-secretos.sh

echo "▶ Base de datos temporal (Docker)"
docker rm -f "$CONTENEDOR" >/dev/null 2>&1
docker run -d --name "$CONTENEDOR" -e POSTGRES_USER=pruebas -e POSTGRES_PASSWORD=pruebas -e POSTGRES_DB=pyme_test \
  -p "$PUERTO_DB:5432" postgres:16-alpine >/dev/null || { echo "No se pudo iniciar Docker"; exit 1; }
for _ in $(seq 1 30); do docker exec "$CONTENEDOR" pg_isready -U pruebas >/dev/null 2>&1 && break; sleep 1; done
docker exec "$CONTENEDOR" psql -U pruebas -d pyme_test -qc "CREATE DATABASE pyme_e2e" >/dev/null

echo "▶ Dependencias"
(cd "$BACKEND" && pnpm install --frozen-lockfile && pnpm exec prisma generate) >"$LOGS/instalar_backend.log" 2>&1 || { echo "Falló la instalación del backend"; exit 1; }
(cd "$FRONTEND" && pnpm install --frozen-lockfile && pnpm exec playwright install chromium) >"$LOGS/instalar_frontend.log" 2>&1 || { echo "Falló la instalación del frontend"; exit 1; }

suite "Backend unitarias (Jest)" "$BACKEND" pnpm test
DATABASE_URL="$DB_URL_BASE/pyme_test" suite "Backend integración (Jest + PostgreSQL)" "$BACKEND" pnpm test:e2e
suite "Frontend unitarias (Vitest)" "$FRONTEND" pnpm exec vitest run

echo "▶ App completa para pruebas de navegador"
export DATABASE_URL="$DB_URL_BASE/pyme_e2e"
(cd "$BACKEND" && pnpm exec prisma migrate deploy && pnpm seed && docker exec -i "$CONTENEDOR" psql -U pruebas -d pyme_e2e -q < scripts/datos-e2e.sql && pnpm build) \
  >"$LOGS/preparar_app.log" 2>&1 || { echo "Falló la preparación de la app (ver $LOGS/preparar_app.log)"; exit 1; }
liberar_puerto $PUERTO_API
liberar_puerto $PUERTO_WEB
(cd "$BACKEND" && exec env JWT_SECRET="pruebas-locales-0123456789abcdef0123456789" LOGIN_MAX_INTENTOS=1000 APP_PORT=$PUERTO_API node dist/src/main.js >"$LOGS/api.log" 2>&1) & PIDS+=($!)
(cd "$FRONTEND" && VITE_API_URL="http://localhost:$PUERTO_API" pnpm exec vite build --outDir "$LOGS/web" --emptyOutDir >"$LOGS/web_build.log" 2>&1 \
  && exec pnpm exec vite preview --outDir "$LOGS/web" --port $PUERTO_WEB --strictPort >"$LOGS/web.log" 2>&1) & PIDS+=($!)
if esperar "http://localhost:$PUERTO_API/health" 60 && esperar "http://localhost:$PUERTO_WEB" 120; then
  E2E_BASE_URL="http://localhost:$PUERTO_WEB" suite "Navegador (Playwright)" "$FRONTEND" pnpm exec playwright test --reporter=line
  suite "Rendimiento p95 de ventas (RNF-REN-01)" "$BACKEND" node scripts/benchmark-ventas.mjs "http://localhost:$PUERTO_API"
else
  RESULTADOS+=("FALLA  | Navegador (Playwright) | la app no levantó | ver .pruebas-logs/api.log y web.log")
  fallas=$((fallas + 1))
fi

{
  echo "RESUMEN DE PRUEBAS — PYMECORE"
  echo "Fecha: $(date '+%Y-%m-%d %H:%M')  ·  Commit: $(git -C "$RAIZ" rev-parse --short HEAD 2>/dev/null || echo 's/i')"
  echo "Node $(node -v) · pnpm $(pnpm -v) · PostgreSQL 16 (Docker)"
  echo
  echo "Estado | Suite | Resultado | Duración"
  printf '%s\n' "${RESULTADOS[@]}"
  echo
  if [ $fallas -eq 0 ]; then echo "RESULTADO GLOBAL: TODAS LAS SUITES PASAN"; else echo "RESULTADO GLOBAL: $fallas SUITE(S) CON FALLAS"; fi
  echo
  echo "Detalle de cada suite en .pruebas-logs/"
} >"$RESUMEN"

echo
cat "$RESUMEN"
[ $fallas -eq 0 ]
