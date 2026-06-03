# TaskFlow Pro — FASE 2: Desarrollo y Correcciones

## Resumen de FASE 2

Expansión completa de la aplicación sobre la base de FASE 1. Se agregaron autenticación, roles, grupos, Kanban, Calendario, Reportes, Subtareas, Comentarios, Tags, Notificaciones y Tema oscuro.

---

## Funcionalidades implementadas en FASE 2

### Autenticación y roles (`AuthContext`)
- Login con email/password contra localStorage (`team_members`)
- Registro de nuevos usuarios con rol `member` por defecto
- Logout limpia `auth_user` y `auth_token` del localStorage
- Helpers de rol: `isAdmin()`, `isLeader()` (admin o leader), `canEdit()` (no viewer)
- `ProtectedRoute` redirige a `/login` si no autenticado

### Control de acceso por rol
| Rol | Puede crear/editar tareas | Puede comentar | Ve /groups y /reports |
|---|---|---|---|
| admin | ✅ | ✅ | ✅ |
| leader | ✅ | ✅ | ✅ |
| member | ❌ | ✅ | ❌ |
| viewer | ❌ | ❌ | ❌ |

### Grupos (`GroupContext`, `GroupsPage`, `GroupForm`, `GroupSelector`)
- CRUD de grupos con nombre, descripción, color y líder
- Selector de grupo activo en el Header — filtra tareas globalmente
- `GroupSelector` en Header: dropdown con todos los grupos del usuario
- Rutas `/groups` visibles solo para admin/leader

### Etiquetas (`TagContext`, `TagSelector`)
- CRUD de etiquetas con nombre y color personalizable
- `TagSelector` en `TaskForm`: pills de color con opción de crear nueva inline
- Las tareas almacenan `tagIds[]`; `TaskCard` y `TaskDetailModal` resuelven los tags

### Notificaciones (`NotificationContext`, `NotificationBell`, `NotificationsPage`)
- Campanilla en Header con badge de no leídas
- Panel dropdown con las 10 más recientes
- Página `/notifications` con historial completo
- Notificación automática al asignar una tarea a otro usuario

### Tema oscuro (`ThemeContext`)
- Toggle en Header y en `/settings`
- Tailwind `darkMode: 'class'` — aplica clase `dark` en `<html>`
- Preferencia persistida en `localStorage` clave `theme`

### Toasts (`ToastContext`, `Toast`)
- `addToast(message, type)` desde cualquier componente
- Tipos: `success`, `error`, `warning`, `info`
- Auto-dismiss con animación; múltiples toasts apilados

### Kanban (`KanbanPage`)
- 3 columnas: Pendiente / En Progreso / Completada
- Drag & drop con `@dnd-kit/core` y `@dnd-kit/sortable`
- Mover una tarjeta actualiza `task.status` en el contexto

### Calendario (`CalendarPage`)
- Grid mensual con navegación prev/next
- Sidebar del día seleccionado con lista de tareas vencidas ese día
- Indicadores visuales en días con tareas

### Reportes (`ReportsPage`)
- 3 tipos: por estado, por prioridad, por miembro
- Filtros de fecha y grupo
- Gráficos con Recharts 2
- Exportar PDF (jsPDF) y Excel (xlsx)

### Subtareas (`SubtaskList`)
- Lista de subtareas por tarea con checkbox toggle
- Barra de progreso visual (`completadas / total`)
- Agregar y eliminar subtareas desde el modal de detalle

### Comentarios (`CommentSection`)
- Comentarios por tarea con avatar, nombre y tiempo relativo (date-fns, locale `es`)
- Editar y eliminar comentarios propios
- Modo `readOnly` para viewers: muestra mensaje en lugar del formulario

### TaskDetailModal
- Se abre al hacer clic en cualquier `TaskCard`
- Muestra toda la información de la tarea: título, badges de prioridad/estado/tags, asignado, fecha límite
- Botones de cambio de estado (Pendiente / En Progreso / Completada) inline
- Embebe `SubtaskList` y `CommentSection`
- Botón "Editar" visible solo para admin/leader

---

## Correcciones aplicadas (post-FASE 2)

### 1. Tareas duplicadas al crear

**Causa:** Doble llamada a `addTask`.
- `Sidebar.jsx` pasaba `onSave={(data) => addTask(data)}` a `TaskModal`
- `TaskModal.handleSubmit` también llamaba `addTask` internamente
- Resultado: dos tareas por cada creación

**Solución:**
- `TaskModal` llama `addTask`/`updateTask` internamente y luego `onClose()`. No acepta ni usa `onSave` callback del padre
- Eliminado `onSave` de todos los usos de `TaskModal` en `Sidebar` y `TaskList`
- Agregado `addingRef = useRef(false)` en `TaskContext.addTask` como guard contra doble ejecución por React StrictMode

### 2. Notificaciones sin llegar al usuario destino

**Causa:** Todos los usuarios compartían la misma clave `notifications` en localStorage. Al asignar una tarea, la notificación se guardaba para el usuario activo (admin), no para el destinatario.

**Solución:**
- Clave por usuario: `notifications_<userId>` en lugar de `notifications`
- `storage.pushNotificationToUser(userId, notif)` escribe directamente en la clave del destino sin requerir que esté logueado
- `TaskContext` llama `pushAssignNotif` al crear o reasignar una tarea
- `NotificationContext` lee `notifications_<userId>` del usuario actual y hace polling cada 3 segundos para detectar cambios escritos por otros usuarios en la misma sesión

### 3. Tareas nuevas no aparecen en tiempo real para el usuario destino

**Causa:** `TaskContext` carga las tareas una sola vez al montar. Cuando el admin crea una tarea asignada a Ana, el contexto de Ana (misma pestaña, distinto usuario simulado) no lo detecta hasta recargar.

**Solución:** Polling cada 3 segundos en `TaskContext` que compara `length` y `updatedAt` del primer elemento. Si detecta cambio, reemplaza el estado. El flag `savingRef` previene que el polling sobreescriba mientras el propio contexto está en medio de un `saveTasks`.

### 4. TaskCard sin acceso al detalle completo

**Problema:** Hacer clic en una tarjeta no hacía nada. No había forma de ver descripción, subtareas ni comentarios sin abrir el modal de edición.

**Solución:** Creado `TaskDetailModal.jsx` — modal de solo lectura/acción que se abre al clicar la card.
- `TaskList` maneja estado `detailTask` y pasa `onView={(t) => setDetailTask(t)}` a cada `TaskCard`
- La card completa es clickeable (`cursor-pointer`, `onClick={() => onView(task)}`)
- Botones de editar/eliminar y el select de estado tienen `e.stopPropagation()` para no activar el modal

### 5. Bug visual: modal cortado por arriba

**Causa:** El contenedor usaba `items-center justify-center` con `max-h-[90vh]`, lo que centraba el modal ignorando el header fijo de 64px. En pantallas con contenido largo, el modal se recortaba por la parte superior.

**Solución:** Cambiado a `items-start overflow-y-auto` con `my-auto` en el modal interno. Esto permite que el modal se centre cuando el contenido es corto y que el contenedor externo scrollee cuando el contenido es largo, sin que el header lo tape.

### 6. Permisos de edición y comentarios mal aplicados

**Problema:** Cualquier usuario podía ver los botones de editar/eliminar en las tarjetas y el formulario de comentarios.

**Solución:**
- `TaskCard`: botones editar/eliminar solo visibles si `isAdmin() || isLeader()`
- `TaskList`: botón "Nueva Tarea" solo visible si `isAdmin() || isLeader()`
- `CommentSection`: acepta prop `readOnly`; si es `true` muestra mensaje en lugar del formulario
- `TaskDetailModal`: pasa `readOnly={user?.role === 'viewer'}` a `CommentSection`

### 7. Subtareas en formulario de creación

**Problema:** El `TaskForm` no tenía campo para agregar subtareas al momento de crear la tarea.

**Solución:** Agregada sección de subtareas en `TaskForm`:
- Estado `subtaskInput` para el input temporal
- `handleAddSubtask` soporta Enter o clic en botón `+`
- Lista con chips removibles antes de guardar
- Las subtareas se incluyen en `taskData.subtasks` al llamar `addTask`

---

## Estado actual del proyecto

- **Fase:** FASE 2 completada con correcciones aplicadas
- **Próxima fase:** FASE 3 — backend real (API REST + base de datos)
- **Sin tests automatizados** — verificar con `npm run build` (0 errores, 0 warnings)
- **Credenciales de prueba:**

| Email | Password | Rol |
|---|---|---|
| maria@empresa.com | admin123 | admin |
| carlos@empresa.com | leader123 | leader |
| ana@empresa.com | member123 | member |
| pedro@empresa.com | member123 | member |
| laura@empresa.com | viewer123 | viewer |

> Si el login falla con credenciales correctas: ejecutar `localStorage.clear()` en la consola del navegador.
