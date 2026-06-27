import { useState } from 'react'
import { storage } from '../utils/storage'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import { useToast } from '../context/ToastContext'
import { useNotifications } from '../context/NotificationContext'

export default function SettingsPage() {
  const { isAdmin, logout } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const { addToast } = useToast()
  const { pushPermission, requestPushPermission } = useNotifications()
  const [requestingPush, setRequestingPush] = useState(false)

  async function handleEnablePush() {
    setRequestingPush(true)
    const result = await requestPushPermission()
    setRequestingPush(false)
    if (result === 'granted') addToast('Notificaciones push activadas', 'success')
    else if (result === 'denied') addToast('Permiso denegado. Actívalas desde Ajustes del sistema.', 'error', 8000)
  }

  const handleClearData = () => {
    if (window.confirm('¿Borrar todos los datos y restaurar los datos de ejemplo? Esta acción no se puede deshacer.')) {
      storage.clearAll()
      window.location.reload()
    }
  }

  const handleExportData = () => {
    const data = {
      tasks: storage.getTasks(),
      team_members: storage.getMembers(),
      groups: storage.getGroups(),
      tags: storage.getTags(),
      exportedAt: new Date().toISOString(),
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `taskflow-backup-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
    addToast('Datos exportados', 'success')
  }

  const cardCls = 'bg-white dark:bg-[#1e2030] rounded-2xl border border-[#c3c6d7] dark:border-[#2e3148] p-6'

  return (
    <div>
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-[#191c1e] dark:text-[#e4e6f0]">Configuración</h2>
        <p className="text-sm text-[#434655] mt-1">Gestiona tu perfil y las preferencias de la aplicación.</p>
      </div>

      <div className="max-w-3xl space-y-6">
        <div className={cardCls}>
          <h3 className="text-lg font-bold text-[#191c1e] dark:text-[#e4e6f0] mb-4">Apariencia</h3>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className={`material-symbols-outlined text-2xl ${theme === 'dark' ? 'text-[#7ba8f0]' : 'text-[#FBBF24]'}`}>
                {theme === 'dark' ? 'dark_mode' : 'light_mode'}
              </span>
              <div>
                <p className="text-sm font-semibold text-[#191c1e] dark:text-[#e4e6f0]">Modo {theme === 'dark' ? 'oscuro' : 'claro'}</p>
                <p className="text-xs text-[#434655] dark:text-[#8b8fa8] mt-0.5">Cambia entre modo claro y oscuro</p>
              </div>
            </div>
            <button
              onClick={toggleTheme}
              aria-label="Cambiar tema"
              className={`relative w-14 h-7 rounded-full transition-colors duration-300 focus:outline-none focus:ring-2 focus:ring-[#004ac6] focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-[#1e2030] ${theme === 'dark' ? 'bg-[#004ac6]' : 'bg-[#c3c6d7]'}`}
            >
              <span className={`absolute top-1 w-5 h-5 rounded-full shadow transition-transform duration-300 flex items-center justify-center text-[10px] ${theme === 'dark' ? 'translate-x-7 bg-white text-[#004ac6]' : 'translate-x-1 bg-white text-[#FBBF24]'}`}>
                <span className="material-symbols-outlined" style={{ fontSize: '13px' }}>
                  {theme === 'dark' ? 'dark_mode' : 'light_mode'}
                </span>
              </span>
            </button>
          </div>
        </div>

        <div className={cardCls}>
          <h3 className="text-lg font-bold text-[#191c1e] dark:text-[#e4e6f0] mb-1">Sobre la aplicación</h3>
          <dl className="space-y-3 mt-4">
            {[
              { label: 'Nombre', value: 'Gestor de Tareas' },
              { label: 'Versión', value: '2.0.0 - Fase 2' },
              { label: 'Almacenamiento', value: 'localStorage (navegador)' },
              { label: 'Stack', value: 'React 18 + Vite + Tailwind CSS' },
            ].map(({ label, value }) => (
              <div key={label} className="flex justify-between items-center py-2 border-b border-[#edeef0] dark:border-[#252840] last:border-0">
                <dt className="text-sm text-[#434655] dark:text-white">{label}</dt>
                <dd className="text-sm font-semibold text-[#191c1e] dark:text-[#e4e6f0]">{value}</dd>
              </div>
            ))}
          </dl>
        </div>

        {isAdmin() && (
          <div className={cardCls}>
            <h3 className="text-lg font-bold text-[#191c1e] dark:text-[#e4e6f0] mb-1">Gestión de Datos</h3>
            <p className="text-sm text-[#434655] mb-5">Todos los datos se almacenan localmente en tu navegador.</p>
            <div className="flex flex-wrap gap-3">
              <button onClick={handleExportData} className="flex items-center gap-1.5 h-10 px-4 rounded-lg border border-[#c3c6d7] dark:border-[#2e3148] text-sm font-semibold text-[#434655] dark:text-[#c4c8e8] hover:bg-[#edeef0] dark:hover:bg-[#252840] transition">
                <span className="material-symbols-outlined text-base">download</span>
                Exportar datos (JSON)
              </button>
              <button onClick={handleClearData} className="flex items-center gap-1.5 h-10 px-4 rounded-lg text-sm font-semibold text-white hover:opacity-90 transition" style={{ background: '#EF4444' }}>
                <span className="material-symbols-outlined text-base">restore</span>
                Restaurar datos de ejemplo
              </button>
              <button onClick={() => { logout(); window.location.href = '/login' }} className="flex items-center gap-1.5 h-10 px-4 rounded-lg border border-[#c3c6d7] dark:border-[#2e3148] text-sm font-semibold text-[#EF4444] hover:bg-[#ffdad6] transition">
                <span className="material-symbols-outlined text-base">logout</span>
                Cerrar sesión
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
