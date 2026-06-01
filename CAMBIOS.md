# TaskFlow Pro - Registro de Cambios

Historial de todas las funcionalidades y mejoras implementadas en sesiones de desarrollo con Claude Code.

---

## Fase 2 — Funcionalidades Avanzadas

### Sistema de Autenticacion con Roles

- Login real con email y password validados contra `localStorage`
- Cinco roles implementados: `admin`, `leader`, `member`, `viewer`
- `AuthContext` expone `isAdmin()`, `isLeader()`, `canEdit()` para control de acceso
- Perfiles de usuario editables desde Configuracion (nombre, email)
- Sesion persistida en `localStorage` y reestablecida al recargar

**Usuarios de prueba:**

| Email | Password | Rol |
|---|---|---|
| maria@empresa.com | admin123 | admin |
| carlos@empresa.com | leader123 | leader |
| ana@empresa.com | member123 | member |
| pedro@empresa.com | member123 | member |
| laura@empresa.com | viewer123 | viewer |

---

### Sistema de Notificaciones

**Arquitectura:**
- `NotificationContext` con hook `useNotifications()` — almacena notificaciones por usuario en clave `notifications_<userId>`
- `storage.pushNotificationToUser(userId, notif)` escribe directo a la clave del destinatario sin que este este logueado
- Polling cada 3 segundos para detectar notificaciones de otros usuarios en la misma sesion

**Tipos de notificacion generados automaticamente:**
- `task_assigned` — cuando se asigna una tarea a un miembro
- `task_updated` — cuando se modifica una tarea asignada
- `comment_added` — cuando alguien comenta en una tarea relevante

**Campo `extra` en notificaciones:**
- `extra: { commentId }` — permite navegar directamente al comentario especifico
- Se propaga desde `TaskContext.addComment()` a todos los destinatarios

**Componentes:**
- `NotificationBell.jsx` — icono campana en Header con badge contador de no leidas
- `NotificationsPage.jsx` — pagina `/notifications` con listado completo y acciones masivas

---

### Navegacion Directa desde Notificaciones

Al hacer clic en una notificacion, la app navega directamente al elemento referenciado:

1. **Notificacion de tarea** → abre `/tasks?openTask=<taskId>` y muestra `TaskDetailModal`
2. **Notificacion de comentario** → abre `/tasks?openTask=<taskId>&comment=<commentId>`, abre el modal y hace scroll hasta el comentario con resaltado temporal (2.5s)

**Flujo tecnico:**
- `NotificationBell` / `NotificationsPage` → construye URL params y navega
- `TasksPage` → extrae `openTask` y `comment` de `useSearchParams`
- `TaskList` → `useEffect` detecta `openTaskId` y abre `TaskDetailModal`
- `TaskDetailModal` → pasa `scrollToCommentId` a `CommentSection`
- `CommentSection` → `useRef` map por comentario + `scrollTo` al contenedor scrollable

**Puntos verdes en notificaciones no leidas:**
- Punto verde con efecto `animate-ping` en cada notificacion no leida del dropdown
- Punto verde en el icono del listado de `NotificationsPage`

---

### Indicadores Visuales de Lectura

- Badge rojo numerico en `NotificationBell` con cantidad de no leidas
- Punto verde pulsante (`animate-ping`) en cada item no leido del dropdown
- Al hacer clic en una notificacion se marca automaticamente como leida

---

### Grupos de Trabajo

- `GroupContext` con CRUD completo de grupos
- Cada tarea puede pertenecer a un grupo (`groupId`)
- `GroupSelector` en Header permite cambiar el grupo activo globalmente
- Filtro por grupo en `TaskFilters`
- Ruta `/groups` con gestion completa (solo admin/leader)

---

### Etiquetas (Tags)

- `TagContext` con CRUD completo
- Cada tarea puede tener multiples etiquetas (`tagIds: []`)
- Filtro por etiqueta en `TaskFilters`
- Chips de etiquetas visibles en `TaskCard` y `TaskDetailModal`

---

### Subtareas

- Array `subtasks` en cada tarea (`[{id, title, completed, createdAt}]`)
- Checkbox por subtarea con progreso visual en `TaskDetailModal`
- Contador de completadas/total en `TaskCard`

---

### Sistema de Comentarios

- Array `comments` en cada tarea (`[{id, authorId, text, mentions, createdAt, updatedAt}]`)
- `CommentSection.jsx` con editor, lista y soporte de @menciones
- Solo usuarios con rol `member` o superior pueden comentar (no `viewer`)
- Notificacion automatica al autor de la tarea y a admins/leaders al recibir un comentario

---

### Vista Kanban

- Ruta `/kanban` con tablero drag-and-drop usando `@dnd-kit`
- Tres columnas: Pendiente / En Progreso / Completada
- Arrastrar una tarjeta actualiza el estado de la tarea en `TaskContext`

---

### Reportes y Exportacion

- Ruta `/reports` (solo admin/leader) con estadisticas avanzadas
- Exportacion a PDF con `jsPDF`
- Exportacion a Excel con `xlsx`
- Los datos exportados incluyen: tareas, miembros, grupos, etiquetas

---

### Tema Oscuro

- `ThemeContext` con `toggleTheme()` y persistencia en `localStorage`
- Boton de cambio de tema en Header (icono `dark_mode` / `light_mode`)
- Toggle de tema tambien disponible en Configuracion
- Todas las vistas soportan `dark:` clases de Tailwind

---

### Modo Responsivo (Mobile/Tablet/Desktop)

Implementado para que la app funcione correctamente en pantallas pequeñas sin perder funcionalidad.

#### `src/App.jsx`
- Agrega estado `sidebarOpen` en el componente `Layout`
- Overlay oscuro `fixed inset-0 bg-black/40 z-40 lg:hidden` que aparece cuando el sidebar esta abierto en movil
- El overlay cierra el sidebar al hacer tap fuera
- `<main>` cambia de `ml-[250px]` a `lg:ml-[250px]` para ocupar pantalla completa en movil
- Padding de contenido: `p-4 sm:p-6` (antes era fijo `p-6`)

#### `src/components/Sidebar.jsx`
- Acepta props `open` y `onClose`
- Animacion de entrada/salida: `transition-transform duration-300 ease-in-out`
- En movil inicia oculto: `-translate-x-full`, visible al abrirse: `translate-x-0`
- En desktop siempre visible: `lg:translate-x-0`
- Boton de cierre `×` visible solo en movil (`lg:hidden`)
- Cada enlace de navegacion llama a `onClose()` para cerrar el drawer al navegar

#### `src/components/Header.jsx`
- Acepta prop `onMenuToggle`
- Posicion fija cambia de `left-[250px]` a `left-0 lg:left-[250px]` para ocupar todo el ancho en movil
- Boton hamburguesa `☰` visible solo en movil (`lg:hidden`) llama a `onMenuToggle`
- `GroupSelector` envuelto en `span hidden sm:block` (oculto en pantallas muy pequeñas)
- Badge de contador de tareas: `hidden lg:block` (solo desktop)

#### `src/components/TaskFilters.jsx`
- En movil, los filtros estan colapsados por defecto con un boton toggle
- Boton toggle (`lg:hidden`) muestra "Filtros" con punto indicador si hay filtros activos
- Iconos `expand_more` / `expand_less` indican estado colapsado/expandido
- Cuerpo de filtros: `${expanded ? 'flex' : 'hidden'} lg:flex` — siempre visible en desktop
- Cada filtro individual tiene `w-full sm:w-auto` para ocupar ancho completo en movil
- Selects con `w-full` y `minWidth: 130` para no colapsar en pantallas intermedias

#### `src/pages/SettingsPage.jsx`
- Grid del formulario de perfil: `grid-cols-2` → `grid-cols-1 sm:grid-cols-2`
- Los campos Nombre y Email se apilan en movil y van lado a lado en sm+

#### `src/components/Dashboard.jsx`
- Titulos de graficos ("Distribucion por Estado", "Tareas por Prioridad", "Proximas a Vencer") ahora incluyen `dark:text-[#e4e6f0]` para ser visibles en modo oscuro

#### `src/components/StatsCard.jsx`
- Fondo: `bg-white dark:bg-[#1e2030]`
- Titulo: agrega `dark:text-[#c4c8e8]`
- Valor numerico: agrega `dark:text-[#e4e6f0]`

---

## Problemas Conocidos

### Banner blanco al abrir modal desde notificacion de comentario

**Descripcion:** Al hacer clic en una notificacion de tipo `comment_added`, se abre `TaskDetailModal` y se intenta hacer scroll hasta el comentario. En algunos casos aparece un recuadro blanco en la parte superior del modal.

**Causa raiz analizada:** `scrollTo` sobre el contenedor scrollable interno del modal interactua con el contenedor externo `fixed inset-0 overflow-y-auto`, desplazando el modal visualmente hacia arriba.

**Estado:** Sin resolver. La funcionalidad de navegacion directa al comentario funciona; el efecto visual colateral persiste en ciertos escenarios de apertura.

---

*Cambios implementados con Claude Code (Anthropic) — TaskFlow Pro Fase 2.*
