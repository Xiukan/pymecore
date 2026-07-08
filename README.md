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

Aplicar la estructura de la base de datos:
```bash
pnpm prisma migrate deploy
```

Cargar datos de prueba (usuarios, productos, stock inicial):
```bash
pnpm prisma db seed
```

Iniciar el servidor:
```bash
pnpm start:dev
```

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
│   ├── src/
│   │   ├── auth/
│   │   ├── items/
│   │   ├── stock/
│   │   ├── transactions/
│   │   ├── sync/
│   │   ├── sii/
│   │   └── ...
│   └── sii-certs/           # Certificados SII de prueba
└── erp-frontend/            # SPA (React + Vite + Tailwind)
    └── src/
        ├── pages/
        ├── components/
        ├── hooks/
        └── api/
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
