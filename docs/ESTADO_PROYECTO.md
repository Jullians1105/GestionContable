# Estado del Proyecto — GestionTareasOficina / TaskFlow Pro

**Última actualización:** 2026-06-23 (sesión 5 — fixes deploy + migraciones)  
**Rama activa:** `main`  
**Versión:** 3.0.0  
**Fases completadas:** FASE 1 ✅ · FASE 2 ✅ · FASE 3 ✅ · OWASP ✅  
**Ramas activas en remoto:** `main` · `feat/arregloBugsYAdiciones` · `feat/modulo-pagos`  
**Servidor de producción:** `192.168.1.12:5173`

---

## Stack tecnológico

| Capa | Tecnología |
|---|---|
| Frontend | React 18 + Vite 5 + React Router v6 |
| Estilos | Tailwind CSS 3 (`darkMode: 'class'`) |
| Estado | Context API + localStorage (fallback) |
| Tiempo real | Socket.io-client ^4.8.3 |
| UI extras | @dnd-kit (Kanban), Recharts 2, date-fns 3, jsPDF, xlsx |
| Backend | Node.js + Express 4 |
| Base de datos | PostgreSQL 16 (pg + connection pooling) |
| Auth | JWT (jsonwebtoken) + bcrypt + refresh tokens |
| WebSockets | Socket.io ^4.7.5 |
| Seguridad | helmet, cors, express-rate-limit, express-validator |
| Logging | pino + pino-pretty |
| Docs API | swagger-jsdoc + swagger-ui-express |
| Contenedores | Docker + Docker Compose |
| Tests | Jest 29 + supertest |

---

## Estructura del repositorio

```
GestionTareasOficina/
├── src/                        # Frontend React
│   ├── App.jsx                 # Jerarquía de providers + rutas
│   ├── context/                # 9 contextos
│   │   ├── AuthContext.jsx     # Login/logout, detección backend vs localStorage
│   │   ├── TaskContext.jsx     # CRUD tareas, escucha socket task:*
│   │   ├── TeamContext.jsx     # CRUD empleados (TeamProvider)
│   │   ├── GroupContext.jsx    # CRUD grupos
│   │   ├── TagContext.jsx      # CRUD etiquetas
│   │   ├── NotificationContext.jsx  # Notificaciones, escucha socket
│   │   ├── SocketContext.jsx   # Conexión Socket.io con JWT
│   │   ├── ThemeContext.jsx    # dark/light mode
│   │   └── ToastContext.jsx    # Notificaciones UI
│   ├── components/             # Componentes reutilizables
│   ├── pages/                  # 17 páginas
│   ├── services/api.js         # Cliente HTTP con interceptores
│   ├── hooks/                  # useTasks.js, useTeam.js
│   └── utils/
├── backend/
│   ├── src/
│   │   ├── index.js            # Punto de entrada (Express + Socket.io + Swagger)
│   │   ├── config/             # database.js, env.js
│   │   ├── controllers/        # authController, taskController, groupController, statsController
│   │   ├── middleware/         # auth.js (JWT + roles), errorHandler.js, validation.js
│   │   ├── routes/             # auth, tasks, employees, groups, tags, notifications, stats
│   │   ├── socket/events.js    # setupSocket — autenticación JWT, rooms, user:online/offline
│   │   ├── services/           # emailService
│   │   └── utils/              # jwt.js, logger.js, ...
│   ├── migrations/             # 6 archivos SQL + run.js
│   │   ├── 001_initial_schema.sql
│   │   ├── 002_seed_data.sql
│   │   ├── 003_notification_extra.sql
│   │   ├── 004_user_permissions.sql
│   │   ├── 005_password_reset.sql
│   │   ├── 006_security_hardening.sql
│   │   └── run.js              # CLI: --seed, --reset + tabla schema_migrations (tracking)
│   ├── tests/
│   │   ├── unit/               # 8 archivos (auth, tasks, groups, middleware, routes, stats, helpers, validators)
│   │   ├── integration/        # auth.test.js, tasks.test.js
│   │   └── e2e/                # ← VACÍO (pendiente)
│   ├── coverage/               # Generado por jest --coverage
│   ├── Dockerfile              # multi-stage + usuario no-root + HEALTHCHECK
│   ├── jest.config.js          # coverageThreshold: 70% lines/functions
│   └── package.json
├── docs/
│   ├── ESTADO_PROYECTO.md      # Este archivo
│   ├── PROYECTO.md             # Descripción general del proyecto
│   ├── CLAUDE.md               # Guía para Claude Code
│   ├── CAMBIOS_FASE_3.md       # Changelog de FASE 3
│   ├── CAMBIOS_SESION_2026-06-04.md
│   ├── CAMBIOS_SESION_2026-06-10.md
│   ├── SETUP_MACOS.md          # Instrucciones de primer setup
│   └── ACCESO_EXTERNO.md       # Acceso desde red local / externa
├── scripts/
│   ├── start-dev.sh            # Levanta Docker Compose para desarrollo
│   ├── stop-dev.sh
│   ├── backup-db.sh            # pg_dump manual vía docker compose exec
│   └── reset-db.sh
├── docker-compose.yml          # 5 servicios: postgres, mailhog, backend, frontend, migrate
├── Dockerfile                  # ← PROBLEMA (ver sección "Falta")
├── .env                        # NO está en git (.gitignore lo excluye)
├── .env.example                # Plantilla de variables
├── package.json                # Scripts npm raíz (dev, build, lint, start, backend:*)
└── vite.config.js
```

---

## Lo que está implementado

### Frontend

**Páginas disponibles (17):**
- `LoginPage`, `RegisterPage`, `ForgotPasswordPage`, `ResetPasswordPage`
- `DashboardPage` — estadísticas, tareas recientes
- `TasksPage` — lista de tareas con filtros
- `KanbanPage` — tablero drag-and-drop (@dnd-kit)
- `CalendarPage` — vista de calendario
- `GroupsPage` — gestión de grupos
- `TeamPage` — gestión de equipo
- `UsersPage` — administración de usuarios (admin)
- `NotificationsPage`
- `ReportsPage` — exportación PDF/Excel
- `ProfilePage`, `SettingsPage`
- `FondoEmprenderPage` + `FondoEmprenderEmpresasPage` + `FondoEmprenderEmpresaDetallePage` (módulo externo)

**Contextos y estado:**
- `AuthContext`: detecta automáticamente si backend real está disponible; fallback a localStorage
- `TaskContext`: CRUD + socket listeners (`task:created`, `task:updated`, `task:deleted`) + polling eliminado cuando socket está conectado
- `SocketContext`: conexión Socket.io con JWT en handshake, reconexión automática (5 intentos)
- `NotificationContext`: escucha notificaciones por socket; polling cada 3s solo cuando socket offline
- Roles: `isAdmin()`, `isLeader()`, `canEdit()` con restricciones en UI

**Control de acceso por rol:**

| Rol | Crear tarea | Editar/Eliminar | Comentar | Ver grupos/reportes |
|---|---|---|---|---|
| admin | ✅ | ✅ | ✅ | ✅ |
| leader | ✅ | ✅ | ✅ | ✅ |
| member | ❌ | ❌ | ✅ | ❌ |
| viewer | ❌ | ❌ | ❌ | ❌ |

### Backend API REST

**Endpoints implementados:**

```
GET    /api/health                         → estado del servidor

POST   /api/auth/register
POST   /api/auth/login
POST   /api/auth/refresh
POST   /api/auth/logout
GET    /api/auth/me
PUT    /api/auth/me
POST   /api/auth/forgot-password
POST   /api/auth/reset-password

GET    /api/tasks                          → filtros: status, priority, assignedTo, groupId, search, page
POST   /api/tasks
GET    /api/tasks/:id
PUT    /api/tasks/:id
DELETE /api/tasks/:id                      → solo admin/leader
GET    /api/tasks/:id/history
GET    /api/tasks/search
POST   /api/tasks/:id/subtasks
PUT    /api/tasks/:id/subtasks/:subtaskId
DELETE /api/tasks/:id/subtasks/:subtaskId
POST   /api/tasks/:id/comments
PUT    /api/tasks/:id/comments/:commentId
DELETE /api/tasks/:id/comments/:commentId

GET    /api/employees
POST   /api/employees                      → solo admin
PUT    /api/employees/:id
DELETE /api/employees/:id                  → solo admin

GET    /api/groups
POST   /api/groups                         → admin/leader
PUT    /api/groups/:id
DELETE /api/groups/:id                     → solo admin
POST   /api/groups/:id/members
DELETE /api/groups/:id/members/:userId

GET    /api/tags
POST   /api/tags
PUT    /api/tags/:id
DELETE /api/tags/:id                       → solo admin

GET    /api/notifications
PUT    /api/notifications/:id/read
PUT    /api/notifications/read-all
DELETE /api/notifications/:id

GET    /api/stats
GET    /api/stats/audit                    → solo admin/leader
```

**Seguridad:**
- JWT access token (1h) + refresh token (7d) en BD
- Blacklist de tokens para logout seguro
- `authMiddleware` valida token + blacklist en cada request
- `roleMiddleware(...roles)` y `canEdit` para control granular
- `helmet` para headers de seguridad
- Rate limiting: 2000 req/15min general, 50 req/15min en `/api/auth/`
- Validación de inputs con `express-validator` en rutas críticas

**WebSockets (Socket.io):**
- Autenticación con JWT en handshake (no puede conectar sin token válido)
- Rooms: `user:{userId}`, `group:{groupId}`, `task:{taskId}`
- Eventos emitidos por el backend: `task:created`, `task:updated`, `task:deleted`, `user:online`, `user:offline`
- `mark:read` para marcar notificaciones desde el cliente
- Evento `disconnect` limpia el mapa de usuarios online

**Base de datos PostgreSQL:**

| Migración | Contenido |
|---|---|
| 001 | Tablas: users, tasks, subtasks, task_comments, task_history, groups, group_members, tags, task_tags, notifications, token_blacklist, refresh_tokens |
| 002 | Seed data (5 usuarios de prueba + tareas de ejemplo) |
| 003 | Columnas extra en notifications |
| 004 | Tabla user_permissions |
| 005 | Tabla password_reset_tokens |
| 006 | OWASP hardening: columna `is_active` en users, tabla `login_attempts` (detección fuerza bruta) |

**Sistema de tracking:** `run.js` crea tabla `schema_migrations` (PRIMARY KEY filename). Saltar migraciones ya aplicadas con `⏭ already applied`. Opción `--reset` para limpiar y reaplicar todo. Todos los `CREATE INDEX` deben usar `IF NOT EXISTS` para ser idempotentes.

**Tests:**
- Cobertura actual: **~84% statements / ~73% functions** (umbral: 70%)
- 8 archivos unitarios: authController, taskController, groupController, statsController, middleware, routes, helpers, validators
- 2 archivos de integración: auth.test.js, tasks.test.js
- Script: `npm --prefix backend run test:coverage`

### Docker Compose

```yaml
# Servicios activos
postgres:   PostgreSQL 16-alpine + healthcheck (pg_isready) + volumen postgres_data
mailhog:    Servidor SMTP de pruebas (puerto 1025 SMTP, 8025 UI web)
backend:    Imagen propia multi-stage + depende de postgres (service_healthy)
frontend:   Imagen propia + depende de backend
migrate:    Perfil "migrate" — corre run.js --seed y termina
```

**Backend Dockerfile:** multi-stage ✅ · usuario no-root (`appuser`) ✅ · `HEALTHCHECK` en imagen ✅

### Documentación y scripts

- `docs/SETUP_MACOS.md` — instrucciones de primer setup completas
- `docs/ACCESO_EXTERNO.md` — acceso desde red local
- `scripts/backup-db.sh` — hace `pg_dump` vía Docker
- `scripts/start-dev.sh / stop-dev.sh / reset-db.sh`
- Swagger UI disponible en `/api/docs` cuando el backend está corriendo

---

## Lo que FALTA o está ROTO

### 🔴 Crítico — ~~Dockerfile frontend~~ ✅ RESUELTO (2026-06-20)

~~Frontend Dockerfile no era apto para producción (corría `npm run dev`).~~

**Solución aplicada:**
- `Dockerfile` reescrito como multi-stage: `node:20-alpine` para build → `nginx:alpine` para servir
- `nginx.conf` creado con proxy `/api/` y `/socket.io/` al backend + `try_files` para React Router
- `docker-compose.yml` actualizado: puerto `5173:80`, `volumes` eliminados del frontend, dependencia cambiada a `service_healthy`

### 🟡 Importante

**~~E2E Tests completamente ausentes~~** ✅ RESUELTO (2026-06-20)
- Cypress ^13.17.0 instalado como devDependency
- `cypress.config.js` configurado (baseUrl: localhost:5173)
- `cypress/support/commands.js`: comandos `login`, `loginAsAdmin`, `loginAsViewer`, `loginAsMember`
- 3 suites de tests en `cypress/e2e/`:
  - `01-login.cy.js` — 6 tests: login válido, login inválido, campos vacíos, logout
  - `02-tasks.cy.js` — 5 tests: crear tarea, editar, completar, eliminar
  - `03-permissions.cy.js` — 8 tests: restricciones por viewer/member/admin
- Scripts añadidos: `npm run e2e` (modo interactivo) y `npm run e2e:run` (headless)

**~~Healthcheck del backend en docker-compose.yml~~** ✅ RESUELTO (2026-06-20)
- `healthcheck:` añadido al servicio `backend` en `docker-compose.yml`
- Servicio `frontend` ahora depende de `backend` con `condition: service_healthy`

**~~DEPLOY.md ausente~~** ✅ RESUELTO (2026-06-20)
- `docs/DEPLOY.md` creado con guía completa para Ubuntu Server `192.168.1.12`
- Cubre: instalación Docker, clonar repo, configurar .env, migraciones, backup automático (cron), firewall, troubleshooting

### 🟢 Nice-to-have

- ~~`README.md` en la raíz del proyecto no existe~~ ✅ CREADO (2026-06-20)
- ~~Backup automático con cron~~ ✅ Documentado en DEPLOY.md (crontab para 2:00 AM + limpieza 7 días)
- Stress test con 14 usuarios simultáneos no ejecutado aún (requiere acceso al servidor)

---

## Usuarios de prueba (seed data)

| Email | Password | Rol |
|---|---|---|
| maria@empresa.com | admin123 | admin |
| carlos@empresa.com | leader123 | leader |
| ana@empresa.com | member123 | member |
| pedro@empresa.com | member123 | member |
| laura@empresa.com | viewer123 | viewer |

Si el login falla con credenciales correctas: `localStorage.clear()` en consola del navegador.

---

## Comandos clave

```bash
# Desarrollo local (frontend + backend en paralelo)
npm run start

# Solo frontend
npm run dev

# Build de producción (verifica errores)
npm run build

# Migraciones
npm run backend:migrate          # solo schema
npm run backend:migrate:seed     # schema + datos de prueba

# Tests del backend
npm --prefix backend run test
npm --prefix backend run test:coverage

# Docker
docker compose up -d             # levanta postgres + mailhog + backend + frontend
docker compose --profile migrate up migrate   # ejecuta migraciones
docker compose down

# Scripts auxiliares
chmod +x scripts/*.sh
./scripts/start-dev.sh
./scripts/backup-db.sh
```

---

## Variables de entorno necesarias

Copiar `.env.example` a `.env` en la raíz antes de usar Docker.  
Copiar `backend/.env.example` a `backend/.env` para modo Node local.

Variables críticas: `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, `PORT`.

---

## Checklist FASE 3 — Estado final

| # | Tarea | Estado |
|---|---|---|
| 1 | PostgreSQL + 5 migraciones SQL | ✅ Completo |
| 2 | Backend API REST (30+ endpoints) | ✅ Completo |
| 3 | JWT + bcrypt + blacklist de tokens | ✅ Completo |
| 4 | Rate limiting (express-rate-limit) | ✅ Completo |
| 5 | Validación de inputs en servidor | ✅ Completo |
| 6 | Control de acceso por rol (admin/leader/member/viewer) | ✅ Completo |
| 7 | Socket.io WebSockets (backend + frontend) | ✅ Completo |
| 8 | Polling eliminado cuando socket activo | ✅ Completo |
| 9 | Dockerfile frontend (multi-stage + nginx) | ✅ Resuelto sesión 2 |
| 10 | nginx.conf (proxy API + WebSocket + React Router) | ✅ Resuelto sesión 2 |
| 11 | docker-compose.yml healthchecks completos | ✅ Resuelto sesión 2 |
| 12 | README.md raíz | ✅ Resuelto sesión 2 |
| 13 | Tests unitarios (84% cobertura, umbral 70%) | ✅ Completo |
| 14 | Tests de integración | ✅ Completo |
| 15 | E2E Tests con Cypress (19 tests en 3 suites) | ✅ Resuelto sesión 3 |
| 16 | docs/DEPLOY.md (guía Ubuntu Server 192.168.1.12) | ✅ Resuelto sesión 3 |
| 17 | Backup automático documentado (cron) | ✅ Resuelto sesión 3 |
| 18 | Stress test 14 usuarios simultáneos | ⏳ Pendiente (requiere servidor real) |
| 19 | OWASP Top 10 hardening | ✅ Implementado sesión 4 |
| 20 | assignedTo multi-usuario (string→array + normalizeAssignedTo) | ✅ Implementado 2026-06-23 |
| 21 | Fix migraciones idempotentes (schema_migrations tracking + IF NOT EXISTS) | ✅ Resuelto 2026-06-23 |
