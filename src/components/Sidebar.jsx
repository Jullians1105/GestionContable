import { NavLink } from 'react-router-dom'

const navItems = [
  { to: '/', label: 'Dashboard', icon: 'dashboard', end: true },
  { to: '/tasks', label: 'Mis Tareas', icon: 'task_alt' },
  { to: '/team', label: 'Equipo', icon: 'group' },
  { to: '/settings', label: 'Configuración', icon: 'settings' },
]

export default function Sidebar() {
  return (
    <aside className="fixed left-0 top-0 h-full w-[250px] z-50 bg-[#f3f4f6] border-r border-[#c3c6d7] flex flex-col p-4 gap-1">
      {/* Logo */}
      <div className="flex items-center gap-3 px-2 py-4 mb-2">
        <div className="w-10 h-10 rounded-lg bg-[#004ac6] flex items-center justify-center text-white">
          <span className="material-symbols-outlined" style={{ fontSize: 20 }}>task_alt</span>
        </div>
        <div>
          <h1 className="text-[18px] font-bold text-[#191c1e] leading-tight">TaskFlow Pro</h1>
          <p className="text-[12px] text-[#434655]">Empresarial</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 flex flex-col gap-1">
        {navItems.map(({ to, label, icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2 rounded-lg text-[12px] font-semibold transition-all duration-200 active:scale-[0.97] ${
                isActive
                  ? 'bg-[#d6e0f3] text-[#596373]'
                  : 'text-[#434655] hover:bg-[#e7e8ea]'
              }`
            }
          >
            <span className="material-symbols-outlined" style={{ fontSize: 20 }}>{icon}</span>
            {label}
          </NavLink>
        ))}
      </nav>

      {/* CTA button */}
      <button className="mt-2 w-full h-10 bg-[#004ac6] text-white rounded-lg text-[12px] font-semibold flex items-center justify-center gap-2 hover:bg-[#2563eb] transition-colors active:scale-[0.97]">
        <span className="material-symbols-outlined" style={{ fontSize: 18 }}>add</span>
        Nueva Tarea
      </button>
    </aside>
  )
}
