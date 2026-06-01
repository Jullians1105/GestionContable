import { useState } from 'react'
import { storage } from '../utils/storage'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import { useToast } from '../context/ToastContext'
import { ROLE_LABELS } from '../utils/helpers'

export default function SettingsPage() {
  const { user, updateCurrentUser, logout } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const { addToast } = useToast()
  const [form, setForm] = useState({ name: user?.name || '', email: user?.email || '' })

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

  const handleSaveProfile = (e) => {
    e.preventDefault()
    if (!form.name.trim()) return
    updateCurrentUser({ name: form.name.trim(), email: form.email.trim() })
    addToast('Perfil actualizado', 'success')
  }

  const cardCls = 'bg-white dark:bg-[#1e2030] rounded-2xl border border-[#c3c6d7] dark:border-[#2e3148] p-6'
  const inputCls = 'w-full h-10 px-3 rounded-lg border border-[#c3c6d7] dark:border-[#2e3148] bg-[#edeef0] dark:bg-[#252840] text-sm text-[#191c1e] dark:text-[#e4e6f0] focus:outline-none focus:ring-2 focus:ring-[#004ac6] transition'

  return (
    <div>
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-[#191c1e] dark:text-[#e4e6f0]">Configuración</h2>
        <p className="text-sm text-[#434655] mt-1">Gestiona tu perfil y las preferencias de la aplicación.</p>
      </div>

      <div className="max-w-3xl space-y-6">
        <div className={cardCls}>
          <h3 className="text-lg font-bold text-[#191c1e] dark:text-[#e4e6f0] mb-4">Mi Perfil</h3>
          <form onSubmit={handleSaveProfile} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-[#434655] mb-1.5">Nombre</label>
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputCls} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#434655] mb-1.5">Email</label>
                <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={inputCls} />
              </div>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-[#434655]">Rol: <span className="font-semibold text-[#191c1e] dark:text-[#e4e6f0]">{ROLE_LABELS[user?.role]}</span></p>
              </div>
              <button type="submit" className="h-10 px-4 rounded-lg text-sm font-semibold text-white hover:opacity-90 transition" style={{ background: '#004ac6' }}>
                Guardar cambios
              </button>
            </div>
          </form>
        </div>

        <div className={cardCls}>
          <h3 className="text-lg font-bold text-[#191c1e] dark:text-[#e4e6f0] mb-4">Apariencia</h3>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-[#191c1e] dark:text-[#e4e6f0]">Tema {theme === 'dark' ? 'Oscuro' : 'Claro'}</p>
              <p className="text-xs text-[#434655] mt-0.5">Cambia entre modo claro y oscuro</p>
            </div>
            <button
              onClick={toggleTheme}
              className={`relative w-12 h-6 rounded-full transition-colors ${theme === 'dark' ? 'bg-[#004ac6]' : 'bg-[#c3c6d7]'}`}
            >
              <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform ${theme === 'dark' ? 'translate-x-6' : 'translate-x-0.5'}`} />
            </button>
          </div>
        </div>

        <div className={cardCls}>
          <h3 className="text-lg font-bold text-[#191c1e] dark:text-[#e4e6f0] mb-1">Sobre la aplicación</h3>
          <dl className="space-y-3 mt-4">
            {[
              { label: 'Nombre', value: 'TaskFlow Pro' },
              { label: 'Versión', value: '2.0.0 - Fase 2' },
              { label: 'Almacenamiento', value: 'localStorage (navegador)' },
              { label: 'Stack', value: 'React 18 + Vite + Tailwind CSS' },
            ].map(({ label, value }) => (
              <div key={label} className="flex justify-between items-center py-2 border-b border-[#edeef0] dark:border-[#252840] last:border-0">
                <dt className="text-sm text-[#434655]">{label}</dt>
                <dd className="text-sm font-semibold text-[#191c1e] dark:text-[#e4e6f0]">{value}</dd>
              </div>
            ))}
          </dl>
        </div>

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
      </div>
    </div>
  )
}
