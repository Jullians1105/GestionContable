# 📝 Prompt para Claude Code - FASE 2 TaskFlow Pro

## 🎯 OBJETIVO

Desarrollar FASE 2 del **Gestor de Tareas TaskFlow Pro** agregando autenticación, control de acceso por rol, grupos de trabajo, nuevas vistas (Kanban, Calendario), comentarios, subtareas, reportes y notificaciones.

---

## 📊 CONTEXTO

**Proyecto:** TaskFlow Pro (en desarrollo)
**Fase actual:** FASE 2 (sobre FASE 1 completada)
**Stack:** React 18 + Vite, Tailwind CSS, Context API, localStorage (aún sin backend real)
**Design System:** Stitch TaskFlow Pro (colores, tipografía, componentes)

---

## 🎨 PALETA DE COLORES (Mantener)

```
Primary: #004ac6
Primary container: #2563eb
Success: #10B981
Warning: #FBBF24
Error/Danger: #EF4444
Info: #F97316
Background: #f3f4f6
Surface: #ffffff
On-surface: #191c1e
On-surface-variant: #434655
Outline-variant: #c3c6d7
```

---

## 📋 FUNCIONALIDADES FASE 2

### 1. AUTENTICACIÓN Y CONTROL DE ACCESO

**Login/Registro**
- Pantalla de login (email, contraseña)
- Pantalla de registro (nombre, email, contraseña)
- Validación de campos
- Mensajes de error/éxito
- Token de sesión (localStorage, implementar JWT structure)
- Recordar sesión activa

**Control por Rol**
```
Admin:
  - Ver todas las tareas de todos los miembros
  - Editar cualquier tarea
  - Crear/eliminar usuarios
  - Acceso a todos los grupos

Leader:
  - Ver tareas de su equipo
  - Asignar tareas a miembros
  - Ver reportes de su equipo
  - Gestionar miembros de su equipo

Member:
  - Ver solo sus tareas asignadas
  - Ver tareas de su grupo
  - Crear tareas en su grupo
  - Ver equipo

Viewer:
  - Solo lectura
  - Ver tareas asignadas
  - No crear ni editar
```

**Contexto de Autenticación**
- AuthContext con: usuario logueado, rol, token, login(), logout(), register()
- Guard de rutas (ProtectedRoute) para validar acceso según rol
- Pantalla de login como ruta pública
- Redirect a login si no autenticado

---

### 2. GRUPOS DE TRABAJO INDEPENDIENTES

**Modelo de Datos**
```js
{
  id: "group-{timestamp}-{random}",
  name: string,          // Ej: "Backend Team"
  description: string,   // Opcional
  leaderId: string,      // id del líder
  memberIds: [],         // Array de ids de miembros
  taskIds: [],           // Array de ids de tareas del grupo
  color: string,         // Color badge #004ac6, #10B981, etc
  createdAt: string,
  updatedAt: string,
}
```

**Funcionalidades**
- Crear grupo (solo admin/líder)
- Editar grupo
- Eliminar grupo
- Agregar miembros a grupo
- Remover miembros de grupo
- Un miembro puede estar en múltiples grupos
- Vista de grupos (grid de tarjetas con color distintivo)
- Selector de grupo en header (dropdown)
- Filtrar tareas por grupo actual
- TaskContext: agregar groupId a cada tarea
- Reportes por grupo

**UI**
- Nueva página /groups
- Grid de tarjetas de grupo (nombre, descripción, color, miembros, contador tareas)
- Botón "Nuevo Grupo" que abre modal
- Modal crear/editar grupo (nombre, descripción, seleccionar miembros, color)

---

### 3. SUBTAREAS

**Modelo de Datos**
```js
// Agregar a Task:
subtasks: [
  {
    id: "subtask-{timestamp}-{random}",
    title: string,
    completed: boolean,
    createdAt: string,
  }
]
```

**Funcionalidades**
- Agregar subtarea a tarea
- Marcar subtarea como completada (checkbox)
- Eliminar subtarea
- Mostrar barra de progreso "3 de 5 completadas"
- Mostrar lista de subtareas en detalles de tarea

**UI**
- Sección "Subtareas" en detalles de tarea
- Input para agregar nueva subtarea
- Checkboxes para completar
- Botón X para eliminar
- Barra de progreso azul

---

### 4. COMENTARIOS EN TAREAS

**Modelo de Datos**
```js
// Agregar a Task:
comments: [
  {
    id: "comment-{timestamp}-{random}",
    authorId: string,      // id del usuario
    text: string,
    mentions: [],          // Array de ids mencionados
    createdAt: string,
    updatedAt: string,
    editable: boolean,     // Solo si es autor
  }
]
```

**Funcionalidades**
- Agregar comentario a tarea
- Editar comentario (solo autor)
- Eliminar comentario (solo autor)
- Menciones @usuario (autocomplete)
- Timestamps relativos ("hace 2 horas")
- Replies/respuestas anidadas
- Mostrar avatar del autor

**UI**
- Sección "Comentarios" debajo de descripción
- Contador "5 comentarios"
- Cada comentario: avatar + nombre + timestamp + texto + acciones (editar, eliminar)
- Input para nuevo comentario con placeholder "Escribe un comentario..."
- Apoyo de markdown básico (bold, italic)

---

### 5. VISTA KANBAN

**Funcionalidades**
- 3 columnas fijas: Pendiente | En Progreso | Completada
- Drag & drop de tarjetas entre columnas
- Al soltar, cambiar estado de tarea automáticamente
- Contador de tareas por columna
- Tarjetas muestran: nombre, prioridad (badge), asignado (avatar), fecha
- Animaciones suaves
- Filtrar Kanban por grupo actual

**UI**
- Nueva página /kanban
- 3 columnas lado a lado (33% ancho cada una)
- Fondo de columna: gris claro para Pendiente, azul claro para En Progreso, verde claro para Completada
- Tarjetas con sombra, hover = sombra más oscura
- Indicador visual de drag ("puede arrastrarse")
- Scroll vertical en cada columna si hay muchas tareas

---

### 6. VISTA CALENDARIO

**Funcionalidades**
- Calendario mensual (date-fns)
- Mostrar tareas en cada fecha (puntos/badges)
- Navegación mes anterior/siguiente
- Click en día muestra lista de tareas de ese día
- Código de colores: rojo=vencida, amarillo=próxima, azul=normal
- Botón "Hoy" para volver al mes actual

**UI**
- Nueva página /calendar
- Encabezado: flecha izquierda | "Mayo 2026" | flecha derecha | botón Hoy
- Grid 7x6 (7 días x 6 semanas)
- Encabezados: Lu, Ma, Mi, Ju, Vi, Sa, Do
- Cada celda: número de día + máximo 3 puntos de tareas
- Sidebar derecha: lista de tareas del día seleccionado
- Responsive: sidebar desaparece en mobile

---

### 7. REPORTES Y EXPORTACIÓN

**Funcionalidades**
- Filtro: tipo de reporte (select)
  - "Tareas completadas por persona"
  - "Productividad general"
  - "Cumplimiento de fechas"
- Filtro: rango de fechas (from - to)
- Filtro: grupo (select)
- Filtro: miembro (select)
- Botón "Generar Reporte"
- Botón "Descargar PDF"
- Botón "Descargar Excel"

**Reportes Disponibles**
- **Tareas por persona:** Tabla nombre | completadas | en progreso | pendientes | % completadas
- **Productividad:** Gráfico barras con nombres y número de tareas completadas
- **Cumplimiento:** Tareas vencidas vs completadas a tiempo

**UI**
- Nueva página /reports
- Formulario de filtros arriba (grid 2 columnas en desktop)
- Vista previa de reporte debajo (tabla + gráfico)
- Botones de descarga (PDF rojo, Excel verde)
- Resumen en texto (ej: "47 tareas completadas en este período")

---

### 8. ETIQUETAS/TAGS

**Modelo de Datos**
```js
// En TaskContext:
tags: [
  {
    id: "tag-{timestamp}-{random}",
    name: string,        // Ej: "frontend", "urgente"
    color: string,       // #004ac6, #10B981, etc
    createdAt: string,
  }
]

// Agregar a Task:
tagIds: []  // Array de ids de etiquetas
```

**Funcionalidades**
- Crear etiqueta personalizada
- Asignar múltiples etiquetas a tarea
- Filtrar tareas por etiqueta
- Mostrar etiquetas como pills de color
- Autocomplete en búsqueda de etiquetas
- Editar nombre/color de etiqueta
- Eliminar etiqueta

**UI**
- Sección de etiquetas en formulario de tarea
- Pills de color con nombre de etiqueta
- Botón "+ Agregar etiqueta"
- Dropdown de etiquetas disponibles + opción crear nueva

---

### 9. NOTIFICACIONES

**Modelo de Datos**
```js
// En AuthContext:
notifications: [
  {
    id: "notif-{timestamp}-{random}",
    type: "task_assigned" | "comment" | "due_soon",
    message: string,
    taskId: string,       // Opcional, para enlazar a tarea
    read: boolean,
    createdAt: string,
  }
]
```

**Eventos que generan notificaciones**
- Tarea asignada a mi
- Comentario en mi tarea
- Tarea próxima a vencer (1-3 días)
- Tarea vencida
- Respuesta a mi comentario

**UI**
- Bell icon en header (rojo si hay no leídas)
- Contador de no leídas en bell
- Click en bell abre panel dropdown
- Panel muestra: últimas 10 notificaciones
- Cada notificación: icono + mensaje + timestamp + enlace
- Click marca como leída
- Link "Ver todas las notificaciones" → página /notifications

---

### 10. FILTROS AVANZADOS Y VISTAS GUARDADAS

**Funcionalidades**
- Guardar filtros personalizados (nombre + criterios)
- Crear vistas guardadas (ej: "Mis tareas esta semana")
- Mostrar vistas guardadas en sidebar bajo "Filtros"
- Click en vista guardada aplica esos filtros

**Criterios de Filtro**
- Texto (búsqueda)
- Estado
- Prioridad
- Asignado
- Grupo
- Etiqueta
- Rango de fechas
- Mis tareas (solo asignadas a mí)

---

### 11. MEJORAS UI/UX

**Tema Oscuro**
- Toggle en Settings
- Cambiar background, text colors, borders
- localStorage: `theme: "light" | "dark"`

**Mejoras Visuales**
- Animaciones suaves (transiciones 200-300ms)
- Hover effects mejorados
- Loading spinners
- Toast notifications para acciones
- Modal confirmación para acciones destructivas
- Skeleton loaders mientras carga

---

## 🗄️ NUEVOS CONTEXTOS

```javascript
// AuthContext
- user: { id, name, email, role, groupIds }
- token: string
- isAuthenticated: boolean
- login(email, password)
- logout()
- register(name, email, password)

// GroupContext
- groups: []
- currentGroupId: string
- createGroup(group)
- updateGroup(id, updates)
- deleteGroup(id)
- addMemberToGroup(groupId, userId)
- removeMemberFromGroup(groupId, userId)

// NotificationContext
- notifications: []
- addNotification(notif)
- markAsRead(notifId)
- deleteNotification(notifId)
- clearAll()
```

---

## 📁 NUEVOS COMPONENTES

```
components/
├── Auth/
│   ├── LoginForm.jsx
│   ├── RegisterForm.jsx
│   └── ProtectedRoute.jsx
├── Groups/
│   ├── GroupManager.jsx
│   ├── GroupForm.jsx
│   └── GroupSelector.jsx
├── Kanban/
│   ├── KanbanBoard.jsx
│   ├── KanbanColumn.jsx
│   └── KanbanCard.jsx
├── Calendar/
│   ├── CalendarView.jsx
│   ├── CalendarGrid.jsx
│   └── CalendarDay.jsx
├── Comments/
│   ├── CommentSection.jsx
│   ├── Comment.jsx
│   └── CommentForm.jsx
├── Subtasks/
│   ├── SubtaskList.jsx
│   └── SubtaskItem.jsx
├── Reports/
│   ├── ReportGenerator.jsx
│   ├── ReportPreview.jsx
│   └── ReportChart.jsx
├── Tags/
│   ├── TagManager.jsx
│   └── TagSelector.jsx
├── Notifications/
│   ├── NotificationBell.jsx
│   └── NotificationPanel.jsx
└── SettingPages/
    ├── ThemeToggle.jsx
    └── PreferencesPanel.jsx

pages/
├── LoginPage.jsx
├── RegisterPage.jsx
├── GroupsPage.jsx
├── KanbanPage.jsx
├── CalendarPage.jsx
├── ReportsPage.jsx
└── NotificationsPage.jsx
```

---

## 📝 ACTUALIZACIONES A DATOS EXISTENTES

### Task (Extender modelo actual)
```js
{
  id: string,
  title: string,
  description: string,
  status: "pending" | "in_progress" | "completed",
  priority: "high" | "medium" | "low",
  assignedTo: string,
  dueDate: string,
  groupId: string,           // NUEVO
  tagIds: [],                // NUEVO
  subtasks: [],              // NUEVO
  comments: [],              // NUEVO
  createdAt: string,
  updatedAt: string,
}
```

### TeamMember (Extender)
```js
{
  id: string,
  name: string,
  email: string,
  password: string,          // NUEVO (hashed en FASE 3)
  role: "admin" | "leader" | "member" | "viewer",
  groupIds: [],              // NUEVO - múltiples grupos
  preferences: {             // NUEVO
    theme: "light" | "dark",
    notifications: boolean,
  },
  createdAt: string,
}
```

---

## 🔄 LOCALSTORAGE ACTUALIZADO

```javascript
// Nuevas claves:
localStorage.setItem('auth_user', JSON.stringify(user))
localStorage.setItem('auth_token', token)
localStorage.setItem('groups', JSON.stringify(groups))
localStorage.setItem('tags', JSON.stringify(tags))
localStorage.setItem('notifications', JSON.stringify(notifications))
localStorage.setItem('saved_filters', JSON.stringify(filters))
localStorage.setItem('theme', theme) // "light" o "dark"
```

---

## ✅ CHECKLIST FASE 2

- [x] AuthContext + Login/Register — `src/context/AuthContext.jsx`, `src/pages/LoginPage.jsx`, `src/pages/RegisterPage.jsx`
- [x] ProtectedRoute y role-based access — `src/components/Auth/ProtectedRoute.jsx`
- [x] GroupContext + GroupManager — `src/context/GroupContext.jsx`, `src/components/Groups/`, `src/pages/GroupsPage.jsx`
- [x] Actualizar TaskContext (agregar groupId, tagIds, subtasks, comments) — `src/context/TaskContext.jsx`
- [x] Subtasks (crear, editar, eliminar, completar) — `src/components/Subtasks/SubtaskList.jsx`
- [x] Comments (crear, editar, eliminar) — `src/components/Comments/CommentSection.jsx`
- [x] Vista Kanban (drag-drop, animaciones) — `src/pages/KanbanPage.jsx` (usa @dnd-kit)
- [x] Vista Calendario (grid, navegación, tareas por día) — `src/pages/CalendarPage.jsx`
- [x] Report Generator (filtros, tablas, gráficos) — `src/pages/ReportsPage.jsx` (exporta PDF/Excel)
- [x] Tags (crear, asignar, filtrar) — `src/context/TagContext.jsx`, `src/components/Tags/TagSelector.jsx`
- [x] Notifications (bell icon, panel, marca como leída) — `src/context/NotificationContext.jsx`, `src/components/Notifications/NotificationBell.jsx`, `src/pages/NotificationsPage.jsx`
- [x] Filtros avanzados (grupo, etiqueta, miembro) — `src/components/TaskFilters.jsx` extendido
- [x] Tema oscuro/claro — `src/context/ThemeContext.jsx`, toggle en Header y Settings, `tailwind.config.js` con `darkMode: 'class'`
- [x] Mejoras UI (toasts, modals confirmación) — `src/context/ToastContext.jsx`, `src/components/Toast.jsx`
- [ ] Vistas guardadas (filtros personalizados guardados)
- [ ] Menciones @usuario en comentarios con autocomplete
- [ ] Notificaciones automáticas por tareas próximas a vencer
- [ ] Testing responsivo completo

---

## 📌 ESTADO AL 2026-05-29

**Commit:** `650bd28` — `feat: FASE 2 completada`
**Build:** ✅ Sin errores (37 archivos, 3295 inserciones)
**Pendiente para continuación:**
- Vistas guardadas de filtros (`/tasks` sidebar con filtros guardados, `storage.getSavedFilters()` ya implementado)
- Notificaciones automáticas al asignar tareas o comentar (conectar `addNotification` a acciones en `TaskContext`)
- Menciones @usuario en `CommentSection` (autocomplete de members)
- Testing responsivo mobile en Kanban y Calendar

---

## 🎯 PRIORIDAD DE DESARROLLO

**Semana 1-2:** ✅ Autenticación, control de acceso, roles
**Semana 3:** ✅ Grupos de trabajo
**Semana 4-5:** ✅ Subtareas, comentarios, mejoras
**Semana 6-7:** ✅ Kanban, Calendario
**Semana 8:** ✅ Reports, Tags, Notificaciones
**Semana 9-10:** Filtros avanzados guardados, pulido, testing

---

**FASE 2 IMPLEMENTADA** ✅ — Para continuar usa este archivo como contexto, el estado está en la sección "📌 ESTADO AL 2026-05-29".
