import { useState } from 'react'
import { Link, NavLink } from 'react-router-dom'
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

export default function Sidebar({ open, onClose }) {
  const { isAdmin, isLeader, hasPermission } = useAuth()
  const { addToast } = useToast()
  const { unreadCount } = useNotifications()
  const [showModal, setShowModal] = useState(false)

  const visible = navItems.filter((item) => {
    if (item.to === '/reports' && !isAdmin() && !isLeader()) return false
    if (item.to === '/groups' && !isAdmin() && !isLeader()) return false
    if (item.to === '/usuarios' && !isAdmin()) return false
    return true
  })

  return (
    <>
      <aside className={`fixed left-0 top-0 h-full w-[250px] z-50 bg-white dark:bg-[#1e2030] border-r border-[#c3c6d7] dark:border-[#2e3148] flex flex-col p-4 gap-1 transition-transform duration-300 ease-in-out ${open ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
        <div className="flex items-center justify-between px-2 py-4 mb-2">
          <Link to="/" onClick={onClose} className="flex items-center gap-3 rounded-lg transition hover:opacity-80">
            <img src="/logo.jpeg" alt="Gestor de Tareas" className="w-10 h-10 rounded-xl object-cover flex-shrink-0" />
            <div>
              <h1 className="text-lg font-bold text-[#191c1e] dark:text-[#e4e6f0] leading-tight">Gestor de Tareas</h1>
            </div>
          </Link>
          <button onClick={onClose} className="lg:hidden p-1.5 rounded-lg hover:bg-[#edeef0] dark:hover:bg-[#252840] text-[#434655] dark:text-[#c4c8e8] transition">
            <span className="material-symbols-outlined text-xl">close</span>
          </button>
        </div>

        <nav className="flex-1 flex flex-col gap-0.5 overflow-y-auto">
          {visible.map(({ to, label, icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              onClick={onClose}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-semibold transition-all duration-150 ${
                  isActive
                    ? 'bg-[#d6e0f3] dark:bg-[#1a2040] text-[#004ac6] dark:text-[#7ba8f0]'
                    : 'text-[#434655] dark:text-[#c4c8e8] hover:bg-[#edeef0] dark:hover:bg-[#252840]'
                }`
              }
            >
              <span className="relative inline-flex">
                <span className="material-symbols-outlined text-xl">{icon}</span>
                {to === '/notifications' && unreadCount > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-1 rounded-full flex items-center justify-center text-[9px] font-bold text-white" style={{ background: '#EF4444' }}>
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </span>
              {label}
            </NavLink>
          ))}
        </nav>

        <button
          onClick={() => {
            if (hasPermission('canCreateTask')) setShowModal(true)
            else addToast('No tienes permiso para crear tareas', 'error')
          }}
          className="mt-2 w-full h-10 rounded-lg text-xs font-semibold text-white flex items-center justify-center gap-2 hover:opacity-90 transition active:scale-[0.97]"
          style={{ background: '#004ac6' }}
        >
          <span className="material-symbols-outlined text-lg">add</span>
          Nueva Tarea
        </button>
      </aside>

      {showModal && (
        <TaskModal onClose={() => setShowModal(false)} />
      )}
    </>
  )
}
