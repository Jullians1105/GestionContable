# Gestcon (GestionTareasOficina) — Arquitectura

**Versión:** 3.0.0
**Última actualización de este documento:** 2026-07-16
**Rama al momento de escribir:** `main`

> **Nota de nombres:** el proyecto nació como "TaskFlow Pro" (queda en `backend/package.json` → `taskflow-backend`, contenedores Docker `taskflow_*`, `<title>` de `index.html` = "Gestor de Tareas - Empresarial") y hoy se identifica como **Gestcon** (`public/manifest.json`: `name: "Gestión Contable"`, `short_name: "Gestcon"`; dominio de producción `https://gestcon.work`). Es una app de gestión interna (tareas + módulo contable "Fondo Emprender") para una firma contable colombiana, no un SaaS multi-tenant.

---

## Visión general

Dos superficies principales sobre la misma base de datos y el mismo backend:

1. **Gestor de Tareas** — tareas, subtareas, comentarios, kanban, calendario, tareas recurrentes, tablero de carga de trabajo, grupos con liderazgo por grupo.
2. **Fondo Emprender** — módulo de seguimiento de un programa de acompañamiento contable a ~30 empresas: checklist mensual de 23 procesos, ficha por empresa con 6 macroprocesos activos, checklist de impuestos, y pagos mensuales a la fiduciaria con flujo de autorización.

Todo corre en un monorepo con tres piezas ejecutables independientes: `src/` (frontend Vite), `backend/` (API Express), `mcpServer/` (servidor MCP, **legacy**, no forma parte del flujo de producción).

---

## Stack tecnológico

| Capa | Tecnología |
|---|---|
| Frontend | React 18 + Vite 5 + React Router v6 |
| Estilos | Tailwind CSS 3 (`darkMode: 'class'`), Material Symbols (Google) — NO Tabler Icons, NO Framer Motion |
| Estado | Context API (sin Redux/Zustand) + localStorage como fallback si no hay backend |
| Tiempo real | Socket.io-client ^4.8.3 |
| UI extras | @dnd-kit (Kanban drag-and-drop), Recharts 2, date-fns 3, jsPDF, xlsx, react-countup |
| Backend | Node.js + Express 4 (CommonJS) |
| Base de datos | PostgreSQL 16 (`pg` + connection pooling) |
| Auth | JWT (`jsonwebtoken`) access (1h) + refresh (7d) + bcrypt + blacklist de tokens en BD |
| WebSockets | Socket.io ^4.7.5, autenticado con JWT en el handshake |
| Cron | `node-cron` (tareas recurrentes, recordatorios de vencimiento) |
| Push | `web-push` (VAPID) — soporta PWA en iPhone |
| Seguridad | helmet, cors, express-rate-limit, express-validator |
| Logging | pino + pino-pretty |
| Docs API | swagger-jsdoc + swagger-ui-express (solo en `NODE_ENV !== 'production'`) |
| Contenedores | Docker + Docker Compose |
| Tests | Jest 29 + supertest (backend), Cypress 13 (E2E) |
| Automatización externa | n8n (workflows, ej. `fondo-pagos-alerta-mora` vía Gmail SMTP) |

---

## Estructura del repositorio

```
GestionTareasOficina/
├── src/                         # Frontend React (raíz del repo, no /frontend)
│   ├── App.jsx                  # Jerarquía de providers + rutas (ver abajo)
│   ├── main.jsx                 # Entry point, registra el Service Worker
│   ├── context/                 # 9 contextos (ver "Estado global")
│   ├── components/              # Componentes reutilizables (15 archivos)
│   ├── pages/                   # 21 páginas (ver "Rutas")
│   ├── hooks/                   # usePullToRefresh, useLocalStorage, useTasks, useTeam
│   ├── services/api.js          # Cliente HTTP único: JWT, auto-refresh, todos los endpoints
│   └── utils/                   # helpers, permissions, validators, storage, sampleData
├── backend/
│   ├── src/
│   │   ├── index.js             # Entry point: Express + Socket.io + Swagger + crons
│   │   ├── config/               # env.js, database.js (pg-pool)
│   │   ├── controllers/          # 13 controladores (ver tabla de endpoints)
│   │   ├── middleware/           # auth.js, roles vía controllers, fondoAccess.js,
│   │   │                        # groupAccess.js, errorHandler.js, validation.js, security.js
│   │   ├── routes/               # 1 router por recurso, documentado con swagger-jsdoc inline
│   │   ├── socket/events.js      # setupSocket — JWT en handshake, rooms, online/offline
│   │   ├── services/              # emailService, pushService, recurringTaskService, reminderService
│   │   └── utils/                 # jwt.js, logger.js, auditLog.js, email.js
│   ├── migrations/                # SQL numerado + run.js (ver "Base de datos")
│   ├── tests/                     # unit/, integration/, e2e/ (vacío)
│   ├── Dockerfile                 # multi-stage, usuario no-root, HEALTHCHECK
│   └── jest.config.js             # coverageThreshold 70% lines/functions
├── mcpServer/                    # Servidor MCP standalone — LEGACY, SQLite propia, no se usa en prod
│   └── src/{index,database,schemas,tools}.ts
├── cypress/                      # E2E: 3 suites (login, tasks, permissions)
├── docs/                          # Ver "Documentación relacionada" al final
├── scripts/                       # backup.sh, restore.sh, setup-cron.sh, start/stop-dev.sh, reset-db.sh
├── docker-compose.yml             # 5 servicios: postgres, mailhog, backend, frontend, migrate
├── Dockerfile                     # Frontend: build Vite → nginx (multi-stage)
├── nginx.conf                     # Proxy /api/ y /socket.io/ al backend + try_files SPA
└── package.json                   # Scripts raíz: dev, build, start (concurrently front+back)
```

---

## Frontend

### Jerarquía de providers (`src/App.jsx`)

```
BrowserRouter
└─ ThemeProvider
   └─ ToastProvider
      └─ AuthProvider
         └─ SocketProvider
            └─ TeamProvider
               └─ TaskProvider
                  └─ GroupProvider
                     └─ NotificationProvider
                        └─ TagProvider
                           └─ Routes (públicas: /login, /register, /forgot-password,
                                              /reset-password)
                              └─ Layout (todo lo demás, requiere isAuthenticated)
```

`Layout` monta `Sidebar` + `Header` + un indicador de *pull-to-refresh* (móvil) y renderiza las rutas protegidas dentro de `<main>`.

### Rutas (`Layout`, todas protegidas)

| Ruta | Página | Notas |
|---|---|---|
| `/` | `DashboardPage` | Estadísticas + tareas recientes |
| `/tasks` | `TasksPage` | Lista con filtros |
| `/tasks/recurrentes` | `RecurringTasksPage` | Solo admin/leader — templates recurrentes |
| `/team` | `TeamPage` | Gestión de equipo |
| `/groups` | `GroupsPage` | Gestión de grupos + liderazgo |
| `/kanban` | `KanbanPage` | Drag-and-drop con @dnd-kit |
| `/calendar` | `CalendarPage` | Templates proyectados + barras de rango |
| `/reports` | `ReportsPage` | Export PDF (jsPDF) / Excel (xlsx) |
| `/workload` | `WorkloadPage` | Solo admin/leader — carga por persona/grupo |
| `/notifications` | `NotificationsPage` | |
| `/settings`, `/profile` | `SettingsPage`, `ProfilePage` | |
| `/usuarios` | `UsersPage` | Solo admin — CRUD usuarios + permisos granulares |
| `/fondo-emprender` | `FondoEmprenderPage` | Seguimiento mensual: checklist 23 procesos × ~30 empresas |
| `/fondo-emprender/empresas` | `FondoEmprenderEmpresasPage` | CRUD empresas con semáforo |
| `/fondo-emprender/empresas/:empresaId` | `FondoEmprenderEmpresaDetallePage` | Ficha con 6 macroprocesos |
| `/fondo-emprender/pagos` | `FondoEmprenderPagosPage` | Tabla de pagos a la fiduciaria |

### Estado global (Context API)

| Contexto | Responsabilidad |
|---|---|
| `AuthContext` | Login/logout, detecta si hay backend real disponible (fallback a localStorage), `hasPermission()`, `isAdmin()`, `isLeader()` |
| `SocketContext` | Conexión Socket.io con JWT en handshake, reconexión automática (5 intentos), escucha `users:online:list` |
| `TaskContext` | CRUD de tareas + listeners `task:created/updated/deleted`; elimina polling cuando el socket está conectado |
| `TeamContext` | CRUD de empleados |
| `GroupContext` | CRUD de grupos, incluye asignación/retiro de líder |
| `NotificationContext` | Notificaciones en tiempo real vía socket; polling cada 3s solo si el socket está offline |
| `TagContext` | CRUD de etiquetas |
| `ThemeContext` | Dark/light mode (`darkMode: 'class'` de Tailwind) |
| `ToastContext` | Notificaciones UI efímeras |

**Patrón de doble modo:** cuando el backend responde, los contextos llaman a `services/api.js` y sincronizan el estado local con la respuesta. Si el backend no está disponible, operan íntegramente sobre `localStorage` (claves: `tasks`, `team_members`, etc.) usando `utils/storage.js` y `utils/sampleData.js` como fallback.

### `src/services/api.js`

Cliente HTTP único. Maneja JWT en memoria + refresh automático en 401, y expone una función por endpoint (incluye todo el namespace `fondo*`: `getFondoEmpresas`, `getFondoDetalle`, `getFondoImpuestos`, `getFondoPagos`, `getFondoPagosTodasEmpresas`, `getFondoPagosMesActual`, etc.).

### Patrones UI establecidos (ver también `docs/` si existiera guía de estilo)

- **StatsCard**: `<StatsCard title value icon borderColor iconColor sub subColor />`, siempre 4 tarjetas en `grid-cols-1 sm:grid-cols-2 xl:grid-cols-4`, iconos Material Symbols como string (ej. `"corporate_fare"`).
- **Filtros segmentados (tabs) + buscador**: contenedor `bg-[#f0f2f8] dark:bg-[#252840] rounded-xl p-1`; tab activo `bg-white dark:bg-[#1e2030] text-[#004ac6] shadow-sm`; buscador con icono `search` absolute.
- **Tablas con scroll horizontal**: wrapper `overflow-x:auto`, primera columna `position:sticky; left:0; zIndex:2`, header `zIndex:3`. No mezclar `style={{background:...}}` inline con clases `dark:bg-*` — el inline gana siempre.
- **Animaciones**: solo `opacity`, `transform`, `background-color`, `color`, transición ~200ms. Nunca `width/height/max-height` (causa reflow). No se usa Framer Motion.
- **Orden de filas**: nunca reordenar dinámicamente por mora/estado — el orden es el que devuelve el servidor (decisión de UX explícita, aplica sobre todo a `FondoEmprenderPagosPage`).
- **Texto UI en Pagos**: el estado en BD es `'aprobado'` pero la UI siempre muestra **"Pagado"**.
- **Colores del sistema**: azul `#004ac6` / dark `#7ba8f0`; verde `#16a34a`; rojo `#ef4444`; ámbar `#d97706`; fondo oscuro card `#1e2030`; fondo oscuro hover `#252840`; borde `#e2e4ef` / dark `#2e3148`.

---

## Backend

### Entry point (`backend/src/index.js`)

- Express + `http.createServer` compartido con Socket.io.
- `app.set('trust proxy', 1)` — necesario para que `express-rate-limit` lea `X-Forwarded-For` detrás de nginx.
- CORS: en desarrollo acepta cualquier `localhost:*`; en producción, lista de orígenes en `CLIENT_URL` separada por comas (soporta `gestcon.work` + IP local simultáneamente).
- **Rate limiting por usuario, no por IP**: extrae `userId` del JWT en el header `Authorization` y limita por `user:{id}`; cae a IP si no hay token válido. Evita que toda la oficina (misma IP pública) comparta un solo cupo. General: 2000 req/15min. Auth (`/login`, `/register`): 50 req/15min.
- Helmet con CSP activo solo en producción.
- Swagger UI en `/api/docs` — deshabilitado en producción (A05 OWASP: no exponer docs).
- Arranca dos crons al iniciar: `initRecurringCron(io)` y `initReminderCron(io)`.
- En desarrollo sirve `dist/` como estático si existe (fallback SPA); en producción esto lo hace nginx.

### Controladores y rutas

| Prefijo | Controlador | Alcance |
|---|---|---|
| `/api/auth` | `authController` | register, login, refresh, logout, me, forgot/reset-password |
| `/api/tasks` | `taskController` | CRUD tareas, subtareas, comentarios, historial, búsqueda, templates recurrentes |
| `/api/tasks/:id/fondo-link` | `fondoLinksController` (montado sobre `/api/tasks`) | vincula una tarea a un macroproceso o checklist de Fondo Emprender |
| `/api/employees` | (empleados, sin controlador propio listado aquí) | CRUD empleados |
| `/api/groups` | `groupController` | CRUD grupos, miembros, liderazgo (`is_leader`) |
| `/api/tags` | (tags) | CRUD etiquetas, crear sin restricción de rol |
| `/api/stats` | `statsController` | estadísticas generales, `/audit`, `/workload` |
| `/api/notifications` | (notificaciones) | listar, marcar leídas, VAPID pública, push-subscribe |
| `/api/fondo/empresas` | `fondoEmpresasController` | CRUD empresas del programa |
| `/api/fondo/procesos` | `fondoProcesosController` | catálogo de 23 procesos del checklist mensual |
| `/api/fondo/checklist` | `fondoChecklistController` | checklist mensual por empresa (alimenta mp5) |
| `/api/fondo/detalle` | `fondoDetalleController` | 6 macroprocesos por empresa/mes (mp1-mp7, ver detalle abajo) |
| `/api/fondo/impuestos` | `fondoImpuestosController` | checklist de 4 impuestos por empresa/mes (alimenta mp6) |
| `/api/fondo/pagos` | `fondoPagosController` | pagos mensuales a la fiduciaria + autorización + mes habilitado |

### Middleware de seguridad y permisos

- `middleware/auth.js` — `authMiddleware`: valida JWT + blacklist en cada request.
- Roles de tareas/grupos: `admin` y `leader` global tienen acceso amplio; a partir de la migración 018, **liderazgo por grupo** (`group_members.is_leader`) permite a un líder de un grupo específico editar/eliminar ese grupo, gestionar sus miembros y borrar tareas del grupo — sin cruzar a otros grupos. Tareas sin grupo solo las borra `admin`.
- `middleware/fondoAccess.js` — dos guards independientes, ambos leen `users.permissions` (JSONB):
  - `requireFondoAccess`: exige `permissions.modulos.fondoEmprender.canEditar === true` (o rol admin). Bloquea `viewer` sin consultar BD.
  - `requireFondoAutorizarPagos`: exige `permissions.modulos.fondoEmprender.canAutorizarPagos === true` (o rol admin). Permiso separado de `canEditar` — quien registra pagos no necesariamente puede autorizar su envío a la fiduciaria.
- `middleware/groupAccess.js`, `validation.js`, `security.js` (incluye `validateUUIDParam`, `validateProductionEnv`), `errorHandler.js` (`notFound` + handler global).

### Control de acceso por rol (Gestor de Tareas)

| Rol | Crear tarea | Editar/Eliminar | Comentar | Ver grupos/reportes |
|---|---|---|---|---|
| admin | ✅ | ✅ | ✅ | ✅ |
| leader | ✅ | ✅ (propio grupo o global) | ✅ | ✅ |
| member | ❌ | ❌ | ✅ | ❌ |
| viewer | ❌ | ❌ | ❌ | ❌ |

Los permisos de Fondo Emprender son independientes de este rol base — se otorgan por usuario vía `permissions.modulos.fondoEmprender.{canEditar,canAutorizarPagos}` en `/usuarios`.

### WebSockets (`backend/src/socket/events.js`)

- Autenticación JWT obligatoria en el handshake (sin token válido no conecta).
- Rooms: `user:{userId}`, `group:{groupId}`, `task:{taskId}`.
- Eventos emitidos por el servidor: `task:created`, `task:updated`, `task:deleted`, `user:online`, `user:offline`, `notification:received`, `empresa:updated` (Fondo Emprender).
- `users:online:list` se emite al socket recién conectado con el array de IDs ya online — fix específico para que la PWA de iPhone muestre el estado online correcto al reabrir.
- Evento `mark:read` desde el cliente para marcar notificaciones sin round-trip HTTP.

### Crons (`backend/src/services/`)

| Servicio | Horario | Qué hace |
|---|---|---|
| `recurringTaskService.js` | `0 7 1-3 * *` (días 1-3 del mes, 7 AM — redundancia por si el servidor está caído el día 1) | Genera instancias de tareas a partir de templates recurrentes, respetando el rango de vigencia (`recurrence.start_date`→`end_date`); notifica a líderes del grupo |
| `reminderService.js` | `*/30 * * * *` (cada 30 min) | Recordatorios de vencimiento: sin `due_time` → vence hoy/mañana; con `due_time` → vence en las próximas 2h. Marca `reminder_sent_at` para no repetir. Envía notificación in-app + Web Push |
| `pushService.js` | — | Helper de envío Web Push (VAPID), usado por los dos crons anteriores y por eventos puntuales |

---

## Módulo Fondo Emprender — detalle

Programa de acompañamiento contable a ~30 empresas, con tres vistas relacionadas pero con tablas independientes:

### 1. Seguimiento Mensual (`/fondo-emprender`)

Checklist de 23 procesos (`fondo_procesos`) × cada empresa, agrupado por mes (`fondo_checklist_meses` + `fondo_checklist_items`). El campo `fondo_checklist_meses.confirmed` de este módulo es la fuente de verdad que alimenta **mp5/Contabilidad** en la ficha de empresa (macroproceso derivado, no editable ahí).

### 2. Ficha de empresa (`/fondo-emprender/empresas/:empresaId`)

7 macroprocesos por empresa/mes (`mp1`-`mp7`, sin `mp5` propio en la tabla — es derivado):

| ID | Nombre | Fuente del estado |
|---|---|---|
| mp1 | Facturación | `fondo_detalle_macroprocesos` — editable directo |
| mp2 | Nómina | `fondo_detalle_macroprocesos` — editable directo |
| mp3 | Nómina electrónica | `fondo_detalle_macroprocesos` — editable directo |
| mp4 | Documentos contador - Pagos | **Derivado en lectura** de `fondo_pagos` del mismo mes (módulo de Pagos). `readonly: true`. `enviado`/`aprobado` → `done`; `rechazado` → `in_progress`; sin registro → `pending`. Responsable/nota siguen editables. |
| mp5 | Contabilidad | **Derivado** de `fondo_checklist_meses.confirmed` (Seguimiento Mensual). `readonly: true`, sin responsable/nota. |
| mp6 | Información tributaria | **Derivado** de `fondo_impuestos_items` (los 4 impuestos). `readonly: true`. Los 4 en `'na'` cuentan como `done` ("Sin impuestos aplicables"). Responsable/nota editables. |
| mp7 | Producción y ventas | `fondo_detalle_macroprocesos` — editable directo |

Cada macroproceso puede tener **tareas vinculadas** del Gestor de Tareas vía `task_fondo_links` (tabla puente, `link_type: 'macroproceso' | 'checklist'`), visibles en la ficha y con badge en `TaskCard`/`TaskForm` del lado de Tareas (`FondoLinkSelector.jsx`).

**Por qué derivación en lectura y no un trigger al confirmar:** se decidió así para mp4 (jul-2026) porque garantiza que el estado nunca quede desincronizado sin importar cómo cambie `fondo_pagos` (aprobar, rechazar, o revertir un "Pagado") — no hay lógica de sync adicional que mantener. Mismo patrón ya usado para mp5 y mp6.

### 3. Pagos a la fiduciaria (`/fondo-emprender/pagos`)

Tabla tipo spreadsheet, una fila por empresa, columnas por mes. Evolucionó bastante desde su reescritura de jun-2026 (ver `docs/CAMBIOS_*` para el detalle histórico); estado actual:

- **`fondo_pagos`**: una fila por empresa × mes con `estado` (`pendiente|enviado|aprobado|rechazado`), `autorizado` (bool, independiente de `estado`), `monto` (snapshot de `fondo_empresas.monthly_fee` al crear), `nota`, `fecha_envio`, `fecha_resolucion`.
- **Autorización interna** (`autorizado`, migración 018): separa "en qué va con la fiduciaria" (`estado`) de "¿el equipo contable tiene luz verde interna para tramitarlo?" (`autorizado`). Guardián propio: `requireFondoAutorizarPagos` — permiso distinto de `canEditar`. Default `false`: todo pago nace bloqueado hasta que una jefa autoriza explícitamente.
- **Mes habilitado** (`fondo_pagos_mes_actual`, migración 019): tabla singleton (`id=1`) que define el límite superior de la grilla — los pagos son sobre **mes vencido** (en julio solo se tramita hasta junio), y ese límite ya no se deriva de la fecha del sistema sino que lo avanza/retrocede una jefa manualmente (`POST /mes-actual/avanzar`, `POST /mes-actual/retroceder`, ambos tras `requireFondoAutorizarPagos`). Piso de retroceso: febrero 2026 (inicio del programa).
- **Mora**: calculada on-the-fly (`calcularMora`) como la cantidad de registros posteriores al último `'aprobado'` con `estado != 'aprobado'` — si nunca hubo un aprobado, cuenta todos los registros.
- Endpoint batch `GET /api/fondo/pagos/todas` trae el historial de **todas** las empresas en una sola llamada (evita N+1 — antes la página hacía una request por empresa en cada carga).
- Frontend: actualizaciones optimistas sobre `rows` local, con `refreshEmpresa(id)` como rollback puntual si falla la API (nunca se refresca todo el listado).

### Checklist de impuestos (mp6, `fondo_impuestos` / `fondo_impuestos_items`)

Catálogo fijo de 4 obligaciones (`autorretencion`, `retencion`, `iva`, `consumo`), sin FK ni JOIN con el checklist mensual — completamente independiente. Estado por ítem: `pending|presented|na`. Estado agregado de mp6 (`deriveImpuestosEstado`): todos en `na` o todos `presented` → `done`; alguno `presented` → `in_progress`; si no, `pending`.

---

## Base de datos (PostgreSQL)

### Sistema de migraciones

`backend/migrations/run.js` mantiene una tabla `schema_migrations` (PK `filename`) para saltar migraciones ya aplicadas — es idempotente. Todos los `CREATE INDEX`/`ALTER TABLE ADD COLUMN` nuevos deben usar `IF NOT EXISTS`. Comandos: `--seed` (schema + datos de prueba), `--reset` (limpia y reaplica todo).

### Migraciones (orden cronológico real, incluye numeración con colisiones históricas)

| Archivo | Contenido |
|---|---|
| 001 | Schema inicial: users, tasks, subtasks, task_comments, task_history, groups, group_members, tags, task_tags, notifications, token_blacklist, refresh_tokens |
| 002 | Seed data (usuarios + tareas de prueba) |
| 003 | Columnas extra en notifications |
| 004 | Tabla `user_permissions` |
| 005 | Tabla `password_reset_tokens` |
| 006 | OWASP hardening: `users.is_active`, tabla `login_attempts` |
| 007_due_time | Columna `due_time TIME` en tasks |
| 007_fondo_empresas | Tabla `fondo_empresas` |
| 008_fondo_checklist | `fondo_procesos`, `fondo_checklist_meses`, `fondo_checklist_items` |
| 009_fondo_detalle | `fondo_detalle_macroprocesos` |
| 010_fondo_pagos | Tabla `fondo_pagos` |
| 011 | `task_fondo_links` (puente tareas ↔ Fondo Emprender) |
| 012 | `fondo_detalle_macroprocesos`: columnas `anio`/`mes` |
| 013_recurring_tasks | `tasks.is_recurring`, `tasks.recurrence JSONB`, `tasks.template_id` |
| 014 | `tasks.start_time` (existe en BD, revertida del código — no usada) |
| 015 | Tabla `push_subscriptions` (Web Push / PWA) |
| 016 | `tasks.reminder_sent_at TIMESTAMPTZ` |
| 017 | Elimina etiquetas de muestra del seed |
| 018_fondo_pagos_autorizado | `fondo_pagos.autorizado BOOLEAN DEFAULT false` |
| 018_group_leaders | `group_members.is_leader BOOLEAN` + índice parcial `WHERE is_leader = true` (colisión de número con la anterior — ambas archivos distintos, mismo prefijo) |
| 019_fondo_pagos_mes_actual | Tabla singleton `fondo_pagos_mes_actual` (mes habilitado, ver arriba) |
| 023_fondo_impuestos | `fondo_impuestos` (catálogo) + `fondo_impuestos_items` (registro por empresa/impuesto/mes) — **nótese el salto 019→023**, no hay 020-022 en el repo actual |

### Tablas principales (fuera de las evidentes por nombre)

```
users                     → bcrypt, role, permissions JSONB (incluye modulos.fondoEmprender.*)
tasks                     → is_recurring, recurrence JSONB, template_id, due_time, reminder_sent_at
group_members             → is_leader (liderazgo por grupo, no solo global)
task_fondo_links          → empresa_id, macro_id ('mp1'..'mp7'), link_type, proceso_id, anio, mes
fondo_detalle_macroprocesos → empresa_id, macroproceso_id, anio, mes, estado, responsable_id, nota
fondo_pagos               → empresa_id, anio, mes, estado, autorizado, monto, nota, fechas
fondo_pagos_mes_actual    → singleton (id=1), mes habilitado global
fondo_impuestos_items     → empresa_id, impuesto_id, anio, mes, estado, nota
push_subscriptions        → suscripciones Web Push por usuario/dispositivo
login_attempts            → detección de fuerza bruta (OWASP hardening)
```

---

## Deployment

### Docker Compose (`docker-compose.yml`) — 5 servicios

```
postgres  → postgres:16-alpine, healthcheck pg_isready, volumen postgres_data
mailhog   → SMTP de pruebas (1025 SMTP, 8025 UI) — dev/staging únicamente
backend   → build multi-stage, depende de postgres (healthy) + migrate (completado)
frontend  → build multi-stage (Vite → nginx), depende de backend, expone 80/443
migrate   → corre `node migrations/run.js --seed` y termina (restart: "no")
```

El orden migrar → arrancar backend está garantizado por `depends_on: migrate: condition: service_completed_successfully` — `docker compose up -d` es seguro sin pasos manuales adicionales.

### Producción actual

- Servidor: `192.168.1.12` (Ubuntu Server, acceso local directo con cert autofirmado en nginx, puertos 80→443).
- **Cloudflare Tunnel** en `https://gestcon.work` — HTTPS real sin warning, usado por 3 líderes remotos además de los ~14 usuarios en oficina.
- CORS acepta ambos orígenes vía `CLIENT_URL` separado por coma.
- Build del frontend a veces se hace localmente con `--platform linux/amd64` cuando el servidor no tiene RAM suficiente para esbuild (SIGSEGV documentado).
- Backup automático: `scripts/backup.sh` (BD + `.env` + certs, comprimido, rotación 7 días) vía cron diario a las 6 PM (`scripts/setup-cron.sh`).

### Variables de entorno

Root `.env` (para `docker-compose.yml`): `PORT`, `CLIENT_URL`, `DB_PORT/NAME/USER/PASSWORD`, `DB_TEST_NAME`, `JWT_SECRET`, `JWT_EXPIRES_IN`, `JWT_REFRESH_SECRET`, `JWT_REFRESH_EXPIRES_IN`, `N8N_ENCRYPTION_KEY`.

`backend/.env` (modo Node local): además de lo anterior, `NODE_ENV`, `DB_HOST`, `DATABASE_URL` (opcional, tiene prioridad), `SMTP_*`, `SHOW_RESET_TOKEN` (**nunca `true` en producción**), `SENDGRID_API_KEY`/`FROM_EMAIL` (opcional), VAPID keys para Web Push, `LOG_LEVEL`.

---

## Tests

```
backend/tests/
├── unit/         → 8 archivos: authController, taskController, groupController,
│                   statsController, middleware, routes, helpers, validators
├── integration/  → auth.test.js, tasks.test.js (se saltan si no hay BD disponible)
└── e2e/          → vacío (el E2E real vive en /cypress, no aquí)

cypress/e2e/
├── 01-login.cy.js        → 6 tests
├── 02-tasks.cy.js        → 5 tests
└── 03-permissions.cy.js  → 8 tests (viewer/member/admin)
```

Cobertura backend: ~79% statements / ~71% functions (umbral configurado: 70%). Servicios de infraestructura (`pushService`, `recurringTaskService`, `reminderService`) están excluidos de cobertura y mockeados en los tests que los tocan indirectamente.

```bash
npm run start                              # frontend (Vite) + backend (nodemon) en paralelo
npm run backend:migrate:seed               # schema + datos de prueba
npm --prefix backend run test:coverage
npm run e2e                                # Cypress interactivo
npm run e2e:run                            # Cypress headless
docker compose up -d
```

---

## `mcpServer/` — nota importante

Servidor MCP standalone en TypeScript con su **propia base SQLite** (`better-sqlite3`), expone tools (`createTask`, `getTasks`, `getEmployees`, `getTaskStats`, etc.) sobre tablas `tareas`/`empleados` en español, independientes de las tablas Postgres del backend real (`tasks`/`users`). Se referencia solo desde `npm run start:legacy`. **No está conectado al backend/BD de producción** — antes de asumir que expone o modifica datos reales, confirmar con quien lo mantenga si sigue en uso o es candidato a eliminar.

---

## Documentación relacionada en `docs/`

- `PROYECTO.md` — descripción general original del proyecto.
- `ESTADO_PROYECTO.md` — bitácora de estado por sesión, con checklist histórico línea por línea de cada feature/fix (más granular que este documento; consultar para "¿cuándo y por qué se hizo X?").
- `DEPLOY.md` — guía de despliegue a `192.168.1.12`.
- `SETUP_MACOS.md` — setup de entorno de desarrollo.
- `CAMBIOS_FASE_3.md`, `CAMBIOS_SESION_*.md` — changelogs de sesiones específicas.
- `TAREAS_RECURRENTES.md`, `N8N_SETUP.md`, `WHATSAPP_BUSINESS_N8N.md`, `PROPUESTA_MODULO_CONTABILIDAD_DIAN.md` — specs de features puntuales.

Este documento (`ARQUITECTURA.md`) es el resumen de referencia rápida; para el detalle día a día de qué cambió y por qué, `ESTADO_PROYECTO.md` tiene más profundidad histórica.
