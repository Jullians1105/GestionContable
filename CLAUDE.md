# TaskFlow Pro - FASE 2

## Descripción del Proyecto
Aplicación web de gestión de tareas para equipos de hasta 25 personas. Construida con React 18, Vite, Tailwind CSS y localStorage como persistencia. FASE 2 completada: autenticación, grupos, Kanban, Calendario, Reportes, Subtareas, Comentarios, Tags, Notificaciones, Tema oscuro.

## Stack Tecnológico
- **Frontend:** React 18 + Vite 5
- **Estilos:** Tailwind CSS 3 (darkMode: 'class')
- **Routing:** React Router v6
- **Gráficos:** Recharts 2
- **Fechas:** date-fns 3
- **Estado global:** Context API
- **Persistencia:** localStorage
- **Drag & Drop:** @dnd-kit/core, @dnd-kit/sortable
- **Exportación:** jsPDF, xlsx

## Comandos
```bash
npm run dev      # Servidor de desarrollo (localhost:5173)
npm run build    # Build de producción
npm run preview  # Previsualizar build
```

## Estructura del Proyecto
```
src/
├── components/
│   ├── Auth/
│   │   └── ProtectedRoute.jsx     # Guard de rutas por rol
│   ├── Comments/
│   │   └── CommentSection.jsx     # Comentarios en tareas (editar/eliminar)
│   ├── Groups/
│   │   ├── GroupForm.jsx          # Modal crear/editar grupo
│   │   └── GroupSelector.jsx      # Dropdown selector en Header
│   ├── Notifications/
│   │   └── NotificationBell.jsx   # Bell icon con panel dropdown
│   ├── Subtasks/
│   │   └── SubtaskList.jsx        # Lista de subtareas con barra de progreso
│   ├── Tags/
│   │   └── TagSelector.jsx        # Selector de etiquetas con crear nueva
│   ├── Dashboard.jsx
│   ├── Header.jsx                 # Búsqueda, GroupSelector, toggle tema, NotificationBell, user menu
│   ├── Sidebar.jsx                # Nav lateral con todas las rutas (filtradas por rol)
│   ├── StatsCard.jsx
│   ├── TaskCard.jsx               # Muestra tags, subtask progress, contador comentarios
│   ├── TaskFilters.jsx            # Filtros: texto, estado, prioridad, asignado, grupo, tag
│   ├── TaskForm.jsx               # Formulario tarea con grupo y tags
│   ├── TaskList.jsx               # Grid paginado con modal confirmación eliminación
│   ├── TaskModal.jsx              # Modal con tabs: Detalles / Subtareas / Comentarios
│   ├── TeamForm.jsx
│   ├── TeamManager.jsx
│   └── Toast.jsx                  # Toasts flotantes (success/error/warning/info)
├── context/
│   ├── AuthContext.jsx            # user, token, login(), logout(), register(), canEdit(), isAdmin()
│   ├── GroupContext.jsx           # groups, currentGroupId, CRUD grupos, add/removeMember
│   ├── NotificationContext.jsx    # notifications, unreadCount, addNotification, markAsRead
│   ├── TagContext.jsx             # tags, createTag, updateTag, deleteTag
│   ├── TaskContext.jsx            # tasks + CRUD + subtask ops + comment ops
│   ├── TeamContext.jsx            # members + CRUD
│   ├── ThemeContext.jsx           # theme ('light'|'dark'), toggleTheme()
│   └── ToastContext.jsx           # toasts, addToast(message, type), removeToast
├── hooks/
│   ├── useTasks.js                # Consume TaskContext
│   ├── useTeam.js                 # Consume TeamContext
│   └── useLocalStorage.js
├── pages/
│   ├── DashboardPage.jsx          # Ruta /
│   ├── TasksPage.jsx              # Ruta /tasks (acepta ?search=)
│   ├── TeamPage.jsx               # Ruta /team
│   ├── GroupsPage.jsx             # Ruta /groups (admin/leader)
│   ├── KanbanPage.jsx             # Ruta /kanban — drag-and-drop @dnd-kit
│   ├── CalendarPage.jsx           # Ruta /calendar — grid mensual + sidebar
│   ├── ReportsPage.jsx            # Ruta /reports — filtros + tabla + gráfico + export PDF/Excel
│   ├── NotificationsPage.jsx      # Ruta /notifications
│   ├── SettingsPage.jsx           # Ruta /settings — perfil, tema, export, reset
│   ├── LoginPage.jsx              # Ruta pública /login
│   └── RegisterPage.jsx           # Ruta pública /register
└── utils/
    ├── helpers.js                 # generateId, formatDate, isDueDate*, getInitials, LABELS
    ├── sampleData.js              # 5 miembros + 8 tareas con nuevos campos
    ├── storage.js                 # Wrapper localStorage — todas las keys de FASE 2
    └── validators.js              # validateTask(), validateMember()
```

## Modelos de Datos

### Tarea (Task)
```js
{
  id: string,
  title: string,
  description: string,
  status: 'pending' | 'in_progress' | 'completed',
  priority: 'high' | 'medium' | 'low',
  assignedTo: string,
  dueDate: string,
  groupId: string,           // id del grupo o null
  tagIds: string[],          // ids de etiquetas
  subtasks: [{ id, title, completed, createdAt }],
  comments: [{ id, authorId, text, mentions, createdAt, updatedAt }],
  createdAt: string,
  updatedAt: string,
}
```

### Miembro (TeamMember)
```js
{
  id: string,
  name: string,
  email: string,
  password: string,          // plaintext (FASE 3 tendrá hash)
  role: 'admin' | 'leader' | 'member' | 'viewer',
  groupIds: string[],
  preferences: { theme: 'light'|'dark', notifications: boolean },
  createdAt: string,
}
```

### Grupo (Group)
```js
{
  id: string,
  name: string,
  description: string,
  leaderId: string,
  memberIds: string[],
  taskIds: string[],
  color: string,
  createdAt: string,
  updatedAt: string,
}
```

## Persistencia localStorage — Keys
```
tasks              → tareas
team_members       → miembros
groups             → grupos de trabajo
tags               → etiquetas
notifications      → notificaciones
saved_filters      → filtros guardados (pendiente implementar UI)
theme              → 'light' | 'dark'
auth_user          → usuario logueado (JSON)
auth_token         → token de sesión
```

## Paleta de Colores
```
Primary:           #004ac6
Primary container: #2563eb
Success:           #10B981
Warning:           #FBBF24
Error/Danger:      #EF4444
Info:              #F97316
Background:        #f3f4f6
Surface:           #ffffff
On-surface:        #191c1e
On-surface-variant:#434655
Outline-variant:   #c3c6d7
```

## Usuarios de Prueba (sampleData)
| Email | Password | Rol |
|---|---|---|
| maria@empresa.com | admin123 | admin |
| carlos@empresa.com | leader123 | leader |
| ana@empresa.com | member123 | member |
| pedro@empresa.com | member123 | member |
| laura@empresa.com | viewer123 | viewer |

## Funcionalidades Implementadas

### FASE 1 (completada)
- [x] CRUD tareas y miembros, estados, prioridades, asignación, fechas límite
- [x] Búsqueda global, filtros combinables, paginación
- [x] Dashboard con gráficos Recharts, export JSON, reset datos

### FASE 2 (completada — commit 650bd28)
- [x] AuthContext + LoginPage + RegisterPage + ProtectedRoute
- [x] Control por rol (admin/leader/member/viewer)
- [x] GroupContext + GroupsPage + GroupForm + GroupSelector en Header
- [x] TagContext + TagSelector (pills de color en tareas)
- [x] NotificationContext + NotificationBell + NotificationsPage
- [x] ThemeContext + modo oscuro (toggle en Header y Settings)
- [x] ToastContext + Toast flotantes en todas las acciones
- [x] KanbanPage con drag-and-drop @dnd-kit (3 columnas por estado)
- [x] CalendarPage con grid mensual, navegación y sidebar del día
- [x] ReportsPage: 3 tipos de reporte, filtros, gráficos, exportar PDF/Excel
- [x] SubtaskList con barra de progreso (tab en TaskModal)
- [x] CommentSection con editar/eliminar propios (tab en TaskModal)
- [x] TaskModal con tabs: Detalles / Subtareas / Comentarios
- [x] TaskFilters extendido: grupo y etiqueta
- [x] TaskCard muestra tags, progreso subtareas, contador comentarios
- [x] Sidebar con todas las rutas (filtradas por rol)

### Pendiente (FASE 2 restante)
- [ ] Vistas guardadas de filtros (UI — el storage ya está listo)
- [ ] Notificaciones automáticas al asignar tarea o comentar
- [ ] Menciones @usuario en comentarios con autocomplete
- [ ] Testing responsivo en Kanban y Calendar

## Estado del Proyecto
- **Fase actual:** FASE 2 completada
- **Commit FASE 2:** `650bd28`
- **Próxima fase:** FASE 3 (backend real, API REST, base de datos)

## Convenciones de Código
- Componentes: PascalCase
- Hooks y utils: camelCase
- Sin comentarios en código (nombres de funciones son descriptivos)
- Tailwind CSS para todos los estilos (tokens inline con hex del design system)
- No usar `useEffect` para derivar estado (usar `useMemo`)
- Contextos exportan su propio hook (ej: `useAuth()`, `useGroups()`)
