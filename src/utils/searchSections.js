// Buscador de secciones/páginas de la app (no de datos como empresas o terceros — eso queda
// para más adelante si hace falta). Junta la navegación real de Sidebar.jsx (una sola fuente,
// ver config/navigation.js) en una lista plana, filtrable por texto.
import { navItems, DIAN_NAV, FONDO_NAV, EMPRESAS_MAESTRO_NAV, MODULE_TITLES } from '../config/navigation'

const quitarAcentos = (texto) => String(texto ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '')
const normalizar = (texto) => quitarAcentos(texto).toLowerCase().trim()

// Mismas reglas de visibilidad que Sidebar.jsx#visible — para que el buscador no ofrezca una
// sección que el usuario no vería nunca en el menú (Reportes/Carga de trabajo/Grupos piden
// admin o leader; Usuarios pide admin; Recurrentes es leaderOnly).
function filtrarPorPermiso(items, { isAdmin, isLeader }) {
  return items.filter((item) => {
    if (item.leaderOnly && !isAdmin && !isLeader) return false
    if (item.to === '/reports' && !isAdmin && !isLeader) return false
    if (item.to === '/workload' && !isAdmin && !isLeader) return false
    if (item.to === '/groups' && !isAdmin && !isLeader) return false
    if (item.to === '/usuarios' && !isAdmin) return false
    return true
  })
}

// DIAN_NAV/FONDO_NAV/EMPRESAS_MAESTRO_NAV no tienen guardas de permiso en Sidebar.jsx hoy
// (cualquier usuario autenticado los ve) — el buscador respeta ese mismo comportamiento, no
// inventa restricciones nuevas.
export function buildSearchableSections({ isAdmin, isLeader }) {
  return [
    ...filtrarPorPermiso(navItems, { isAdmin, isLeader }).map((item) => ({ ...item, module: 'tasks' })),
    ...DIAN_NAV.map((item) => ({ ...item, module: 'dian' })),
    ...FONDO_NAV.map((item) => ({ ...item, module: 'fondo' })),
    ...EMPRESAS_MAESTRO_NAV.map((item) => ({ ...item, module: 'empresas-directorio' })),
  ]
}

export function filtrarSecciones(secciones, query, limite = 8) {
  const q = normalizar(query)
  if (!q) return []
  return secciones
    .filter((s) => normalizar(s.label).includes(q))
    .slice(0, limite)
    .map((s) => ({ ...s, moduleLabel: MODULE_TITLES[s.module] }))
}
