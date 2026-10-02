# Gestcon (GestionTareasOficina) — Arquitectura

**Versión:** 3.2.0
**Última actualización de este documento:** 2026-10-02 (puesta al día completa: Nómina Electrónica, Directorio maestro de empresas, Contabilidad por empresa, Exógenas, Terceros + RUES, token DIAN, backup a Drive, migraciones 041–063)
**Rama al momento de escribir:** `main`

> **Nota de nombres:** el proyecto nació como "TaskFlow Pro" y el 2026-07-20 se completó el
> rename a **Gestcon** en todo el código, docs, scripts e infraestructura (`backend/package.json`
> → `gestcon-backend`, contenedores Docker `gestcon_*`, `<title>` de `index.html` = "Gestcon",
> `public/manifest.json`: `name`/`short_name` = "Gestcon"; dominio de producción
> `https://gestcon.work`). Es una app de gestión interna (tareas + módulos contables) para una
> firma contable colombiana, no un SaaS multi-tenant.

---

## Visión general

Ocho superficies principales sobre la misma base de datos y el mismo backend (las 4 primeras son los módulos originales; las demás se agregaron entre agosto y octubre de 2026 y comparten el **directorio maestro de empresas**, ver más abajo):

1. **Gestor de Tareas** — tareas, subtareas, comentarios, kanban, calendario, tareas recurrentes, tablero de carga de trabajo, grupos con liderazgo por grupo. Incluye también un espacio **personal** por usuario (no compartido con el equipo): tareas pendientes propias (`/pendientes`) y notas propias con editor enriquecido (`/notas`).
2. **Fondo Emprender** — módulo de seguimiento de un programa de acompañamiento contable a ~30 empresas: checklist mensual de 23 procesos, ficha por empresa con 6 macroprocesos activos, checklist de impuestos, y pagos mensuales a la fiduciaria con flujo de autorización.
3. **Empresas Externas** — catálogo de ~34 empresas externas (fuera del programa Fondo Emprender) con checklist mensual de 11 procesos contables por empresa (Nómina electrónica, Ventas, Compras, Autorretención, etc.), cada una con un responsable y un contador asignado.
4. **Contabilidad DIAN** — wizard de 4 pasos que toma el reporte Excel exportado del portal de la DIAN, calcula IVA/INC/retenciones/nómina/autorretención en renta, y genera un Excel de vuelta (varias hojas: Resumen, Resumen mensual, IVA, INC, Retenciones por proveedor, Detalle de compras, Nómina, Autorretención) sin depender de un ERP externo. Desde la migración 051 puede además **guardar** lo clasificado por empresa y mes y consultarlo en el **Consolidado**. Ver detalle abajo.
5. **Nómina Electrónica** — seguimiento mensual de la presentación de nómina electrónica por empresa, con responsable, fecha límite por mes y avisos automáticos. Ver "Módulo Nómina Electrónica".
6. **Exógenas** — genera los archivos de información exógena (formatos 1001, 1005, 1006 y 1007) a partir del TOKEN de la DIAN, cruzando con terceros y con lo clasificado en Contabilidad. Ver "Módulo Exógenas".
7. **Terceros (facturas + RUES)** — base de datos de terceros extraída de PDFs de factura electrónica DIAN, verificada contra el RUES (registro mercantil), con pantalla "Consulta Tercero". Ver "Módulo Terceros y RUES".
8. **Directorio maestro de empresas (`/empresas`)** — identidad única (NIT/cédula, tipo de contribuyente) de las empresas de los demás módulos, detección de duplicados y generación automática del token de acceso a la DIAN. Ver "Directorio maestro de empresas y token DIAN".

Todo corre en un monorepo con tres piezas ejecutables independientes: `src/` (frontend Vite), `backend/` (API Express), `mcpServer/` (servidor MCP, **legacy**, no forma parte del flujo de producción).

---

## Stack tecnológico

| Capa | Tecnología |
|---|---|
| Frontend | React 18 + Vite 5 + React Router v6 |
| Estilos | Tailwind CSS 3, Material Symbols (Google) — NO Tabler Icons, NO Framer Motion. **Sin modo oscuro** (ya no hay `ThemeContext` ni clases `dark:`) |
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
| Excel / PDF | ExcelJS (lectura de reportes DIAN y generación de Excel/exógenas, backend), `pdf-parse` (extracción de terceros desde PDFs de factura), `multer` (subidas en memoria) |
| Automatización DIAN | Playwright + **Google Chrome real** y Xvfb dentro del contenedor del backend, para generar el token de acceso a la DIAN (ver "Directorio maestro de empresas y token DIAN") |
| Datos externos | RUES vía datos abiertos (datos.gov.co / Socrata, licencia CC BY-SA 4.0) — ver "Módulo Terceros y RUES". `fetch` nativo de Node 20, sin librería HTTP adicional |
| Respaldo | `scripts/backup.sh` + `rclone` hacia Google Drive (ver "Producción actual") |
| Automatización externa | n8n (workflows, ej. `fondo-pagos-alerta-mora` vía Gmail SMTP) — fuera de este repo |

---

## Estructura del repositorio

```
GestionTareasOficina/
├── src/                         # Frontend React (raíz del repo, no /frontend)
│   ├── App.jsx                  # Jerarquía de providers + rutas (ver abajo)
│   ├── main.jsx                 # Entry point, registra el Service Worker
│   ├── context/                 # 8 contextos (ver "Estado global")
│   ├── components/              # Componentes reutilizables (23 archivos, incl. subcarpetas)
│   ├── pages/                   # 35 páginas (ver "Rutas")
│   ├── hooks/                   # usePullToRefresh, useLocalStorage, useTasks, useTeam
│   ├── services/api.js          # Cliente HTTP único: JWT, auto-refresh, todos los endpoints
│   └── utils/                   # helpers, permissions, validators, storage, sampleData
├── backend/
│   ├── src/
│   │   ├── index.js             # Entry point: Express + Socket.io + Swagger + crons
│   │   ├── config/               # env.js, database.js (pg-pool)
│   │   ├── controllers/          # 27 controladores (ver tabla de endpoints)
│   │   ├── middleware/           # auth.js, roles vía controllers, fondoAccess.js,
│   │   │                        # nominaElectronicaAccess.js, empresasAccess.js, groupAccess.js, errorHandler.js,
│   │   │                        # validation.js, security.js
│   │   ├── routes/               # 30 routers (1 por recurso), documentados con swagger-jsdoc inline
│   │   ├── socket/events.js      # setupSocket — JWT en handshake, rooms, online/offline
│   │   ├── services/              # emailService, pushService, recurringTaskService, reminderService,
│   │   │                        # nePlazoReminderService, borradorCleanupService, dianTokenService,
│   │   │                        # terceros/ (extracción de PDF + ruesService), exogenas/ (formatos 1001/1005/1006/1007)
│   │   └── utils/                 # jwt.js, logger.js, auditLog.js, email.js
│   ├── migrations/                # SQL numerado 001–064 + run.js (ver "Base de datos")
│   ├── tests/                     # unit/ (37 suites, 606 tests), integration/, e2e/ (vacío)
│   ├── Dockerfile                 # multi-stage sobre node:20-slim, usuario no-root, HEALTHCHECK, Google Chrome + Xvfb (token DIAN)
│   ├── docker-entrypoint.sh       # arranca Xvfb en segundo plano antes de Node
│   └── jest.config.js             # coverageThreshold 70% lines/functions
├── mcpServer/                    # Servidor MCP standalone — LEGACY, SQLite propia, no se usa en prod
│   └── src/{index,database,schemas,tools}.ts
├── cypress/                      # E2E: 3 suites (login, tasks, permissions)
├── docs/                          # Ver "Documentación relacionada" al final
├── scripts/                       # backup.sh (BD + .env + certs, y copia a Google Drive), restore.sh, setup-cron.sh, gestion-start/stop.sh, deploy-n8n.sh, start/stop-dev.sh, reset-db.sh
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
| `/pendientes` | `PersonalTasksPage` | Tareas personales del usuario logueado, no compartidas con el equipo |
| `/notas` | `PersonalNotesPage` | Notas personales, editor enriquecido (BlockNote/Tiptap) — cargada `lazy()`, chunk separado (~230KB gzip) que solo baja al entrar a la ruta |
| `/fondo-emprender` | `FondoEmprenderPage` | Seguimiento mensual: checklist 23 procesos × ~30 empresas |
| `/fondo-emprender/empresas` | `FondoEmprenderEmpresasPage` | CRUD empresas con semáforo |
| `/fondo-emprender/empresas/:empresaId` | `FondoEmprenderEmpresaDetallePage` | Ficha con 6 macroprocesos |
| `/fondo-emprender/pagos` | `FondoEmprenderPagosPage` | Tabla de pagos a la fiduciaria |
| `/empresas-externas` | `EmpresasExternasPage` | Checklist mensual de 11 procesos × ~34 empresas externas (fuera de Fondo Emprender) |
| `/empresas` | `EmpresasPage` | Directorio maestro de empresas: NIT/cédula, tipo de contribuyente, vigencia por módulo, posibles duplicados (Fusionar / "No es duplicado") y botón "Generar token" DIAN |
| `/dian/consolidado` | `ContabilidadConsolidadoPage` | Consolidado por empresa (mensual / cuatrimestral / anual) de lo clasificado y guardado en Contabilidad, con gráfico de tendencia y exportación a Excel |
| `/exogenas/upload` | `ExogenasUploadPage` | Genera los formatos de exógena 1001 / 1005 / 1006 / 1007 a partir del TOKEN de la DIAN |
| `/dian/nomina-electronica` | `NominaElectronicaPage` | Seguimiento mensual de Nómina Electrónica por empresa (estado, novedad, fecha límite por mes) |
| `/dian/nomina-electronica/empresas` | `NominaElectronicaEmpresasPage` | Catálogo de empresas de Nómina Electrónica (responsable, enlaces con Fondo Emprender / Externas) |
| `/dian/terceros` | `TercerosPage` | "Importar Terceros": sube PDFs de factura DIAN y guarda dirección/municipio/departamento/país por tercero |
| `/dian/consulta-tercero` | `ConsultaTerceroPage` | "Consulta Tercero": datos de las facturas (izquierda) y del RUES (derecha) de un NIT/documento |
| `/dian/upload` | `DianUploadPage` | Paso 1: sube el Excel exportado del portal DIAN |
| `/dian/clasificacion/:borradorId` | `DianClasificacionPage` | Paso 2: clasifica retención en la fuente por cada compra recibida |
| `/dian/nomina/:borradorId` | `DianNominaPage` | Paso 3: datos de nómina y tarifa de autorretención en renta |
| `/dian/exportacion/:borradorId` | `DianExportacionPage` | Paso 4: genera y descarga el Excel final (varias hojas) |

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
| `ToastContext` | Notificaciones UI efímeras |

**Patrón de doble modo:** cuando el backend responde, los contextos llaman a `services/api.js` y sincronizan el estado local con la respuesta. Si el backend no está disponible, operan íntegramente sobre `localStorage` (claves: `tasks`, `team_members`, etc.) usando `utils/storage.js` y `utils/sampleData.js` como fallback.

### `src/services/api.js`

Cliente HTTP único. Maneja JWT en memoria + refresh automático en 401, y expone una función por endpoint (incluye todo el namespace `fondo*`: `getFondoEmpresas`, `getFondoDetalle`, `getFondoImpuestos`, `getFondoPagos`, `getFondoPagosTodasEmpresas`, `getFondoPagosMesActual`, etc.; el namespace `dian*`: `uploadDian`, `getDianBorrador`, `patchDianBorrador`, `patchDianClasificacionRapida`, `patchDianNomina`, `exportarDianBorrador`, etc.; y el namespace de Empresas Externas).

### Patrones UI establecidos (ver también `docs/` si existiera guía de estilo)

- **StatsCard**: `<StatsCard title value icon borderColor iconColor sub subColor />`, siempre 4 tarjetas en `grid-cols-1 sm:grid-cols-2 xl:grid-cols-4`, iconos Material Symbols como string (ej. `"corporate_fare"`).
- **Filtros segmentados (tabs) + buscador**: contenedor `bg-[#f0f2f8] rounded-xl p-1`; tab activo `bg-white text-[#003B43] shadow-sm`; buscador con icono `search` absolute.
- **Tablas con scroll horizontal**: wrapper `overflow-x:auto`, primera columna `position:sticky; left:0; zIndex:2`, header `zIndex:3`. Si se mezcla `style={{background:...}}` inline con clases de Tailwind, el inline gana siempre.
- **Animaciones**: solo `opacity`, `transform`, `background-color`, `color`, transición ~200ms. Nunca `width/height/max-height` (causa reflow). No se usa Framer Motion.
- **Orden de filas**: nunca reordenar dinámicamente por mora/estado — el orden es el que devuelve el servidor (decisión de UX explícita, aplica sobre todo a `FondoEmprenderPagosPage`).
- **Texto UI en Pagos**: el estado en BD es `'aprobado'` pero la UI siempre muestra **"Pagado"**.
- **Paleta de marca Gestcon** (rebranding de sept-2026): `#06272E` verde muy oscuro (fondos sólidos grandes, sidebar), **`#003B43` teal principal** (acento por defecto: botones, focus, bordes activos, enlaces, iconos), `#E5A70C` dorado (CTAs grandes en pantallas ya migradas), `#E3EEEE` fondo teal claro para chips/paneles informativos con texto `#003B43`. El azul viejo `#004ac6` / `#2563eb` ya no se usa salvo como uno de varios colores de una paleta por categorías (ej. `GROUP_PALETTE`, `PRESET_COLORS` de tags). Estados: verde `#16a34a`, rojo `#ef4444`, ámbar `#d97706`; neutros `#f0f2f8` (fondo de filtros) y borde `#e2e4ef`. Fuente de verdad: la guía de marca (`Entrega.pdf` en `docs/`). **No hay modo oscuro.**

---

## Backend

### Entry point (`backend/src/index.js`)

- Express + `http.createServer` compartido con Socket.io.
- `app.set('trust proxy', 1)` — necesario para que `express-rate-limit` lea `X-Forwarded-For` detrás de nginx.
- CORS: en desarrollo acepta cualquier `localhost:*`; en producción, lista de orígenes en `CLIENT_URL` separada por comas (soporta `gestcon.work` + IP local simultáneamente).
- **Rate limiting por usuario, no por IP**: extrae `userId` del JWT en el header `Authorization` y limita por `user:{id}`; cae a IP si no hay token válido. Evita que toda la oficina (misma IP pública) comparta un solo cupo. General: 2000 req/15min. Auth (`/login`, `/register`): 50 req/15min.
- Helmet con CSP activo solo en producción.
- Swagger UI en `/api/docs` — deshabilitado en producción (A05 OWASP: no exponer docs).
- Arranca cuatro crons al iniciar: `initRecurringCron(io)`, `initReminderCron(io)`, `initNEPlazoCron(io)` y `initBorradorCleanupCron()` (ver tabla de crons). No se arrancan bajo Jest (dejarían temporizadores vivos).
- En desarrollo sirve `dist/` como estático si existe (fallback SPA); en producción esto lo hace nginx.

### Controladores y rutas

| Prefijo | Controlador | Alcance |
|---|---|---|
| `/api/auth` | `authController` | register, login, refresh, logout, me, forgot/reset-password |
| `/api/tasks` | `taskController` | CRUD tareas, subtareas, comentarios, historial, búsqueda, templates recurrentes, asignados múltiples (`task_assignees`), solicitudes de borrado (`task_delete_requests`) |
| `/api/tasks/:id/fondo-link` | `fondoLinksController` (montado sobre `/api/tasks`) | vincula una tarea a un macroproceso o checklist de Fondo Emprender |
| `/api/personal-tasks` | `personalTaskController` | tareas personales del usuario (no compartidas), con sub-items |
| `/api/personal-notes` | `personalNoteController` | notas personales del usuario, contenido enriquecido |
| `/api/employees` | (empleados, sin controlador propio listado aquí) | CRUD empleados |
| `/api/groups` | `groupController` | CRUD grupos, miembros, liderazgo (`is_leader`) |
| `/api/tags` | (tags) | CRUD etiquetas, crear sin restricción de rol |
| `/api/stats` | `statsController` | estadísticas generales, `/audit`, `/workload` |
| `/api/notifications` | (notificaciones) | listar, marcar leídas, VAPID pública, push-subscribe |
| `/api/fondo/empresas` | `fondoEmpresasController` | CRUD empresas del programa |
| `/api/fondo/procesos` | `fondoProcesosController` | catálogo de 23 procesos del checklist mensual |
| `/api/fondo/proceso-grupos` | `fondoProcesoGruposController` | catálogo de grupos de proceso (NOMINA, CONTABILIDAD, …) usados para derivar mp2/mp5 |
| `/api/fondo/checklist` | `fondoChecklistController` | checklist mensual por empresa (alimenta mp5) |
| `/api/fondo/detalle` | `fondoDetalleController` | 6 macroprocesos por empresa/mes (mp1-mp7, ver detalle abajo) |
| `/api/fondo/impuestos` | `fondoImpuestosController` | checklist de 4 impuestos por empresa/mes (alimenta mp6) |
| `/api/fondo/pagos` | `fondoPagosController` | pagos mensuales a la fiduciaria + autorización + mes habilitado |
| `/api/externas/empresas` | `extEmpresasController` | CRUD del catálogo de empresas externas (nombre, responsable, contador, activa) |
| `/api/externas/procesos` | `extProcesosController` | catálogo de 11 procesos del checklist de Empresas Externas |
| `/api/externas/checklist` | `extChecklistController` | checklist mensual por empresa externa |
| `/api/externas/proceso-grupos` | `extProcesoGruposController` | grupos de procesos del Seguimiento Mensual de Empresas Externas (agrupan columnas por color) |
| `/api/nomina-electronica/empresas` | `neEmpresasController` | catálogo de empresas de Nómina Electrónica (responsable, enlaces a Fondo/Externas, vigencia) |
| `/api/nomina-electronica/meses` | `neMesesController` | estado mensual por empresa (`GET /?anio&mes`, `PUT /:empresaId`), con arrastre del estado "En espera" |
| `/api/nomina-electronica/plazo` | `nePlazoController` | fecha límite por mes (editable solo por cuentas de confianza) |
| `/api/contabilidad/empresas` | `contabEmpresasController` | CRUD del catálogo de empresas de Contabilidad (borrar solo admin) |
| `/api/contabilidad` | `contabConsolidadoController` | `GET /periodos`, `GET /consolidado`, `GET /consolidado/resumen-anual`, `GET /consolidado/exportar` (Excel) |
| `/api/empresas` | `empresasMaestroController` | directorio maestro: CRUD, `GET /duplicados`, `POST /fusionar`, `POST /duplicados/descartar`, `POST /:id/habilitar`, `POST /:id/generar-token-dian`, `POST /verificar-matricula` (admin, o quien tenga el permiso `empresas.canActualizarMatricula`: consulta el RUES y actualiza la matrícula mercantil de las empresas), `GET /rues-fuente` (fecha de la última actualización de los datos del RUES) |
| `/api/exogenas` | `exogenasController` | `POST /upload`, `GET /borradores/:id`, `POST /borradores/:id/generar`, `POST /generar-combinado` (formatos 1001, 1005, 1006, 1007) |
| `/api/terceros` | `tercerosController` | `POST /upload` (PDFs de factura), `GET /:nit` (Consulta Tercero + RUES), `POST /verificar-rues-lote` (admin/líder) |
| `/api/dian` | `dianController` | wizard de 4 pasos: upload de reporte DIAN, clasificación de retención, nómina/autorretención, export a Excel (ver detalle abajo) |

### Middleware de seguridad y permisos

- `middleware/auth.js` — `authMiddleware`: valida JWT + blacklist en cada request.
- Roles de tareas/grupos: `admin` y `leader` global tienen acceso amplio; a partir de la migración 018, **liderazgo por grupo** (`group_members.is_leader`) permite a un líder de un grupo específico editar/eliminar ese grupo, gestionar sus miembros y borrar tareas del grupo — sin cruzar a otros grupos. Tareas sin grupo solo las borra `admin`.
- `middleware/fondoAccess.js` — dos guards independientes, ambos leen `users.permissions` (JSONB):
  - `requireFondoAccess`: exige `permissions.modulos.fondoEmprender.canEditar === true` (o rol admin). Bloquea `viewer` sin consultar BD.
  - `requireFondoAutorizarPagos`: exige `permissions.modulos.fondoEmprender.canAutorizarPagos === true` (o rol admin). Permiso separado de `canEditar` — quien registra pagos no necesariamente puede autorizar su envío a la fiduciaria.
- `middleware/nominaElectronicaAccess.js` — guards propios de Nómina Electrónica, sobre `permissions.modulos.nominaElectronica.{canEditar, canVerTodo, canGestionar}`: `requireNEAccess` (escribir estados), `requireNEView` (leer), `requireNEAdmin` (catálogo de empresas) y `requireNEPlazoAdmin` (la fecha límite solo la editan las cuentas listadas en `IDS_RESPONSABLES_PLAZO`).
- `middleware/empresasAccess.js` — `requireEmpresasMatricula` protege `POST /api/empresas/verificar-matricula` ("Actualizar matrícula" del RUES): el administrador siempre puede; los demás roles, excepto viewer, solo con `permissions.modulos.empresas.canActualizarMatricula === true`, que se activa por persona en la pantalla **Usuarios** (columna y panel "Empresas"). Esa ruta se declara **antes** del filtro admin/líder del router de empresas porque ese filtro no mira permisos por usuario.
- Directorio de empresas, Terceros y Consulta Tercero: lectura y "generar token" abiertos a cualquier usuario autenticado; escribir en el directorio exige admin o líder, y `POST /api/terceros/verificar-rues-lote` también.
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
| `reminderService.js` (segundo cron) | `*/5 * * * *` (cada 5 min) | Recordatorios de **tareas personales** (`personal_tasks.reminder_at`): a una hora puntual elegida por la persona, por eso necesita más precisión que el de vencimiento |
| `nePlazoReminderService.js` | `0 8 * * *` zona `America/Bogota`, **y también al arrancar** | Avisos de Nómina Electrónica: mes habilitado, plazo próximo (5 días), plazo vencido y "configura la fecha límite". Todos son idempotentes (`yaSeEnvioHoy` / `yaSeEnvioEsteMes`), por eso pueden repetirse al arrancar sin duplicar. La fecha límite es manual a propósito (no se calcula por festivos) |
| `empresasRuesService.js` | Al arrancar y `0 6 * * *` zona `America/Bogota` | Pregunta primero la **fecha de la última "foto" de los datos del RUES** (`ruesService.js#fechaActualizacionFuente`, ficha de metadatos de 2,6 KB) y consulta solo a las empresas **activas** del directorio nunca verificadas o verificadas **antes** de esa fecha; si la foto no cambió, no consulta nada (si no se puede saber la fecha, cae al criterio de 7 días). Guarda el estado de su matrícula mercantil (solo columnas `rues_*`). Un fallo del RUES no se guarda. También se lanza en segundo plano al crear una empresa o cambiarle el NIT/cédula, y a mano con "Actualizar matrícula" |
| `borradorCleanupService.js` | Al arrancar y `0 10 * * *` | Borra los borradores vencidos de `calculo_borradores` (Contabilidad) y `exogenas_borradores` (Exógenas), que guardan el Excel original (BYTEA) y expiran a los 14 días |
| `pushService.js` | — | Helper de envío Web Push (VAPID), usado por los crons de recordatorios y por eventos puntuales |

---

## Módulo Fondo Emprender — detalle

Programa de acompañamiento contable a ~30 empresas, con tres vistas relacionadas pero con tablas independientes:

### 1. Seguimiento Mensual (`/fondo-emprender`)

Checklist de 23 procesos (`fondo_procesos`) × cada empresa, agrupado por mes (`fondo_checklist_meses` + `fondo_checklist_items`). El campo `fondo_checklist_meses.confirmed` de este módulo es la fuente de verdad que alimenta **mp5/Contabilidad** en la ficha de empresa (macroproceso derivado, no editable ahí).

**Código Siigo** (`fondo_empresas.codigo_siigo`, migración 037): primera columna de la grilla (header "Cod Siigo"), a la izquierda de Empresa (ambas *sticky*). Es dato maestro de la empresa, no del mes — lo mismo para todos los meses. Lo ve todo el mundo pero **solo el admin con "Editar estructura" activo lo edita** (`canEditStructure`, mismo modo que los grupos y procesos: es catálogo, no dato mensual); clic en la celda → input. El guardián vive en `fondoEmpresasController` y no en un middleware, porque `PUT /api/fondo/empresas/:id` es la misma ruta con la que un usuario con `fondoEmprender.canEditar` edita nombre/categoría/mensualidad. `codigo_siigo` es el único campo de esa ruta que no usa `COALESCE`: borrarlo es una edición válida, así que el `UPDATE` distingue "no vino en el body" de "vino en `null`" con un flag, igual que `grupoId` en `fondoProcesosController`. La búsqueda de la grilla también entra por este código.

### 2. Ficha de empresa (`/fondo-emprender/empresas/:empresaId`)

7 macroprocesos por empresa/mes (`mp1`-`mp7`, sin `mp5` propio en la tabla — es derivado):

| ID | Nombre | Fuente del estado |
|---|---|---|
| mp1 | Facturación | `fondo_detalle_macroprocesos` — editable directo |
| mp2 | Nómina | **Derivado en lectura** del agregado de TODOS los procesos del grupo NOMINA del checklist mensual (Seguimiento Mensual), vinculado por `fondo_proceso_grupos.macroproceso_id = 'mp2'` (por id, no por nombre). `readonly: true`. `na` en todos → `done`; algún avance sin terminar → `in_progress`. Responsable/nota siguen editables. La ficha muestra además el desglose por proceso (`checklistItems`). |
| mp3 | Nómina electrónica | **Derivado en lectura** del ítem "nomina electronica" del checklist mensual (Seguimiento Mensual), vinculado por `fondo_procesos.macroproceso_id = 'mp3'` (por id, no por nombre — sobrevive a renombrados). `readonly: true`. `na` → `done`. Responsable/nota siguen editables. |
| mp4 | Documentos contador - Pagos | **Derivado en lectura** de `fondo_pagos` del mismo mes (módulo de Pagos). `readonly: true`. `enviado`/`aprobado` → `done`; `rechazado` → `in_progress`; sin registro → `pending`. Responsable/nota siguen editables. |
| mp5 | Contabilidad | **Derivado en lectura** del agregado de TODOS los procesos del grupo CONTABILIDAD del checklist mensual, mismo criterio que mp2, vinculado por `fondo_proceso_grupos.macroproceso_id = 'mp5'`. `readonly: true`, sin responsable/nota. `confirmed`/`enviado` (flujo "Listo para enviar" → "Enviada" de Seguimiento Mensual) ya NO son la fuente del estado — quedan como un paso manual posterior e independiente, mostrado aparte en la ficha. El botón "Listo para enviar" en Seguimiento Mensual se deshabilita mientras falte algún proceso del grupo CONTABILIDAD por resolver. |
| mp6 | Información tributaria | **Derivado** de `fondo_impuestos_items` (los 4 impuestos). `readonly: true`. Los 4 en `'na'` cuentan como `done` ("Sin impuestos aplicables"). Responsable/nota editables. |
| mp7 | Producción y ventas | `fondo_detalle_macroprocesos` — editable directo |

Cada macroproceso puede tener **tareas vinculadas** del Gestor de Tareas vía `task_fondo_links` (tabla puente, `link_type: 'macroproceso' | 'checklist'`), visibles en la ficha y con badge en `TaskCard`/`TaskForm` del lado de Tareas (`FondoLinkSelector.jsx`).

**Por qué derivación en lectura y no un trigger al confirmar:** se decidió así para mp4 (jul-2026) porque garantiza que el estado nunca quede desincronizado sin importar cómo cambie `fondo_pagos` (aprobar, rechazar, o revertir un "Pagado") — no hay lógica de sync adicional que mantener. Mismo patrón usado para mp2, mp3, mp5 y mp6.

**`getEmpresas` (lista de Empresas) recalcula el agregado "X/7" con su propia consulta SQL**, independiente de `fondoDetalleController.getDetalle` — cualquier macroproceso nuevo que se vuelva derivado (mp2, mp3, mp5 así fue) hay que excluirlo del conteo crudo de `fondo_detalle_macroprocesos` ahí también y sumar su contribución derivada, o la lista queda desincronizada de la ficha aunque esta última esté bien.

### 3. Pagos a la fiduciaria (`/fondo-emprender/pagos`)

Tabla tipo spreadsheet, una fila por empresa, columnas por mes. Evolucionó bastante desde su reescritura de jun-2026 (el detalle histórico está en `git log`); estado actual:

- **`fondo_pagos`**: una fila por empresa × mes con `estado` (`pendiente|enviado|aprobado|rechazado`), `autorizado` (bool, independiente de `estado`), `monto` (snapshot de `fondo_empresas.monthly_fee` al crear), `nota`, `fecha_envio`, `fecha_resolucion`.
- **Autorización interna** (`autorizado`, migración 018): separa "en qué va con la fiduciaria" (`estado`) de "¿el equipo contable tiene luz verde interna para tramitarlo?" (`autorizado`). Guardián propio: `requireFondoAutorizarPagos` — permiso distinto de `canEditar`. Default `false`: todo pago nace bloqueado hasta que una jefa autoriza explícitamente.
- **Mes habilitado** (`fondo_pagos_mes_actual`, migración 019): tabla singleton (`id=1`) que define el límite superior de la grilla — los pagos son sobre **mes vencido** (en julio solo se tramita hasta junio), y ese límite ya no se deriva de la fecha del sistema sino que lo avanza/retrocede una jefa manualmente (`POST /mes-actual/avanzar`, `POST /mes-actual/retroceder`, ambos tras `requireFondoAutorizarPagos`). Piso de retroceso: febrero 2026 (inicio del programa).
- **Mora**: calculada on-the-fly (`calcularMora`) como la cantidad de registros posteriores al último `'aprobado'` con `estado != 'aprobado'` — si nunca hubo un aprobado, cuenta todos los registros.
- Endpoint batch `GET /api/fondo/pagos/todas` trae el historial de **todas** las empresas en una sola llamada (evita N+1 — antes la página hacía una request por empresa en cada carga).
- Frontend: actualizaciones optimistas sobre `rows` local, con `refreshEmpresa(id)` como rollback puntual si falla la API (nunca se refresca todo el listado).

### Checklist de impuestos (mp6, `fondo_impuestos` / `fondo_impuestos_items`)

Catálogo fijo de 4 obligaciones (`autorretencion`, `retencion`, `iva`, `consumo`), sin FK ni JOIN con el checklist mensual — completamente independiente. Estado por ítem: `pending|presented|na`. Estado agregado de mp6 (`deriveImpuestosEstado`): todos en `na` o todos `presented` → `done`; alguno `presented` → `in_progress`; si no, `pending`.

---

## Módulo Contabilidad DIAN — detalle

> Esta sección describe el wizard de 4 pasos. Desde la migración 051 también puede guardar lo clasificado por empresa y mes: ver "Módulo Contabilidad por empresa y Consolidado". En el menú lateral, el módulo **DIAN** (`DIAN_NAV` en `src/config/navigation.js`) agrupa: Contabilidad (el wizard), Consolidado, Exógenas, Importar Terceros, Consulta Tercero, Empresas Externas y Seguimiento Nómina (Nómina Electrónica). El Directorio de empresas (`/empresas`) y Fondo Emprender son módulos propios del menú.

Wizard de 4 pasos sobre un "borrador" (`calculo_borradores`, JSONB, expira a los 14 días) que no toca datos contables reales de las empresas — todo el cálculo se rehace desde `datos.filas` en cada paso/export, así que editar una clasificación después de subir el archivo siempre queda reflejado en el resultado final.

1. **Upload** (`/dian/upload` → `POST /api/dian/upload`) — sube el `.xlsx` exportado del portal de la DIAN. Se parsea con ExcelJS; se guarda `archivo_original` (BYTEA, migración 036) tal cual se subió, y un array `filas` con: totales, IVA y los 12 impuestos adicionales que puede traer un documento (ICA, IC, INC, Timbre, INC Bolsas, IN Carbono, IN Combustibles, IC Datos, ICL, INPP, IBUA, ICUI), retenciones que ya trae el documento (Rete IVA/Renta/ICA), tipo de documento y Grupo (Emitido/Recibido).
2. **Clasificación de retención** (`/dian/clasificacion/:borradorId`) — cada compra recibida real (`requiereClasificacion`: Grupo=Recibido + tipo en `TIPOS_COMPRA`) necesita una clasificación (`Compras`/`Servicios`/`Arrendamiento`/`Honorarios` con tarifa, o `N/A`/`Autorretenedor` cuando no aplica retención) antes de poder exportar. Autoguardado por fila (debounce 1.5s, `PATCH /borradores/:id`), más "clasificación rápida" (aplica una clasificación a todas las filas aún sin clasificar) y selección múltiple. La "Base" sobre la que se calcula la retención (columna en pantalla y columnas Subtotal/Retención del Excel) es el Total de la fila neto de **todos** los impuestos que trae (`getBaseRetencion`), no solo el IVA.
3. **Nómina** (`/dian/nomina/:borradorId`) — datos de nómina del período (empleados, meses, salario, tarifa ARL) para seguridad social/parafiscales, y la tarifa de autorretención en renta (`TASAS_AUTORRETENCION`; obligatoria solo si el período tiene nómina Y ventas).
4. **Exportación** (`/dian/exportacion/:borradorId` → `POST /borradores/:id/exportar`) — genera el Excel final con ExcelJS. Hojas: `RESUMEN` (+ `RESUMEN_MENSUAL` si el período cruza más de un mes calendario), `IVA`, `INC` (solo si hubo INC en el período), `RETENCIONES_POR_PROVEEDOR`, `DETALLE_COMPRAS`, `NOMINA`, `AUTORRETENCION` (solo si aplica), `METADATOS`. `archivo_original` se conserva en BD para poder volver a generar/descargar el export sin tener que resubir el reporte.

Puntos de diseño a tener en cuenta:
- Ventas/Compras Netas y Utilidad Bruta se calculan **sin IVA ni INC** (ninguno es ingreso/costo real); las retenciones practicadas a proveedores tampoco se restan de la utilidad (son un anticipo de impuesto al proveedor, no un costo de la empresa).
- Notas de crédito, "Documento soporte con no obligados a facturar" (Grupo invertido: `Emitido` = compra propia) y notas de ajuste no piden clasificación de retención ni entran a `DETALLE_COMPRAS`.
- `calcularAnomalias` detecta CUFE duplicado, totales negativos en facturas (no en notas crédito) y tipos de documento no parametrizados; se pueden marcar como "revisada" sin alterar ningún cálculo.

---

## Módulo Empresas Externas — detalle

Catálogo de empresas fuera del programa Fondo Emprender (sin macroprocesos derivados ni módulo de pagos): checklist mensual de 11 procesos contables (`ext_procesos` — Nómina electrónica, Ventas, Compras, Autorretención, Depreciación, Nómina, Pago nómina, Conciliación, Pago seguridad social, Pago impuestos, Caja) por empresa (`ext_empresas`, ~34 registros) y mes (`ext_checklist_meses` + `ext_checklist_items`, estado `pending|in_progress|done|na`). Cada empresa tiene un `responsable_id` (usuario del equipo, asignado inicialmente por nombre en la migración 039) y una columna `contador` de texto libre (migración 040). Mismo patrón que los catálogos de Fondo Emprender: un proceso con historial no se borra, solo se desactiva (`ON DELETE RESTRICT` + `activo`).

---

## Módulo Contabilidad por empresa y Consolidado — detalle

Hasta la migración 051 cada corrida del wizard DIAN era desechable (se borraba al exportar). Desde entonces, si se elige una empresa, lo clasificado queda **guardado de forma permanente** por empresa y mes, para consultarlo después (mensual / cuatrimestral / anual) y usarlo como insumo de la exógena. Estado detallado y decisiones: `docs/ESTADO_CONTABILIDAD_EMPRESAS.md`.

- **Tablas** (migraciones 051–052): `contab_empresas` (catálogo de 52 empresas; el NIT se completó con la 052 y se aprende también del primer reporte subido), `contab_periodos` (qué empresa/mes ya está guardado) y `contab_documentos` (una fila por documento, identificado por CUFE). `calculo_borradores` ganó una columna nullable para asociar el borrador a una empresa; sin empresa todo funciona igual que antes ("Solo calcular").
- **Tres clasificaciones por compra**: retención (la de siempre), **IVA** (Mayor valor / Descontable / Activo fijo) y **Concepto** (Servicios, Compras, Activo fijo, Honorarios, Arriendos, Adecuaciones, Compras diversos, Diversos, No deducible). Son obligatorias para exportar **solo si el borrador tiene empresa**. De las ventas solo se guarda el IVA generado (y el INC).
- **Verificación de NIT en dos capas**: comparación directa si la empresa ya tiene NIT; si es la primera vinculación se compara el nombre del reporte contra el del catálogo (`nombresSeParecen`) y, si no se parecen, responde `409 { requiereConfirmacion: true, nombreDetectado }`.
- **Re-subida del mismo mes**: se detecta por CUFE y se elige entre `actualizar` (upsert) y `reemplazar` (borra y recarga ese mes). Solo se guardan documentos con relevancia contable (`TIPOS_CONTABILIZADOS`).
- **Dirección del proveedor**: se resuelve contra `terceros` al leer o exportar, nunca se congela en la fila guardada.
- **Consolidado** (`/dian/consolidado`, `contabConsolidadoController`): `GET /api/contabilidad/periodos`, `/consolidado` (mensual / cuatrimestral Ene–Abr, May–Ago, Sep–Dic / anual), `/consolidado/resumen-anual` y `/consolidado/exportar` (Excel). La página muestra totales, qué meses tienen datos y un gráfico de tendencia.
- **Directorio**: `contab_empresas.empresa_id` apunta a la tabla maestra `empresas` (migración 053).
- **Limpieza**: `borradorCleanupService` borra a diario los borradores vencidos (14 días).

---

## Módulo Nómina Electrónica — detalle

Reemplaza el Excel que llevaba una sola persona. Páginas: `/dian/nomina-electronica` (seguimiento mensual) y `/dian/nomina-electronica/empresas` (catálogo). Migraciones 045–050, 059 y 061.

- **`ne_empresas`**: empresa, responsable, `origen` (agrupación Maritza / Diana / Externas, mig. 047), enlaces opcionales y únicos a `fondo_empresas` y `ext_empresas` (mig. 045–046, 049), `activa` y vigencia (`vigente_hasta_anio/mes`, mig. 059).
- **`ne_meses`**: una fila por empresa y mes con `estado` (`pendiente` | `presentada` | `no_aplica`), `tiene_novedad` / `novedad_nota` (eje aparte, no cambia el color) y `nota` (obligatoria en la UI cuando es `no_aplica`). Una empresa sin fila en un mes vencido se muestra como pendiente (el `GET` la sintetiza). `autorizada` (mig. 048) separa "ya se puede presentar" del estado, mismo patrón que `fondo_pagos.autorizado`.
- **"En espera"**: es el estado interno `no_aplica` mostrado en gris, y **se arrastra al mes siguiente** si la empresa no tiene fila ahí (`utils/nominaElectronicaArrastre.js`). No se guarda nada: se calcula al consultar; al marcar algo en el mes nuevo se crea la fila sembrada con el estado y la nota heredados.
- **Fecha límite por mes** (`ne_plazo_mes`, mig. 061; reemplaza al singleton `ne_plazo`): 100 % manual a propósito (el usuario decidió no calcularla por festivos) y solo editable por `requireNEPlazoAdmin`.
- **Derivación hacia otros módulos**: la celda "Nómina electrónica" del seguimiento de Fondo Emprender (mp3) y de Empresas Externas lee en vivo este estado, vía los enlaces.
- **Avisos**: ver `nePlazoReminderService` en la tabla de crons.
- **Permisos**: `permissions.modulos.nominaElectronica.{canEditar, canVerTodo, canGestionar}` (ver "Middleware").

---

## Módulo Exógenas — detalle

Genera los archivos de información exógena a partir del **TOKEN** de la DIAN (Excel con hojas COMPRAS / VENTAS / DEV VENTAS / DEV COMPRAS). Página `/exogenas/upload`; backend `exogenasController` + `services/exogenas/` (un archivo por formato). Estado y decisiones: `docs/ESTADO_EXOGENAS_1001_1007.md`.

- **Formatos soportados** (`FORMATOS_SOPORTADOS`): **1001**, **1005**, **1006** y **1007**. Flujo: `POST /upload` crea un borrador (`exogenas_borradores`, migración 041, expira a los 14 días) → se revisa la tabla → `POST /borradores/:id/generar` devuelve el Excel con la plantilla ya llena; `POST /generar-combinado` recibe varios `ids` y devuelve un solo Excel con la hoja de cada formato.
- **Lectura del TOKEN**: las filas ocultas por filtro o "Ocultar" se **ignoran** (`row.hidden`) en todos los formatos; las columnas ocultas sí se leen (ahí vienen los impuestos que deben restarse).
- **1001**: la ubicación (DIR / DPTO / MUN / PAIS) sale de `terceros` (MUN pide solo los 3 últimos dígitos del código DANE) y un tercero sin dirección + municipio + departamento cuenta como incompleto. **CPT y PAGO** se llenan desde lo ya clasificado en Contabilidad, con un selector de empresa/año; las demás columnas de dinero siguen siendo manuales.
- **1007**: no tiene DV y sí PAIS, que se cruza contra `terceros` (queda en blanco si el cliente no tiene factura importada); **CPT sigue en blanco**.
- **Tipo de documento** (NIT = 31 / cédula = 13): el TOKEN no lo trae, así que se infiere (`inferirTipoDocumento` en `utils/dian.js`): primero por palabras clave de empresa en el nombre y, si no hay pista, por la cantidad de dígitos (hasta 8 = cédula antigua, exactamente 9 = NIT de persona jurídica, 10 = cédula NUIP). Fuentes de los rangos: `docs/nit-vs-cedula-rangos.md`.
- **Depende de Terceros**: cuanto más completa esté la tabla `terceros`, menos vacíos salen en el 1001 y el 1007. El nombre que usan los formatos es el **de la factura** (`terceros.razon_social`), no el del RUES; cambiarlo está pendiente de comprobar qué nombre acepta la DIAN.

---

## Directorio maestro de empresas y token DIAN — detalle

Unifica bajo una sola identidad las empresas de Fondo Emprender, Empresas Externas, Nómina Electrónica y Contabilidad. Página `/empresas`; migraciones 053–056, 059, 060 y 062. Estado y decisiones: `docs/ESTADO_EMPRESAS_DIRECTORIO.md`.

- **Tabla `empresas`**: solo identidad (`name`, `nit`, `tipo_contribuyente`, `cedula_representante`, `activa`) y qué módulos tiene habilitados. Las 4 tablas de módulo siguen siendo dueñas de sus propios campos y tienen un `empresa_id` **nullable** hacia ella. Renombrar solo se hace desde el directorio (`PUT /api/empresas/:id`), con cascada a las tablas de módulo.
- **Persona natural**: su cédula vive en `empresas.nit` (la lista y el token DIAN la leen de ahí).
- **Vigencia de cada empresa** (mig. 059–060): las 4 tablas de módulo (`fondo_empresas`, `ne_empresas`, `ext_empresas`, `contab_empresas`) tienen `vigente_hasta_anio` / `vigente_hasta_mes`; `NULL` = sin restricción. Una empresa que sale deja de aparecer en los meses siguientes, pero su histórico no se borra. El filtro por vigencia también afecta contadores y progreso.
- **Matrícula mercantil de los propios clientes (RUES, mig. 064)**: columna "Matrícula" y filtro en `/empresas`, con una línea que dice **"datos del RUES al <fecha>"** (la de la última foto, no la de hoy). El **RUES no entrega una fecha de vencimiento**: entrega el estado, el último año renovado y la fecha de esa renovación; el plazo lo pone la ley (renovación anual hasta el **31 de marzo**, según el Código de Comercio) y se **calcula al leer** (`ruesService.js#calcularSituacionMatricula`, `plazoLimite`). Situaciones: `al_dia`, `por_renovar` (ene–mar, renovó el año pasado), `sin_renovar`, `cancelada` ("cancelada por traslado de domicilio" no cuenta), `no_encontrada`, `sin_dato`, `otro` y `sin_verificar`. Mismas fuentes y reglas que Terceros (ver ese módulo); cuando cambia el NIT/cédula de una empresa se limpia lo anterior en el mismo `UPDATE` y se vuelve a consultar. Una prueba con las 162 empresas reales (2026-10-02) dio 143 al día, 9 sin renovar, 2 canceladas y 3 que no aparecen. Es un aviso para revisar, no una prueba: los datos abiertos tienen retraso y manda el certificado de la Cámara de Comercio.
- **Posibles duplicados**: mismo NIT, o nombre con una palabra significativa en común (se ignoran figuras jurídicas y "ASOCIACION"/"FUNDACION"); se puede **fusionar** o marcar **"No es duplicado"** (`empresas_duplicados_descartados`, mig. 056). Ojo: `fusionar` mueve habilitaciones de módulo pero **no copia** NIT/tipo/cédula.
- **Permisos**: escribir en el directorio, admin y líder; leer y generar token, cualquier usuario autenticado.
- **Generación del token de acceso a la DIAN** (`services/dianTokenService.js`): automatiza el login de `catalogo-vpfe.dian.gov.co` con **Google Chrome real** (el WAF de Cloudflare bloquea el Chromium de Playwright) sobre un **perfil persistente "calentado"** una sola vez con una verificación real. El perfil vive en el servidor (`${HOME}/dian-perfil-real-chrome`, montado por *bind mount* en `/app/dian-perfil`, no como volumen nombrado, para no perderlo). El contenedor no tiene pantalla: `docker-entrypoint.sh` arranca **Xvfb** antes de Node. Hay una cola con concurrencia máxima `DIAN_TOKEN_MAX_CONCURRENTE` (5 en `docker-compose.yml`): las demás solicitudes esperan turno. El servidor es modesto (2 núcleos); con 3 o 5 generaciones simultáneas el CPU se satura pero no falla. Esta pieza está excluida de la cobertura de tests (integración real con el navegador).
- **Las empresas se crean solo en el directorio**: los routers de Fondo Emprender, Empresas Externas, Nómina Electrónica y Contabilidad **no tienen rutas de creación**; `POST /api/empresas/:id/habilitar` es lo único que inserta en las 4 tablas de módulo. En producción ninguna de sus filas queda sin `empresa_id`. La pantalla `/empresas` también permite corregir nombre, tipo de contribuyente y NIT/cédula.

---

## Módulo Terceros y RUES — detalle

Base de datos de terceros (proveedores y clientes) con **dos fuentes**: las facturas electrónicas de la DIAN (PDF) y el **RUES** (registro mercantil de las Cámaras de Comercio). Migraciones 042–044 (facturas) y 063 (RUES). Páginas `/dian/terceros` (importar) y `/dian/consulta-tercero`.

### Fuente 1: facturas (PDF)
- `POST /api/terceros/upload` recibe hasta 500 PDFs (5 MB c/u, en memoria) con `tipoOperacion` (`compras` guarda al **Emisor**; `ventas`, al **Adquiriente**) y hace *upsert* en `terceros` por NIT. Un PDF que falla no frena el lote; las notas crédito y documentos soporte se descartan y se cuentan aparte.
- La extracción (`services/terceros/index.js`, `pdf-parse`) usa expresiones regulares fijas porque el layout lo genera la DIAN, no el emisor. Guarda razón social, dirección (normalizada a las reglas de la DIAN), municipio y departamento con su **código DANE**, país con su código DIAN, régimen fiscal, responsabilidad tributaria, teléfono y correo. Si el layout cambia, el resumen avisa con `erroresFormato`.
- Los datos de factura **no** son un RUT verificado. `razon_social` es el nombre **de la factura** y es lo que usan las exógenas.

### Fuente 2: RUES (migración 063)
- **De dónde sale**: conjunto de datos abierto `c82u-588k` de datos.gov.co ("Personas Naturales, Personas Jurídicas y Entidades Sin Ánimo de Lucro"), publicado por **Confecámaras**, API SODA/Socrata, sin credenciales. **Licencia CC BY-SA 4.0**: uso comercial permitido; exige atribución, y *CompartirIgual* solo aplicaría si se redistribuyeran datos derivados a terceros (uso interno no lo activa). Se decidió **no** mostrar la atribución en pantalla. El servicio propio de RUES (`ruesapi.rues.org.co`) responde 403 y pide credenciales; no se usa.
- **Frecuencia de actualización (importante)**: Confecámaras publica este conjunto como una **"foto" de vez en cuando, no a diario**, y **no declara con qué frecuencia**. El 2026-10-02 la última actualización era del **2026-09-04** (la renovación más reciente era de ese día, con ~3.000 por día hábil hasta el 3/09 y solo 421 el 4/09: foto tomada a media mañana). Consultar a diario devuelve lo mismo hasta que publiquen otra, por eso el sistema pregunta la fecha de la foto (`dataUpdatedAt` de `/api/views/metadata/v1/c82u-588k`, recordada 1 hora; si falla, no insiste por 5 min) y la **muestra en pantalla** ("Datos del RUES al 04/09/2026"): "consultado hoy" no significa "dato de hoy". Una renovación posterior a la foto aparece como "sin renovar" hasta la siguiente publicación; ante la duda, manda el certificado de la Cámara de Comercio. `GET /api/terceros/:nit` devuelve `ruesFuenteActualizadaAl`.
- **Qué trae** y se guarda en columnas `rues_*` de `terceros`: razón social oficial, estado de la matrícula, último año renovado, CIIU principal, tipo de organización jurídica, representante legal y su **documento** (número y tipo). **No trae** dirección, país ni datos tributarios: esos solo salen de la factura. Se consulta por `numero_identificacion` (el campo mezcla NITs y cédulas).
- **Cliente** (`services/terceros/ruesService.js`): consulta en **lotes de 100** con `$where=numero_identificacion in(...)`, `fetch` nativo y `X-App-Token` opcional (`SOCRATA_APP_TOKEN`). El documento se normaliza a solo dígitos **antes** de armar la consulta (el filtro es texto SoQL: evita inyección) y se descartan los de menos de 5 o más de 15 dígitos y los de solo ceros (el conjunto tiene cientos de miles de filas con `0000000000000`). Nunca lanza excepciones por red: cada documento queda `encontrado`, `no_encontrado` o `error`.
- **Tiempos**: en segundo plano, 10 s por lote y 1 reintento (4xx distintos de 429 no se reintentan); en la búsqueda, 6 s y sin reintento (`OPCIONES_BUSQUEDA`). Medido: ~0,5–0,8 s por consulta y ~19 s para 861 documentos.
- **Varias matrículas por NIT** (sucursales, canceladas, traslados): se elige la **activa y principal**; si no hay, la renovada más recientemente (`elegirRegistro`). "Cancelada por traslado de domicilio" **no** cuenta como cancelada (`clasificarEstado`).

### Columnas nuevas en `terceros`
`tiene_pdf` (¿hay factura? default `true`), `rues_consulta` (`encontrado` | `no_encontrado`), `rues_consultado_at`, `rues_razon_social`, `rues_estado`, `rues_ciiu`, `rues_representante_legal`, `rues_representante_documento`, `rues_representante_tipo_documento`, `rues_organizacion_juridica`, `rues_ultimo_ano_renovado`, más el índice `idx_terceros_rues_consultado_at`. Las columnas originales no se tocan.

### Cuándo se consulta el RUES y qué se escribe
| Situación | Qué ve el usuario | Qué se escribe |
|---|---|---|
| Búsqueda de un tercero **guardado** y el RUES responde | Dato de hoy | Se actualizan **solo** las columnas `rues_*` |
| Búsqueda de un tercero guardado y el RUES **falla** | Lo último guardado + aviso ámbar ("puede estar desactualizado") | Nada |
| Búsqueda de un NIT **no guardado** y el RUES lo tiene | Lo del RUES en vivo, marcado "Solo RUES" | Nada (un tercero sin factura no se guarda: sin dirección ni país no sirve para la exógena) |
| **Subida de PDFs** | Respuesta normal de la subida | En segundo plano, se verifican los terceros nuevos o con más de 30 días sin verificar; si el RUES falla, la subida no se afecta |
| `POST /verificar-rues-lote` (admin/líder) | Conteos | Verifica los pendientes (o todos con `forzar: true`); no permite dos corridas a la vez (409) |

Una búsqueda **sí escribe** (la fecha y los datos del RUES de un tercero que ya existe), aunque el usuario sea de solo lectura.

### Origen de los datos y avisos (`GET /api/terceros/:nit`)
- `origen`: `pdf` (solo factura), `rues` (solo RUES, sin guardar) o `ambos`. `razon_social_oficial` es la del RUES si existe; `razon_social_factura` queda aparte.
- **Avisos** (`calcularAlertas`): `matricula_cancelada` (rojo), `sin_renovar` (ámbar: activa con última renovación de hace **más de un año**, `< año − 1`), `nombre_distinto` (ámbar: el nombre de la factura no comparte **ninguna palabra significativa** con el del RUES, reutilizando `nombresSeParecen`; el orden de apellidos no cuenta), `no_en_rues` (gris). El aviso de nombre solo aparece si el tercero tiene factura.
- **Pantalla** (`ConsultaTerceroPage`): nombre arriba; abajo, a la izquierda los datos de las facturas y a la derecha los del RUES; sin scroll en 1366×768. Muestra también el documento del representante legal (decisión del usuario, aunque el portal del RUES lo muestre como "información no disponible"; no usarlo para trámites sin cotejar con el certificado de la Cámara de Comercio).

### Decisiones y límites conocidos
- **El RUES manda** para razón social, estado y CIIU; **la factura manda** para dirección, país, régimen, teléfono y correo.
- **La exógena sigue usando el nombre de la factura.** Pendiente: comprobar con la DIAN cuál acepta antes de cambiarlo.
- **No se corrió la carga inicial** de los terceros ya existentes (decisión de 2026-10-02): se van verificando solos al buscarlos o al subir facturas suyas. Si algún día se quiere un reporte de terceros con avisos, conviene verificarlos todos antes con `POST /api/terceros/verificar-rues-lote` (login de admin/líder y `forzar`).
- **Posibles choques**: el RUES mezcla NITs y cédulas en el mismo campo, así que un NIT podría coincidir con la cédula de otra persona; no se filtra por tipo de documento (el aviso de nombre lo atrapa en parte). En una prueba con 861 terceros, el **95 %** apareció en el RUES (~40 no; algunos podrían tener el dígito de verificación pegado, sin investigar).
- **No hay** botón para repasar en lote desde la interfaz, ni los avisos aparecen en el resumen de la importación ni en la lista de Terceros.
- La cédula del representante la ve cualquier usuario autenticado.

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
| 013_calculo_borradores | Tabla `calculo_borradores` (módulo DIAN — borradores de cálculo, expiran a los 14 días) — colisión de número con la anterior, mismo patrón que 018 más abajo |
| 014 | `tasks.start_time` (existe en BD, revertida del código — no usada) |
| 015 | Tabla `push_subscriptions` (Web Push / PWA) |
| 016 | `tasks.reminder_sent_at TIMESTAMPTZ` |
| 017 | Elimina etiquetas de muestra del seed |
| 018_fondo_pagos_autorizado | `fondo_pagos.autorizado BOOLEAN DEFAULT false` |
| 018_group_leaders | `group_members.is_leader BOOLEAN` + índice parcial `WHERE is_leader = true` (colisión de número con la anterior — ambas archivos distintos, mismo prefijo) |
| 019_fondo_pagos_mes_actual | Tabla singleton `fondo_pagos_mes_actual` (mes habilitado, ver arriba) |
| 020_task_assignees | Tabla `task_assignees` (asignados múltiples por tarea) |
| 021_subtask_completed_by | `task_subtasks.completed_by` / `completed_at` |
| 022_task_delete_requests | Tabla `task_delete_requests` (solicitud de borrado de tarea, para roles sin permiso de borrado directo) |
| 023_fondo_impuestos | `fondo_impuestos` (catálogo) + `fondo_impuestos_items` (registro por empresa/impuesto/mes) |
| 024_fondo_proceso_grupos | Tabla `fondo_proceso_grupos` + `fondo_procesos.grupo_id` (agrupa procesos para derivar mp2/mp5) |
| 025_fondo_procesos_vigencia | `fondo_procesos`: rango de vigencia (`vigente_desde/hasta_anio/mes`) |
| 026_fondo_checklist_enviado | `fondo_checklist_meses`: `enviado`, `enviado_at`, `confirmed_at` |
| 027_fondo_procesos_macroproceso_link | `fondo_procesos.macroproceso_id` (vincula proceso → mpX por id, no por nombre) |
| 028_fondo_grupos_macroproceso_link | `fondo_proceso_grupos.macroproceso_id` (mismo vínculo, a nivel de grupo) |
| 029_personal_tasks | Tablas `personal_tasks` + `personal_task_items` (tareas personales por usuario) |
| 030_personal_notes | Tabla `personal_notes` (notas personales por usuario) |
| 031_fondo_checklist_confirmado_por_grupo | `fondo_checklist_meses`: separa confirmación/envío en `_contabilidad` vs `_nomina` |
| 032_fondo_produccion_ventas_link | `fondo_procesos`: vínculo para mp7 (Producción y ventas) |
| 033_task_custom_reminder | `tasks.custom_reminder_at` / `custom_reminder_sent_at` |
| 034_personal_task_reminder | `personal_tasks.reminder_at` / `reminder_sent_at` |
| 035_remove_task_custom_reminder | Revierte la 033 (columnas eliminadas — feature descartada) |
| 036_calculo_borradores_archivo_original | `calculo_borradores.archivo_original BYTEA` (guarda el Excel original subido, módulo DIAN) |
| 037_fondo_empresas_codigo_siigo | `fondo_empresas.codigo_siigo VARCHAR(20)` |
| 038_empresas_externas | Tablas `ext_empresas`, `ext_procesos` (+ seed de 11 procesos y ~34 empresas), `ext_checklist_meses`, `ext_checklist_items` |
| 039_empresas_externas_responsables | Asigna `ext_empresas.responsable_id` inicial por nombre de usuario (`ILIKE`), a partir de `docs/EMPRESAS.xlsx` |
| 040_empresas_externas_contador | `ext_empresas.contador VARCHAR(255)` |
| 041_exogenas_borradores | Tabla `exogenas_borradores` (borradores de los formatos de exógena, con el Excel original en BYTEA; expiran a los 14 días) |
| 042_terceros | Tabla `terceros` (NIT, razón social, dirección, municipio y departamento con códigos DANE) extraída de PDFs de factura DIAN |
| 043_terceros_datos_fiscales | `terceros`: régimen fiscal, responsabilidad tributaria, teléfono y correo |
| 044_terceros_pais | `terceros`: país (texto + código DIAN de 3 dígitos), necesario para el 1001 / 1007 |
| 045_nomina_electronica | `ne_empresas` + `ne_meses` (estado mensual por empresa), con enlaces opcionales a Fondo Emprender y Externas |
| 046_nomina_electronica_enlaces | Enlaces adicionales de Nómina Electrónica confirmados con el usuario |
| 047_nomina_electronica_origen | `ne_empresas.origen` (agrupación Maritza / Diana / Externas) |
| 048_nomina_electronica_autorizada | `ne_meses.autorizada` (separa "ya se puede presentar" del estado) |
| 049_nomina_electronica_responsables_fondo | Responsable para las empresas de NE enlazadas con Fondo Emprender |
| 050_nomina_electronica_plazo | Plazo de presentación único y editable a mano (luego reemplazado por la 061) |
| 051_contabilidad_empresas | `contab_empresas`, `contab_periodos`, `contab_documentos`; columna nullable de empresa en `calculo_borradores` |
| 052_contabilidad_empresas_nit | Completa el NIT de las 52 empresas sembradas en la 051 |
| 053_empresas_maestro | Tabla maestra `empresas` + `empresa_id` nullable en las 4 tablas de módulo (con *backfill*) |
| 054_empresas_maestro_nit | NIT en el directorio maestro |
| 055_empresas_maestro_dian_token | `tipo_contribuyente` y `cedula_representante` (datos para generar el token DIAN) |
| 056_empresas_duplicados_descartados | Pares de "posibles duplicados" marcados como "No es duplicado" |
| 057_ext_checklist_resultado | Empresas Externas: Utilidad/Pérdida mensual por empresa |
| 058_ext_proceso_grupos | Empresas Externas: grupos de procesos (columnas agrupadas por color) |
| 059_empresa_vigencia_hasta | `vigente_hasta_anio/mes` en `fondo_empresas` y `ne_empresas` |
| 060_empresa_vigencia_hasta_ext_contab | `vigente_hasta_anio/mes` en `ext_empresas` y `contab_empresas` |
| 061_ne_plazo_mes | Fecha límite de Nómina Electrónica **por mes** (`ne_plazo_mes`), reemplaza al singleton `ne_plazo` |
| 062_empresas_natural_documento_en_nit | Directorio: la cédula de una persona natural pasa a `empresas.nit` (corrige filas con NIT vacío) |
| 063_terceros_rues | `terceros`: `tiene_pdf` y las columnas `rues_*` de la verificación contra el RUES (ver "Módulo Terceros y RUES") |
| 064_empresas_rues | `empresas`: `rues_consulta`, `rues_consultado_at`, `rues_estado`, `rues_ultimo_ano_renovado`, `rues_fecha_renovacion` — estado de la matrícula mercantil de los propios clientes (ver "Directorio maestro de empresas y token DIAN") |

### Tablas principales (fuera de las evidentes por nombre)

```
users                     → bcrypt, role, permissions JSONB (incluye modulos.fondoEmprender.*)
tasks                     → is_recurring, recurrence JSONB, template_id, due_time, reminder_sent_at
task_assignees            → asignados múltiples por tarea (además del creador)
task_delete_requests      → solicitudes de borrado pendientes de aprobación
group_members             → is_leader (liderazgo por grupo, no solo global)
task_fondo_links          → empresa_id, macro_id ('mp1'..'mp7'), link_type, proceso_id, anio, mes
fondo_detalle_macroprocesos → empresa_id, macroproceso_id, anio, mes, estado, responsable_id, nota
fondo_proceso_grupos      → agrupa procesos del checklist mensual (NOMINA, CONTABILIDAD, …), vinculado a mpX
fondo_pagos               → empresa_id, anio, mes, estado, autorizado, monto, nota, fechas
fondo_pagos_mes_actual    → singleton (id=1), mes habilitado global
fondo_impuestos_items     → empresa_id, impuesto_id, anio, mes, estado, nota
personal_tasks            → tareas personales por usuario (+ personal_task_items, sub-items)
personal_notes            → notas personales por usuario, contenido enriquecido
calculo_borradores        → borradores del wizard DIAN, datos JSONB + archivo_original BYTEA, expiran a 14 días
ext_empresas              → catálogo Empresas Externas: name, responsable_id, contador, activa
ext_procesos              → catálogo de 11 procesos del checklist de Empresas Externas
ext_checklist_items       → estado por empresa/proceso/mes (pending|in_progress|done|na)
terceros                  → una fila por NIT: datos de factura (dirección, DANE, país, régimen…) + columnas rues_* (verificación RUES) + tiene_pdf
empresas                  → directorio maestro: identidad (nit, tipo_contribuyente, cedula_representante); las 4 tablas de módulo apuntan con empresa_id nullable; más columnas rues_* con el estado de la matrícula mercantil (mig. 064)
ne_empresas / ne_meses    → Nómina Electrónica: catálogo y estado mensual (pendiente | presentada | no_aplica = "En espera"); ne_plazo_mes = fecha límite por mes
contab_empresas / contab_periodos / contab_documentos → Contabilidad por empresa: catálogo, meses guardados y una fila por documento (CUFE) con retención/IVA/concepto
exogenas_borradores       → borradores de exógenas (Excel original BYTEA, expiran a 14 días); calculo_borradores hace lo mismo para el wizard DIAN
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
- Backup automático: `scripts/backup.sh` (BD + `.env` + certs, comprimido, rotación local de 7 días) vía cron diario a las 6 PM (`scripts/setup-cron.sh`). Además **sube una copia a Google Drive** (`rclone`, remoto `gdrive:GestconBackups`, en segundo plano para no retrasar el backup) y borra allá lo de más de 30 días (`GDRIVE_KEEP_DAYS`). Si `rclone` no está instalado, esa parte se omite sin fallar.
- **Cómo se despliega**: en el servidor, el alias `deploy` (definido en `~/.bashrc`, **no versionado**; ver `docs/DEPLOY.md` §6 y §10) hace `backup.sh` → `git pull` → `docker compose build` → `docker compose up -d`. El servicio `migrate` corre antes que el backend, así que las migraciones nuevas se aplican solas. **Regla aprendida**: el código nuevo no debe correr contra una base sin su migración (un día se importó con el código nuevo y una base sin la migración 063 y todas las filas fallaron con "no existe la columna tiene_pdf").
- **Contenedor del backend**: imagen `node:20-slim` (no Alpine) con **Google Chrome estable + Xvfb** para la generación del token DIAN. En `docker-compose.yml` el backend monta el perfil persistente de Chrome (`${HOME}/dian-perfil-real-chrome:/app/dian-perfil`) y define `DIAN_CHROME_PROFILE_DIR` y `DIAN_TOKEN_MAX_CONCURRENTE`.
- **Salida a internet del backend**: necesaria para el RUES (`datos.gov.co`) y para la DIAN; no se abre ningún puerto nuevo.
- **n8n** corre aparte, directo en el servidor y fuera de `docker-compose.yml` (ver `docs/N8N_SETUP.md`).

### Variables de entorno

Root `.env` (para `docker-compose.yml`): `PORT`, `CLIENT_URL`, `DB_PORT/NAME/USER/PASSWORD`, `DB_TEST_NAME`, `JWT_SECRET`, `JWT_EXPIRES_IN`, `JWT_REFRESH_SECRET`, `JWT_REFRESH_EXPIRES_IN`, `N8N_ENCRYPTION_KEY`, y opcionalmente `SOCRATA_APP_TOKEN` (app token gratuito de datos.gov.co para consultar el RUES con cupo propio; funciona sin él — el compose lo toma del `.env` raíz con `env_file`).

`backend/.env` (modo Node local): además de lo anterior, `NODE_ENV`, `DB_HOST`, `DATABASE_URL` (opcional, tiene prioridad), `SMTP_*`, `SHOW_RESET_TOKEN` (**nunca `true` en producción**), `SENDGRID_API_KEY`/`FROM_EMAIL` (opcional), VAPID keys para Web Push, `LOG_LEVEL`.

---

## Tests

```
backend/tests/
├── unit/         → 37 suites / 606 tests: authController, taskController, groupController,
│                   statsController, middleware, routes, helpers, validators, groupAccess,
│                   fondo* (Checklist, Empresas, Procesos, ProcesoGrupos),
│                   personalTask/personalNote, ext* (Empresas, Checklist),
│                   dianController, contabEmpresas/contabConsolidado, empresasMaestro + empresasMaestroMatricula + empresasRuesService,
│                   exogenasController + exogenasFormato1001/1005/1006/1007 + exogenasIndex,
│                   terceros (extracción de PDF y Consulta Tercero), tercerosRues, ruesService,
│                   nePlazoReminderService, nominaElectronicaAccess, borradorCleanupService,
│                   nombresSeParecen
├── integration/  → auth.test.js, tasks.test.js (necesitan una BD Postgres de pruebas
│                   real — DB_TEST_NAME/`taskflow_test` — y se cuelgan si no existe,
│                   en vez de saltarse limpiamente)
└── e2e/          → vacío (el E2E real vive en /cypress, no aquí)

cypress/e2e/
├── 01-login.cy.js        → 6 tests
├── 02-tasks.cy.js        → 5 tests
└── 03-permissions.cy.js  → 8 tests (viewer/member/admin)
```

Cobertura backend (medida el 2026-10-02 con `jest --coverage`): **76,8 % líneas, 74,6 % funciones, 76,0 % statements, 67,1 % branches** (umbral configurado: 70 % líneas y funciones). Quedan **excluidos del cálculo**, con el motivo en `backend/jest.config.js`: `index.js`, `fondo*` y `ext*` (controllers/rutas pesados en SQL, con tests propios), `pushService`, `recurringTaskService`, `reminderService`, `dianController` (el camino de exportación usa un `import()` ESM que Jest no puede interceptar) y `dianTokenService` (Chrome real contra la DIAN).

**Huecos conocidos de tests**: no hay tests de los controladores de Nómina Electrónica (`neEmpresas`, `neMeses`, `nePlazo`), del frontend (React), ni del permiso admin/líder de `POST /api/terceros/verificar-rues-lote`. Los tests de Terceros y del RUES **nunca** consultan el RUES real (se mockea `ruesService`).

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

**Estado y decisiones por módulo** (documentos de continuidad: léelos antes de tocar ese módulo; resumen lo ya acordado para no reabrirlo sin evidencia nueva):
- `ESTADO_CONTABILIDAD_EMPRESAS.md` — Contabilidad por empresa, clasificación IVA/Concepto y Consolidado.
- `ESTADO_EXOGENAS_1001_1007.md` — Exógenas 1001 y 1007: qué genera cada una y qué queda manual.
- `ESTADO_EMPRESAS_DIRECTORIO.md` — directorio maestro de empresas y generación del token DIAN.

**Referencia técnica:**
- `modulo-dian.md` — descripción general del wizard de Contabilidad DIAN.
- `dian-tipos-documento.md` — catálogo DIAN de tipos de documento y cómo se trata cada uno.
- `nit-vs-cedula-rangos.md` — por qué `inferirTipoDocumento` usa el conteo de dígitos (con fuentes).
- `arqExogena.md` — contexto técnico del formato 1005 (cargador TOKEN → SIIGO).
- `PLANEACION_EXTRACCION_DATOS_FACTURAS.md` — planeación original de la extracción de datos de facturas (hoy implementada en el módulo Terceros).
- `ARQUITECTURA_DESCARGA_FACTURAS.md` — arquitectura de **GestorDocs**, la aplicación de escritorio que descarga los PDFs de la DIAN. Vive **fuera de este repo** (repo aparte); acá solo queda su documento técnico.

**Operación:**
- `DEPLOY.md` — guía de despliegue al servidor (incluye el alias `deploy` y la configuración manual no versionada, §6 y §10).
- `SETUP_MACOS.md` — entorno de desarrollo en macOS.
- `N8N_SETUP.md` y `WHATSAPP_BUSINESS_N8N.md` — automatizaciones con n8n (el plan de WhatsApp sigue **pendiente de implementar**).

Otros archivos de `docs/` son material de apoyo (`Entrega.pdf`: guía de marca; `EXOGENA 2025 GUIA.xlsx`: guía de formatos). Los changelogs por sesión, `ESTADO_PROYECTO.md`, `PROYECTO.md`, `TAREAS_RECURRENTES.md` y `PROPUESTA_MODULO_CONTABILIDAD_DIAN.md` que mencionaban versiones anteriores de este documento **ya no existen** en el repo: para el "cuándo y por qué" de un cambio, usa `git log` y los `ESTADO_*.md` de arriba.

Este documento (`ARQUITECTURA.md`) es el resumen de referencia rápida de todo el sistema.
