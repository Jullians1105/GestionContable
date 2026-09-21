import { useMemo, useRef, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useTasks } from '../hooks/useTasks'
import { useOnlineStatus } from '../hooks/useOnlineStatus'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import { useSocket } from '../context/SocketContext'
import { getInitials, getAvatarColor, ROLE_LABELS, normalizeAssignedTo } from '../utils/helpers'
import { buildSearchableSections, filtrarSecciones } from '../utils/searchSections'
import { moduleForPath } from '../config/navigation'
import NotificationBell from './Notifications/NotificationBell'

export default function Header({ onMenuToggle }) {
  const [search, setSearch] = useState('')
  const [seccionesAbiertas, setSeccionesAbiertas] = useState(false)
  const { tasks } = useTasks()
  const { user, logout, isAdmin, isLeader } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const location = useLocation()
  // "Todos los grupos" y el contador de tareas son específicos del módulo de Tareas (Dashboard,
  // Mis Tareas, Kanban, Calendario, Equipo, Grupos, Reportes...) — no tiene sentido mostrarlos
  // mientras alguien está en Contabilidad, Fondo Emprender o cualquier otro módulo que no usa
  // ninguno de los dos. `moduleForPath` es la misma clasificación que ya usa el Sidebar.
  const enModuloTareas = moduleForPath(location.pathname) === 'tasks'
  const { connected } = useSocket()
  const isOnline = useOnlineStatus()
  const navigate = useNavigate()
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const blurTimerRef = useRef(null)

  // Lista de secciones navegables (Sidebar + submenús) que este usuario puede ver — se
  // recalcula solo si cambia el rol, no en cada tecla.
  const secciones = useMemo(
    () => buildSearchableSections({ isAdmin: isAdmin(), isLeader: isLeader() }),
    [isAdmin, isLeader]
  )
  const seccionesFiltradas = useMemo(() => filtrarSecciones(secciones, search), [secciones, search])

  const irASeccion = (to) => {
    navigate(to)
    setSearch('')
    setSeccionesAbiertas(false)
  }

  // Solo busca módulos/secciones (no tareas) — pedido explícito del usuario. Enter salta a la
  // primera sección que coincida; sin coincidencias, no hace nada.
  const handleSearch = (e) => {
    e.preventDefault()
    if (seccionesFiltradas.length > 0) irASeccion(seccionesFiltradas[0].to)
  }

  // Pequeño delay en el blur para que el clic en una sugerencia alcance a registrarse antes de
  // que el dropdown se cierre (si no, onBlur del input gana la carrera y el onClick del botón
  // nunca dispara).
  const cerrarConDelay = () => {
    blurTimerRef.current = setTimeout(() => setSeccionesAbiertas(false), 150)
  }
  const cancelarCierre = () => {
    if (blurTimerRef.current) clearTimeout(blurTimerRef.current)
  }

  const avatarBg = user ? getAvatarColor(user.name) : 'bg-[#004ac6]'
  // Solo pendientes/en progreso, no el total — contar también las completadas hacía que el
  // número no dijera nada de un vistazo (una cuenta con 40 tareas completadas y 2 por hacer
  // mostraba "42 tareas").
  const visibleTaskCount = ((isAdmin() || isLeader())
    ? tasks
    : tasks.filter((t) => normalizeAssignedTo(t.assignedTo).includes(user?.id) || t.createdBy === user?.id)
  ).filter((t) => t.status !== 'completed').length

  return (
    <header className="fixed top-0 right-0 left-0 lg:left-[var(--sidebar-w,112px)] h-16 z-40 bg-white dark:bg-[#1e2030] border-b border-[#c3c6d7] dark:border-[#2e3148] shadow-sm flex items-center justify-between px-4 gap-3 transition-[left] duration-200">
      <button
        onClick={onMenuToggle}
        className="lg:hidden w-9 h-9 flex items-center justify-center rounded-lg hover:bg-[#edeef0] dark:hover:bg-[#252840] transition text-[#434655] dark:text-[#c4c8e8] flex-shrink-0"
      >
        <span className="material-symbols-outlined text-xl">menu</span>
      </button>

      <form onSubmit={handleSearch} className="relative flex-1 min-w-0 max-w-md">
        <div className="relative focus-within:ring-2 focus-within:ring-[#004ac6] rounded-lg transition-all">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[#434655] dark:text-[#c4c8e8]" style={{ fontSize: 18 }}>search</span>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onFocus={() => setSeccionesAbiertas(true)}
            onBlur={cerrarConDelay}
            onKeyDown={(e) => { if (e.key === 'Escape') { setSeccionesAbiertas(false); e.currentTarget.blur() } }}
            placeholder="Buscar un módulo..."
            className="w-full h-10 pl-10 pr-4 bg-[#f3f4f6] dark:bg-[#252840] border-none rounded-lg text-sm text-[#191c1e] dark:text-[#e4e6f0] focus:outline-none"
          />
        </div>

        {seccionesAbiertas && seccionesFiltradas.length > 0 && (
          <div
            className="absolute z-50 mt-1.5 w-full bg-white dark:bg-[#1e2030] border border-[#c3c6d7] dark:border-[#2e3148] rounded-xl shadow-lg overflow-hidden"
            onMouseDown={cancelarCierre}
          >
            {seccionesFiltradas.map((s) => (
              <button
                key={s.to}
                type="button"
                onClick={() => irASeccion(s.to)}
                className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-left hover:bg-[#f3f4f6] dark:hover:bg-[#252840] transition-colors"
              >
                <span className="material-symbols-outlined text-[#8890b5] text-lg flex-shrink-0">{s.icon}</span>
                <span className="text-sm text-[#191c1e] dark:text-[#e4e6f0] truncate">{s.label}</span>
                <span className="ml-auto text-[11px] text-[#8890b5] flex-shrink-0">{s.moduleLabel}</span>
              </button>
            ))}
          </div>
        )}
      </form>

      <div className="flex items-center gap-2">
        {enModuloTareas && (
          <span className="hidden lg:block text-xs font-semibold px-3 py-1 bg-[#edeef0] dark:bg-[#252840] text-[#434655] dark:text-[#c4c8e8] rounded-full">
            {visibleTaskCount} pendientes
          </span>
        )}

        <button
          onClick={() => window.location.reload()}
          className="lg:hidden w-9 h-9 flex items-center justify-center rounded-lg hover:bg-[#edeef0] dark:hover:bg-[#252840] transition text-[#434655] dark:text-[#c4c8e8]"
          title="Recargar"
        >
          <span className="material-symbols-outlined text-xl">refresh</span>
        </button>

        <button
          onClick={toggleTheme}
          className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-[#edeef0] dark:hover:bg-[#252840] transition text-[#434655] dark:text-[#c4c8e8]"
          title={theme === 'light' ? 'Modo oscuro' : 'Modo claro'}
        >
          <span className="material-symbols-outlined text-xl">{theme === 'light' ? 'dark_mode' : 'light_mode'}</span>
        </button>

        <div
          className="flex items-center gap-1.5 text-xs font-semibold px-2 sm:px-2.5 py-1 rounded-full flex-shrink-0"
          style={{
            background: connected && isOnline ? '#f0fdf4' : '#fef2f2',
            color:      connected && isOnline ? '#22c55e' : '#ef4444',
          }}
          title={!isOnline ? 'Sin conexión a internet' : !connected ? 'Sin conexión con el servidor' : 'Conectado'}
        >
          <span
            className="w-2 h-2 rounded-full flex-shrink-0"
            style={{ background: connected && isOnline ? '#22c55e' : '#ef4444' }}
          />
          <span className="hidden sm:inline">
            {connected && isOnline ? 'En línea' : 'Sin conexión'}
          </span>
        </div>

        <NotificationBell />

        <div className="h-8 w-px bg-[#c3c6d7] dark:bg-[#2e3148]" />

        <div className="relative">
          <button onClick={() => setUserMenuOpen((v) => !v)} className="flex items-center gap-2 rounded-lg hover:bg-[#edeef0] dark:hover:bg-[#252840] px-2 py-1 transition">
            <div className="text-right hidden sm:block">
              <p className="text-xs font-semibold text-[#191c1e] dark:text-[#e4e6f0] leading-tight">{user?.name}</p>
              <p className="text-[10px] text-[#434655] dark:text-[#c4c8e8]">{ROLE_LABELS[user?.role]}</p>
            </div>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0 ${avatarBg}`}>
              {getInitials(user?.name || '')}
            </div>
          </button>

          {userMenuOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setUserMenuOpen(false)} />
              <div className="absolute top-full right-0 mt-1 z-50 bg-white dark:bg-[#1e2030] rounded-xl shadow-xl border border-[#c3c6d7] dark:border-[#2e3148] min-w-[160px] overflow-hidden">
                <button
                  onClick={() => { navigate('/profile'); setUserMenuOpen(false) }}
                  className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-[#434655] dark:text-[#c4c8e8] hover:bg-[#edeef0] dark:hover:bg-[#252840] transition"
                >
                  <span className="material-symbols-outlined text-base">person</span>
                  Mi Perfil
                </button>
                <button
                  onClick={() => { navigate('/settings'); setUserMenuOpen(false) }}
                  className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-[#434655] dark:text-[#c4c8e8] hover:bg-[#edeef0] dark:hover:bg-[#252840] transition"
                >
                  <span className="material-symbols-outlined text-base">settings</span>
                  Configuración
                </button>
                <button
                  onClick={() => { logout(); navigate('/login') }}
                  className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-[#EF4444] hover:bg-[#ffdad6] transition"
                >
                  <span className="material-symbols-outlined text-base">logout</span>
                  Cerrar sesión
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  )
}
