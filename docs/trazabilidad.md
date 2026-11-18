# Trazabilidad, Definition of Done y defectos

Fuente única que enlaza retroalimentación → decisión → requisito → prueba → resultado. Los identificadores (RET, AC, PBI, ADR, D) son estables; los enlaces apuntan a archivos del repositorio. El resultado vigente de todas las pruebas está en [`resumen_pruebas.txt`](../resumen_pruebas.txt), generado por [`ejecutar_pruebas.sh`](../ejecutar_pruebas.sh) para el commit que indica.

## 1. Retroalimentación de la segunda defensa

| Criterio (nota) | Observación | Decisión | Evidencia |
|---|---|---|---|
| 9 y 10 (4) | AC-04 falló en el CI: sin certificado real, el DTE salía sin firma y el SII simulado rechazaba por "Firma o timbre inválidos". Playwright no corrió por depender de ese trabajo | Las pruebas firman con certificado y CAF sintéticos generados al vuelo; el CI ya no depende de secretos (D-01) | [`test/fixtures/certificados-sinteticos.ts`](../erp-backend/test/fixtures/certificados-sinteticos.ts), [`test/env.ts`](../erp-backend/test/env.ts); AC-04 pasa sin `sii-certs/` |
| 6 (4) | Reproducir Edge → Cloud exigía configurar dos instancias a mano | `docker-compose.demo.yml` levanta dos bases, nube, local e interfaz con credenciales de demo; prueba de humo | [`docker-compose.demo.yml`](../docker-compose.demo.yml), [`scripts/humo-demo.sh`](../scripts/humo-demo.sh) |
| 11 (4) | p95 medido en modo local, una sola corrida | Benchmark repetido (media ± desviación, peor p95) y ejecutable contra el local con la nube detenida; informa modo y conectividad reales (D-02) | [`scripts/benchmark-ventas.mjs`](../erp-backend/scripts/benchmark-ventas.mjs), sección 6 |
| 12 (4) | Escaneo dependía de git; historial con material del SII | El escaneo funciona sin `.git` (copia o ZIP) y declara que el historial no es verificable; el material del historial es un certificado de pruebas sin validez tributaria (R-01, riesgo aceptado) | [`scripts/escanear-secretos.sh`](../scripts/escanear-secretos.sh) |
| 3 (4) | README mezclaba módulos heredados con la versión candidata | README separa Incremento 1, Incremento 2 y código heredado (apagado por defecto) | [`README.md`](../README.md#qué-es-la-versión-candidata-y-qué-es-código-heredado) |
| 2 y 15 (4) | H-01 sin medición de mermas; H-02 sin evidencia de pago | El Incremento 2 construye el instrumento de medición de H-01 (perdido vs salvado). H-01 y H-02 se declaran **no validadas** hasta medir en el local piloto | Sección 2 |
| 4 y 13 (4) | Spikes sin cierre; presentación con estados "Planificada" | Cierre de spikes (sección 8) y estados reales por criterio (sección 4) | Este documento |

## 2. Incremento 2: objetivo e hipótesis

- **Usuario:** encargado o dueño de una tienda de insumos agrícolas.
- **Resultado:** retirar con un toque los lotes vencidos o dañados (queda la merma valorizada, su asiento y su rastro) y ver cuánto se perdió y cuánto se salvó gracias al aviso; ajustar el aviso por producto (semillas antes que fertilizantes).
- **Límite:** sin cambios en la arquitectura del Incremento 1; no incluye catálogo desde la nube ni varios locales.
- **Hipótesis H-01:** si el aviso llega con anticipación suficiente, el encargado vende o retira a tiempo y la pérdida por vencimiento baja. **Señal:** en el local piloto, la tasa "perdido / (perdido + salvado)" y el perdido mensual bajan frente al mes base. **Estado: no validada** — el instrumento existe y está probado; falta el mes de medición en el local.
- **H-02 (disposición de pago):** **no validada**; requiere entrevistas, no código.

## 3. Product Backlog del Incremento 2

| Orden | ID | Resultado | Por qué ahí |
|---|---|---|---|
| 1 | D-01 | CI estable sin secretos (AC-04) | Defecto que impedía evidenciar la versión candidata |
| 2 | PBI-06 | Baja de lotes y "Pérdidas por vencimiento" | Valor y aprendizaje: produce la señal de H-01 |
| 3 | PBI-07 | Aviso de vencimiento por producto | Pospuesto en el Inc. 1 (RNF-MAN-01); depende de PBI-03 |
| 4 | D-02 | Conectividad informada real con la cola vacía | Defecto encontrado al medir p95 en modo edge |
| 5 | D-05 | Suites de integración independientes del orden | Fallaba solo en el CI; bloqueaba la regresión |
| 6 | D-07 | La cola de envío no se tapa con ventas sin folio | Riesgo de perder la sincronización (ADR-02) |
| 7 | D-06 | F3 cobra con el estado actual del POS | Descuadre de caja en el flujo principal |
| 8 | D-08 | Scripts `.sh` ejecutables en Windows | Reproducibilidad de la candidata por un tercero |
| 9 | D-09 | `ejecutar_pruebas.sh` no depende del `.env` del desarrollador | Reproducibilidad: fallaba siguiendo el README |
| Pospuesto | PBI-08 | Catálogo y precios desde la nube al local | Riesgo medio; no aporta a H-01 |
| Pospuesto | PBI-09 | Varios locales por PYME con conflictos (DEC-05) | Riesgo alto para la capacidad restante |

## 4. Criterios de aceptación y pruebas

Estado = resultado de la última ejecución de `ejecutar_pruebas.sh` (no planificado).

| ID | Dado / Cuando / Entonces | Prueba | Estado |
|---|---|---|---|
| AC-09 | Lote vencido → dar de baja → baja lote y stock, merma a costo con asiento y movimiento `BAJA_VENCIDO` | [`incremento2.e2e-spec.ts`](../erp-backend/test/incremento2.e2e-spec.ts), [`incremento2.spec.ts`](../erp-frontend/e2e/incremento2.spec.ts) | Pasa |
| AC-10 | Dos bajas simultáneas del mismo lote / cantidad mayor al saldo / motivo inválido / lote inexistente → una sola baja, 400, 400, 404 | `incremento2.e2e-spec.ts` | Pasa |
| AC-11 | Lote que no ha vencido → baja "vencido" se rechaza; "dañado" se acepta | `incremento2.e2e-spec.ts` | Pasa |
| AC-12 | Vendedor → no da de baja ni ve el reporte (403) | `incremento2.e2e-spec.ts` | Pasa |
| AC-13 | Venta dentro de la ventana de aviso → cuenta como salvado; baja → perdido; tasa calculada; sin datos → "Sin datos" | `incremento2.e2e-spec.ts`, [`mermas.spec.ts`](../erp-backend/src/lotes/mermas.spec.ts) | Pasa |
| AC-14 | Producto con aviso propio (15 días) → "Próximo a vencer" antes que uno sin aviso (3 días); valor fuera de rango → 400; vacío → vuelve al de la empresa | `incremento2.e2e-spec.ts`, `incremento2.spec.ts` | Pasa |
| Regresión Inc. 1 | AC-SYNC-01, AC-04 (AUTO-0005), AC-05, AC-06 (AUTO-0006), AC-07 (AUTO-0007), AC-08 | [`sync-nube.e2e-spec.ts`](../erp-backend/test/sync-nube.e2e-spec.ts), [`vencimientos.e2e-spec.ts`](../erp-backend/test/vencimientos.e2e-spec.ts), [`incremento1.spec.ts`](../erp-frontend/e2e/incremento1.spec.ts) | Pasan |
| D-07 | 51 ventas sin folio y luego una boleta con folio → la boleta llega a la nube; al cargar folios se envían las 51, cada una con folio distinto | `sync-nube.e2e-spec.ts` ("más de un lote de ventas sin folio no tapa la cola…") | Pasa |

## 5. Definition of Done

Un ítem está terminado cuando cumple todo:

1. **Valor:** responde a un PBI o defecto con criterio de aceptación escrito (sección 4).
2. **Funcionalidad:** sus criterios pasan con prueba automatizada (integración y, si tiene pantalla, navegador).
3. **Regresión:** `ejecutar_pruebas.sh` completo en verde, incluidas las pruebas del Incremento 1.
4. **Calidad:** p95 de venta ≤ 2 s; sin errores de tipos (`tsc`).
5. **Seguridad:** escaneo de secretos con 0 hallazgos; permisos por rol probados; entradas inválidas con error controlado (4xx, nunca 500).
6. **Revisión:** PR revisado y aprobado por otro integrante antes de integrar.
7. **Reproducibilidad:** se ejecuta con `docker-compose.demo.yml` o con las instrucciones del README sin pasos extra.

| Ítem | 1 | 2 | 3 | 4 | 5 | 6 | 7 | PR |
|---|---|---|---|---|---|---|---|---|
| D-01 | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | ✓ | #4 |
| PBI-06 | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | ✓ | #4 |
| PBI-07 | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | ✓ | #4 |
| D-02 | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | ✓ | #4 |
| D-05 | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | ✓ | #4 |
| D-06 | ✓ | — | ✓ | ✓ | ✓ | ✗ | ✓ | #8 |
| D-07 | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | ✓ | #8 |
| D-08 | ✓ | — | ✓ | ✓ | ✓ | ✗ | ✓ | #10 |
| D-09 | ✓ | — | ✓ | ✓ | ✓ | ✗ | ✓ | #10 |

**Condición 6 (revisión) no se cumple en ningún ítem:** ningún PR tiene revisiones registradas en GitHub y la rama no exige aprobación. Se declara como pendiente (R-07) en vez de darla por cumplida. **Condición 2:** D-06 (atajo de teclado), D-08 y D-09 (scripts) no tienen prueba automatizada propia; se verificaron con el build, el linter y la ejecución completa de `ejecutar_pruebas.sh`.

## 6. Atributos de calidad medidos

| ID | Condición | Umbral | Método | Resultado |
|---|---|---|---|---|
| RNF-REN-01 | Ventas contra el local (`MODO=edge`) con la nube detenida, concurrencia 5, 3 corridas | p95 ≤ 2 s | `benchmark-ventas.mjs` contra `docker-compose.demo.yml` | p95 medio 224 ms ± 102, peor 366 ms (3×20 ventas; el informe confirma «modo edge, nube SIN_CONEXION») |
| RNF-REN-01 | Mismo benchmark en `ejecutar_pruebas.sh` (modo local) | p95 ≤ 2 s | Script de verificación | Ver `resumen_pruebas.txt` |
| RNF-REN-02 / RNF-CON-01 | Ventas durante un corte; reconexión; reenvío del mismo lote | 100 % en la nube, 0 duplicados | `sync-nube.e2e-spec.ts` (20 ventas) y `humo-demo.sh` (contenedores reales) | 20/20 y 5/5, 0 duplicados |
| RNF-SEC-02 | Repositorio y su historial (medida comprometida en la Semana 6) | 0 hallazgos | `escanear-secretos.sh` | Versión actual: 0 hallazgos. Historial: 2 archivos (`mi_certificado.p12`, `CAF_Prueba.xml`). **No cumple la medida original**; riesgo aceptado con DEC-08 (R-01) |

**Limitación declarada:** no se ejecutó un ensayo continuo de 30 minutos de corte; la prueba de corte usa desconexión simulada (integración) y detención real del contenedor de la nube (humo), sin duración prolongada.

## 7. Defectos

| ID | Defecto | Causa | Corrección | Prueba que lo protege |
|---|---|---|---|---|
| D-01 | AC-04 fallaba en el CI con glosa "Firma o timbre inválidos" | Las pruebas dependían de `sii-certs/`, que no se versiona | Certificado y CAF sintéticos en las pruebas | `sync-nube.e2e-spec.ts` sin `sii-certs/` |
| D-02 | El local informaba "EN_LINEA" con la nube caída si la cola estaba vacía | Sin envíos no se contactaba la nube | Con cola vacía se consulta `/health` de la nube | `sync-nube.e2e-spec.ts` ("con la cola vacía y la nube caída…") |
| D-03 | `ejecutar_pruebas.sh` probaba un servidor viejo que quedaba vivo en el puerto | Se mataba el subshell, no el proceso | `exec` y liberación de puertos | Ejecución del script |
| D-04 | Falsos positivos del escaneo (código que arma valores) | Patrones demasiado amplios | Patrones exigen un valor literal | Escaneo con un `.env` de prueba |
| D-05 | En el CI, `incremento2` corría antes que `productores` y fallaban 5 pruebas | La suite dejaba lotes con saldo y FEFO tomaba otro lote | La suite deja sin saldo sus lotes al terminar (`c1d5a2e`, posterior al tag `v2.0-rc1`) | Integración completa en verde en el CI |
| D-06 | En el POS, F3 cobraba con el medio de pago, documento o cliente anteriores si se cambiaban después del carrito | El atajo capturaba la función de cobro de cuando cambió el carrito | F3 llama siempre a la versión vigente y no cobra dos veces mientras procesa (PR #8) | Sin prueba automatizada; build y linter sin el aviso `exhaustive-deps` |
| D-07 | En `MODO=edge`, una venta hecha sin folios quedaba sin folio para siempre, y 50 de ellas al inicio de la cola impedían enviar todas las siguientes | Solo el modo `local` reintentaba el folio; el lote se cortaba al no encontrar ventas enviables | Cada pasada reintenta folio y DTE y salta las ventas que siguen sin folio; folio y venta se guardan en una transacción (PR #8) | `sync-nube.e2e-spec.ts` (falla sin la corrección: 0 enviadas en vez de 1) |
| D-08 | En Windows, `ejecutar_pruebas.sh` y los scripts de `scripts/` fallaban (`$'\r': command not found`) | Git los descargaba con saltos de línea CRLF | `.gitattributes` fija LF para `*.sh` | `ejecutar_pruebas.sh` ejecutado completo en Windows (Git Bash) |
| D-09 | Con un `.env` copiado de `.env.example`, `ejecutar_pruebas.sh` fallaba en Playwright (18 de 19) y en el benchmark | El backend de prueba heredaba `CORS_ORIGIN` del `.env` del desarrollador y el navegador bloqueaba las llamadas desde el puerto 4199; en el CI no hay `.env` | El script fija `CORS_ORIGIN` del backend de prueba | `ejecutar_pruebas.sh` en verde con el `.env` del README |

## 8. Cierre de spikes

**SPIKE-02 — credenciales del SII.**
- **Alternativas:** rutas y clave en `.env` vs certificado en base64 dentro de una variable.
- **Resultado:** se adoptaron rutas en `.env` (`SII_CAF_PATH`, `SII_P12_PATH`, `SII_P12_PASSWORD`). El firmado funciona con material real y con material sintético (pruebas y demo). El escaneo da 0 hallazgos en la versión actual.
- **Decisión (DEC-06):** confirma ADR-03.
- **R-01 (riesgo aceptado):** el historial conserva un certificado **de pruebas** del SII y su contraseña. No permite emitir documentos tributarios reales, por lo que no se reescribe el historial (obligaría a todos a reclonar y cambiaría los hashes de la versión candidata). Mitigación: la versión actual no contiene secretos (escaneo con 0 hallazgos), las pruebas usan certificados sintéticos y el certificado real de producción nunca se versiona (`.gitignore` y escaneo en CI). Cierre: limpiar el historial antes de publicar el repositorio o de usar un certificado real.
- **Actualización (DEC-08, modifica ADR-03):** el repositorio ya es público, así que la condición de cierre anterior se cumplió y el certificado de pruebas y su contraseña son descargables desde el historial. ADR-03 comprometía rotar la contraseña y reescribir el historial; se decide no reescribirlo (cambiaría los hashes de la candidata y de los PR citados) y dar el certificado expuesto por comprometido: no se vuelve a usar, y cualquier certificado nuevo se carga solo por `.env`. Revisar si se obtiene un certificado real o el equipo decide limpiar el historial.

**SPIKE-03 — outbox idempotente.**
- **Alternativas:** orden por marca de tiempo vs secuencia local con la hora como dato informativo.
- **Resultado:** se adoptó la secuencia local (columna `secuencia` autoincremental) más idempotencia por UUID en la nube.
- **Verificado:**
  - 20 ventas en corte llegan 20/20;
  - el reenvío del mismo lote no duplica;
  - el orden en la nube sigue la secuencia local.
- **No medido:** el desfase de reloj de ±10 min. Con secuencia local, el orden no depende del reloj; queda como argumento de diseño, no como medición.
- **Decisión (DEC-07):** confirma ADR-02.

## 9. Riesgos y pendientes vigentes

| ID | Tipo | Estado |
|---|---|---|
| R-01 | Seguridad | Certificado de pruebas del SII y su contraseña en el historial de git de un repositorio **público**. **Aceptado con DEC-08 (nivel medio):** sin validez tributaria; la versión actual no tiene secretos; el certificado expuesto se da por comprometido y no se vuelve a usar |
| R-02 | Producto | H-01 y H-02 no validadas: falta medición en el local piloto y entrevistas |
| R-03 | Técnico | Un solo local por PYME; conflictos entre locales fuera de alcance (PBI-09) |
| R-04 | Legal | SII simulado; certificación en el ambiente de pruebas del SII pendiente |
| R-07 | Proceso | Revisión por pares sin registro: los PR #1 a #9 no tienen revisiones en GitHub y la rama no exige aprobación (la regla de la retrospectiva no se configuró). Los PR #8 y #9 se integraron sin revisión |
| R-08 | Versión | El tag `v2.0-rc1` (`25e2f36`) no incluye D-05 ni las correcciones posteriores; la candidata vigente es `v2.0-rc2` |
