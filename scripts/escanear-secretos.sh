#!/usr/bin/env bash
# Escaneo de secretos (RNF-SEC-02): busca material sensible en los archivos versionados y en
# el historial de git. Falla si encuentra algo en la versión actual; el historial se informa
# aparte porque limpiarlo exige reescribirlo (ADR-03).
set -uo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

hallazgos=0
reporta() { echo "  ✘ $1"; hallazgos=$((hallazgos + 1)); }

echo "== Escaneo de secretos: versión actual =="
# Archivos que nunca deben versionarse.
while IFS= read -r f; do reporta "archivo sensible versionado: $f"; done < <(git ls-files | grep -E '(\.p12|\.pfx|\.pem|\.key)$|(^|/)CAF[^/]*\.xml$|(^|/)\.env$')
# Contenido: llaves privadas con cuerpo, clave del CAF, tokens y contraseñas del certificado con valor.
patron='-----BEGIN [A-Z ]*PRIVATE KEY-----[[:space:]]*$|<RSASK>[^<]{20,}|github_pat_[A-Za-z0-9_]{20,}|ghp_[A-Za-z0-9]{30,}|AKIA[0-9A-Z]{16}|xox[baprs]-[A-Za-z0-9-]{10,}|SII_P12_PASSWORD=[^[:space:]]+'
while IFS= read -r l; do
  archivo=${l%%:*}
  # Una cabecera PEM sin cuerpo (código que arma el PEM) no es un secreto.
  if [[ "$l" == *"BEGIN"* ]] && ! grep -A1 -F -- "${l#*:*:}" "$archivo" 2>/dev/null | tail -1 | grep -qE '^[A-Za-z0-9+/=]{40,}$'; then continue; fi
  # Los .example llevan valores de muestra, no secretos.
  [[ "$archivo" == *.example ]] && continue
  reporta "$l"
done < <(git grep -nE -- "$patron" -- . ':!*.lock' ':!scripts/escanear-secretos.sh' 2>/dev/null)
[ $hallazgos -eq 0 ] && echo "  ✔ 0 hallazgos"

echo "== Historial de git =="
historial=$(git log --all --format='%h %ad' --date=short --name-only -- '*.p12' '*.pfx' '*CAF*.xml' 2>/dev/null | grep -E '\.(p12|pfx|xml)$' | sort -u)
if [ -n "$historial" ]; then
  echo "  ⚠ el historial aún contiene material del SII (requiere rotar la clave y reescribir el historial):"
  echo "$historial" | sed 's/^/     /'
else
  echo "  ✔ historial limpio"
fi

echo "RESULTADO: $hallazgos hallazgo(s) en la versión actual"
[ $hallazgos -eq 0 ]
