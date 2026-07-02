# Tareas Recurrentes Mensuales
## Plan de implementación — listo para ejecutar

**Fecha de evaluación:** 2026-06-26  
**Estado:** Evaluado ✅ — Pendiente de implementación

---

## Contexto

Tareas que se repiten mensualmente con fechas no fijas. El líder definía cada tarea manualmente desde cero cada mes. Este módulo automatiza la generación de instancias y notifica al líder para que confirme la fecha exacta.

**Decisiones tomadas:**

| Punto | Decisión |
|---|---|
| Templates visibles en listado principal | ❌ No — sección aparte `/tasks/recurrentes` |
| Quién crea templates | Solo `leader` y `admin` |
| Día aproximado | Obligatorio al crear el template |
| Vínculo Fondo | Sin herencia — instancias son independientes |
| Recordatorios | No en esta fase — se agregan después |

---

## Flujo final

```
LÍDER (una sola vez):
Sección "Recurrentes" → Nuevo template → título, asignado, grupo, prioridad, día aprox (ej: 25)

INICIO DE CADA MES (días 1, 2 y 3 — resistencia a servidor caído):
cron → busca templates activos → genera instancia por template
     → instancia: mismo título/asignado/grupo, due_date = YYYY-MM-{approxDay}, status = pending
     → notifica a líderes: "Nómina necesita fecha para julio (~día 25)"

LÍDER:
Abre notificación → ve instancia en listado principal → edita fecha exacta → guarda
```

---

## Checklist de implementación

### PASO 1 — Base de datos

- [ ] Crear `backend/migrations/013_recurring_tasks.sql`
  ```sql
  ALTER TABLE tasks ADD COLUMN IF NOT EXISTS is_recurring  BOOLEAN NOT NULL DEFAULT false;
  ALTER TABLE tasks ADD COLUMN IF NOT EXISTS recurrence    JSONB;
  ALTER TABLE tasks ADD COLUMN IF NOT EXISTS template_id   UUID REFERENCES tasks(id) ON DELETE SET NULL;

  CREATE INDEX IF NOT EXISTS idx_tasks_recurring
    ON tasks(is_recurring) WHERE is_recurring = true;
  ```
- [ ] Correr migración en dev: `docker compose -f docker-compose.dev.yml run --rm migrate`

---

### PASO 2 — Backend: servicio de recurrencia

- [ ] Crear `backend/src/services/recurringTaskService.js`
  - [ ] `generateMonthlyInstances(io)` — genera instancias del mes actual
  - [ ] `cloneTemplate(template, anio, mes)` — crea una instancia a partir del template
  - [ ] Deduplicación: no generar si ya existe instancia del mismo template en el mismo mes
  - [ ] Validar día aproximado vs. último día del mes (`Math.min(approxDay, lastDayOfMonth)`)
  - [ ] Emitir `task:created` por socket para cada instancia generada
  - [ ] Insertar notificación en BD + emitir por socket a todos los líderes

---

### PASO 3 — Backend: cron

- [ ] `npm install node-cron` en `backend/`
- [ ] Inicializar cron en `backend/src/index.js` después de `setupSocket(io)`
  ```js
  const { initRecurringCron } = require('./services/recurringTaskService')
  initRecurringCron(io)
  ```
- [ ] Cron schedule: `'0 7 1-3 * *'` (días 1, 2 y 3 de cada mes a las 7 AM)

---

### PASO 4 — Backend: controller y rutas

- [ ] `taskController.js` — `normalizeTask()`: agregar campos
  ```js
  isRecurring: t.is_recurring ?? false,
  recurrence:  t.recurrence  ?? null,
  templateId:  t.template_id ?? null,
  ```
- [ ] `taskController.js` — `createTask()`: aceptar `isRecurring` y `recurrence` del body
  ```js
  const { ..., isRecurring = false, recurrence = null } = req.body
  // agregar a INSERT: is_recurring, recurrence
  ```
- [ ] `taskController.js` — filtro en `getTasks()`: excluir templates del listado principal
  ```sql
  AND (t.is_recurring = false OR t.template_id IS NOT NULL)
  ```
- [ ] `tasks.js` (routes) — nuevo endpoint para listar templates:
  ```
  GET /api/tasks/templates  → solo líderes/admin, devuelve is_recurring=true AND template_id IS NULL
  ```
- [ ] `tasks.js` (routes) — proteger POST de templates con `roleMiddleware('admin','leader')`
- [ ] Agregar tipo `'task_reminder_pending'` al mapa de notificaciones del socket

---

### PASO 5 — Frontend: API service

- [ ] `src/services/api.js` — agregar:
  ```js
  getTemplates: ()           => request('/tasks/templates'),
  createTemplate: (data)     => request('/tasks', { method: 'POST', body: data }),
  ```

---

### PASO 6 — Frontend: validación

- [ ] `src/utils/validators.js` — eximir `dueDate` cuando `isRecurring = true`
  ```js
  if (!form.isRecurring && !form.dueDate) errors.dueDate = 'La fecha límite es obligatoria'
  ```

---

### PASO 7 — Frontend: TaskForm

- [ ] Agregar a `EMPTY_TASK`: `isRecurring: false, recurrence: null`
- [ ] Toggle "Se repite mensualmente" (solo visible para líderes/admin)
- [ ] Si `isRecurring = true`:
  - [ ] Campo `dueDate` se oculta (reemplazado por "día aproximado")
  - [ ] Mostrar input numérico: "Día aproximado del mes" (1–31, obligatorio)
  - [ ] `form.recurrence = { type: 'monthly', approx_day: N }`
- [ ] Si `isRecurring = false`: comportamiento actual sin cambios

---

### PASO 8 — Frontend: TaskCard

- [ ] Badge "Recurrente" (color distinto, ej: naranja) cuando `task.isRecurring && !task.templateId`
  > No aplica porque los templates no aparecen en el listado — pero dejar el badge por si se filtra mal
- [ ] Badge "Sin fecha" cuando `!task.dueDate && task.templateId` (instancia pendiente de confirmar)
- [ ] El badge "Sin fecha" debe llamar la atención — quizás en amarillo/naranja

---

### PASO 9 — Frontend: sección Templates

- [ ] Nueva ruta: `/tasks/recurrentes`
- [ ] Nuevo componente: `src/pages/RecurringTasksPage.jsx`
  - [ ] Lista de templates existentes (GET /api/tasks/templates)
  - [ ] Botón "Nuevo template recurrente" → abre `TaskModal` con `isRecurring=true`
  - [ ] Cada fila: título · asignado · día aprox · grupo · acciones (editar/eliminar)
  - [ ] Solo visible para líderes/admin (proteger ruta)
- [ ] Agregar enlace en la navegación lateral (sidebar) solo para líderes/admin

---

### PASO 10 — Frontend: notificación al líder

- [ ] `NotificationContext.jsx` — agregar tipo `task_reminder_pending` a `NOTIF_TITLES`:
  ```js
  task_reminder_pending: 'Tarea recurrente pendiente de fecha',
  ```
- [ ] El toast de la notificación debe incluir botón "Ver" que navega al listado de tareas

---

### PASO 11 — Testing manual

- [ ] Crear template desde `/tasks/recurrentes`
- [ ] Verificar que NO aparece en el listado principal (`/tasks`)
- [ ] Ejecutar cron manualmente (o simular con fecha del día 1)
- [ ] Verificar que la instancia SÍ aparece en el listado principal con badge "Sin fecha"
- [ ] Verificar que líderes reciben notificación
- [ ] Editar la instancia para asignar fecha → badge desaparece
- [ ] Verificar deduplicación: correr cron dos veces → solo una instancia
- [ ] Caso borde: template con `approx_day = 31` en febrero → debe generar el día 28/29

---

## Archivos que cambian

```
backend/migrations/013_recurring_tasks.sql         NUEVO
backend/src/services/recurringTaskService.js       NUEVO
backend/src/index.js                               +init cron (~5 líneas)
backend/src/controllers/taskController.js          normalizeTask, createTask, getTasks
backend/src/routes/tasks.js                        GET /templates
backend/package.json                               + node-cron

src/pages/RecurringTasksPage.jsx                   NUEVO
src/components/TaskForm.jsx                        toggle recurrente + día aprox
src/components/TaskCard.jsx                        badge "Sin fecha"
src/context/TaskContext.jsx                        addTask pasa isRecurring/recurrence
src/context/NotificationContext.jsx                + tipo task_reminder_pending
src/utils/validators.js                            eximir dueDate si isRecurring
src/services/api.js                                getTemplates, createTemplate
src/App.jsx (o router)                             + ruta /tasks/recurrentes
```

---

## Lo que NO entra en esta fase

- Recordatorios/alarmas (evaluados, van después)
- Herencia de vínculo Fondo (instancias son independientes)
- Edición en cadena (editar template no actualiza instancias ya generadas)
- Tipos de recurrencia distintos a mensual

---

## Notas para la sesión

- Empezar siempre por el PASO 1 (migración) — sin esto nada funciona
- El cron del PASO 3 se puede probar en dev llamando `generateMonthlyInstances(io)` directamente desde una ruta temporal
- El filtro de `getTasks()` (PASO 4) es el cambio más delicado — verificar que instancias sí aparecen y templates no
