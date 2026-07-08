# PYMECORE — ERP para PYMEs chilenas

Demo ERP desarrollado para UCM Ingeniería de Software II.  
Stack: NestJS 11 · Prisma 7 · PostgreSQL 16 · React · Vite · Tailwind CSS

---

## Requisitos previos

- [Node.js 20+](https://nodejs.org/)
- [pnpm](https://pnpm.io/installation) — `npm install -g pnpm`
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (o Docker Engine en Linux)

---

## Instalación desde cero

### 1. Clonar el repositorio

```bash
git clone <URL_DEL_REPO>
cd "Ing Software II"
```

### 2. Levantar la base de datos

```bash
docker compose up -d
```

Esto levanta PostgreSQL en el puerto `5433` y pgAdmin en `http://localhost:5050`.

### 3. Configurar el backend

```bash
cd erp-backend
cp .env.example .env
pnpm install
```

Aplicar migraciones y cargar datos de prueba:

```bash
pnpm prisma migrate deploy
pnpm prisma db seed
```

Iniciar el servidor:

```bash
pnpm start:dev
```

El backend queda disponible en `http://localhost:3000`.  
Swagger en `http://localhost:3000/api-docs`.

### 4. Configurar el frontend

```bash
cd ../erp-frontend
cp .env.example .env
pnpm install
pnpm dev
```

El frontend queda disponible en `http://localhost:5173`.

---

## Acceso a la red local (LAN)

Para acceder desde otros dispositivos en la misma red Wi-Fi:

1. Averigua la IP de tu máquina: `ip a | grep "inet " | grep -v 127.0.0.1`
2. En `erp-frontend/.env` cambia:
   ```
   VITE_API_URL=http://192.168.X.X:3000
   ```
3. Reinicia el frontend (`Ctrl+C` y `pnpm dev`).
4. Desde el otro dispositivo entra a `http://192.168.X.X:5173`.

---

## Usuarios de prueba

| Usuario     | Contraseña | Rol           |
|-------------|------------|---------------|
| `admin`     | `admin1234`| Administrador |
| `vendedor1` | `vend1234` | Vendedor      |

---

## Estructura del proyecto

```
├── docker-compose.yml       # PostgreSQL + pgAdmin
├── erp-backend/             # API REST (NestJS + Prisma)
│   ├── prisma/
│   │   ├── schema.prisma
│   │   ├── migrations/
│   │   └── seed.ts
│   ├── src/
│   │   ├── auth/
│   │   ├── items/
│   │   ├── stock/
│   │   ├── transactions/
│   │   ├── sync/
│   │   ├── sii/
│   │   └── ...
│   └── sii-certs/           # Certificados SII de prueba
│       ├── mi_certificado.p12
│       └── CAF_Prueba.xml
└── erp-frontend/            # SPA (React + Vite + Tailwind)
    └── src/
        ├── pages/
        ├── components/
        ├── hooks/
        └── api/
```
