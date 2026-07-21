# Gestcon — GestionTareasOficina

Gestor de tareas para equipos de oficina con backend real en PostgreSQL, autenticación JWT, WebSockets en tiempo real y soporte Docker.

## Requisitos

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (recomendado)
- Node.js 20+ y npm (para modo local)

## Inicio rápido con Docker

```bash
# 1. Copiar variables de entorno
cp .env.example .env

# 2. Dar permisos a los scripts (solo la primera vez)
chmod +x scripts/*.sh

# 3. Levantar todos los servicios
docker compose up -d

# 4. Ejecutar migraciones con datos de prueba (solo la primera vez)
docker compose --profile migrate up migrate

# 5. Abrir la app
open http://localhost:5173
```

La API queda disponible en `http://localhost:3000/api` y la documentación Swagger en `http://localhost:3000/api/docs`.

## Inicio en modo local (Node + Postgres en Docker)

```bash
# 1. Levantar solo PostgreSQL y Mailhog
docker compose up -d postgres mailhog

# 2. Instalar dependencias
npm install
npm run backend:install

# 3. Copiar y configurar .env del backend
cp backend/.env.example backend/.env

# 4. Ejecutar migraciones
npm run backend:migrate:seed

# 5. Arrancar frontend + backend en paralelo
npm run start
```

Frontend: `http://localhost:5173` · Backend: `http://localhost:3000`

## Comandos útiles

```bash
npm run build              # Build de producción (verifica errores)
npm run lint               # ESLint (falla con warnings)
npm run backend:test       # Tests del backend
docker compose down        # Parar contenedores
./scripts/backup.sh    # Backup manual de BD, .env, certs con rotación de 7 días
./scripts/reset-db.sh     # Resetear BD (destructivo)
```

## Usuarios de prueba

| Email | Password | Rol |
|---|---|---|
| maria@empresa.com | admin123 | admin |
| carlos@empresa.com | leader123 | leader |
| ana@empresa.com | member123 | member |
| pedro@empresa.com | member123 | member |
| laura@empresa.com | viewer123 | viewer |

> Si el login falla con credenciales correctas: `localStorage.clear()` en la consola del navegador.

## Stack

| Capa | Tecnología |
|---|---|
| Frontend | React 18 + Vite 5 + Tailwind CSS 3 |
| Backend | Node.js + Express 4 |
| Base de datos | PostgreSQL 16 |
| Tiempo real | Socket.io 4 |
| Auth | JWT + bcrypt |
| Contenedores | Docker + Docker Compose |

## Documentación adicional

- [`docs/SETUP_MACOS.md`](docs/SETUP_MACOS.md) — Setup detallado en macOS
- [`docs/ACCESO_EXTERNO.md`](docs/ACCESO_EXTERNO.md) — Acceso desde red local
- [`docs/PROYECTO.md`](docs/PROYECTO.md) — Descripción completa del proyecto
- [`docs/ESTADO_PROYECTO.md`](docs/ESTADO_PROYECTO.md) — Estado actual e implementación detallada
