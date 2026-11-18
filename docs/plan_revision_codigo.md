# Plan de revisión de código — PYMECORE v2.0-rc1

Objetivo: encontrar defectos antes de la tercera defensa, priorizando lo que se demuestra y lo que maneja dinero, stock o datos tributarios. Cada hallazgo se registra en `trazabilidad.md` §7 (Defectos) con ID D-xx.

## 1. Alcance y prioridad

| Prioridad | Módulo (backend `erp-backend/src`) | Por qué | Revisor |
|---|---|---|---|
| Alta | `transactions` (ventas, devoluciones) | Dinero, stock y DTE; núcleo del Incremento 1 | |
| Alta | `lotes` (FEFO, baja, mermas) | Núcleo del Incremento 2 | |
| Alta | `sync`, `nube`, `lease` | Offline, idempotencia, licencia | |
| Alta | `auth`, `usuarios`, guards | Permisos y sesiones | |
| Media | `stock`, `items`, `caja`, `sii` | Invariantes de inventario y caja | |
| Media | `compras`, `productores`, `contabilidad`, `tributario` | Montos, IVA, asientos | |
| Baja | `campo`, `pedidos`, `gastos`, `finanzas`, `reportes` | Módulos apagados por defecto | |
| Alta | Frontend: `VentasPage`, `LotesPage`, `Layout`, `api` | Lo que se ve en la demo | |

## 2. Lista de verificación por archivo

**Correctitud y estado**
- [ ] Operaciones que tocan varias tablas (venta + stock + lote + caja + asiento) van en una sola transacción de Prisma.
- [ ] Concurrencia: dos peticiones simultáneas no dejan stock o saldo de lote negativo ni duplican una baja o un pago (condición en el `update`, no solo un `find` previo).
- [ ] Montos con `Decimal`, sin `number` en cálculos de dinero; redondeo de IVA consistente (CLP sin decimales).
- [ ] Fechas: comparación de vencimientos en zona horaria de Chile; límites "hoy" y "a N días" correctos.
- [ ] Anulaciones y devoluciones revierten exactamente lo que se aplicó (lote, stock, caja, asiento).

**Entradas y errores**
- [ ] DTO con `class-validator` en cada endpoint; cantidades > 0, IDs UUID, enums cerrados.
- [ ] Recursos inexistentes → 404; reglas de negocio → 400 con mensaje claro; nunca 500 por entrada del usuario.
- [ ] Sin `catch` vacíos que oculten fallos (backend y `catch(() => {})` del frontend).

**Seguridad**
- [ ] Cada endpoint tiene guard de rol; el vendedor no accede a bajas, costos, usuarios ni configuración.
- [ ] Toda consulta filtra por empresa o sucursal del usuario (sin acceso cruzado por ID).
- [ ] Sin secretos en código ni logs; errores no exponen stack ni SQL.
- [ ] Sincronización: valida instalación, secreto y tenant; reintentos idempotentes por UUID.

**Frontend**
- [ ] Botones de envío deshabilitados mientras la petición está en curso (doble clic).
- [ ] Estados de carga, vacío y error en cada pantalla de la demo.
- [ ] Formato de montos y fechas en es-CL.

## 3. Herramientas automáticas (antes de leer código)

```bash
cd erp-backend  && pnpm exec eslint "{src,test}/**/*.ts" && pnpm exec tsc --noEmit && pnpm audit --prod
cd erp-frontend && pnpm lint && pnpm exec tsc -b && pnpm audit --prod
./ejecutar_pruebas.sh            # regresión completa en base desechable
grep -rn "catch(() => {})\|: any\|console.log" erp-*/src
```

## 4. Procedimiento

1. Correr las herramientas del punto 3 y registrar lo que salga.
2. Repartir los módulos de prioridad alta entre integrantes; nadie revisa su propio código.
3. Cada revisor recorre la lista del punto 2 y abre un issue por hallazgo con: archivo y línea, escenario que falla, severidad (alta / media / baja).
4. Para cada defecto alto o medio: escribir primero una prueba que falle, corregir y comprobar que pasa.
5. Las correcciones van en una rama `fix/revision-rc1` con PR hacia `Pruebas`, revisado por otro integrante.
6. Repetir `./ejecutar_pruebas.sh` y actualizar `trazabilidad.md` §7 y `resumen_pruebas.txt`.

## 5. Criterio de término

- Sin defectos de severidad alta abiertos.
- Defectos medios corregidos o declarados con justificación en §7.
- Todas las suites en verde en CI.
- Cada PR de corrección con al menos un comentario de revisión.

Duración estimada: 1 día de revisión y 1 a 2 días de correcciones.
