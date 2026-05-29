import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useNotifications } from '../../context/NotificationContext'
import { formatDistanceToNow, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'

const TYPE_ICONS = {
  task_assigned: 'assignment_ind',
  comment: 'chat',
  due_soon: 'schedule',
  overdue: 'warning',
}

function timeAgo(str) {
  try { return formatDistanceToNow(parseISO(str), { addSuffix: true, locale: es }) } catch { return '' }
}

export default function NotificationBell() {
  const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications()
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()

  const recent = notifications.slice(0, 10)

  const handleClick = (n) => {
    markAsRead(n.id)
    setOpen(false)
    if (n.taskId) navigate('/tasks')
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative w-9 h-9 flex items-center justify-center rounded-lg hover:bg-[#edeef0] dark:hover:bg-[#252840] transition"
      >
        <span className="material-symbols-outlined text-[#434655] dark:text-[#c4c8e8]">notifications</span>
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold text-white" style={{ background: '#EF4444' }}>
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute top-full right-0 mt-1 z-50 bg-white dark:bg-[#1e2030] rounded-2xl shadow-2xl border border-[#c3c6d7] dark:border-[#2e3148] w-80">
            <div className="flex items-center justify-between px-4 py-3 border-b border-[#c3c6d7] dark:border-[#2e3148]">
              <h3 className="text-sm font-bold text-[#191c1e] dark:text-[#e4e6f0]">Notificaciones</h3>
              {unreadCount > 0 && (
                <button onClick={markAllAsRead} className="text-xs text-[#004ac6] hover:underline">
                  Marcar todas como leídas
                </button>
              )}
            </div>

            <div className="max-h-80 overflow-y-auto">
              {recent.length === 0 ? (
                <div className="px-4 py-8 text-center">
                  <span className="material-symbols-outlined text-3xl text-[#c3c6d7]">notifications_none</span>
                  <p className="text-sm text-[#434655] mt-2">Sin notificaciones</p>
                </div>
              ) : (
                recent.map((n) => (
                  <button
                    key={n.id}
                    onClick={() => handleClick(n)}
                    className={`w-full flex items-start gap-3 px-4 py-3 hover:bg-[#edeef0] dark:hover:bg-[#252840] transition text-left ${!n.read ? 'bg-blue-50 dark:bg-[#1a2040]' : ''}`}
                  >
                    <span className="material-symbols-outlined text-base mt-0.5 flex-shrink-0 text-[#004ac6]">
                      {TYPE_ICONS[n.type] || 'notifications'}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-[#191c1e] dark:text-[#e4e6f0] leading-relaxed">{n.message}</p>
                      <p className="text-[10px] text-[#888] mt-0.5">{timeAgo(n.createdAt)}</p>
                    </div>
                    {!n.read && <span className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0" style={{ background: '#004ac6' }} />}
                  </button>
                ))
              )}
            </div>

            <div className="border-t border-[#c3c6d7] dark:border-[#2e3148] px-4 py-2.5">
              <button
                onClick={() => { navigate('/notifications'); setOpen(false) }}
                className="text-xs text-[#004ac6] hover:underline w-full text-center"
              >
                Ver todas las notificaciones
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
