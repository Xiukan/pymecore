#!/usr/bin/env bash
# Escaneo de secretos (RNF-SEC-02): busca material sensible en los archivos versionados y en
# el historial de git. Falla si encuentra algo en la versión actual; el historial se informa
# aparte porque limpiarlo exige reescribirlo (ADR-03).
set -uo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

hallazgos=0
reporta() { echo "  ✘ $1"; hallazgos=$((hallazgos + 1)); }

# Con repositorio git se revisan los archivos versionados; sin él (por ejemplo, un ZIP), todos
# los archivos del proyecto salvo dependencias y compilados.
if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  CON_GIT=1
  listar() { git ls-files; }
  buscar() { git grep -nE -- "$1" -- . ':!*.lock' ':!scripts/escanear-secretos.sh' 2>/dev/null; }
else
  CON_GIT=0
  listar() { find . -type f -not -path '*/node_modules/*' -not -path '*/dist/*' -not -path './.pruebas-logs/*' -not -path '*/test-results/*' | sed 's|^\./||'; }
  buscar() { grep -rnE --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=.pruebas-logs --exclude='*.lock' --exclude=escanear-secretos.sh -- "$1" . 2>/dev/null | sed 's|^\./||'; }
fi

echo "== Escaneo de secretos: versión actual =="
# Archivos que nunca deben versionarse.
while IFS= read -r f; do reporta "archivo sensible versionado: $f"; done < <(listar | grep -E '(\.p12|\.pfx|\.pem|\.key)$|(^|/)CAF[^/]*\.xml$|(^|/)\.env$')
# Contenido: llaves privadas con cuerpo, clave del CAF, tokens y contraseñas del certificado con valor.
patron='-----BEGIN [A-Z ]*PRIVATE KEY-----[[:space:]]*$|<RSASK>[^<$]{20,}|github_pat_[A-Za-z0-9_]{20,}|ghp_[A-Za-z0-9]{30,}|AKIA[0-9A-Z]{16}|xox[baprs]-[A-Za-z0-9-]{10,}|SII_P12_PASSWORD=["\x27]?[^"\x27$[:space:]]{4,}["\x27]?[[:space:]]*$'
while IFS= read -r l; do
  archivo=${l%%:*}
  # Una cabecera PEM sin cuerpo (código que arma el PEM) no es un secreto.
  if [[ "$l" == *"BEGIN"* ]] && ! grep -A1 -F -- "${l#*:*:}" "$archivo" 2>/dev/null | tail -1 | grep -qE '^[A-Za-z0-9+/=]{40,}$'; then continue; fi
  # Los .example llevan valores de muestra, no secretos.
  [[ "$archivo" == *.example ]] && continue
  reporta "$l"
done < <(buscar "$patron")
[ $hallazgos -eq 0 ] && echo "  ✔ 0 hallazgos"

echo "== Historial de git =="
if [ $CON_GIT -eq 0 ]; then
  echo "  ⚠ sin carpeta .git: el historial no se puede verificar desde esta copia"
  echo "RESULTADO: $hallazgos hallazgo(s) en la versión actual"
  [ $hallazgos -eq 0 ]
  exit
fi
historial=$(git log --all --format='%h %ad' --date=short --name-only -- '*.p12' '*.pfx' '*CAF*.xml' 2>/dev/null | grep -E '\.(p12|pfx|xml)$' | sort -u)
if [ -n "$historial" ]; then
  echo "  ⚠ el historial aún contiene material del SII (requiere rotar la clave y reescribir el historial):"
  echo "$historial" | sed 's/^/     /'
else
  echo "  ✔ historial limpio"
fi

echo "RESULTADO: $hallazgos hallazgo(s) en la versión actual"
[ $hallazgos -eq 0 ]
