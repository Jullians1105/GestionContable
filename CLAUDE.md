# Gestor de Tareas Empresarial - FASE 1 MVP

## Descripción del Proyecto
Aplicación web de gestión de tareas para equipos de hasta 25 personas. Construida con React 18, Vite, Tailwind CSS y localStorage como persistencia.

## Stack Tecnológico
- **Frontend:** React 18 + Vite 5
- **Estilos:** Tailwind CSS 3
- **Routing:** React Router v6
- **Gráficos:** Recharts
- **Fechas:** date-fns 3
- **Estado global:** Context API
- **Persistencia:** localStorage

## Comandos
```bash
npm run dev      # Servidor de desarrollo (localhost:5173)
npm run build    # Build de producción
npm run preview  # Previsualizar build
```

## Estructura del Proyecto
```
src/
├── components/       # Componentes reutilizables
│   ├── Dashboard.jsx      # Dashboard con gráficos Recharts
│   ├── Header.jsx         # Navbar con búsqueda global
│   ├── Sidebar.jsx        # Navegación lateral
│   ├── StatsCard.jsx      # Tarjeta de estadística
│   ├── TaskCard.jsx       # Tarjeta individual de tarea
│   ├── TaskFilters.jsx    # Filtros de búsqueda
│   ├── TaskForm.jsx       # Formulario crear/editar tarea
│   ├── TaskList.jsx       # Lista paginada de tareas (9/página)
│   ├── TaskModal.jsx      # Modal wrapper para TaskForm
│   ├── TeamForm.jsx       # Formulario crear/editar miembro
│   └── TeamManager.jsx    # CRUD miembros + tabla/cards responsive
├── context/
│   ├── TaskContext.jsx    # Estado global de tareas
│   └── TeamContext.jsx    # Estado global del equipo
├── hooks/
│   ├── useTasks.js        # Hook para consumir TaskContext
│   ├── useTeam.js         # Hook para consumir TeamContext
│   └── useLocalStorage.js # Hook genérico de localStorage
├── pages/
│   ├── DashboardPage.jsx  # Ruta /
│   ├── TasksPage.jsx      # Ruta /tasks (acepta ?search=)
│   ├── TeamPage.jsx       # Ruta /team
│   └── SettingsPage.jsx   # Ruta /settings (export JSON, reset)
└── utils/
    ├── helpers.js         # Constantes, formatDate, isDueDate*, getInitials
    ├── sampleData.js      # Datos de ejemplo (5 miembros, 8 tareas)
    ├── storage.js         # Wrapper de localStorage
    └── validators.js      # Validaciones de formularios
```

## Modelos de Datos

### Tarea (Task)
```js
{
  id: string,            // "task-{timestamp}-{random}"
  title: string,         // Obligatorio, max 255 chars
  description: string,   // Opcional
  status: 'pending' | 'in_progress' | 'completed',
  priority: 'high' | 'medium' | 'low',
  assignedTo: string,    // id del miembro (opcional)
  dueDate: string,       // "YYYY-MM-DD" (opcional)
  createdAt: string,
  updatedAt: string,
}
```

### Miembro (TeamMember)
```js
{
  id: string,           // "user-{timestamp}-{random}"
  name: string,         // Obligatorio, max 100 chars
  email: string,        // Obligatorio, formato válido
  role: 'admin' | 'leader' | 'member' | 'viewer',
  createdAt: string,
}
```

## Persistencia localStorage
- `tasks` → array JSON de tareas
- `team_members` → array JSON de miembros
- Si no existen las keys, carga datos de ejemplo de `sampleData.js`

## Paleta de Colores
```
Azul Profesional: #2563EB  (primario, botones)
Rojo:            #EF4444   (prioridad alta, errores)
Amarillo:        #FBBF24   (prioridad media, advertencias)
Verde:           #10B981   (prioridad baja, éxito)
Naranja:         #F97316   (información)
Gris Oscuro:     #1F2937   (texto principal)
Gris Claro:      #F3F4F6   (fondos)
```

## Funcionalidades Implementadas (FASE 1 MVP)
- [x] CRUD completo de tareas con validaciones
- [x] CRUD completo de miembros del equipo
- [x] Estados: Pendiente / En Progreso / Completada
- [x] Prioridades: Alta / Media / Baja (con colores)
- [x] Asignación de tareas a miembros
- [x] Fechas límite con indicadores vencida/próxima
- [x] Búsqueda por texto + 4 filtros combinables
- [x] Paginación (9 tareas por página)
- [x] Dashboard con gráfico de pie (por estado) y barras (por prioridad)
- [x] Sección "Próximas a vencer" en dashboard
- [x] Interfaz responsiva (mobile, tablet, desktop)
- [x] Persistencia automática en localStorage
- [x] Export de datos a JSON
- [x] Reset a datos de ejemplo

## Estado del Proyecto
- **Fase actual:** FASE 1 - MVP completada
- **Próxima fase:** FASE 2 (autenticación, grupos, reportes PDF, backend)

## Convenciones de Código
- Componentes: PascalCase
- Hooks y utils: camelCase
- Sin comentarios en código (nombres de funciones son descriptivos)
- Tailwind CSS para todos los estilos
- No usar `useEffect` para derivar estado (usar `useMemo`)
