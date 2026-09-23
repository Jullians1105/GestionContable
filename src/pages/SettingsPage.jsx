import { useState } from 'react'
import { storage } from '../utils/storage'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { useNotifications } from '../context/NotificationContext'

export default function SettingsPage() {
  const { isAdmin, logout } = useAuth()
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
    a.download = `gestcon-backup-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
    addToast('Datos exportados', 'success')
  }

  const cardCls = 'bg-white rounded-2xl border border-[#c3c6d7] p-6'

  return (
    <div>
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-[#191c1e]">Configuración</h2>
        <p className="text-sm text-[#434655] mt-1">Gestiona tu perfil y las preferencias de la aplicación.</p>
      </div>

      <div className="max-w-3xl space-y-6">
        {pushPermission !== 'unsupported' && (
          <div className={cardCls}>
            <h3 className="text-lg font-bold text-[#191c1e] mb-4">Notificaciones</h3>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-2xl text-[#004ac6]">notifications</span>
                <div>
                  <p className="text-sm font-semibold text-[#191c1e]">
                    {pushPermission === 'granted' ? 'Notificaciones activadas' : 'Notificaciones push'}
                  </p>
                  <p className="text-xs text-[#434655] mt-0.5">
                    {pushPermission === 'granted'
                      ? 'Recibirás alertas de vencimiento aunque tengas la app cerrada'
                      : 'Recibe alertas de vencimiento de tareas en tu dispositivo'}
                  </p>
                </div>
              </div>
              {pushPermission === 'granted' ? (
                <span className="flex items-center gap-1 text-xs font-semibold text-green-600 bg-green-50 px-3 py-1.5 rounded-full">
                  <span className="material-symbols-outlined text-sm">check_circle</span>
                  Activas
                </span>
              ) : (
                <button
                  onClick={handleEnablePush}
                  disabled={requestingPush}
                  className="flex items-center gap-1.5 h-9 px-4 rounded-lg text-sm font-semibold text-white bg-[#2563eb] hover:bg-[#2563eb] disabled:opacity-60 transition"
                >
                  {requestingPush
                    ? <span className="material-symbols-outlined text-base animate-spin">progress_activity</span>
                    : <span className="material-symbols-outlined text-base">notifications_active</span>}
                  {requestingPush ? 'Activando...' : 'Activar'}
                </button>
              )}
            </div>
          </div>
        )}

        <div className={cardCls}>
          <h3 className="text-lg font-bold text-[#191c1e] mb-1">Sobre la aplicación</h3>
          <dl className="space-y-3 mt-4">
            {[
              { label: 'Nombre', value: 'Gestcon' },
              { label: 'Versión', value: '2.0.0 - Fase 2' },
              { label: 'Almacenamiento', value: 'localStorage (navegador)' },
              { label: 'Stack', value: 'React 18 + Vite + Tailwind CSS' },
            ].map(({ label, value }) => (
              <div key={label} className="flex justify-between items-center py-2 border-b border-[#edeef0] last:border-0">
                <dt className="text-sm text-[#434655]">{label}</dt>
                <dd className="text-sm font-semibold text-[#191c1e]">{value}</dd>
              </div>
            ))}
          </dl>
        </div>

        {isAdmin() && (
          <div className={cardCls}>
            <h3 className="text-lg font-bold text-[#191c1e] mb-1">Gestión de Datos</h3>
            <p className="text-sm text-[#434655] mb-5">Todos los datos se almacenan localmente en tu navegador.</p>
            <div className="flex flex-wrap gap-3">
              <button onClick={handleExportData} className="flex items-center gap-1.5 h-10 px-4 rounded-lg border border-[#c3c6d7] text-sm font-semibold text-[#434655] hover:bg-[#edeef0] transition">
                <span className="material-symbols-outlined text-base">download</span>
                Exportar datos (JSON)
              </button>
              <button onClick={handleClearData} className="flex items-center gap-1.5 h-10 px-4 rounded-lg text-sm font-semibold text-white hover:opacity-90 transition" style={{ background: '#EF4444' }}>
                <span className="material-symbols-outlined text-base">restore</span>
                Restaurar datos de ejemplo
              </button>
              <button onClick={() => { logout(); window.location.href = '/login' }} className="flex items-center gap-1.5 h-10 px-4 rounded-lg border border-[#c3c6d7] text-sm font-semibold text-[#EF4444] hover:bg-[#ffdad6] transition">
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
