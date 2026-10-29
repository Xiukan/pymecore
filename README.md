# PYMECORE — ERP para PYMEs chilenas

Demo ERP desarrollado para UCM Ingeniería de Software II.  
Stack: NestJS 11 · Prisma 7 · PostgreSQL 16 · React · Vite · Tailwind CSS

---

## 1. Instalar dependencias del sistema

### Node.js 20

**Windows / Mac:** Descarga el instalador desde https://nodejs.org/ (versión LTS) y ejecútalo.

**Ubuntu / Debian:**
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
```

Verifica: `node --version` debe mostrar `v20.x.x`

---

### pnpm

**Windows (PowerShell):**
```powershell
Invoke-WebRequest https://get.pnpm.io/install.ps1 -UseBasicParsing | Invoke-Expression
```

**Mac / Linux:**
```bash
curl -fsSL https://get.pnpm.io/install.sh | sh -
```

Cierra y vuelve a abrir la terminal para que el comando `pnpm` quede disponible.

Verifica: `pnpm --version`

---

### Docker

**Windows / Mac:** Descarga e instala Docker Desktop desde https://www.docker.com/products/docker-desktop/

**Ubuntu / Debian:**
```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
newgrp docker
```

Verifica: `docker --version` y `docker compose version`

---

## 2. Clonar el repositorio

```bash
git clone https://github.com/Xiukan/pymecore.git
cd pymecore
```

---

## 3. Levantar la base de datos

```bash
docker compose up -d
```

Esto descarga PostgreSQL 16 y lo inicia en el puerto `5433`.  
La primera vez puede tardar 1-2 minutos mientras descarga la imagen.

Verifica que esté corriendo:
```bash
docker ps
```
Debes ver el contenedor `erp_postgres` con estado `Up`.

---

## 4. Configurar y lanzar el backend

```bash
cd erp-backend
cp .env.example .env
pnpm install
```

Aplicar la estructura de la base de datos y generar el cliente Prisma:
```bash
pnpm prisma migrate deploy
pnpm prisma generate
```

Cargar datos de prueba (usuarios, productos, stock inicial):
```bash
pnpm prisma db seed
```

Variables que conviene revisar en `.env` (todas están en `.env.example`):

| Variable | Para qué |
|---|---|
| `JWT_SECRET` | Firma de sesiones. Obligatoria; en producción, 32+ caracteres aleatorios. |
| `SII_P12_PASSWORD` | Clave del certificado `.p12` en `sii-certs/` (el certificado y el CAF no se versionan). |
| `CORS_ORIGIN` | Orígenes del frontend separados por coma; en producción es obligatoria y no admite `*`. |
| `LOGIN_MAX_INTENTOS` | Intentos de login por minuto por IP y usuario (5 por defecto). |
| `SII_CAF_PATH` / `SII_P12_PATH` | Rutas del CAF y del certificado (por defecto en `sii-certs/`). |
| `MODO` | `local` (por defecto), `edge` (el local) o `cloud` (la nube). Ver "Incremento 1". |
| `LEASE_SECRET` / `LEASE_GRACIA_MIN` | Secreto compartido de la licencia y margen tras las 24 h. |
| `CLOUD_URL` / `INSTALACION_ID` / `INSTALACION_SECRETO` / `SYNC_INTERVALO_MS` | Solo en el local: a qué nube enviar, con qué credenciales y cada cuánto. |
| `NODE_ENV` / `SWAGGER` | En `production` Swagger se desactiva salvo `SWAGGER=true`. |

Los datos de la empresa (RUT, razón social, giro, IVA, plazos, topes) no van en `.env`: se editan en la pantalla **Configuración** (tabla `empresa`).

Iniciar el servidor:
```bash
pnpm start:dev
```

Comprobar que responde: `curl http://localhost:3000/health`.

El backend queda disponible en `http://localhost:3000`.  
Swagger (documentación API) en `http://localhost:3000/api-docs`.

---

## 5. Configurar y lanzar el frontend

Abre una **nueva terminal** y desde la raíz del proyecto:

```bash
cd erp-frontend
cp .env.example .env
pnpm install
pnpm dev
```

Abre el navegador en `http://localhost:5173`.

---

## Módulos

| Módulo | Qué hace |
|---|---|
| Ventas POS | Precio fijado por el servidor (oferta o lista del cliente, el menor), IVA incluido, caja obligatoria, efectivo/tarjeta/transferencia/crédito o dos medios, venta por peso, boleta o factura con folio del pool y DTE firmado. |
| Cotizaciones y pedidos | Cotización imprimible con los precios del cliente → pedido aceptado → venta. |
| Cajas | Apertura con fondo, arqueo (efectivo esperado vs contado) e informe Z por medio de pago. |
| Devoluciones | Contra la venta de origen, sin superar lo vendido; un vendedor no devuelve su propia venta. |
| Compras | Orden de compra → recepción (stock y costo promedio ponderado) → factura del proveedor; bandeja de DTE recibidos con verificación de timbre y firma. |
| Gastos | Gastos generales por categoría, con respaldo, IVA recuperable o no, retención de honorarios, vencimiento y pago. |
| Cuentas | Por cobrar (ventas a crédito con cupo, abonos y antigüedad) y por pagar (facturas de compra y gastos). |
| Impuestos (IVA) | Libro de ventas, libro de compras y resumen mensual tipo F29 (incluye IVA retenido a productores), descarga CSV y cuadratura con el RCV del SII. |
| Dashboard | Ventas, margen, gastos y resultado del período. |
| Contabilidad | Asientos automáticos desde cada documento, estado de resultados, balance de 8 columnas, libros diario y mayor, asientos manuales y cierre de mes (bloquea documentos del mes cerrado). |
| Bancos y flujo de caja | Cuentas bancarias, importación de cartola CSV y conciliación con sugerencias, flujo de caja proyectado por semana y activos fijos con depreciación lineal. |
| Compras a productores | Recepción con pesaje (bruto/tara), castigo por humedad e impurezas, factura de compra (DTE 46, retención total del IVA) o cambio de sujeto parcial, anticipos descontados al pagar. |
| Lotes | Lote por recepción o cosecha, con vencimiento; salidas FEFO en ventas, mermas y guías; trazabilidad del productor al cliente. |
| Campo | Predios, cuarteles y temporadas; cuaderno de campo con carencias que bloquean la cosecha; cosecha a stock con el costo del cuartel; costo por hectárea y por kilo frente al presupuesto. |
| Trabajadores de temporada | Jornadas y tratos, anticipos, liquidación de lo pendiente y control del certificado F30-1 de contratistas (no calcula cotizaciones: exporta CSV para remuneraciones). |
| Inventario | Conteo físico guiado (faltantes y sobrantes contabilizados) y sugerencia de compra según venta de 30 días. |

Cada empresa elige en **Datos de la empresa** qué módulos opcionales ve en el menú (cotizaciones, contabilidad, bancos, productores, campo, varios locales).

---

## Pruebas

**Todo con un solo comando** (requiere Docker, Node 20 y pnpm): levanta una base PostgreSQL desechable, corre el escaneo de secretos, las cuatro capas de pruebas y la medición p95, y escribe `resumen_pruebas.txt`. No toca la base de desarrollo.

```bash
./ejecutar_pruebas.sh
```

Por capa:

```bash
# Backend: unitarias
cd erp-backend && pnpm test

# Backend: integración contra PostgreSQL real (incluye concurrencia).
# Solo corre sobre una base cuyo nombre contenga "test": la borra y la recrea.
DATABASE_URL=postgresql://erp_user:erp_pass@localhost:5433/pyme_test pnpm test:e2e

# Frontend: unitarias
cd erp-frontend && pnpm test

# Navegador (Playwright) con backend y frontend levantados
E2E_BASE_URL=http://localhost:5173 pnpm test:e2e
```

Para la base de integración basta crearla una vez:
`docker exec erp_postgres psql -U erp_user -d postgres -c "create database pyme_test"`.

El CI de GitHub (`.github/workflows/ci.yml`) corre el escaneo de secretos y las tres capas en cada pull request hacia `Pruebas` o `main`.

---

## Incremento 1: local → nube

| Rol (`MODO`) | Qué hace |
|---|---|
| `edge` (el local) | Vende sin internet. Cada venta se guarda junto a su lugar en la cola de envío (`outbox_sync`) en la misma transacción. Un proceso envía la cola a la nube en lotes ordenados por secuencia local y reintenta con espera creciente. No vende si la licencia (Lease Token de 24 h + margen) venció; lo ya vendido no se toca. |
| `cloud` (la nube) | `POST /sync/lotes`: aplica cada venta una sola vez por su UUID (reenviar un lote no duplica), separada por `tenant_id`, y la envía al SII simulado (acepta o rechaza). `POST /lease/renovar`: emite la licencia del local. Se autentica cada local con su instalación y secreto. |
| `local` (por defecto) | Todo en una base, para desarrollo y demostración. |

Alta de un local en la nube: `DATABASE_URL=<base de la nube> pnpm exec ts-node scripts/alta-instalacion.ts "Nombre PYME" "Nombre local"` imprime `INSTALACION_ID` e `INSTALACION_SECRETO` para el `.env` del local. Ambos lados comparten `LEASE_SECRET`.

Contratos: `GET /inventario/alertas` (Próximo a vencer a 3 días, configurable en Datos de la empresa; Vencido; OK; Sin dato), `GET /sync/estado` (pendientes, último envío, conectividad, licencia), `POST /sync/lotes`, `POST /lease/renovar`.

### Logrado, simulado y pendiente

| Estado | Qué |
|---|---|
| Logrado | Venta sin internet con cola outbox; sincronización real a una base separada sin pérdidas ni duplicados (prueba con 20 ventas, corte y reenvío); `tenant_id` y aislamiento por PYME; licencia de 24 h validada sin conexión; alerta a 3 días con ícono y texto y "Sin dato"; DTE Aceptado/Rechazado sin anular la venta; venta en 3 pasos; p95 de ventas medido; escaneo de secretos; claves y rutas del certificado en `.env`. |
| Simulado | Respuesta del SII (adaptador que aplica sus validaciones básicas); datos de demostración. |
| Pendiente | Conexión al SII real (certificación); más de un local por PYME con conflictos; rotar la contraseña del certificado expuesta y reescribir el historial de git (el escaneo lo informa). |

Los módulos fuera del núcleo del incremento (ofertas, devoluciones, clientes y fiado, gastos, reportes, cotizaciones, contabilidad, bancos, productores, campo, varios locales) están apagados en una instalación nueva y se activan en **Datos de la empresa**.

---

## Usuarios de prueba

| Usuario     | Contraseña  | Rol           |
|-------------|-------------|---------------|
| `admin`     | `admin1234` | Administrador |
| `vendedor1` | `vend1234`  | Vendedor      |

---

## Acceso desde otros dispositivos en la misma red (LAN)

Para que tablets o celulares en la misma red Wi-Fi puedan acceder:

**1. Averigua la IP de tu máquina:**

- Windows: `ipconfig` → busca "Dirección IPv4" (ej. `192.168.1.X`)
- Mac/Linux: `ip a | grep "inet " | grep -v 127.0.0.1`

**2. Edita `erp-frontend/.env`:**
```
VITE_API_URL=http://192.168.1.X:3000
```

**3. Abre los puertos en el firewall (solo Linux):**
```bash
sudo ufw allow 3000/tcp
sudo ufw allow 5173/tcp
sudo ufw reload
```

**4. Reinicia el frontend** (`Ctrl+C` y `pnpm dev`).

Desde el otro dispositivo entra a `http://192.168.1.X:5173`.

---

## Estructura del proyecto

```
├── docker-compose.yml       # PostgreSQL + pgAdmin
├── erp-backend/             # API REST (NestJS + Prisma)
│   ├── prisma/
│   │   ├── schema.prisma
│   │   ├── migrations/
│   │   └── seed.ts          # Datos de prueba
│   ├── scripts/             # Diagnósticos y datos para pruebas
│   ├── src/
│   │   ├── auth/            # JWT, roles, alcance por sucursal, límite de login
│   │   ├── transactions/    # Ventas, devoluciones, mermas
│   │   ├── caja/
│   │   ├── compras/         # OC, recepciones, facturas, DTE recibidos
│   │   ├── gastos/
│   │   ├── cuentas/         # Por cobrar y por pagar
│   │   ├── tributario/      # Libros e IVA
│   │   ├── empresa/         # Parámetros y unidades de medida
│   │   ├── sii/ · sync/     # Emisión y envío de DTE
│   │   └── ...
│   ├── test/                # Integración (Jest + supertest + PostgreSQL)
│   └── sii-certs/           # Certificado y CAF (no versionados)
└── erp-frontend/            # SPA (React + Vite + Tailwind)
    └── src/
        ├── pages/
        ├── components/
        ├── hooks/
        ├── utils/           # Lógica pura con pruebas (*.test.ts)
        └── api/
    └── e2e/                 # Pruebas de navegador (Playwright)
```

---

## Solución de problemas frecuentes

**`pnpm prisma db seed` no encuentra el comando seed**
```bash
npx ts-node -r tsconfig-paths/register prisma/seed.ts
```

**Puerto 3000 o 5173 ya en uso**
```bash
# Ver qué proceso usa el puerto
lsof -i :3000
# Matarlo
kill -9 <PID>
```

**Docker no arranca el contenedor de PostgreSQL**
```bash
# Ver logs del contenedor
docker logs erp_postgres
# Reiniciar
docker compose down && docker compose up -d
```
