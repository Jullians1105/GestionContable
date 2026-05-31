# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Comandos

```bash
npm run dev      # Servidor de desarrollo en localhost:5173
npm run build    # Build de producción (verifica errores antes de entregar)
npm run lint     # ESLint con max-warnings 0 (falla si hay warnings)
npm run preview  # Previsualizar build de producción
```

No hay tests automatizados. Verificar con `npm run build` que no hay errores antes de dar por terminado cualquier cambio.

## Stack

React 18 + Vite 5 · Tailwind CSS 3 (`darkMode: 'class'`) · React Router v6 · Context API · localStorage · @dnd-kit (Kanban) · Recharts 2 · date-fns 3 · jsPDF + xlsx (exportación)

## Arquitectura

### Jerarquía de providers (App.jsx)

El orden de providers importa — los internos pueden consumir los externos:

```
ThemeProvider
  ToastProvider
    AuthProvider
      TeamProvider
        TaskProvider
          GroupProvider
            NotificationProvider
              TagProvider
                <Routes>
```

`NotificationContext` depende de `AuthContext` para saber el `userId` actual. `TaskContext` depende de `AuthContext` para el nombre del actor al crear notificaciones.

### Layout

`Layout` en App.jsx protege todas las rutas autenticadas. La estructura fija es:
- `Sidebar` (fixed left, 250px)
- `Header` (fixed top, 64px — `pt-16` en main)
- `main` con `ml-[250px] pt-16`

Los modales que se renderizan sobre este layout deben usar `fixed inset-0 z-50` y considerar el offset del header/sidebar al centrarse verticalmente.

### Persistencia y sincronización entre usuarios

Todo vive en localStorage. Múltiples usuarios simulados en la misma pestaña. Patrones clave:

- **Por usuario:** Las notificaciones usan clave `notifications_<userId>` en lugar de la clave global `notifications`.
- **`storage.pushNotificationToUser(userId, notif)`** escribe directamente en la clave del usuario destino sin que él esté logueado.
- **Polling cada 3 segundos** en `NotificationContext` y `TaskContext` para detectar cambios escritos por otros "usuarios" en la misma sesión. Sin esto, Ana no ve las tareas que Maria le asignó hasta recargar.

```js
// Patrón de polling en contextos (NotificationContext, TaskContext)
useEffect(() => {
  const interval = setInterval(() => {
    const fresh = storage.getNotifications(userId)
    setNotifications(prev => {
      if (fresh.length !== prev.length || fresh[0]?.id !== prev[0]?.id) return fresh
      return prev  // referencia estable si no cambió nada
    })
  }, 3000)
  return () => clearInterval(interval)
}, [userId])
```

### Control de roles

`AuthContext` expone:
- `isAdmin()` → role === 'admin'
- `isLeader()` → role === 'admin' || 'leader'
- `canEdit()` → role !== 'viewer'

Reglas de UI vigentes:
- Botones "Nueva Tarea" y "Editar/Eliminar" en TaskCard/TaskList: solo `isAdmin() || isLeader()`
- Comentarios: solo `role !== 'viewer'` (members y superiores)
- Rutas `/groups` y `/reports`: solo `isAdmin() || isLeader()` (filtradas en Sidebar)

### Prevención de duplicados al crear tareas

React StrictMode ejecuta los efectos dos veces en dev. `TaskContext.addTask` usa un `addingRef = useRef(false)` como guard:

```js
const addTask = useCallback((taskData) => {
  if (addingRef.current) return null
  addingRef.current = true
  // ...
  setTasks(prev => { addingRef.current = false; return [newTask, ...prev] })
}, [user])
```

`TaskModal` llama `addTask`/`updateTask` internamente y luego `onClose()`. **No pasar `onSave` callback desde el padre** — causaría doble inserción.

### Notificaciones al asignar tareas

`TaskContext` tiene `pushAssignNotif(assignedTo, actorName, taskTitle, taskId)` que llama a `storage.pushNotificationToUser` directamente (sin pasar por `NotificationContext`). Se dispara en `addTask` (si `assignedTo !== user.id`) y en `updateTask` (si `assignedTo` cambió).

### TaskDetailModal

Se abre al hacer clic en un `TaskCard`. Usa `getTaskById(task.id)` para siempre renderizar datos vivos del contexto, no los props posiblemente stale. El `onEdit` cierra el detail y abre el `TaskModal` de edición.

## Modelos de datos relevantes

```js
// Task
{ id, title, description, status: 'pending'|'in_progress'|'completed',
  priority: 'high'|'medium'|'low', assignedTo: userId, dueDate: 'YYYY-MM-DD',
  groupId, tagIds: [], subtasks: [{id, title, completed, createdAt}],
  comments: [{id, authorId, text, mentions:[], createdAt, updatedAt}],
  createdAt, updatedAt }

// TeamMember
{ id, name, email, password, role: 'admin'|'leader'|'member'|'viewer',
  groupIds: [], preferences: {theme, notifications}, createdAt }
```

IDs generados con `generateId('prefix')` de `utils/helpers.js` (timestamp + random).

## Paleta de colores (design tokens)

```
Primary:    #004ac6    Success: #10B981
Warning:    #FBBF24    Error:   #EF4444
Background: #f3f4f6    Surface: #ffffff
Text:       #191c1e    Muted:   #434655
Border:     #c3c6d7
```
Dark mode usa clases `dark:bg-[#1e2030]`, `dark:text-[#e4e6f0]`, etc. — siempre inline con hex.

## Usuarios de prueba

| Email | Password | Rol |
|---|---|---|
| maria@empresa.com | admin123 | admin |
| carlos@empresa.com | leader123 | leader |
| ana@empresa.com | member123 | member |
| pedro@empresa.com | member123 | member |
| laura@empresa.com | viewer123 | viewer |

Si el login falla con credenciales correctas, ejecutar `localStorage.clear()` en la consola del navegador — indica datos stale de una versión anterior sin campo `password`.

## Convenciones

- Tailwind CSS para todos los estilos, sin CSS modules ni styled-components
- Colores siempre como hex inline (no clases de Tailwind para colores del design system)
- Contextos exportan su propio hook: `useAuth()`, `useTasks()`, `useGroups()`, etc.
- `useEffect` solo para side effects (storage, timers, DOM). Derivar estado con `useMemo` o cálculo inline
- Sin comentarios en código salvo invariantes no obvios
