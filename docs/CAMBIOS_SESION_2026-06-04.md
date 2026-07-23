# Cambios Sesión 2026-06-04 — Gestcon Fase 3

Registro de todas las funcionalidades implementadas, correcciones y bugs resueltos durante esta sesión de desarrollo. Complementa `CAMBIOS_FASE_3.md` (arquitectura backend) y `BUGS_SESION_2026-06-04.md` (integración inicial).

---

## 1. Notificaciones — campo `extra_data`

### Migración
```sql
-- migrations/003_notification_extra.sql
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS extra_data JSONB DEFAULT '{}';
```

### Backend (`src/controllers/taskController.js`)
Los tres tipos de notificación ahora almacenan metadatos en `extra_data`:

| Tipo | Datos guardados |
|---|---|
| `task_assigned` | `{ actorId, actorName }` — quién asignó la tarea |
| `task_completed` | `{ completedById, completedByName }` — quién la completó |
| `comment_added` | `{ commentId }` — ya estaba implementado |

Los eventos Socket.io también incluyen el campo `extra` con los mismos datos.

### API (`src/routes/notifications.js`)
`normalizeNotif` ya mapeaba `extra_data` → `extra` en la respuesta. Sin cambios adicionales.

---

## 2. Campo `assignedTo` obligatorio al crear tarea

### Frontend (`src/utils/validators.js`, `src/components/TaskForm.jsx`)
- `validateTask` agrega `errors.assignedTo` si el campo está vacío.
- El select muestra `*` rojo, borde rojo y mensaje de error igual que los otros campos obligatorios.
- La opción por defecto cambió de "Sin asignar" a "Seleccionar...".

### Backend (`src/routes/tasks.js`)
```js
body('assignedTo').notEmpty().withMessage('Debes asignar la tarea a alguien')
```
Validación añadida al `POST /api/tasks` para que el API rechace tareas sin asignar aunque se llame directamente.

---

## 3. CRUD de usuarios — panel de administrador

### Nueva ruta y página
- Ruta `/usuarios` accesible solo para rol `admin` (filtrada en sidebar y en navegación).
- `src/pages/UsersPage.jsx` — wrapper de página.
- `src/components/UsersManager.jsx` — componente principal.

### Funcionalidades
- Tabla con búsqueda por nombre/email.
- **Crear usuario**: nombre, email, rol, contraseña (mínimo 8 caracteres). Llama `POST /api/employees`.
- **Editar usuario**: nombre, email, rol, contraseña opcional ("dejar vacío para no cambiar"). Llama `PUT /api/employees/:id`.
- **Eliminar usuario**: confirmación inline en la misma fila. Llama `DELETE /api/employees/:id`.
- Toasts de éxito y error. Errores del backend (ej. "Email ya registrado") se muestran al usuario.

### Backend (`src/routes/employees.js`)
- `PUT /:id` — añadido soporte para `password` opcional: si viene, se hashea con bcrypt y se actualiza `password_hash`.
- `GET /` y `GET /:id` — incluyen el campo `permissions` en el SELECT.

### Corrección de bug: usuario creado no podía iniciar sesión
**Causa:** `TeamContext.addMember/updateMember/deleteMember` solo modificaban el estado local, nunca llamaban al backend.  
**Fix:** Las tres funciones son ahora `async`. Cuando `useRealBackend` es true, llaman al API antes de actualizar el estado. `addMember` usa el UUID real devuelto por la BD, no un ID generado localmente.

---

## 4. Sistema de permisos granular por usuario

### Migración
```sql
-- migrations/004_user_permissions.sql
ALTER TABLE users ADD COLUMN IF NOT EXISTS permissions JSONB DEFAULT NULL;
```

### Permisos definidos (`src/utils/permissions.js`)

| Clave | Descripción |
|---|---|
| `canCreateTask` | Crear tareas |
| `canEditTask` | Editar tareas |
| `canDeleteTask` | Eliminar tareas |
| `canComment` | Agregar comentarios |
| `canViewReports` | Ver reportes |
| `canManageGroups` | Gestionar grupos |

### Defaults por rol

| Rol | crear | editar | eliminar | comentar | reportes | grupos |
|---|---|---|---|---|---|---|
| admin | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| leader | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| member | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ |
| viewer | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

Cuando `permissions` es `null` en la BD, se aplican los defaults del rol. Cuando está definido, los valores sobreescriben el default (merge con `{ ...roleDefaults, ...customPerms }`).

### `AuthContext` — nueva función `hasPermission(key)`
```js
const hasPermission = useCallback((key) => getEffectivePermissions(user)[key] ?? false, [user])
```
Expuesta en el contexto. Reemplaza los checks de `isAdmin() || isLeader()` en componentes de UI.

### Backend
- `GET /api/auth/me` y `POST /api/auth/login` incluyen `permissions` en la respuesta.
- `GET /api/employees` y `GET /api/employees/:id` incluyen `permissions`.
- `PUT /api/employees/:id` acepta `permissions` (JSONB) y lo guarda en la BD.
- `TeamContext.updateMember` pasa `permissions` al API cuando el objeto `updates` lo incluye.

### Checklist de permisos en UsersManager
- Cada fila tiene un botón **"Permisos"** que expande una fila adicional debajo.
- La fila expandida muestra un checkbox por cada permiso con su label.
- Toglear un checkbox llama inmediatamente `updateMember(userId, { permissions: newPerms })`.
- Si el usuario tiene permisos personalizados (distintos del default del rol), aparece un badge **"personalizados"** junto a su nombre.

### Mensajes al usuario sin permiso
Todos los botones de acción son ahora visibles para todos los roles. Al hacer clic sin el permiso correspondiente, se muestra un toast de error en lugar de ejecutar la acción:

| Acción | Permiso requerido | Mensaje |
|---|---|---|
| Crear tarea (sidebar / TaskList) | `canCreateTask` | "No tienes permiso para crear tareas" |
| Editar tarea (TaskCard / TaskDetailModal) | `canEditTask` | "No tienes permiso para realizar esta acción" |
| Eliminar tarea (TaskCard) | `canDeleteTask` | "No tienes permiso para realizar esta acción" |
| Cambiar estado (TaskCard select / TaskDetailModal) | `canEditTask` | "No tienes permiso para cambiar el estado de tareas" |
| Arrastrar en Kanban | `canEditTask` | "No tienes permiso para mover tareas" |
| Crear/editar/eliminar grupo | `canManageGroups` | "No tienes permiso para gestionar grupos" |
| Agregar comentario | `canComment` | Mensaje lock visible sobre la sección de comentarios |

---

## 5. Correcciones de bugs

### Bug: viewer podía "cambiar estado" con mensaje falso de éxito
**Síntoma:** El selector de estado en TaskCard y los botones de estado en TaskDetailModal mostraban "Estado actualizado" aunque el cambio no se ejecutaba para viewers.  
**Causa:** `handleStatusChange` en `TaskList` y `TaskDetailModal` no verificaba permisos.  
**Fix:** Ambas funciones comprueban `hasPermission('canEditTask')` antes de llamar `updateTask`. Si falla, muestran toast de error y hacen `return`.

### Bug: viewer podía arrastrar tarjetas en Kanban con mensaje falso de éxito
**Síntoma:** Al soltar una tarjeta arrastrándola, aparecía el toast "Tarea movida a X" aunque no cambiaba nada.  
**Causa:** `handleDragEnd` en `KanbanPage` no verificaba permisos.  
**Fix:** Check de `hasPermission('canEditTask')` antes de llamar `updateTask`.

### Bug: contraseña mínima — frontend no validaba 8 caracteres
**Síntoma:** Crear un usuario con contraseña de 3 caracteres pasaba la validación frontend pero el backend devolvía error 400.  
**Causa:** `UsersManager.handleSubmit` solo verificaba que la contraseña no estuviera vacía.  
**Fix:** Agregada validación `length < 8 → "Mínimo 8 caracteres"` antes de llamar al API.

### Bug: `assignedTo` requerido solo en frontend
**Síntoma:** Llamadas directas al `POST /api/tasks` sin `assignedTo` eran aceptadas.  
**Causa:** La ruta de tareas no incluía validación de `assignedTo`.  
**Fix:** `body('assignedTo').notEmpty()` añadido en `src/routes/tasks.js`.

---

## 6. Correcciones de modo oscuro

### Fondos blancos visibles en modo oscuro
Archivos corregidos con clases `dark:bg-`:

| Componente | Problema | Fix |
|---|---|---|
| `TeamManager.jsx` | Cards de miembros `bg-white` sin dark | `dark:bg-[#1e2030]` + bordes y textos |
| `TeamForm.jsx` | Inputs `bg-white` sin dark | `dark:bg-[#252840]` |
| `LoginPage.jsx` | Fondo de página y card sin dark | `dark:bg-[#0f1117]` / `dark:bg-[#1e2030]` |
| `RegisterPage.jsx` | Igual que LoginPage | Mismo fix |

### Textos oscuros invisibles en modo oscuro
Corrección masiva de `text-[#191c1e]` y `text-[#434655]` sin variante dark en 21 archivos:

**Páginas:** `DashboardPage`, `TasksPage`, `TeamPage`, `GroupsPage`, `CalendarPage`, `NotificationsPage`, `ReportsPage`, `KanbanPage`, `LoginPage`, `RegisterPage`

**Componentes:** `Dashboard`, `TeamManager`, `TagSelector`, `GroupForm`, `Header`, `NotificationBell`, `SubtaskList`, `CommentSection`, `TaskList`, `TaskCard`, `TaskFilters`

Regla aplicada:
- `text-[#191c1e]` → añadir `dark:text-[#e4e6f0]`
- `text-[#434655]` → añadir `dark:text-[#c4c8e8]`
- `border-[#c3c6d7]` sin dark → añadir `dark:border-[#2e3148]`
- `bg-[#edeef0]` sin dark → añadir `dark:bg-[#252840]`

### Toggle de tema mejorado (`SettingsPage.jsx`)
- Ícono grande `light_mode`/`dark_mode` con color amarillo/azul según el tema activo.
- Toggle más ancho (`w-14 h-7`) con ícono de sol/luna dentro del círculo deslizante.
- Subtexto con `dark:text-[#8b8fa8]` para visibilidad en fondo oscuro.
- Transición `duration-300` para animación suave.

---

## 7. Bugs pendientes de sesiones anteriores resueltos en esta sesión

### P4. Notificaciones `comment_added` sin texto del comentario
**Resuelto:** El backend ahora incluye un snippet del comentario (máx. 80 chars) en el campo `message` de la notificación, y almacena el `commentId` en `extra_data`. El mensaje tiene formato: `"Nombre comentó en 'Tarea': 'snippet...'"`.

---

## Archivos creados

| Archivo | Descripción |
|---|---|
| `backend/migrations/003_notification_extra.sql` | Columna `extra_data` en notifications |
| `backend/migrations/004_user_permissions.sql` | Columna `permissions` en users |
| `src/utils/permissions.js` | Constantes y defaults de permisos |
| `src/pages/UsersPage.jsx` | Página wrapper de gestión de usuarios |
| `src/components/UsersManager.jsx` | Tabla CRUD + checklist de permisos |

## Archivos modificados (resumen)

| Archivo | Cambios |
|---|---|
| `backend/src/controllers/authController.js` | `login` y `me` retornan `permissions` |
| `backend/src/controllers/taskController.js` | Notificaciones con `extra_data` |
| `backend/src/routes/tasks.js` | `assignedTo` requerido en POST |
| `backend/src/routes/employees.js` | Soporte `password` y `permissions` en PUT; `permissions` en GET |
| `src/context/AuthContext.jsx` | Agrega `hasPermission(key)` |
| `src/context/TeamContext.jsx` | `addMember`, `updateMember`, `deleteMember` llaman al API |
| `src/components/TaskCard.jsx` | Guard de permisos con toast |
| `src/components/TaskDetailModal.jsx` | Guard de permisos + mensaje lock en comentarios |
| `src/components/TaskList.jsx` | Guard en "Nueva Tarea" y `handleStatusChange` |
| `src/components/Sidebar.jsx` | Guard en "Nueva Tarea" |
| `src/pages/GroupsPage.jsx` | Guard en botones de gestión |
| `src/pages/KanbanPage.jsx` | Guard en `handleDragEnd` |
| `src/utils/validators.js` | `assignedTo` requerido en `validateTask` |
| `src/components/TaskForm.jsx` | Campo "Asignado a" marcado como obligatorio |
| `src/pages/SettingsPage.jsx` | Toggle de tema mejorado con iconos |
| `src/pages/LoginPage.jsx` | Dark mode completo |
| `src/pages/RegisterPage.jsx` | Dark mode completo |
| `src/components/TeamManager.jsx` | Dark mode en cards de miembros |
| `src/components/TeamForm.jsx` | Dark mode en inputs |
| +11 componentes/páginas | Correcciones de texto/borde en modo oscuro |
