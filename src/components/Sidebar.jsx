import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import TaskModal from './TaskModal'

const navItems = [
  { to: '/', label: 'Dashboard', icon: 'dashboard', end: true },
  { to: '/tasks', label: 'Mis Tareas', icon: 'task_alt' },
  { to: '/kanban', label: 'Kanban', icon: 'view_kanban' },
  { to: '/calendar', label: 'Calendario', icon: 'calendar_month' },
  { to: '/team', label: 'Equipo', icon: 'group' },
  { to: '/groups', label: 'Grupos', icon: 'group_work' },
  { to: '/reports', label: 'Reportes', icon: 'bar_chart' },
  { to: '/notifications', label: 'Notificaciones', icon: 'notifications' },
  { to: '/settings', label: 'Configuración', icon: 'settings' },
]

export default function Sidebar() {
  const { isAdmin, isLeader, canEdit } = useAuth()
  const [showModal, setShowModal] = useState(false)

  const visible = navItems.filter((item) => {
    if (item.to === '/reports' && !isAdmin() && !isLeader()) return false
    if (item.to === '/groups' && !isAdmin() && !isLeader()) return false
    return true
  })

  return (
    <>
      <aside className="fixed left-0 top-0 h-full w-[250px] z-50 bg-white dark:bg-[#1e2030] border-r border-[#c3c6d7] dark:border-[#2e3148] flex flex-col p-4 gap-1">
        <div className="flex items-center gap-3 px-2 py-4 mb-2">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white flex-shrink-0" style={{ background: '#004ac6' }}>
            <span className="material-symbols-outlined text-xl">task_alt</span>
          </div>
          <div>
            <h1 className="text-lg font-bold text-[#191c1e] dark:text-[#e4e6f0] leading-tight">TaskFlow Pro</h1>
            <p className="text-xs text-[#434655] dark:text-[#c4c8e8]">Fase 2</p>
          </div>
        </div>

        <nav className="flex-1 flex flex-col gap-0.5 overflow-y-auto">
          {visible.map(({ to, label, icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-semibold transition-all duration-150 ${
                  isActive
                    ? 'bg-[#d6e0f3] dark:bg-[#1a2040] text-[#004ac6] dark:text-[#7ba8f0]'
                    : 'text-[#434655] dark:text-[#c4c8e8] hover:bg-[#edeef0] dark:hover:bg-[#252840]'
                }`
              }
            >
              <span className="material-symbols-outlined text-xl">{icon}</span>
              {label}
            </NavLink>
          ))}
        </nav>

        {canEdit() && (
          <button
            onClick={() => setShowModal(true)}
            className="mt-2 w-full h-10 rounded-lg text-xs font-semibold text-white flex items-center justify-center gap-2 hover:opacity-90 transition active:scale-[0.97]"
            style={{ background: '#004ac6' }}
          >
            <span className="material-symbols-outlined text-lg">add</span>
            Nueva Tarea
          </button>
        )}
      </aside>

      {showModal && (
        <TaskModal onClose={() => setShowModal(false)} />
      )}
    </>
  )
}
