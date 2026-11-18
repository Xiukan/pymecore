#!/bin/sh
# Arranque de la demo reproducible (docker-compose.demo.yml): migra su propia base y prepara
# los datos mínimos según su rol. Es idempotente: se puede reiniciar sin duplicar nada.
set -e
pnpm exec prisma migrate deploy

# DTE firmados con certificado y CAF sintéticos (el material real del SII no se distribuye).
eval "$(node -e "require('ts-node/register'); const c = require('./test/fixtures/certificados-sinteticos').certificadosSinteticos(); console.log('export SII_CAF_PATH=' + c.caf + ' SII_P12_PATH=' + c.p12 + ' SII_P12_PASSWORD=' + c.clave)")"

if [ "$MODO" = "cloud" ]; then
  pnpm exec ts-node scripts/alta-instalacion.ts "${DEMO_PYME:-PYME demo}" "${DEMO_LOCAL:-Local demo}"
else
  if [ "$(psql "$DATABASE_URL" -tAc 'select count(*) from usuarios')" = "0" ]; then
    pnpm seed
    psql "$DATABASE_URL" -q -f scripts/datos-e2e.sql
  fi
fi
exec node dist/src/main.js
