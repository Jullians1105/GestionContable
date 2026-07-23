# Gestcon - Contexto del Proyecto

## Descripcion General

**Gestcon** es una aplicacion web de gestion de tareas para equipos empresariales de hasta 25 personas. Es un proyecto personal desarrollado completamente en el lado del cliente, sin backend ni base de datos externa. Toda la persistencia ocurre en el `localStorage` del navegador.

El proyecto fue concebido como un MVP funcional (Fase 1) con miras a evolucionar hacia una solucion con autenticacion, backend real y reportes avanzados en fases futuras.

---

## Estado Actual: Fase 1 - MVP Completado

### Lo que esta implementado

| Funcionalidad | Descripcion |
|---|---|
| CRUD de Tareas | Crear, leer, editar y eliminar tareas con validaciones |
| CRUD de Miembros | Gestionar miembros del equipo con roles diferenciados |
| Sistema de Estados | Pendiente / En Progreso / Completada |
| Sistema de Prioridades | Alta / Media / Baja con colores distinctivos |
| Asignacion de Tareas | Vincular tareas a miembros del equipo |
| Fechas Limite | Con indicadores visuales de vencida / proxima a vencer |
| Busqueda Global | Desde el header, redirige a /tasks con query param |
| Filtros Combinables | Por estado, prioridad, miembro asignado y texto libre |
| Paginacion | 9 tareas por pagina |
| Dashboard | Graficos de distribucion por estado (pie) y prioridad (barras) |
| Seccion Urgentes | Tareas proximas a vencer en el dashboard |
| Persistencia | localStorage automatico con datos de ejemplo precargados |
| Export JSON | Descarga un backup de todos los datos |
| Reset de datos | Restaura los datos de ejemplo originales |
| Diseno responsivo | Mobile, tablet y desktop |

---

## Stack Tecnologico

```
Frontend:     React 18 + Vite 5
Estilos:      Tailwind CSS 3
Routing:      React Router v6
Graficos:     Recharts 2
Fechas:       date-fns 3
Estado:       Context API (sin Redux ni Zustand)
Persistencia: localStorage (sin backend)
Fuentes:      Inter (Google Fonts)
Iconos:       Material Symbols Outlined (Google Fonts)
```

### Comandos del proyecto

```bash
npm run dev      # Servidor de desarrollo en localhost:5173
npm run build    # Build de produccion en /dist
npm run preview  # Previsualizar el build de produccion
```

---

## Arquitectura del Proyecto

```
src/
├── components/
│   ├── Dashboard.jsx       # Graficos Recharts: pie (estados) + barras (prioridades)
│   ├── Header.jsx          # Barra top fija: busqueda global, notificaciones, avatar
│   ├── Sidebar.jsx         # Nav lateral fija 250px: logo Gestcon + Material Icons
│   ├── StatsCard.jsx       # Tarjeta de metrica con borde de color e icono
│   ├── TaskCard.jsx        # Tarjeta individual de tarea con badges y selector de estado
│   ├── TaskFilters.jsx     # Panel de filtros: texto, estado, prioridad, asignado
│   ├── TaskForm.jsx        # Formulario crear/editar tarea (titulo, desc, prioridad, estado, fecha)
│   ├── TaskList.jsx        # Lista paginada con toolbar y modal integrado
│   ├── TaskModal.jsx       # Wrapper modal para TaskForm
│   ├── TeamForm.jsx        # Formulario crear/editar miembro (nombre, email, rol)
│   └── TeamManager.jsx     # Grid de tarjetas de miembro con avatar, stats y acciones
├── context/
│   ├── TaskContext.jsx     # Estado global de tareas + CRUD + getTasksByMember
│   └── TeamContext.jsx     # Estado global de miembros + CRUD + getMemberById
├── hooks/
│   ├── useLocalStorage.js  # Hook generico: useState sincronizado con localStorage
│   ├── useTasks.js         # Consume TaskContext
│   └── useTeam.js          # Consume TeamContext
├── pages/
│   ├── DashboardPage.jsx   # Ruta /
│   ├── TasksPage.jsx       # Ruta /tasks (acepta ?search= desde el header)
│   ├── TeamPage.jsx        # Ruta /team
│   └── SettingsPage.jsx    # Ruta /settings: info app, export JSON, reset, paleta
└── utils/
    ├── helpers.js          # Constantes, formatDate, isDueDateOverdue, isDueDateSoon,
    │                       # getInitials, getAvatarColor, PRIORITY_LABELS, STATUS_LABELS, ROLE_LABELS
    ├── sampleData.js       # 5 miembros + 8 tareas de ejemplo para el primer arranque
    ├── storage.js          # Wrapper de localStorage con fallback a sampleData
    └── validators.js       # validateTask() y validateMember() con mensajes en espanol
```

---

## Modelos de Datos

### Tarea (Task)

```js
{
  id: "task-{timestamp}-{random}",
  title: string,           // Requerido, max 255 chars
  description: string,     // Opcional
  status: "pending" | "in_progress" | "completed",
  priority: "high" | "medium" | "low",
  assignedTo: string,      // id del miembro o "" si sin asignar
  dueDate: "YYYY-MM-DD",  // Opcional
  createdAt: string,       // ISO 8601
  updatedAt: string,       // ISO 8601
}
```

### Miembro del Equipo (TeamMember)

```js
{
  id: "user-{timestamp}-{random}",
  name: string,            // Requerido, max 100 chars
  email: string,           // Requerido, formato valido
  role: "admin" | "leader" | "member" | "viewer",
  createdAt: string,       // ISO 8601
}
```

### Claves en localStorage

```
tasks          → array JSON de tareas
team_members   → array JSON de miembros
```

Si alguna clave no existe al arrancar, se cargan los datos de `sampleData.js` automaticamente.

---

## Design System (Stitch - Gestcon)

El diseno fue definido en Stitch y luego implementado en codigo. El sistema de diseno es consistente en todas las vistas.

### Colores

| Token | Hex | Uso |
|---|---|---|
| Primary | `#004ac6` | Botones principales, links, focus ring |
| Primary container | `#2563eb` | Hover de botones primarios |
| Surface | `#ffffff` | Fondo de cards y modales |
| Background | `#f3f4f6` | Fondo general de la app |
| Surface container | `#edeef0` | Fondo de inputs, hovers suaves |
| On-surface | `#191c1e` | Texto principal |
| On-surface-variant | `#434655` | Texto secundario, labels |
| Outline-variant | `#c3c6d7` | Bordes de cards, inputs, divisores |
| Success | `#10B981` | Prioridad baja, completadas, estado activo |
| Warning | `#FBBF24` | Prioridad media |
| Error / Danger | `#EF4444` | Prioridad alta, acciones destructivas |
| Error container | `#ffdad6` | Fondo badges de alta prioridad |
| Info | `#F97316` | Naranja informativo |

### Tipografia

| Clase | Tamano | Peso | Uso |
|---|---|---|---|
| headline-xl | 32px | 700 | Metricas grandes en StatsCard |
| headline-lg | 24px | 700 | Titulos de pagina |
| headline-md | 18px | 700 | Titulos de seccion/card |
| body-md | 14px | 400 | Texto de contenido |
| label-sm-bold | 12px | 600 | Labels, badges, botones |
| label-sm | 12px | 400 | Texto secundario, subtitulos |

### Espaciado y Geometria

- Sidebar: 250px fija
- Header: 64px fija
- Bordes: `rounded-lg` (8px) para inputs/botones, `rounded-xl` (12px) para cards y modales
- Altura de elementos interactivos (inputs, botones): 40px (`h-10`)
- Padding de cards: 24px (`p-6`)
- Gap entre cards: 16-24px

---

## Flujo de Navegacion

```
/ (Dashboard)
  ├── Resumen de metricas (4 StatsCards)
  ├── Grafico de distribucion por estado (Recharts PieChart)
  ├── Grafico de distribucion por prioridad (Recharts BarChart)
  └── Lista de tareas proximas a vencer → enlace a /tasks

/tasks
  ├── Toolbar: contador + boton "Nueva Tarea"
  ├── Panel de filtros (estado, prioridad, asignado, texto)
  ├── Grid de TaskCards (9 por pagina)
  ├── Paginacion
  └── Modal crear/editar tarea

/team
  ├── Header con contador + boton "Agregar Miembro"
  ├── Grid de tarjetas de miembro (avatar, rol, tareas asignadas)
  └── Modal crear/editar miembro

/settings
  ├── Informacion de la app (nombre, version, stack)
  ├── Gestion de datos (export JSON, reset a ejemplo)
  └── Paleta de colores del design system
```

---

## Decisiones Tecnicas Relevantes

| Decision | Razon |
|---|---|
| Context API en lugar de Redux/Zustand | Suficiente para equipos pequenos; sin dependencias extra |
| `useMemo` para derivar estado, no `useEffect` | Convencion del proyecto para evitar renders innecesarios |
| localStorage como unica persistencia | MVP sin backend; facil de reemplazar con una API en Fase 2 |
| Sin comentarios en codigo | Nombres de funciones/variables descriptivos hacen el codigo autoexplicativo |
| Tailwind con tokens inline (`#004ac6`) | El design system de Stitch usa tokens no estandar de Tailwind |
| Material Symbols Outlined via Google Fonts | Consistencia con el design system de Stitch |

---

## Proxima Fase (Fase 2) - Pendiente

Lo que esta planeado pero NO esta implementado:

- Autenticacion de usuarios (login/registro)
- Backend real (API REST o GraphQL)
- Base de datos persistente (no localStorage)
- Grupos de trabajo
- Vista Kanban
- Vista Calendario
- Generador de reportes PDF
- Tablero de tareas expandido con detalles completos
- Notificaciones en tiempo real

---

## Historial de Desarrollo

### Commit inicial
- Aplicacion completa de gestion de tareas con React 18, Vite y Tailwind CSS
- CRUD de tareas y miembros, sistema de prioridades y estados, asignacion, fechas limite
- Dashboard con graficos Recharts, busqueda global, filtros, paginacion
- Persistencia localStorage con datos de ejemplo precargados

### Actualizacion de UI (Stitch Design System)
- Implementacion del design system "Gestcon" basado en prototipos Stitch
- Renombrado de la aplicacion: "Gestor de Tareas" → "Gestcon"
- Layout cambiado a sidebar fijo (250px) + header fijo (64px)
- Sustitucion de emojis e iconos SVG por Material Symbols Outlined
- Fuente cambiada a Inter 400/600/700
- Sistema de color completo con tokens de Stitch (primario #004ac6, surfaces, outlines)
- TeamManager rediseñado: tabla → grid de tarjetas de perfil con avatar, rol y stats
- StatsCard rediseñado: borde izquierdo de color, icono Material, metrica 32px bold
- Formularios y modales actualizados con h-10 uniform, labels 12px, focus ring primario
- Filtros de tareas reorganizados en panel blanco con labels por columna

---

*Proyecto personal desarrollado con Claude Code (Anthropic). El design system fue definido visualmente en Stitch y luego implementado en React + Tailwind.*
