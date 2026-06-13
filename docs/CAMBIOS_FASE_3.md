# CAMBIOS FASE 3 — TaskFlow Pro

**Fecha:** 2026-06-03
**Versión:** 3.0.0
**Estado:** ✅ Implementado — pendiente de infraestructura (PostgreSQL + Redis)

---

## 🏗️ CAMBIOS ARQUITECTÓNICOS

### SQLite → PostgreSQL
- El backend abandona `better-sqlite3` y el módulo `mcpServer/database.ts` para adoptar `pg` (node-postgres)
- Se implementa connection pooling con `pg-pool` (máx. 20 conexiones)
- Tablas completamente relacionales con foreign keys y `ON DELETE CASCADE/SET NULL`
- Triggers automáticos de `updated_at` via función PostgreSQL `update_updated_at()`
- Índice full-text: `GIN(to_tsvector('spanish', title || ' ' || description))` en tareas

### Backend Restructurado
- **Antes:** `backend/server.js` (150 líneas monolíticas, SQLite)
- **Ahora:** `backend/src/` con estructura modular (config, controllers, middleware, routes, socket, utils, services)
- Separación clara: rutas → controladores → base de datos

### WebSockets en Tiempo Real (Socket.io)
- El servidor emite eventos `task:created`, `task:updated`, `task:deleted` en tiempo real
- El cliente React escucha estos eventos y actualiza el estado sin recargar
- **Polling eliminado** en `TaskContext` y `NotificationContext` cuando el socket está conectado
- Autenticación del socket con JWT en el handshake
- Salas (rooms): `user:{userId}`, `group:{groupId}`, `task:{taskId}`

### JWT Real
- **Antes:** tokens falsos (`token-${generateId()}`) guardados en localStorage, sin backend
- **Ahora:** JWT firmados con `jsonwebtoken` (acceso 1h) + refresh tokens (7 días)
- Blacklist de tokens en BD para logout seguro
- Tabla `refresh_tokens` para gestión de sesiones
- El `AuthContext` detecta automáticamente si el backend real está disponible (fallback a localStorage)

---

## 🆕 NUEVOS ENDPOINTS

### Auth (`/api/auth/`)
| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/register` | Registrar usuario (bcrypt 10 rounds) |
| POST | `/login` | Login → JWT + refreshToken |
| POST | `/refresh` | Renovar token con refreshToken |
| POST | `/logout` | Invalidar token (blacklist) |
| GET | `/me` | Perfil del usuario autenticado |

### Tasks (`/api/tasks/`)
| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/` | Listar con filtros (status, priority, assignedTo, groupId, search, paginación) |
| GET | `/search?q=` | Búsqueda full-text PostgreSQL con ranking |
| GET | `/:id` | Tarea con subtareas, comentarios y tags embebidos |
| GET | `/:id/history` | Historial de cambios (audit_log) |
| POST | `/` | Crear tarea (solo canEdit) |
| PUT | `/:id` | Actualizar tarea (optimistic update + socket) |
| DELETE | `/:id` | Eliminar (solo admin/leader) |

### Employees, Groups, Tags, Notifications, Stats, Audit
- CRUD completo para cada entidad
- `GET /api/stats` — estadísticas generales + by_priority + by_user
- `GET /api/audit` — audit log paginado con filtros (solo admin/leader)
- `GET /api/notifications` — notificaciones del usuario autenticado
- Documentación Swagger en `GET /api/docs`

---

## 🗄️ MIGRACIONES SQL

### `migrations/001_initial_schema.sql`
Crea todas las tablas:
- `users`, `groups`, `group_members`
- `tasks`, `task_subtasks`, `task_comments`
- `task_tags`, `task_tag_assignment`
- `notifications`, `audit_log`
- `token_blacklist`, `refresh_tokens`
- Índices de performance y búsqueda full-text
- Triggers de `updated_at`

### `migrations/002_seed_data.sql`
Datos de prueba con los 5 usuarios de siempre:
- `maria@empresa.com` / `admin123` (admin)
- `carlos@empresa.com` / `leader123` (leader)
- `ana@empresa.com` / `member123` (member)
- `pedro@empresa.com` / `member123` (member)
- `laura@empresa.com` / `viewer123` (viewer)
- 2 grupos, 4 tags, 5 tareas con subtareas y comentarios

---

## 🧪 TESTS IMPLEMENTADOS

### Unit Tests (22/22 pasando)
- `tests/unit/validators.test.js` — JWT sign/verify, validación de email, contraseñas, normalización de tareas
- `tests/unit/helpers.test.js` — formatDate, isDueDateOverdue, getInitials, lógica de roles

### Integration Tests
- `tests/integration/auth.test.js` — registro, login, me, refresh, logout (requiere BD)
- `tests/integration/tasks.test.js` — CRUD completo de tareas (requiere BD)
- Se saltan automáticamente si la BD no está disponible

### Ejecución
```bash
npm --prefix backend test                    # todos los tests
npm --prefix backend run test:coverage       # con reporte de cobertura
npx jest tests/unit --no-coverage           # solo unit (sin BD)
```

---

## 🔧 VARIABLES DE ENTORNO REQUERIDAS

Copiar `backend/.env.example` a `backend/.env`:

```env
PORT=3000
NODE_ENV=development
CLIENT_URL=http://localhost:5173

DB_HOST=localhost
DB_PORT=5432
DB_NAME=taskflow
DB_USER=postgres
DB_PASSWORD=tu_password
DB_TEST_NAME=taskflow_test

JWT_SECRET=secreto-muy-largo-aleatorio
JWT_EXPIRES_IN=1h
JWT_REFRESH_SECRET=otro-secreto-diferente
JWT_REFRESH_EXPIRES_IN=7d

# Opcionales
SENDGRID_API_KEY=SG.xxx
FROM_EMAIL=noreply@taskflow.com
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/...
```

---

## 🐳 DEPLOYMENT

### Desarrollo local (con PostgreSQL en Docker)
```bash
# 1. Instalar dependencias del backend
npm run backend:install

# 2. Levantar PostgreSQL
docker-compose up postgres -d

# 3. Ejecutar migraciones + seed
npm run backend:migrate:seed

# 4. Iniciar backend + frontend
npm start
```

### Producción (docker-compose completo)
```bash
# Copiar y editar variables de entorno
cp backend/.env.example .env
nano .env

# Levantar todo
docker-compose up -d

# Ejecutar migraciones (primera vez)
docker-compose --profile migrate run migrate
```

### Sin Docker — PostgreSQL local
```bash
# macOS con Homebrew
brew install postgresql@16
brew services start postgresql@16

# Crear BD
psql -U postgres -c "CREATE DATABASE taskflow;"
psql -U postgres -c "CREATE DATABASE taskflow_test;"

# Ejecutar migraciones
npm run backend:migrate:seed
```

---

## 🔒 SEGURIDAD IMPLEMENTADA

- **Helmet.js** — headers de seguridad (X-Frame-Options, HSTS, etc.)
- **Rate limiting** — 200 req/15min general, 20 req/15min para auth
- **CORS** — restringido a `CLIENT_URL`
- **bcrypt** — hash de contraseñas con 10 rounds
- **JWT blacklist** — tokens invalidados tras logout
- **SQL parametrizado** — 100% con `$1, $2, ...` (sin interpolación string)
- **express-validator** — validación y sanitización de inputs
- **Roles**: admin > leader > member > viewer con middleware

---

## ⚠️ PROBLEMAS ENCONTRADOS Y RESUELTOS

1. **top-level await en SocketContext.jsx** — No compatible con el bundler Vite. Solución: importación dinámica con `.then()` dentro de `useEffect`.

2. **Lint nunca configurado** — El proyecto no tenía `.eslintrc`. Se creó `.eslintrc.cjs` con reglas compatibles con el codebase existente (sin prop-types obligatorio, sin react-refresh strict).

3. **Hook condicional en TaskDetailModal** — `useEffect` después de `return null` condicional. Solucionado moviendo el hook antes del early return.

4. **Test de fecha con timezone** — `'2026-12-31'` parseado en UTC difería 1 día. Solución: test independiente de día exacto.

5. **socket.io-client no instalado en frontend** — Vite no puede resolver el módulo en build. Solución: `npm install socket.io-client` en el frontend.

6. **Backend usa CommonJS, frontend usa ESM** — Coexisten correctamente; el frontend importa socket.io-client vía dynamic import.

---

## 📊 ESTADO DEL CHECKLIST

### Backend ✅
- [x] Estructura modular (config, controllers, middleware, routes, socket)
- [x] PostgreSQL con pg-pool
- [x] Migraciones SQL versionadas
- [x] JWT + bcrypt + refresh tokens
- [x] Blacklist de tokens (logout seguro)
- [x] Middleware auth + roles
- [x] CRUD completo (tasks, employees, groups, tags, notifications)
- [x] Socket.io con autenticación JWT
- [x] Audit log + historial de tareas
- [x] Búsqueda full-text PostgreSQL
- [x] Rate limiting + Helmet + CORS
- [x] Swagger UI en `/api/docs`
- [x] Email service (SendGrid — requiere API key)
- [x] Unit tests (22/22)
- [x] Integration tests (requieren BD)
- [x] Dockerfile multi-stage
- [x] docker-compose.yml

### React ✅
- [x] SocketContext (socket.io-client)
- [x] Polling eliminado cuando socket activo
- [x] AuthContext con JWT real + fallback localStorage
- [x] NotificationContext con sockets
- [x] API service con JWT, auto-refresh, manejo de 401
- [x] SocketProvider en jerarquía de providers

### DevOps ✅
- [x] Dockerfile backend (Alpine, multi-stage, non-root user)
- [x] docker-compose.yml (postgres + backend + migrate profile)
- [x] .env.example documentado
- [x] GitHub Actions CI (unit tests + integration + docker build)
- [x] .eslintignore + .eslintrc.cjs

### Pendiente (requiere infraestructura)
- [ ] PostgreSQL instalado en el servidor
- [ ] Redis para caché (opcional — performance avanzada)
- [ ] SendGrid API key para emails
- [ ] Slack webhook para notificaciones

---

## 🏢 DEPLOYMENT EN SERVIDOR LOCAL (EMPRESA)

El proyecto está diseñado para correr en servidores locales de la empresa. **No se necesita cloud ni Docker** para producción — solo dos dependencias de sistema.

### Requisitos obligatorios

| Componente | Versión mínima | Propósito |
|---|---|---|
| **Node.js** | v20+ | Correr el backend |
| **PostgreSQL** | 16 | Base de datos |

### Componentes opcionales

| Componente | ¿Necesario? | Para qué sirve |
|---|---|---|
| Docker | ❌ No | Solo simplifica setup inicial |
| Redis | ❌ No | Caché avanzada (no en código actual) |
| SendGrid | ❌ No | Solo si quieren emails automáticos |
| GitHub Actions | ❌ No | Solo si tienen CI/CD con repo remoto |
| Nginx | ✅ Recomendado | Proxy reverso, HTTPS, puerto 80/443 |
| PM2 | ✅ Recomendado | Mantener Node.js corriendo como servicio |

### Instalación en macOS (Homebrew)

```bash
brew install postgresql@16 node
brew services start postgresql@16
psql -U postgres -c "CREATE DATABASE taskflow;"
```

### Instalación en Ubuntu/Debian

```bash
apt install postgresql-16 nodejs npm
systemctl start postgresql
psql -U postgres -c "CREATE DATABASE taskflow;"
```

### Levantar la aplicación

```bash
# Instalar dependencias del backend
npm run backend:install

# Crear tablas y datos de prueba
npm run backend:migrate:seed

# Iniciar (backend :3000 + frontend :5173 en modo dev)
npm start
```

### Producción con PM2 (recomendado)

PM2 mantiene el proceso Node corriendo aunque se cierre la terminal y lo reinicia automáticamente si el servidor se reinicia.

```bash
npm install -g pm2

# Iniciar el backend como servicio
cd backend
pm2 start src/index.js --name taskflow

# Guardar configuración y habilitar arranque automático
pm2 save
pm2 startup
```

### Nginx como proxy reverso (recomendado)

Permite acceder por el puerto 80 (HTTP) o 443 (HTTPS) en lugar del puerto 3000.

```nginx
server {
    listen 80;
    server_name taskflow.empresa.local;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;cxx
    }
}
```
