# TaskFlow Pro — Resumen de Arquitectura

**Versión actual:** 3.0.0  
**Estado:** Fase 3 implementada — pendiente PostgreSQL + Redis en infraestructura de producción

---

## Visión General

TaskFlow Pro es una aplicación web de gestión de tareas para equipos empresariales de hasta 25 personas. Comenzó como un MVP de frontend puro (Fase 1) y evolucionó hasta una arquitectura full-stack con backend real, base de datos relacional y comunicación en tiempo real (Fase 3).

---

## Stack Tecnológico

| Capa | Tecnología |
|---|---|
| **Frontend** | React 18 + Vite 5 |
| **Estilos** | Tailwind CSS 3 + Design System "Stitch" |
| **Routing** | React Router v6 |
| **Gráficos** | Recharts 2 |
| **Fechas** | date-fns 3 |
| **Estado global** | Context API (sin Redux/Zustand) |
| **Backend** | Node.js + Express (CommonJS, estructura modular) |
| **Base de datos** | PostgreSQL 16 con `pg-pool` (máx. 20 conexiones) |
| **Tiempo real** | Socket.io (server + client) |
| **Autenticación** | JWT (acceso 1h) + Refresh Tokens (7 días) + bcrypt |
| **Email** | Nodemailer (Mailhog en dev, proveedor real en producción) |
| **Contenedores** | Docker + docker-compose |
| **CI/CD** | GitHub Actions |
| **Proceso** | PM2 (producción) |
| **Proxy** | Nginx (producción) |

---

## Arquitectura Frontend

```
src/
├── components/          # UI reutilizable
│   ├── Dashboard.jsx    # Gráficos Recharts (pie + barras)
│   ├── Header.jsx       # Barra top: búsqueda global, notificaciones
│   ├── Sidebar.jsx      # Navegación lateral 250px fija
│   ├── TaskCard.jsx     # Tarjeta de tarea con guards de permisos
│   ├── TaskList.jsx     # Lista paginada + modal integrado
│   ├── TaskForm.jsx     # Crear/editar tarea
│   ├── TaskFilters.jsx  # Panel de filtros combinables
│   ├── TaskDetailModal.jsx  # Vista detalle: subtareas, comentarios
│   ├── TeamManager.jsx  # Grid de tarjetas de miembro
│   ├── UsersManager.jsx # CRUD admin + checklist de permisos granulares
│   ├── KanbanBoard.jsx  # Tablero drag-and-drop
│   └── ...
├── context/             # Estado global (Context API)
│   ├── AuthContext.jsx  # Sesión, JWT, hasPermission()
│   ├── TaskContext.jsx  # CRUD tareas + sincronización socket
│   ├── TeamContext.jsx  # CRUD miembros → llama al API
│   ├── NotificationContext.jsx  # Notificaciones en tiempo real
│   ├── SocketContext.jsx        # Conexión Socket.io con JWT
│   ├── GroupContext.jsx
│   └── TagContext.jsx
├── hooks/               # Consumidores de context
│   ├── useLocalStorage.js
│   ├── useTasks.js
│   └── useTeam.js
├── pages/               # Rutas
│   ├── DashboardPage.jsx    # /
│   ├── TasksPage.jsx        # /tasks
│   ├── TeamPage.jsx         # /team
│   ├── KanbanPage.jsx       # /kanban
│   ├── CalendarPage.jsx     # /calendar
│   ├── GroupsPage.jsx       # /groups
│   ├── ReportsPage.jsx      # /reports
│   ├── NotificationsPage.jsx # /notifications
│   ├── UsersPage.jsx        # /usuarios (solo admin)
│   ├── SettingsPage.jsx     # /settings
│   ├── LoginPage.jsx        # /login
│   ├── RegisterPage.jsx     # /register
│   ├── ForgotPasswordPage.jsx # /forgot-password
│   └── ResetPasswordPage.jsx  # /reset-password
├── services/
│   └── api.js           # Cliente HTTP: JWT, auto-refresh, manejo 401
└── utils/
    ├── helpers.js        # Constantes, formatDate, getInitials, labels
    ├── permissions.js    # Definición y defaults de permisos por rol
    ├── sampleData.js     # 5 miembros + 8 tareas de ejemplo (fallback)
    ├── storage.js        # Wrapper localStorage con fallback a sampleData
    └── validators.js     # validateTask(), validateMember()
```

### Patrón de estado

- **Context API** para estado global; `useMemo` para derivar estado filtrado (no `useEffect`).
- **Doble modo:** cuando el backend está disponible, los contextos llaman al API y actualizan el estado local con la respuesta. Sin backend, operan íntegramente sobre `localStorage`.
- **Socket.io** actualiza `TaskContext` y `NotificationContext` en tiempo real; elimina el polling cuando el socket está conectado.

---

## Arquitectura Backend

```
backend/src/
├── config/
│   └── env.js           # Variables de entorno centralizadas
├── controllers/
│   ├── authController.js    # register, login, me, refresh, logout,
│   │                        # forgotPassword, resetPassword
│   ├── taskController.js    # CRUD + emisión de eventos socket
│   ├── employeeController.js
│   ├── groupController.js
│   ├── notificationController.js
│   ├── statsController.js
│   └── auditController.js
├── middleware/
│   ├── auth.js          # Verificación JWT + blacklist
│   └── roles.js         # Guards por rol/permiso
├── routes/              # Express routers
│   ├── auth.js          # /api/auth/*
│   ├── tasks.js         # /api/tasks/*
│   ├── employees.js     # /api/employees/*
│   ├── groups.js        # /api/groups/*
│   ├── tags.js          # /api/tags/*
│   ├── notifications.js # /api/notifications/*
│   ├── stats.js         # /api/stats
│   └── audit.js         # /api/audit
├── socket/              # Lógica Socket.io
│   └── index.js         # Autenticación JWT en handshake, rooms
├── utils/
│   └── email.js         # sendPasswordResetEmail() vía nodemailer
└── index.js             # Entry point: Express + Socket.io + pg-pool
```

---

## Base de Datos (PostgreSQL)

### Esquema de tablas

```
users               → Cuentas de usuario (bcrypt, roles, permissions JSONB)
groups              → Grupos de trabajo
group_members       → Relación users ↔ groups
tasks               → Tareas (foreign keys a users/groups, índice GIN full-text)
task_subtasks       → Subtareas de una tarea
task_comments       → Comentarios por tarea
task_tags           → Definición de etiquetas
task_tag_assignment → Relación tasks ↔ tags
notifications       → Notificaciones por usuario (extra_data JSONB)
audit_log           → Historial de cambios
token_blacklist     → JWTs invalidados tras logout
refresh_tokens      → Gestión de sesiones activas
password_reset_tokens → Tokens SHA-256 para recuperación (expiran en 30 min)
```

### Características DB

- **Connection pooling** — `pg-pool` con máx. 20 conexiones.
- **Triggers** — `update_updated_at()` automático en cada UPDATE.
- **Full-text search** — `GIN(to_tsvector('spanish', title || ' ' || description))` en `tasks`.
- **Migraciones versionadas** — archivos `migrations/001_*.sql` … `005_*.sql`.

### Claves localStorage (fallback sin backend)

```
tasks              → array JSON de tareas
team_members       → array JSON de miembros
password_reset_tokens → tokens temporales de recuperación
```

---

## Modelos de Datos Principales

### Tarea (Task)
```js
{
  id: "task-{timestamp}-{random}",
  title: string,           // max 255 chars, requerido
  description: string,
  status: "pending" | "in_progress" | "completed",
  priority: "high" | "medium" | "low",
  assignedTo: string,      // id del usuario, requerido
  groupId: string,
  dueDate: "YYYY-MM-DD",
  tags: string[],
  subtasks: Subtask[],
  comments: Comment[],
  createdAt: string,       // ISO 8601
  updatedAt: string,
}
```

### Usuario (User)
```js
{
  id: "UUID",
  name: string,
  email: string,
  role: "admin" | "leader" | "member" | "viewer",
  permissions: {           // null = usar defaults del rol
    canCreateTask: bool,
    canEditTask: bool,
    canDeleteTask: bool,
    canComment: bool,
    canViewReports: bool,
    canManageGroups: bool,
  } | null,
  createdAt: string,
}
```

---

## Sistema de Permisos

Los permisos son granulares por usuario, almacenados como JSONB en la BD. Si `permissions = null`, se aplican los defaults del rol:

| Permiso | admin | leader | member | viewer |
|---|---|---|---|---|
| `canCreateTask` | ✅ | ✅ | ✅ | ❌ |
| `canEditTask` | ✅ | ✅ | ❌ | ❌ |
| `canDeleteTask` | ✅ | ✅ | ❌ | ❌ |
| `canComment` | ✅ | ✅ | ✅ | ❌ |
| `canViewReports` | ✅ | ✅ | ❌ | ❌ |
| `canManageGroups` | ✅ | ✅ | ❌ | ❌ |

Los permisos se verifican en frontend (`hasPermission()` en `AuthContext`) y en backend (middleware `roles.js`).

---

## Flujo de Autenticación

```
Login → POST /api/auth/login
  → bcrypt.compare(password, hash)
  → JWT firmado (1h) + refreshToken (7 días) guardado en BD
  → Cliente guarda accessToken en memoria y refreshToken en cookie/localStorage

Request autenticado → Authorization: Bearer <token>
  → Middleware verifica JWT + blacklist
  → Acceso concedido o 401

Token expirado → POST /api/auth/refresh
  → Valida refreshToken en BD
  → Devuelve nuevo accessToken (auto-refresh en api.js)

Logout → POST /api/auth/logout
  → Token añadido a token_blacklist en BD

Recuperación de contraseña:
  → POST /api/auth/forgot-password → token SHA-256, expira 30 min, email via Mailhog/SMTP
  → POST /api/auth/reset-password → valida hash, actualiza password, revoca refresh tokens
```

---

## Comunicación en Tiempo Real (Socket.io)

- **Autenticación:** JWT en el handshake del socket.
- **Rooms:** `user:{userId}`, `group:{groupId}`, `task:{taskId}`.
- **Eventos emitidos por el servidor:** `task:created`, `task:updated`, `task:deleted`, notificaciones.
- **Impacto en frontend:** `TaskContext` elimina polling cuando el socket está activo; `NotificationContext` recibe updates sin recargar.

---

## API REST — Endpoints Principales

| Método | Ruta | Descripción |
|---|---|---|
| POST | `/api/auth/register` | Registro (bcrypt 10 rounds) |
| POST | `/api/auth/login` | Login → JWT + refreshToken |
| POST | `/api/auth/refresh` | Renovar accessToken |
| POST | `/api/auth/logout` | Invalidar token |
| GET | `/api/auth/me` | Perfil del usuario autenticado |
| POST | `/api/auth/forgot-password` | Solicitar reset de contraseña |
| POST | `/api/auth/reset-password` | Confirmar reset con token |
| GET | `/api/tasks` | Listar con filtros y paginación |
| GET | `/api/tasks/search?q=` | Búsqueda full-text PostgreSQL |
| GET | `/api/tasks/:id` | Tarea con subtareas, comentarios y tags |
| POST | `/api/tasks` | Crear tarea |
| PUT | `/api/tasks/:id` | Actualizar tarea |
| DELETE | `/api/tasks/:id` | Eliminar tarea |
| GET | `/api/stats` | Estadísticas generales |
| GET | `/api/audit` | Audit log (solo admin/leader) |
| GET | `/api/docs` | Swagger UI |

---

## Seguridad

- **Helmet.js** — headers HTTP de seguridad.
- **Rate limiting** — 200 req/15 min general; 20 req/15 min para `/api/auth/*`.
- **CORS** — restringido a `CLIENT_URL`.
- **bcrypt** — passwords con 10 rounds.
- **JWT blacklist** — tokens invalidados persistidos en BD.
- **SQL parametrizado** — 100% con `$1, $2, ...` (sin interpolación de strings).
- **express-validator** — validación y sanitización de todos los inputs.
- **Roles + permisos granulares** — doble verificación frontend/backend.

---

## Deployment

### Desarrollo local con Docker

```bash
docker compose up -d          # Levanta postgres, backend, frontend, mailhog
# Mailhog UI en http://localhost:8025
```

### Producción sin Docker (recomendado para empresa)

Requisitos: Node.js v20+ y PostgreSQL 16.

```bash
npm run backend:install       # Instalar dependencias del backend
npm run backend:migrate:seed  # Crear tablas y datos de prueba
npm start                     # Backend :3000 + Frontend :5173
```

Con PM2 + Nginx para producción estable:

```bash
cd backend && pm2 start src/index.js --name taskflow
pm2 save && pm2 startup
```

### Variables de entorno requeridas (`backend/.env`)

```
PORT, NODE_ENV, CLIENT_URL
DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD
JWT_SECRET, JWT_EXPIRES_IN, JWT_REFRESH_SECRET, JWT_REFRESH_EXPIRES_IN
SMTP_HOST, SMTP_PORT                    # Mailhog en dev
SHOW_RESET_TOKEN=true                   # Solo en dev
SENDGRID_API_KEY, FROM_EMAIL            # Opcionales, producción
```

---

## Tests

```
tests/
├── unit/
│   ├── validators.test.js   # JWT, validación email/contraseña, normalización (22/22)
│   └── helpers.test.js      # formatDate, isDueDateOverdue, getInitials, roles
└── integration/
    ├── auth.test.js         # Registro, login, me, refresh, logout (requiere BD)
    └── tasks.test.js        # CRUD completo de tareas (requiere BD)
```

Los tests de integración se saltan automáticamente si la BD no está disponible.

```bash
npm --prefix backend test                  # Todos los tests
npm --prefix backend run test:coverage     # Con reporte de cobertura
npx jest tests/unit --no-coverage          # Solo unit (sin BD)
```

---

## Pendientes

- **`schema_migrations`** — tabla de control para que `migrations/run.js` sea idempotente (actualmente falla si se reejcuta sobre BD existente).
- **Rate limiting** en `/auth/forgot-password` y `/auth/reset-password` (prevenir fuerza bruta).
- **Redis** — caché avanzada (opcional, no en el código actual).
- **`SHOW_RESET_TOKEN=false`** en producción — nunca exponer el token de reset en la respuesta del API.

---

*Generado el 2026-06-20 a partir de `docs/PROYECTO.md`, `docs/CAMBIOS_FASE_3.md`, `docs/CAMBIOS_SESION_2026-06-04.md` y `docs/CAMBIOS_SESION_2026-06-10.md`.*
