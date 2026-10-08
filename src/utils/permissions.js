export const PERMISSIONS = [
  { key: 'canCreateTask', label: 'Crear tareas' },
  { key: 'canEditTask',   label: 'Editar tareas' },
  { key: 'canDeleteTask', label: 'Eliminar tareas' },
  { key: 'canComment',    label: 'Agregar comentarios' },
  { key: 'canViewReports',  label: 'Ver reportes' },
  { key: 'canManageGroups', label: 'Gestionar grupos' },
]

export const DEFAULT_PERMISSIONS = {
  admin:  { canCreateTask: true,  canEditTask: true,  canDeleteTask: true,  canComment: true,  canViewReports: true,  canManageGroups: true },
  leader: { canCreateTask: true,  canEditTask: true,  canDeleteTask: true,  canComment: true,  canViewReports: true,  canManageGroups: true },
  member: { canCreateTask: true,  canEditTask: true,  canDeleteTask: false, canComment: true,  canViewReports: false, canManageGroups: false },
  viewer: { canCreateTask: false, canEditTask: false, canDeleteTask: false, canComment: false, canViewReports: false, canManageGroups: false },
}

// Registro de actividad: admin siempre; los demás (menos viewer) con permissions.modulos.actividad.canVer.
// El servidor lo valida igual (middleware/actividadAccess.js).
export function puedeVerActividad(user) {
  if (!user) return false
  if (user.role === 'admin') return true
  return user.role !== 'viewer' && user.permissions?.modulos?.actividad?.canVer === true
}

export function getEffectivePermissions(user) {
  const base = DEFAULT_PERMISSIONS[user?.role] ?? DEFAULT_PERMISSIONS.viewer
  if (!user?.permissions || Object.keys(user.permissions).length === 0) return base
  return { ...base, ...user.permissions }
}
