# Estado del Proyecto — GestionTareasOficina / TaskFlow Pro

**Última actualización:** 2026-07-13 (sesión 14 — subtareas: quién completó cada una; Equipo:
editar/remover solo admin; filtro "Creadas por mí"; botón "Nueva Tarea" en el Header; solicitud
de eliminación de tareas con aprobación de admin/líder — checklist #52-56)  
**Rama activa:** `feat/ajustesResponsiveArregloBugs11/07` (local, sin push aún; sobre `main`
tras el merge de `feat/funcionesNuevas` vía PR #13). Working tree **sin commitear todavía**,
acumulando la sesión 13 (progreso individual por asignado — checklist #51) más toda la sesión 14
(checklist #52-56): incluye `backend/migrations/019` a `021` sin trackear, más los archivos
modificados de ambas sesiones. Plan: el usuario va a commitear, pushear la rama (sin abrir PR
todavía — no hace falta para poder seguir trabajándola en otra máquina, `git fetch` +
`git checkout` alcanza) y continuar desde un MacBook.  
**Ojo si se retoma desde otra máquina:** `CLAUDE.md` (raíz) y toda la carpeta `.claude/`
(incluida esta memoria de sesión) están en `.gitignore` — **no viajan con git push/pull/clone**.
Si el trabajo continúa en el Mac, ese Claude Code arranca sin este contexto salvo que alguien
copie esos archivos manualmente (AirDrop/USB/etc.), no vía git.  
**Versión:** 3.0.0  
**Fases completadas:** FASE 1 ✅ · FASE 2 ✅ · FASE 3 ✅ · OWASP ✅ · Fondo Emprender ✅  
**Ramas activas en remoto:** `main` (`feat/funcionesNuevas` ya mergeada vía PR #13 —
Tablero de Carga de Trabajo + liderazgo por grupo + fix `CalendarPage`; verificar con
`git fetch` antes de asumir vigencia)  
**Servidor de producción:** `https://gestcon.work` (Cloudflare Tunnel + HTTPS real) · `https://192.168.1.12` (acceso local directo)

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
│   ├── pages/                  # 18 páginas
│   ├── services/api.js         # Cliente HTTP con interceptores
│   ├── hooks/                  # useTasks.js, useTeam.js
│   └── utils/
├── backend/
│   ├── src/
│   │   ├── index.js            # Punto de entrada (Express + Socket.io + Swagger)
│   │   ├── config/             # database.js, env.js
│   │   ├── controllers/        # authController, taskController, groupController, statsController,
│   │   │                       # fondoEmpresasController, fondoProcesosController, fondoChecklistController,
│   │   │                       # fondoDetalleController, fondoPagosController, fondoLinksController
│   │   ├── middleware/         # auth.js (JWT + roles), errorHandler.js, validation.js, fondoAccess.js
│   │   ├── routes/             # auth, tasks, employees, groups, tags, notifications, stats,
│   │   │                       # fondoEmpresas, fondoProcesos, fondoChecklist, fondoDetalle, fondoPagos, fondoLinks
│   │   ├── socket/events.js    # setupSocket — autenticación JWT, rooms, user:online/offline
│   │   ├── services/           # emailService
│   │   └── utils/              # jwt.js, logger.js, ...
│   ├── migrations/             # 12 archivos SQL + run.js
│   │   ├── 001_initial_schema.sql
│   │   ├── 002_seed_data.sql
│   │   ├── 003_notification_extra.sql
│   │   ├── 004_user_permissions.sql
│   │   ├── 005_password_reset.sql
│   │   ├── 006_security_hardening.sql
│   │   ├── 007_due_time.sql
│   │   ├── 007_fondo_empresas.sql
│   │   ├── 008_fondo_checklist.sql
│   │   ├── 009_fondo_detalle.sql
│   │   ├── 010_fondo_pagos.sql
│   │   ├── 011_task_fondo_links.sql
│   │   ├── 012_fondo_detalle_anio_mes.sql
│   │   └── run.js              # CLI: --seed, --reset + tabla schema_migrations (col: version)
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
│   ├── backup.sh               # Backup completo: BD + .env + certs, comprimido, rotación 7 días
│   ├── restore.sh              # Restaura desde backup_TIMESTAMP.tar.gz
│   ├── setup-cron.sh           # Instala cron de backup diario a las 6 PM
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

**Páginas disponibles (18):**
- `LoginPage`, `RegisterPage`, `ForgotPasswordPage`, `ResetPasswordPage`
- `DashboardPage` — estadísticas, tareas recientes
- `TasksPage` — lista de tareas con filtros
- `KanbanPage` — tablero drag-and-drop (@dnd-kit)
- `CalendarPage` — vista de calendario + templates proyectados + barras de rango de fechas
- `GroupsPage` — gestión de grupos
- `TeamPage` — gestión de equipo
- `UsersPage` — administración de usuarios (admin)
- `NotificationsPage`
- `ReportsPage` — exportación PDF/Excel
- `WorkloadPage` — Tablero de Carga de Trabajo (`/workload`, admin/leader): barras de tareas
  abiertas por persona, detalle con vencidas, indicador de balance, recomendaciones de
  rebalanceo **por grupo** (no cruza equipos) e histórico mensual de tareas creadas
- `ProfilePage`, `SettingsPage`
- `FondoEmprenderPage` + `FondoEmprenderEmpresasPage` + `FondoEmprenderEmpresaDetallePage` + `FondoEmprenderPagosPage` (módulo Fondo Emprender)
- `RecurringTasksPage` — gestión de templates recurrentes (solo admin/leader, ruta `/tasks/recurrentes`)

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

Nota: member (y cualquiera que no sea viewer) puede *solicitar* la eliminación de una tarea con
un motivo aunque no pueda borrarla directamente — ver checklist #56 (`task_delete_requests`).

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
PUT    /api/groups/:id/members/:userId/leader  → asignar/quitar liderazgo del grupo (solo admin)

GET    /api/tags
POST   /api/tags                           → cualquier usuario autenticado (sin restricción de rol)
PUT    /api/tags/:id
DELETE /api/tags/:id                       → solo admin

GET    /api/fondo/empresas
POST   /api/fondo/empresas
PUT    /api/fondo/empresas/:id
DELETE /api/fondo/empresas/:id
GET    /api/fondo/procesos
GET    /api/fondo/checklist/:empresaId
PUT    /api/fondo/checklist/:empresaId
GET    /api/fondo/detalle/:empresaId
PUT    /api/fondo/detalle/:empresaId/:macroId
GET    /api/fondo/detalle/tareas-macro
GET    /api/fondo/detalle/responsables
GET    /api/fondo/pagos
POST   /api/fondo/pagos
PUT    /api/fondo/pagos/:id
DELETE /api/fondo/pagos/:id
GET    /api/tasks/:id/fondo-link
POST   /api/tasks/:id/fondo-link
DELETE /api/tasks/:id/fondo-link

PATCH  /api/tasks/:id/assignees/me         → marca el status individual del usuario autenticado
                                              como asignado; tasks.status se recalcula como
                                              agregado (completed solo si todos completaron)

POST   /api/tasks/:id/delete-request       → solicita eliminar una tarea con motivo (cualquiera
                                              que no sea viewer); notifica a admins + líder(es)
                                              del grupo de la tarea
PATCH  /api/tasks/:id/delete-request/:requestId → aprueba/rechaza (admin o líder del grupo);
                                              mismo criterio de autorización que DELETE /:id

GET    /api/tasks/templates                  → lista templates recurrentes (admin/leader)

GET    /api/notifications
PUT    /api/notifications/:id/read
PUT    /api/notifications/read-all
DELETE /api/notifications/:id
GET    /api/notifications/vapid-public-key  → clave pública VAPID para Web Push
POST   /api/notifications/push-subscribe    → registrar suscripción push del dispositivo
DELETE /api/notifications/push-subscribe    → eliminar suscripción

GET    /api/stats
GET    /api/stats/audit                    → solo admin/leader
GET    /api/stats/workload                 → solo admin/leader; carga por persona (total + por
                                              grupo) y tareas creadas por mes (últimos 6 meses)
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
- `users:online:list` emitido al socket recién conectado con array de IDs ya online (fix PWA)
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

**Sistema de tracking:** `run.js` crea tabla `schema_migrations` (PRIMARY KEY `filename`). Saltar migraciones ya aplicadas. Opción `--reset` para limpiar y reaplicar todo. Todos los `CREATE INDEX` deben usar `IF NOT EXISTS` para ser idempotentes.

**Números duplicados (007 y 018) — intencionalmente sin renombrar:** existen dos pares de
archivos con el mismo prefijo numérico (`007_due_time.sql`/`007_fondo_empresas.sql` y
`018_fondo_pagos_autorizado.sql`/`018_group_leaders.sql`). El tracking es por **nombre de
archivo completo** (no por el número), así que no hay colisión real ni problema de
dependencias entre ellos. **No renombrar estos archivos**: ya corrieron en producción
(`gestcon.work`), y `run.js` solo reconoce una migración como "ya aplicada" si el nombre
coincide exactamente con lo que hay en `schema_migrations`. Renombrar `007_fondo_empresas.sql`
la haría re-ejecutarse en el próximo deploy y duplicaría el `INSERT` de las 30 empresas
(no tiene protección `ON CONFLICT`).

| Migración | Contenido |
|---|---|
| 007 | Columna `due_time TIME` en tasks |
| 007_fondo_* → 012 | Módulo Fondo Emprender |
| 013 | Tareas recurrentes: `is_recurring`, `recurrence JSONB`, `template_id` |
| 014 | Columna `start_time` (existe en BD, no usada en código — reverted) |
| 015 | Tabla `push_subscriptions` (Web Push / iPhone PWA) |
| 016 | Columna `reminder_sent_at TIMESTAMPTZ` en tasks |
| 017 | Elimina etiquetas de muestra del seed (bug, feature, urgente, documentación) vía DELETE por UUID |
| 018 | `group_members.is_leader BOOLEAN` — soporte multi-líder por grupo (índice parcial `WHERE is_leader = true`) |
| 019 | Tabla `fondo_pagos_mes_actual` (singleton) — mes vencido habilitado para pagos, controlado manualmente por las jefas en vez de derivarse de la fecha del sistema |
| 020 | Tabla `task_assignees` (task_id, user_id, status, completed_at) — estado individual por asignado; backfill desde `tasks.assigned_to`/`status` existentes |
| 021 | Columnas `completed_by`/`completed_at` en `task_subtasks` — quién completó cada subtarea; backfill best-effort de `completed_at` desde `updated_at` |
| 022 | Tabla `task_delete_requests` (task_id, requested_by, reason, status, resolved_by, resolved_at) — solicitudes de eliminación con motivo; índice único parcial evita duplicar solicitudes pendientes por tarea |
| 023 | Tablas `fondo_impuestos` (catálogo fijo: autorretención, retención, IVA, consumo) y `fondo_impuestos_items` (registro por empresa × impuesto × mes) — checklist de la tarjeta "Información tributaria" (mp6), independiente del checklist mensual |

**Tests:**
- Cobertura actual: **~81% statements / ~74% functions** (umbral: 70%)
- 8 archivos unitarios: authController, taskController, groupController, statsController, middleware, routes, helpers, validators
- 2 archivos de integración: auth.test.js, tasks.test.js
- Excluidos de cobertura: `pushService.js`, `recurringTaskService.js`, `reminderService.js` (servicios de infraestructura)
- `jest.mock('../../src/services/pushService', ...)` en taskController.test.js y routes.test.js
- `public/sw.js` tiene override en `.eslintrc.cjs` con `env: { serviceworker: true }`
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

**Backend Dockerfile:** multi-stage ✅ · usuario no-root (`appuser`) ✅ · `HEALTHCHECK` en imagen ✅ · `app.set('trust proxy', 1)` para X-Forwarded-For con nginx ✅

**Frontend nginx:** escucha en 443 (HTTPS) y redirige 80 → 443. Certs montados desde `/etc/nginx/certs/` del host como volumen `:ro`. Expone puertos 80 y 443.

**HTTPS producción:** Cloudflare Tunnel activo en `https://gestcon.work`. HTTPS real sin warning para todos los usuarios (14 en oficina + 3 líderes remotos). Acceso local directo sigue disponible en `https://192.168.1.12` (cert autofirmado). CORS acepta ambos orígenes vía `CLIENT_URL` separado por comas.

**Service Worker (`public/sw.js`):** Maneja `push` events (Web Push API) y `notificationclick` con navegación a `event.notification.data.url`. Registrado en `src/main.jsx`.

**PWA (iPhone):** `public/manifest.json` con `display: standalone`. Meta tags Apple en `index.html`. Instalar desde Safari → Compartir → "Agregar a pantalla de inicio". Push notifications se suscriben automáticamente al iniciar sesión si el usuario otorga permiso. VAPID keys en `backend/.env`.

**Frontend build:** Se construye localmente con `--platform linux/amd64` si el servidor no tiene RAM suficiente para esbuild.

### Documentación y scripts

- `docs/SETUP_MACOS.md` — instrucciones de primer setup completas
- `scripts/backup.sh` — backup completo (BD + .env + certs) con rotación 7 días
- `scripts/restore.sh` — restauración desde archivo tar.gz
- `scripts/setup-cron.sh` — instala cron de backup diario 6 PM
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
./scripts/backup.sh
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
| 22 | Fix backend crash SHOW_RESET_TOKEN en producción | ✅ Resuelto 2026-06-24 |
| 23 | Fix frontend Docker: puerto 5173:80, CSP nginx una línea, logos como imports ES | ✅ Resuelto 2026-06-24 |
| 24 | Build frontend desde Mac (--platform linux/amd64) por SIGSEGV esbuild en servidor | ✅ Documentado 2026-06-24 |
| 25 | Módulo Fondo Emprender completo (empresas, checklist, macroprocesos, pagos, responsables) | ✅ Implementado 2026-06-26 |
| 26 | Vínculo tarea ↔ macroproceso Fondo (task_fondo_links, badge en TaskCard, TaskForm) | ✅ Implementado 2026-06-26 |
| 27 | Panel Fondo Emprender en Mis Tareas (solo miembros del grupo) | ✅ Implementado 2026-06-26 |
| 28 | HTTPS con certificado autofirmado en nginx (puertos 80→443) | ✅ Implementado 2026-06-26 |
| 29 | Service Worker para Notification API en red local HTTP/HTTPS | ✅ Implementado 2026-06-26 |
| 30 | Backup automático con cron a las 6 PM (BD + .env + certs, rotación 7 días) | ✅ Implementado 2026-06-26 |
| 31 | Fix grupos: leaders pueden eliminar grupos | ✅ Resuelto 2026-06-26 |
| 32 | Tags: sin restricción de rol para crear, eliminadas etiquetas de muestra | ✅ Resuelto 2026-06-26 |
| 33 | Cloudflare Tunnel `gestcon.work` (HTTPS real, acceso remoto 3 líderes, sin warning) | ✅ Implementado 2026-06-26 |
| 34 | Tareas recurrentes mensuales: templates, instancias automáticas, cron días 1-3 a las 7AM, vigencia por rango de fechas | ✅ Implementado 2026-06-27 |
| 35 | Calendario: templates proyectados + barras naranjas para rangos de fechas | ✅ Implementado 2026-06-27 |
| 36 | Web Push notifications (VAPID) — soporte iPhone PWA + manifest.json | ✅ Implementado 2026-06-27 |
| 37 | Recordatorios automáticos de vencimiento: cron cada 30 min, sin due_time → hoy/mañana, con due_time → 2h antes | ✅ Implementado 2026-06-27 |
| 38 | Logo Sidebar clickeable → navega al inicio (/) | ✅ Implementado 2026-06-27 |
| 39 | Fix CI: ESLint override para sw.js (serviceworker env), mock pushService en tests, coveragePathIgnore nuevos servicios | ✅ Resuelto 2026-06-27 |
| 40 | Responsable temporal Nómina electrónica: `Daniela Ruiz` → `Dana` en `MACRO_RESPONSABLES` (hardcoded en FondoEmprenderEmpresaDetallePage.jsx) | ✅ Resuelto 2026-07-02 |
| 41 | Fix online en PWA: `socket/events.js` emite `users:online:list` al conectar; `SocketContext.jsx` lo escucha para poblar estado inicial | ✅ Resuelto 2026-07-02 |
| 42 | Migración 017: elimina etiquetas de muestra del seed; `002_seed_data.sql` limpiado de tags y assignments | ✅ Resuelto 2026-07-02 |
| 43 | Tablero de Carga de Trabajo (`/workload`): `GET /api/stats/workload` (solo lectura, sin migraciones), barras + detalle + balance + histórico mensual | ✅ Implementado 2026-07-08 |
| 44 | Recomendaciones de rebalanceo **por grupo** (Tablero) y sugerencia de menor carga **por grupo** en el selector "Asignado a" de `TaskForm` — no cruzan equipos (Desarrollo/Fondo Emprender/Tributario/etc.) | ✅ Implementado 2026-07-08 |
| 45 | n8n `fondo-pagos-alerta-mora`: fix login de servicio (password real), fix SMTP `Missing credentials for PLAIN` con Mailhog, migrado a Gmail SMTP para alertas reales | ✅ Resuelto 2026-07-08 |
| 46 | Limpieza: carpeta duplicada de OneDrive del repo (causaba error de migración en Docker) eliminada | ✅ Resuelto 2026-07-08 |
| 47 | Liderazgo por grupo: migración 018 (`group_members.is_leader`, multi-líder por grupo), permisos reales en backend (editar/eliminar grupo, agregar/quitar miembros, eliminar tarea — solo admin o líder del grupo específico; tareas sin grupo solo las borra admin), asignable desde Usuarios | ✅ Implementado 2026-07-08 |
| 48 | Revisión de seguridad de BD antes de deploy de `feat/funcionesNuevas`: migración 018 es aditiva/idempotente (`ADD COLUMN IF NOT EXISTS` + `DEFAULT false`, `CREATE INDEX IF NOT EXISTS`), no toca datos existentes; `GET /api/stats/workload` es 100% de solo lectura; todas las columnas usadas en las queries nuevas ya existían salvo `is_leader` (la crea la propia 018). El orden migrar→arrancar backend ya está garantizado por `docker-compose.yml` (`backend` tiene `depends_on: migrate: condition: service_completed_successfully`), así que `docker compose up -d` solo es seguro sin pasos manuales extra — ver `docs/DEPLOY.md` §6 (actualizado con backup previo vía `scripts/backup.sh`) | ✅ Revisado 2026-07-11 |
| 49 | Fix `CalendarPage`: al hacer clic en un día dentro del rango de vigencia (`recurrence.start_date`→`end_date`) de un template recurrente, el panel derecho ahora muestra el template como si fuera una tarea de ese día (antes solo aparecía en el día exacto proyectado `approx_day`, y el resto de días del rango sombreado mostraban "Sin tareas este día"). Verificado end-to-end con Playwright headless contra los contenedores `_dev` (usuario admin temporal creado y borrado en la BD para el test, no se usaron credenciales reales) | ✅ Implementado 2026-07-11 |
| 50 | Corrección `docs/DEPLOY.md` §6: el paso de migración ya no depende de que la persona que despliega "revise si hay migraciones nuevas" — se descubrió que `docker-compose.yml` ya fuerza el orden correcto vía `backend: depends_on: migrate: condition: service_completed_successfully` (el `migrate` de ese archivo no tiene `profiles:`, a diferencia de lo que sugería la doc vieja con `--profile migrate`). Guía simplificada a 3 comandos (`git pull` → `build` → `up -d`) + backup previo recomendado con `./scripts/backup.sh` | ✅ Resuelto 2026-07-11 |
| 51 | Progreso individual por asignado en tareas multi-persona: migración 019 (`task_assignees`, aditiva/idempotente, backfill desde `tasks.assigned_to`/`status`), fix del bug preexistente que descartaba todos los asignados salvo el primero al guardar, endpoint `PATCH /api/tasks/:id/assignees/me` (cada asignado marca su propio estado), `tasks.status` recalculado como agregado (completed solo si todos completaron), barra de progreso "X/Y completaron" en `TaskCard`/`TaskDetailModal` (mismo patrón visual que la barra de subtareas). Verificado end-to-end contra la API real de `taskflow_backend_dev` con usuarios temporales (creados y borrados en la BD para la prueba) | ✅ Implementado 2026-07-12 |
| 52 | Quién completó cada subtarea: migración 020 (`task_subtasks.completed_by`/`completed_at`, aditiva), `updateSubtask` setea `completed_by` desde el usuario autenticado al marcar/desmarcar, texto "Completado por X" bajo cada subtarea tildada en `SubtaskList`. Alcance acotado a propósito (elegido por el usuario entre dos opciones): sin asignación previa de subtareas a personas específicas, cualquier responsable de la tarea puede tildar cualquier subtarea, solo se traza quién lo hizo. Verificado en la UI real (Playwright + usuario temporal) contra `taskflow_backend_dev`/`taskflow_frontend_dev` | ✅ Implementado 2026-07-13 |
| 53 | Fix `TeamManager.jsx` (página `/team` "Equipo"): los botones "Editar" y "Remover del equipo" ahora solo se muestran si `isAdmin()` — antes se mostraban a cualquier rol autenticado (leader/member/viewer), aunque el backend (`PUT`/`DELETE /api/employees/:id`) ya exigía admin. "Agregar Miembro" queda fuera de este cambio (no se pidió). Verificado en la UI con dos usuarios temporales (admin ve 17/17 botones, member ve 0) | ✅ Implementado 2026-07-13 |
| 54 | Filtro "Creadas por mí" en Mis Tareas (`TaskFilters.jsx`/`TaskList.jsx`): nuevo campo `createdBy` (= `tasks.user_id`) expuesto por `normalizeTask` (antes solo se exponía `createdByName`, sin el id, insuficiente para filtrar). Checkbox visible solo para admin/leader (mismo gate que el resto de `TaskFilters`, `canSeeAll`), ya que member/viewer no pueden crear tareas y de por sí solo ven las suyas asignadas. Sin migración (el dato ya existía en `tasks.user_id`). Verificado en la UI real: con el filtro activo pasó de 9 a 1 tarea (la creada por el usuario de prueba) | ✅ Implementado 2026-07-13 |
| 55 | Botón "Nueva Tarea" siempre accesible desde `Header.jsx` (icono "+" azul, con label en `sm:` y superior), independiente de la barra lateral y disponible en cualquier página, no solo en `/tasks`. Antes la única forma de crear una tarea fuera de `/tasks` era el botón dentro de `Sidebar.jsx`, que en mobile exige primero abrir el drawer (hamburguesa) — ahora no hace falta. De paso se corrigió un overflow horizontal real en el header a 375px/360px (el avatar del usuario quedaba fuera de la pantalla, invisible/no clickeable): al formulario de búsqueda le faltaba `min-w-0`, por lo que no podía encoger más allá de su ancho mínimo de contenido y empujaba al resto de los íconos fuera del viewport (no se detectaba por `scrollWidth` porque es un elemento `fixed`, solo visible comparando screenshots). Verificado con Playwright en 4 anchos (360/375/768/1440px, sin overflow) y flujo completo de creación de tarea desde el Dashboard sin tocar el sidebar | ✅ Implementado 2026-07-13 |
| 56 | Solicitud de eliminación de tareas: migración 021 (`task_delete_requests`, aditiva, índice único parcial evita solicitudes duplicadas pendientes), `POST /api/tasks/:id/delete-request` (motivo obligatorio, cualquiera que no sea viewer) y `PATCH /api/tasks/:id/delete-request/:requestId` (aprobar/rechazar — admin o líder del grupo de la tarea, mismo criterio que `DELETE /api/tasks/:id`). Notifica a todos los admins + líder(es) del grupo de la tarea (o solo admins si no tiene grupo); botones "Aprobar"/"Rechazar" inline en la notificación (`NotificationBell`/`NotificationsPage`) y banner con motivo + acciones en `TaskDetailModal` cuando hay una solicitud pendiente. Alcance elegido explícitamente por el usuario entre opciones: cualquiera con acceso a la tarea puede solicitar (no solo el asignado), notifica admin + líder del grupo (no solo admin), rechazo sin motivo adicional. 13 tests unitarios nuevos (`createDeleteRequest`/`respondDeleteRequest`), cobertura subió a 82%/75%. Bug encontrado y corregido durante la verificación: `resolveDeleteRequest` en `TaskContext.jsx` devolvía éxito falso si la tarea ya no estaba en el estado local (notificación vieja tras resolver dos veces) — la rama de backend real ahora llama a la API primero, sin depender del estado local; y como `notifications.task_id` queda `NULL` cuando se borra la tarea referenciada (`ON DELETE SET NULL`), se agregó un guard en el frontend para notificaciones con `taskId` nulo. Verificado end-to-end con Playwright (2 usuarios temporales, aprobación + rechazo + ambos casos de solicitud ya resuelta) | ✅ Implementado 2026-07-13 |
