// Fuente única de la navegación real de la app — Sidebar.jsx y el buscador de secciones del
// Header (ver utils/searchSections.js) leen de acá, para no mantener dos listas de rutas que
// puedan desincronizarse.

export const navItems = [
  { to: '/', label: 'Dashboard', icon: 'dashboard', end: true },
  { to: '/tasks', label: 'Mis Tareas', icon: 'task_alt' },
  { to: '/pendientes', label: 'Mis Pendientes', icon: 'checklist' },
  { to: '/notas', label: 'Mis Notas', icon: 'edit_note' },
  { to: '/kanban', label: 'Kanban', icon: 'view_kanban' },
  { to: '/calendar', label: 'Calendario', icon: 'calendar_month' },
  { to: '/tasks/recurrentes', label: 'Recurrentes', icon: 'repeat', leaderOnly: true },
  { to: '/team', label: 'Equipo', icon: 'group' },
  { to: '/groups', label: 'Grupos', icon: 'group_work' },
  { to: '/reports', label: 'Reportes', icon: 'bar_chart' },
  { to: '/workload', label: 'Carga de trabajo', icon: 'balance' },
  { to: '/usuarios', label: 'Usuarios', icon: 'manage_accounts' },
  { to: '/notifications', label: 'Notificaciones', icon: 'notifications' },
  { to: '/settings', label: 'Configuración', icon: 'settings' },
]

export const modules = [
  { id: 'tasks',   label: 'Gestor de Tareas',    icon: 'task_alt' },
  { id: 'fondo',   label: 'Fondo Emprender',      icon: 'rocket_launch' },
  { id: 'dian',    label: 'Gestión Tributaria',   icon: 'account_balance' },
  // Directorio maestro que une los 4 catálogos de empresas (Fondo Emprender; Empresas
  // Externas y Nómina Electrónica, ambos anidados dentro de Gestión Tributaria; y
  // Contabilidad) — ícono propio ('contacts', no 'corporate_fare'/'domain' — esos dos son
  // siluetas de edificio casi iguales a este tamaño) para que se distinga a simple vista. Se
  // ve sin importar en qué módulo se esté parado, a diferencia de Usuarios/Configuración
  // (esos sí viven solo dentro de "Gestor de Tareas").
  { id: 'empresas-directorio', label: 'Empresas', icon: 'contacts' },
]

export const MODULE_TITLES = {
  tasks:    'Gestor de Tareas',
  fondo:    'Fondo Emprender',
  dian:     'Gestión Tributaria',
  'empresas-directorio': 'Empresas',
}

export const DIAN_NAV = [
  { to: '/dian/upload',     label: 'Contabilidad',     icon: 'upload_file',   end: true,
    matchPrefixes: ['/dian/clasificacion', '/dian/nomina/', '/dian/exportacion'] },
  { to: '/dian/consolidado', label: 'Consolidado',     icon: 'query_stats',   end: true },
  { to: '/exogenas/upload', label: 'Exógenas',          icon: 'request_quote', end: true },
  { to: '/dian/terceros',   label: 'Importar Terceros', icon: 'location_on',   end: true },
  { to: '/dian/consulta-tercero', label: 'Consulta Tercero', icon: 'person_search', end: true },
  { to: '/empresas-externas', label: 'Empresas Externas', icon: 'table_chart', end: true },
  // Sin `end: true` a propósito — tiene una sub-página real (/dian/nomina-electronica/empresas,
  // ver NominaElectronicaPage.jsx) y debe seguir marcado como activo ahí también.
  { to: '/dian/nomina-electronica', label: 'Seguimiento Nómina', icon: 'badge' },
]

export const EMPRESAS_MAESTRO_NAV = [
  { to: '/empresas', label: 'Directorio', icon: 'contacts', end: true },
]

export const FONDO_NAV = [
  { to: '/fondo-emprender',          label: 'Seguimiento mensual', icon: 'table_chart',    end: true },
  { to: '/fondo-emprender/empresas', label: 'Empresas',            icon: 'corporate_fare' },
  { to: '/fondo-emprender/pagos',    label: 'Pagos',               icon: 'payments' },
]

// Deriva qué módulo del sidebar corresponde a la ruta actual — ver el comentario original en
// Sidebar.jsx (bug real: recargar en /dian/consolidado dejaba el sidebar en "Gestor de
// Tareas"). El orden importa poco porque los prefijos no se pisan, salvo '/empresas' vs
// '/empresas-externas' — por eso ese caso usa === exacto.
export function moduleForPath(pathname) {
  if (pathname.startsWith('/fondo-emprender')) return 'fondo'
  if (pathname.startsWith('/dian') || pathname.startsWith('/exogenas') || pathname === '/empresas-externas') return 'dian'
  if (pathname === '/empresas') return 'empresas-directorio'
  return 'tasks'
}
