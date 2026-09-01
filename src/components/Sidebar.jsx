import { useState, useRef, useCallback, useEffect } from 'react'
import { NavLink } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { useNotifications } from '../context/NotificationContext'
import TaskModal from './TaskModal'
import logoBlanco from '../assets/logo-icono-blanco.png'

const navItems = [
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

const modules = [
  { id: 'tasks',   label: 'Gestor de Tareas',    icon: 'task_alt' },
  { id: 'fondo',   label: 'Fondo Emprender',      icon: 'rocket_launch' },
  { id: 'dian',    label: 'Gestión Tributaria',   icon: 'receipt_long' },
  { id: 'empresas', label: 'Empresas Externas',   icon: 'corporate_fare' },
]

const MODULE_TITLES = {
  tasks:    'Gestor de Tareas',
  fondo:    'Fondo Emprender',
  dian:     'Gestión Tributaria',
  empresas: 'Empresas Externas',
}

const DIAN_NAV = [
  { to: '/dian/upload',     label: 'Contabilidad',     icon: 'upload_file',   end: true },
  { to: '/exogenas/upload', label: 'Exógenas',          icon: 'request_quote', end: true },
  { to: '/dian/nomina-electronica', label: 'Nómina Electrónica', icon: 'badge', end: true },
  { to: '/dian/terceros',   label: 'Importar Terceros', icon: 'location_on',   end: true },
  { to: '/dian/consulta-tercero', label: 'Consulta Tercero', icon: 'person_search', end: true },
]

const EXTERNAS_NAV = [
  { to: '/empresas-externas', label: 'Seguimiento mensual', icon: 'table_chart', end: true },
]

const FONDO_NAV = [
  { to: '/fondo-emprender',          label: 'Seguimiento mensual', icon: 'table_chart',    end: true },
  { to: '/fondo-emprender/empresas', label: 'Empresas',            icon: 'corporate_fare' },
  { to: '/fondo-emprender/pagos',    label: 'Pagos',               icon: 'payments' },
]

function setSidebarCssVar(pinned) {
  document.documentElement.style.setProperty(
    '--sidebar-w',
    pinned ? '314px' : '112px'
  )
}

export default function Sidebar({ open, onClose }) {
  const { isAdmin, isLeader, hasPermission } = useAuth()
  const { addToast } = useToast()
  const { unreadCount } = useNotifications()
  const [showModal, setShowModal] = useState(false)
  const [activeModule, setActiveModule] = useState('tasks')
  const [pinned, setPinned] = useState(() => {
    const p = localStorage.getItem('sidebar_pinned') === 'true'
    setSidebarCssVar(p)
    return p
  })

  function togglePin() {
    setPinned(prev => {
      const next = !prev
      localStorage.setItem('sidebar_pinned', String(next))
      setSidebarCssVar(next)
      return next
    })
  }

  const visible = navItems.filter(item => {
    if (item.leaderOnly && !isAdmin() && !isLeader()) return false
    if (item.to === '/reports' && !isAdmin() && !isLeader()) return false
    if (item.to === '/workload' && !isAdmin() && !isLeader()) return false
    if (item.to === '/groups' && !isAdmin() && !isLeader()) return false
    if (item.to === '/usuarios' && !isAdmin()) return false
    return true
  })

  const activeModuleMeta = modules.find(m => m.id === activeModule)

  const navForModule =
    activeModule === 'tasks'    ? visible       :
    activeModule === 'fondo'    ? FONDO_NAV     :
    activeModule === 'dian'     ? DIAN_NAV      :
    activeModule === 'empresas' ? EXTERNAS_NAV  :
    []

  const hasNav = navForModule.length > 0

  // Sin scrollbar visible (ver scrollbar-hide en index.css) el único indicio
  // de que el nav tiene más ítems ocultos es un degradado arriba/abajo, como
  // el "scroll shadow" de apps nativas — visible solo si de verdad hay algo
  // que scrollear en esa dirección, no un adorno fijo. Solo importa en la
  // práctica para el admin, que ve bastantes más ítems que un usuario normal.
  const navRef = useRef(null)
  const [scrollShadow, setScrollShadow] = useState({ top: false, bottom: false })

  const updateScrollShadow = useCallback(() => {
    const el = navRef.current
    if (!el) { setScrollShadow({ top: false, bottom: false }); return }
    setScrollShadow({
      top: el.scrollTop > 1,
      bottom: el.scrollTop + el.clientHeight < el.scrollHeight - 1,
    })
  }, [])

  // Recalcula al cambiar de módulo (la cantidad de ítems cambia) y al
  // redimensionar la ventana o cambiar el zoom (cambia clientHeight) — el
  // mismo tipo de ajuste de zoom que causaba el scroll horizontal.
  useEffect(() => {
    updateScrollShadow()
    window.addEventListener('resize', updateScrollShadow)
    return () => window.removeEventListener('resize', updateScrollShadow)
  }, [activeModule, hasNav, updateScrollShadow])

  // Shared label class: hidden when collapsed, revealed on hover or when pinned
  const labelCls = pinned
    ? 'max-w-[180px] opacity-100'
    : 'max-w-0 opacity-0 group-hover/nav:max-w-[180px] group-hover/nav:opacity-100'

  return (
    <>
      <aside
        className={`fixed left-0 top-0 h-full z-50 flex transition-transform duration-300 ease-in-out ${
          open ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        {/* Column 1 – module icons (always 64 px) */}
        <div
          className="w-16 h-full flex flex-col items-center py-4 gap-1 flex-shrink-0 overflow-hidden"
          style={{ background: '#004ac6' }}
        >
          {/* Logo — navega al inicio */}
          <NavLink to="/" className="w-10 h-10 flex items-center justify-center mb-3 flex-shrink-0">
            <img
              src={logoBlanco}
              alt="Logo"
              className="w-9 h-9 object-contain"
            />
          </NavLink>
          {modules.map(({ id, label, icon }) => (
            <button
              key={id}
              onClick={() => setActiveModule(id)}
              title={label}
              className={`w-10 h-10 rounded-lg flex items-center justify-center transition-all ${
                activeModule === id
                  ? 'bg-white/20 text-white'
                  : 'text-white/60 hover:bg-white/10 hover:text-white'
              }`}
            >
              <span className="material-symbols-outlined text-xl">{icon}</span>
            </button>
          ))}
        </div>

        {/* Column 2 – nav content (collapses to 48 px, expands on hover/pin) */}
        <div
          className={`group/nav h-full bg-white dark:bg-[#1e2030] border-r border-[#c3c6d7] dark:border-[#2e3148] flex flex-col overflow-hidden shadow-[2px_0_12px_rgba(0,0,0,0.07)] transition-[width] duration-200 ease-in-out ${
            pinned ? 'w-[250px]' : 'w-12 hover:w-[250px]'
          }`}
        >
          {/* Header row */}
          <div className="flex items-center gap-1 pl-3 pr-2 h-16 flex-shrink-0 border-b border-[#e8eaf0] dark:border-[#2e3148]">
            <div
              className={`flex items-center gap-2.5 overflow-hidden transition-[max-width,opacity] duration-200 ${
                pinned
                  ? 'max-w-[210px] opacity-100'
                  : 'max-w-0 opacity-0 group-hover/nav:max-w-[210px] group-hover/nav:opacity-100'
              }`}
            >
              <span className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 bg-[#e8f0fe] dark:bg-[#1a2550]">
                <span className="material-symbols-outlined text-lg text-[#004ac6] dark:text-[#7ba8f0]">
                  {modules.find((m) => m.id === activeModule)?.icon}
                </span>
              </span>
              <span className="text-[15px] font-bold tracking-tight text-[#191c1e] dark:text-[#e4e6f0] whitespace-nowrap">
                {MODULE_TITLES[activeModule]}
              </span>
            </div>
            {/* spacer that only exists when expanded */}
            <span
              className={`transition-[flex] duration-200 ${
                pinned ? 'flex-1' : 'group-hover/nav:flex-1'
              }`}
            />
            {/* Pin button – only visible when expanded (hover or pinned) */}
            <button
              onClick={togglePin}
              title={pinned ? 'Desanclar sidebar' : 'Anclar sidebar'}
              className={`flex-shrink-0 p-1.5 rounded-lg transition-[colors,opacity] duration-200 hover:bg-[#edeef0] dark:hover:bg-[#252840] ${
                pinned
                  ? 'text-[#004ac6] opacity-100'
                  : 'text-[#b0b4cc] dark:text-[#4a5078] opacity-0 group-hover/nav:opacity-100'
              }`}
            >
              <span
                className="material-symbols-outlined"
                style={{
                  fontSize: 18,
                  display: 'block',
                  transform: pinned ? 'rotate(-45deg)' : 'none',
                  transition: 'transform 0.2s',
                }}
              >
                push_pin
              </span>
            </button>
            <button
              onClick={onClose}
              className="lg:hidden flex-shrink-0 p-1.5 rounded-lg hover:bg-[#edeef0] dark:hover:bg-[#252840] text-[#434655] dark:text-[#c4c8e8] transition"
            >
              <span className="material-symbols-outlined text-xl">close</span>
            </button>
          </div>

          {/* Nav links */}
          {hasNav ? (
            <>
              {/* overflow-x-hidden explícito: si solo se fija overflow-y-auto,
                  la spec de CSS obliga a que el otro eje (que por default
                  queda en `visible`) también pase a `auto` — cualquier
                  desborde de subpíxel (típico en flex + gap + los max-width
                  que transicionan con el hover) dispara entonces una barra
                  horizontal aunque no haya contenido real que la justifique.
                  Pasa siempre que el navegador tenga scrollbars clásicos (no
                  overlay), independiente del nivel de zoom — no es un tema de
                  zoom, es este eje quedando en auto por accidente.

                  scrollbar-hide (ver index.css): el scroll vertical solo
                  aparece con muchos ítems de menú (el caso del admin, que ve
                  bastantes más que un usuario normal) y el scrollbar clásico
                  de Windows con flechitas se ve mal en una columna angosta.
                  Se oculta la barra pero el scroll sigue andando con la rueda
                  del mouse/trackpad, colapsado o expandido. En su lugar, un
                  degradado arriba/abajo (ver scrollShadow) avisa cuando hay
                  más ítems ocultos para scrollear.

                  min-h-0 en el wrapper: sin esto un hijo flex con contenido
                  que desborda puede terminar más alto que el contenedor,
                  ignorando el overflow-y-auto de adentro — el bug clásico de
                  flexbox + scroll. */}
              <div className="relative flex-1 min-h-0">
                <nav
                  ref={navRef}
                  onScroll={updateScrollShadow}
                  className="h-full flex flex-col gap-0.5 overflow-y-auto overflow-x-hidden scrollbar-hide py-2 px-2"
                >
                  {navForModule.map(({ to, label, icon, end }) => (
                    <NavLink
                      key={to}
                      to={to}
                      end={end}
                      onClick={onClose}
                      className={({ isActive }) =>
                        `flex items-center gap-3 py-2 rounded-lg text-xs font-semibold transition-all duration-150 ${
                          isActive
                            ? 'bg-[#d6e0f3] dark:bg-[#1a2040] text-[#004ac6] dark:text-[#7ba8f0]'
                            : 'text-[#434655] dark:text-[#c4c8e8] hover:bg-[#edeef0] dark:hover:bg-[#252840]'
                        }`
                      }
                    >
                      <span className="relative w-8 flex items-center justify-center flex-shrink-0">
                        <span className="material-symbols-outlined text-xl">{icon}</span>
                        {to === '/notifications' && unreadCount > 0 && (
                          <span
                            className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-1 rounded-full flex items-center justify-center text-[9px] font-bold text-white"
                            style={{ background: '#EF4444' }}
                          >
                            {unreadCount > 9 ? '9+' : unreadCount}
                          </span>
                        )}
                      </span>
                      <span
                        className={`whitespace-nowrap overflow-hidden transition-[max-width,opacity] duration-150 ${labelCls}`}
                      >
                        {label}
                      </span>
                    </NavLink>
                  ))}
                </nav>

                {/* pointer-events-none: son puramente decorativos, un clic
                    ahí debe llegar al nav de abajo (para poder seguir
                    scrolleando arrastrando, o para no bloquear el último
                    ítem visible bajo el degradado inferior). */}
                {scrollShadow.top && (
                  <div className="pointer-events-none absolute top-0 inset-x-0 h-4 bg-gradient-to-b from-white dark:from-[#1e2030] to-transparent" />
                )}
                {scrollShadow.bottom && (
                  <div className="pointer-events-none absolute bottom-0 inset-x-0 h-4 bg-gradient-to-t from-white dark:from-[#1e2030] to-transparent" />
                )}
              </div>

              {activeModule === 'tasks' && (
                <div className="px-2 pb-4 flex-shrink-0">
                  <button
                    onClick={() => {
                      if (hasPermission('canCreateTask')) setShowModal(true)
                      else addToast('No tienes permiso para crear tareas', 'error')
                    }}
                    className="w-full h-10 rounded-lg text-xs font-semibold text-white flex items-center gap-3 hover:opacity-90 transition active:scale-[0.97] overflow-hidden"
                    style={{ background: '#004ac6' }}
                  >
                    {/* Mismo slot w-8 que el ícono de los NavLink de arriba (línea
                        ~205) en vez de centrar todo el contenido con
                        justify-center: con justify-center el "+" se corría al
                        pasar el mouse, porque el centro del bloque ícono+texto
                        se mueve cuando el texto pasa de 0 a "Nueva Tarea" — con
                        un slot fijo el ícono queda anclado en la misma posición
                        colapsado y expandido. */}
                    <span className="w-8 flex items-center justify-center flex-shrink-0">
                      <span className="material-symbols-outlined text-lg">add</span>
                    </span>
                    <span
                      className={`whitespace-nowrap overflow-hidden transition-[max-width,opacity] duration-150 ${labelCls}`}
                    >
                      Nueva Tarea
                    </span>
                  </button>
                </div>
              )}
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 overflow-hidden px-2">
              <span className="material-symbols-outlined text-5xl text-[#c3c6d7] dark:text-[#3e4260] flex-shrink-0">
                {activeModuleMeta?.icon}
              </span>
              <span
                className={`text-xs text-center font-semibold text-[#8890b5] dark:text-[#5a5f7a] whitespace-nowrap overflow-hidden transition-[max-width,opacity] duration-150 ${labelCls}`}
              >
                Próximamente
              </span>
            </div>
          )}
        </div>
      </aside>

      {showModal && <TaskModal onClose={() => setShowModal(false)} />}
    </>
  )
}
