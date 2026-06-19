import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { useNotifications } from '../context/NotificationContext'
import TaskModal from './TaskModal'

const navItems = [
  { to: '/', label: 'Dashboard', icon: 'dashboard', end: true },
  { to: '/tasks', label: 'Mis Tareas', icon: 'task_alt' },
  { to: '/kanban', label: 'Kanban', icon: 'view_kanban' },
  { to: '/calendar', label: 'Calendario', icon: 'calendar_month' },
  { to: '/team', label: 'Equipo', icon: 'group' },
  { to: '/groups', label: 'Grupos', icon: 'group_work' },
  { to: '/reports', label: 'Reportes', icon: 'bar_chart' },
  { to: '/usuarios', label: 'Usuarios', icon: 'manage_accounts' },
  { to: '/notifications', label: 'Notificaciones', icon: 'notifications' },
  { to: '/settings', label: 'Configuración', icon: 'settings' },
]

const modules = [
  { id: 'tasks', label: 'Gestor de Tareas', icon: 'task_alt' },
  { id: 'fondo', label: 'Fondo Emprender', icon: 'rocket_launch' },
  { id: 'empresas', label: 'Empresas Externas', icon: 'corporate_fare' },
]

const MODULE_TITLES = {
  tasks: 'Gestor de Tareas',
  fondo: 'Fondo Emprender',
  empresas: 'Empresas Externas',
}

const FONDO_NAV = [
  { to: '/fondo-emprender',          label: 'Seguimiento mensual', icon: 'table_chart',    end: true },
  { to: '/fondo-emprender/empresas', label: 'Empresas',            icon: 'corporate_fare' },
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
    if (item.to === '/reports' && !isAdmin() && !isLeader()) return false
    if (item.to === '/groups' && !isAdmin() && !isLeader()) return false
    if (item.to === '/usuarios' && !isAdmin()) return false
    return true
  })

  const activeModuleMeta = modules.find(m => m.id === activeModule)

  const navForModule =
    activeModule === 'tasks' ? visible :
    activeModule === 'fondo' ? FONDO_NAV :
    []

  const hasNav = navForModule.length > 0

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
          {/* Logo wrapper same width as buttons so items align on the same axis */}
          <div className="w-10 h-10 flex items-center justify-center mb-3 flex-shrink-0">
            <img
              src="/src/assets/logo-icono-blanco.png"
              alt="Logo"
              className="w-9 h-9 object-contain"
            />
          </div>
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
          <div className="flex items-center gap-1 px-2 h-16 flex-shrink-0 border-b border-[#e8eaf0] dark:border-[#2e3148]">
            <span
              className={`text-sm font-bold text-[#191c1e] dark:text-[#e4e6f0] whitespace-nowrap overflow-hidden transition-[max-width,opacity] duration-200 ${labelCls}`}
            >
              {MODULE_TITLES[activeModule]}
            </span>
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
              <nav className="flex-1 flex flex-col gap-0.5 overflow-y-auto py-2 px-2">
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

              {activeModule === 'tasks' && (
                <div className="px-2 pb-4 flex-shrink-0">
                  <button
                    onClick={() => {
                      if (hasPermission('canCreateTask')) setShowModal(true)
                      else addToast('No tienes permiso para crear tareas', 'error')
                    }}
                    className="w-full h-10 rounded-lg text-xs font-semibold text-white flex items-center justify-center gap-2 hover:opacity-90 transition active:scale-[0.97] overflow-hidden"
                    style={{ background: '#004ac6' }}
                  >
                    <span className="material-symbols-outlined text-lg flex-shrink-0">add</span>
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
