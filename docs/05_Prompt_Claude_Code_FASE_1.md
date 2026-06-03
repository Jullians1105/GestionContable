# 📝 Prompt para Claude Code - FASE 1 Gestor de Tareas Empresarial

## 🎯 OBJETIVO

Desarrollar FASE 1 (MVP) de un **Gestor de Tareas Empresarial** con React, Tailwind CSS y localStorage. La aplicación debe permitir a equipos de hasta 25 personas gestionar tareas de forma colaborativa.

---

## 📊 CONTEXTO DEL PROYECTO

**Nombre:** Gestor de Tareas Empresarial
**Fase:** FASE 1 - MVP
**Stack:** React 18+ (Vite), Tailwind CSS, Context API, localStorage
**Diseño:** 10 interfaces completamente diseñadas en Figma

---

## 🎨 PALETA DE COLORES OFICIAL

```
Azul Profesional:   #2563EB (botones primarios, enlaces)
Rojo:              #EF4444 (prioridad alta, errores)
Amarillo:          #FBBF24 (prioridad media, advertencia)
Verde:             #10B981 (prioridad baja, éxito)
Gris Oscuro:       #1F2937 (textos principales)
Gris Medio:        #6B7280 (textos secundarios)
Gris Claro:        #F3F4F6 (fondos)
Blanco:            #FFFFFF (fondo principal)
Naranja:           #F97316 (información)
```

---

## 📋 FUNCIONALIDADES FASE 1 (MVP)

### ✅ CRUD DE TAREAS
- Crear nueva tarea
- Editar tarea existente
- Eliminar tarea
- Ver detalles de tarea
- Validación de campos obligatorios

### ✅ ESTADOS DE PROGRESO
- Pendiente (gris, inicial)
- En Progreso (azul)
- Completada (verde)
- Cambio de estado fácil (dropdown, buttons o drag-drop)
- Indicador visual del estado actual

### ✅ PRIORIDADES
- Alta (rojo 🔴)
- Media (amarillo 🟡)
- Baja (verde 🟢)
- Asignación de prioridad al crear/editar
- Filtrado por prioridad

### ✅ ASIGNACIÓN DE TAREAS
- Asignar a miembros del equipo
- Ver tareas por persona
- Cambiar asignación
- Avatar + nombre de asignado

### ✅ FECHAS LÍMITE
- Date picker para fecha límite
- Indicador visual si vencida (rojo)
- Indicador si próxima a vencer (amarillo)
- Ordenar por fecha límite

### ✅ BÚSQUEDA Y FILTROS
- Buscador por título/descripción
- Filtro por estado
- Filtro por prioridad
- Filtro por asignado
- Combinar múltiples filtros

### ✅ DASHBOARD
- Tarjetas de estadísticas:
  - Total de tareas
  - Completadas
  - En progreso
  - Pendientes
- Gráfico pie: distribución por estado
- Gráfico barras: distribución por prioridad
- Sección "Próximas a vencer" (tareas con fecha límite en rojo/amarillo)

### ✅ GESTIÓN DE EQUIPO
- Agregar miembros (nombre, email, rol)
- Editar miembros
- Eliminar miembros
- Ver lista de equipo
- Asignar roles: Administrador, Líder, Miembro, Viewer

### ✅ PERSISTENCIA EN LOCALSTORAGE
- Guardar todas las tareas
- Guardar miembros del equipo
- Cargar datos automáticamente al iniciar
- Sincronización automática de cambios

### ✅ INTERFAZ RESPONSIVA
- Mobile (320px+)
- Tablet (768px+)
- Desktop (1024px+)

---

## 📁 ESTRUCTURA DE CARPETAS REQUERIDA

```
src/
├── components/
│   ├── Dashboard.jsx
│   ├── TaskList.jsx
│   ├── TaskCard.jsx
│   ├── TaskForm.jsx
│   ├── TaskFilters.jsx
│   ├── TaskModal.jsx
│   ├── TeamManager.jsx
│   ├── TeamForm.jsx
│   ├── Header.jsx
│   ├── Sidebar.jsx
│   └── StatsCard.jsx
├── pages/
│   ├── DashboardPage.jsx
│   ├── TasksPage.jsx
│   ├── TeamPage.jsx
│   └── SettingsPage.jsx
├── context/
│   ├── TaskContext.jsx
│   └── TeamContext.jsx
├── hooks/
│   ├── useTasks.js
│   ├── useTeam.js
│   └── useLocalStorage.js
├── utils/
│   ├── storage.js
│   ├── validators.js
│   └── helpers.js
├── App.jsx
├── App.css
└── index.css
```

---

## 🔧 REQUISITOS TÉCNICOS

### Setup Inicial
- [ ] Crear proyecto React con Vite
- [ ] Instalar Tailwind CSS
- [ ] Instalar React Router v6
- [ ] Configurar estructura de carpetas
- [ ] Setup Context API

### Dependencias Necesarias
```json
{
  "react": "^18.0.0",
  "react-dom": "^18.0.0",
  "react-router-dom": "^6.0.0",
  "date-fns": "^2.29.0"
}
```

### DevDependencies
```json
{
  "vite": "^4.0.0",
  "tailwindcss": "^3.0.0",
  "autoprefixer": "^10.0.0",
  "postcss": "^8.0.0"
}
```

---

## 📝 COMPONENTES A CREAR

### 1. **Header** (Navbar superior)
- Logo + Nombre aplicación
- Búsqueda global
- Avatar usuario + menu dropdown
- Responsive menu hamburguesa en mobile

### 2. **Sidebar** (Navegación lateral)
- Logo
- Menu items: Dashboard, Mis Tareas, Equipo, Reportes, Configuración
- Indicador de página activa
- Collapse en mobile

### 3. **Dashboard** (Página principal)
- 4 StatsCard (Total, Completadas, En Progreso, Pendientes)
- Gráfico Pie Chart (por estado)
- Gráfico Bar Chart (por prioridad)
- Sección "Próximas a vencer"
- Responsive grid

### 4. **TaskList** (Lista de tareas)
- Tabla con columnas: ID, Nombre, Descripción, Prioridad, Estado, Asignado, Fecha Límite, Acciones
- Filas con hover effect
- Paginación
- Botón "Nueva Tarea"

### 5. **TaskCard** (Tarjeta individual de tarea)
- Nombre, descripción truncada
- Prioridad (color badge)
- Estado (color badge)
- Avatar asignado
- Fecha límite
- Acciones (editar, eliminar)

### 6. **TaskForm/TaskModal** (Crear/Editar tarea)
- Inputs: Nombre*, Descripción, Prioridad*, Estado*, Asignado, Fecha Límite
- Validación de campos
- Botones: Guardar, Cancelar
- Mensajes de error/éxito

### 7. **TaskFilters** (Controles de filtrado)
- Input búsqueda
- Dropdown Estado
- Dropdown Prioridad
- Dropdown Asignado
- Botón limpiar filtros

### 8. **TeamManager** (Gestión de equipo)
- Tabla o cards de miembros
- Columnas: Avatar, Nombre, Email, Rol, Tareas, Acciones
- Botón "Agregar Miembro"
- Acciones: Editar, Eliminar

### 9. **TeamForm** (Crear/Editar miembro)
- Inputs: Nombre*, Email*, Rol*
- Dropdown Rol (con colores)
- Botones: Guardar, Cancelar

### 10. **StatsCard** (Tarjeta de estadística)
- Número grande
- Icono
- Descripción
- Color según tipo

---

## 💾 ESTRUCTURA DE DATOS

### Tarea (Task)
```javascript
{
  id: "task-1",
  title: "Implementar login",
  description: "Agregar autenticación con email y contraseña",
  status: "pending", // pending, in_progress, completed
  priority: "high", // high, medium, low
  assignedTo: "user-2", // id del miembro
  dueDate: "2026-05-20",
  createdAt: "2026-05-14",
  updatedAt: "2026-05-14",
  groupId: "group-1" // opcional para FASE 2
}
```

### Miembro (Team Member)
```javascript
{
  id: "user-1",
  name: "María García",
  email: "maria@example.com",
  role: "admin", // admin, leader, member, viewer
  avatar: "https://...", // opcional
  createdAt: "2026-05-14"
}
```

---

## 🎯 REQUISITOS DE VALIDACIÓN

### Campos Obligatorios
- Nombre de tarea: 1-255 caracteres
- Email de miembro: email válido
- Nombre de miembro: 1-100 caracteres
- Rol: una de las 4 opciones

### Validaciones Visuales
- Campo válido: borde gris claro + checkmark verde
- Campo error: borde rojo + mensaje de error
- Hover en inputs: fondo gris muy claro
- Focus: borde azul

---

## 🔄 FLUJO DE ESTADO (Context API)

### TaskContext
```
- tasks: [] (array de tareas)
- addTask(task)
- updateTask(id, updates)
- deleteTask(id)
- getTasks()
- getTaskById(id)
```

### TeamContext
```
- members: [] (array de miembros)
- addMember(member)
- updateMember(id, updates)
- deleteMember(id)
- getMembers()
- getMemberById(id)
```

---

## 💾 PERSISTENCIA (localStorage)

**Keys a usar:**
```javascript
localStorage.setItem('tasks', JSON.stringify(tasks))
localStorage.setItem('team_members', JSON.stringify(members))
```

**Al montar App:**
```javascript
- Cargar tasks desde localStorage
- Cargar members desde localStorage
- Si no existen, cargar datos de ejemplo
```

---

## 📊 DATOS DE EJEMPLO INICIALES

### Tasks de Ejemplo (6-8)
```javascript
{
  id: "task-1",
  title: "Diseñar Dashboard",
  description: "Crear mockup y prototipo del dashboard",
  status: "completed",
  priority: "high",
  assignedTo: "user-1",
  dueDate: "2026-05-10",
  createdAt: "2026-05-01",
  updatedAt: "2026-05-10"
}
```

### Team Members de Ejemplo (4-5)
```javascript
{
  id: "user-1",
  name: "María García",
  email: "maria@empresa.com",
  role: "admin",
  createdAt: "2026-05-01"
}
```

---

## 🎨 ESTILOS TAILWIND ESPECÍFICOS

### Colores Personalizados en tailwind.config.js
```javascript
extend: {
  colors: {
    primary: '#2563EB',
    success: '#10B981',
    warning: '#FBBF24',
    error: '#EF4444',
    dark: '#1F2937',
    light: '#F3F4F6'
  }
}
```

### Clases Reutilizables
```
btn-primary: bg-blue-600 hover:bg-blue-700 text-white
btn-secondary: bg-gray-200 hover:bg-gray-300 text-gray-900
badge-high: bg-red-100 text-red-800
badge-medium: bg-yellow-100 text-yellow-800
badge-low: bg-green-100 text-green-800
```

---

## 📱 RESPONSIVE BREAKPOINTS

- **Mobile:** 320px - 639px (1 columna)
- **Tablet:** 640px - 1023px (2 columnas)
- **Desktop:** 1024px+ (3+ columnas)

---

## ✅ CHECKLIST DE IMPLEMENTACIÓN

- [ ] Setup React + Vite + Tailwind
- [ ] Crear estructura de carpetas
- [ ] Crear contextos (TaskContext, TeamContext)
- [ ] Crear hooks personalizados
- [ ] Crear componentes base (Header, Sidebar)
- [ ] Crear componentes de tareas (TaskList, TaskCard, TaskForm)
- [ ] Crear componentes de equipo (TeamManager, TeamForm)
- [ ] Implementar CRUD de tareas
- [ ] Implementar CRUD de equipo
- [ ] Implementar búsqueda y filtros
- [ ] Implementar Dashboard
- [ ] Implementar localStorage
- [ ] Implementar React Router
- [ ] Testing responsivo
- [ ] Testing de funcionalidades
- [ ] Pulido de UI
- [ ] Documentación de código

---

## 🚀 INSTRUCCIONES FINALES

1. **Crea el proyecto:** `npm create vite@latest task-manager -- --template react`
2. **Instala dependencias:** `npm install`
3. **Configura Tailwind:** Sigue guía oficial de Tailwind + Vite
4. **Comienza con estructura de carpetas**
5. **Crea los contextos y hooks**
6. **Desarrolla componentes uno a uno**
7. **Integra localStorage**
8. **Prueba completamente antes de siguiente fase**

---

## 📞 CONTACTO SI NECESITAS ACLARACIONES

- Paleta de colores: Ver arriba
- Funcionalidades: Ver sección "Funcionalidades FASE 1"
- Estructura datos: Ver sección "Estructura de Datos"
- Cualquier duda: Pregunta antes de codificar

---

**¡LISTO PARA EMPEZAR! 🚀**
