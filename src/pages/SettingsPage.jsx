import { useState } from 'react'
import { useToast } from '../context/ToastContext'
import { useNotifications } from '../context/NotificationContext'

export default function SettingsPage() {
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
      </div>
    </div>
  )
}
