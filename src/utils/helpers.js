import { format, isAfter, isBefore, addDays, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'

export const generateId = (prefix = 'id') =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`

// Normaliza assignedTo a array — soporta datos viejos con string
export const normalizeAssignedTo = (val) => {
  if (!val) return []
  if (Array.isArray(val)) return val
  return [val]
}

// Progreso de una tarea según el estado individual de cada asignado (task.assignees).
// null si la tarea no tiene asignados trackeados (tareas sin asignar, o creadas antes
// de esta feature y aún no re-sincronizadas).
export const getTaskProgress = (task) => {
  const assignees = task.assignees || []
  if (assignees.length === 0) return null
  const completed = assignees.filter((a) => a.status === 'completed').length
  return { completed, total: assignees.length, pct: Math.round((completed / assignees.length) * 100) }
}

// Mismo criterio de agregación que el backend (recalculateTaskStatus en taskController.js):
// completed solo si todos completaron, in_progress si alguno avanzó, pending si nadie.
export const computeAggregateStatus = (assignees) => {
  if (!assignees || assignees.length === 0) return null
  if (assignees.every((a) => a.status === 'completed')) return 'completed'
  if (assignees.some((a) => a.status === 'in_progress' || a.status === 'completed')) return 'in_progress'
  return 'pending'
}

export const formatDate = (dateStr, timeStr = '') => {
  if (!dateStr) return '—'
  try {
    const formatted = format(parseISO(dateStr), 'dd/MM/yyyy', { locale: es })
    return timeStr ? `${formatted}, ${timeStr}` : formatted
  } catch {
    return dateStr
  }
}

export const today = () => format(new Date(), 'yyyy-MM-dd')

const toDatetime = (dateStr, timeStr = '') => parseISO(`${dateStr}T${timeStr || '19:00'}`)

export const isDueDateOverdue = (dateStr, timeStr = '') => {
  if (!dateStr) return false
  try {
    return isBefore(toDatetime(dateStr, timeStr), new Date())
  } catch {
    return false
  }
}

export const isDueDateSoon = (dateStr, timeStr = '', days = 3) => {
  if (!dateStr) return false
  try {
    const due = toDatetime(dateStr, timeStr)
    const now = new Date()
    return isAfter(due, now) && isBefore(due, addDays(now, days))
  } catch {
    return false
  }
}

export const getInitials = (name = '') => {
  return name
    .split(' ')
    .slice(0, 2)
    .map((n) => n[0])
    .join('')
    .toUpperCase()
}

export const PRIORITY_LABELS = {
  high: 'Alta',
  medium: 'Media',
  low: 'Baja',
}

export const STATUS_LABELS = {
  pending: 'Pendiente',
  in_progress: 'En Progreso',
  completed: 'Completada',
}

export const ROLE_LABELS = {
  admin: 'Administrador',
  leader: 'Líder',
  member: 'Miembro',
  viewer: 'Viewer',
}

export const PRIORITY_OPTIONS = [
  { value: 'high', label: 'Alta' },
  { value: 'medium', label: 'Media' },
  { value: 'low', label: 'Baja' },
]

export const STATUS_OPTIONS = [
  { value: 'pending', label: 'Pendiente' },
  { value: 'in_progress', label: 'En Progreso' },
  { value: 'completed', label: 'Completada' },
]

export const ROLE_OPTIONS = [
  { value: 'admin', label: 'Administrador' },
  { value: 'leader', label: 'Líder' },
  { value: 'member', label: 'Miembro' },
  { value: 'viewer', label: 'Viewer' },
]

export const AVATAR_COLORS = [
  'bg-blue-500', 'bg-purple-500', 'bg-green-500', 'bg-red-500',
  'bg-yellow-500', 'bg-pink-500', 'bg-indigo-500', 'bg-teal-500',
]

export const getAvatarColor = (name = '') => {
  const index = name.charCodeAt(0) % AVATAR_COLORS.length
  return AVATAR_COLORS[index]
}
