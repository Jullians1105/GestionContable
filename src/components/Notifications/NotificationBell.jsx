import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useNotifications } from '../../context/NotificationContext'
import { useTasks } from '../../hooks/useTasks'
import { useToast } from '../../context/ToastContext'
import { formatDistanceToNow, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'

const TYPE_ICONS = {
  task_assigned:    'assignment_ind',
  task_completed:   'check_circle',
  task_in_progress: 'pending_actions',
  task_overdue:     'warning',
  task_reminder:    'notifications_active',
  comment_added:    'chat_bubble',
  comment:          'chat',
  subtask_done:     'task_alt',
  due_soon:         'schedule',
  overdue:          'warning',
  delete_request:          'report',
  delete_request_approved: 'delete',
  delete_request_rejected: 'block',
}

function timeAgo(str) {
  try { return formatDistanceToNow(parseISO(str), { addSuffix: true, locale: es }) } catch { return '' }
}

export default function NotificationBell() {
  const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications()
  const { resolveDeleteRequest } = useTasks()
  const { addToast } = useToast()
  const [open, setOpen] = useState(false)
  const [resolvingId, setResolvingId] = useState(null)
  const navigate = useNavigate()

  const recent = notifications.slice(0, 10)

  const handleClick = (n) => {
    markAsRead(n.id)
    setOpen(false)
    if (n.taskId) {
      const params = new URLSearchParams({ openTask: n.taskId })
      if (n.extra?.commentId) params.set('comment', n.extra.commentId)
      navigate(`/tasks?${params}`)
    }
  }

  const handleResolve = async (n, action) => {
    if (resolvingId) return
    if (!n.taskId) {
      addToast('Esta tarea ya no existe (la solicitud ya fue resuelta)', 'error')
      markAsRead(n.id)
      return
    }
    setResolvingId(n.id)
    try {
      await resolveDeleteRequest(n.taskId, n.extra.requestId, action)
      addToast(action === 'approve' ? 'Tarea eliminada' : 'Solicitud rechazada', action === 'approve' ? 'info' : 'success')
      markAsRead(n.id)
    } catch (err) {
      addToast(err.message || 'Error al resolver la solicitud', 'error')
    } finally {
      setResolvingId(null)
    }
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative w-9 h-9 flex items-center justify-center rounded-lg hover:bg-[#edeef0] dark:hover:bg-[#252840] transition"
      >
        <span className="material-symbols-outlined text-[#434655] dark:text-[#c4c8e8]">notifications</span>
        {unreadCount > 0 && (
          <>
            <span className="absolute top-1 right-1 w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold text-white" style={{ background: '#EF4444' }}>
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
            <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full animate-pulse" style={{ background: '#10B981' }} />
          </>
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
                  <p className="text-sm text-[#434655] dark:text-[#c4c8e8] mt-2">Sin notificaciones</p>
                </div>
              ) : (
                recent.map((n, i) => (
                  <div
                    key={n.id ?? `notif-${i}`}
                    onClick={() => handleClick(n)}
                    className={`w-full flex items-start gap-3 px-4 py-3 hover:bg-[#edeef0] dark:hover:bg-[#252840] transition text-left cursor-pointer ${!n.read ? 'bg-blue-50 dark:bg-[#1a2040]' : ''}`}
                  >
                    <span className="material-symbols-outlined text-base mt-0.5 flex-shrink-0 text-[#004ac6]">
                      {TYPE_ICONS[n.type] || 'notifications'}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-[#191c1e] dark:text-[#e4e6f0] leading-relaxed">{n.message}</p>
                      <p className="text-[10px] text-[#888] mt-0.5">{timeAgo(n.createdAt)}</p>
                      {n.type === 'delete_request' && (
                        <div className="flex gap-2 mt-2" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() => handleResolve(n, 'approve')}
                            disabled={resolvingId === n.id}
                            className="h-7 px-2.5 rounded-lg text-[10px] font-semibold text-white disabled:opacity-40 hover:opacity-90 transition"
                            style={{ background: '#93000a' }}
                          >
                            Aprobar
                          </button>
                          <button
                            onClick={() => handleResolve(n, 'reject')}
                            disabled={resolvingId === n.id}
                            className="h-7 px-2.5 rounded-lg text-[10px] font-semibold border border-[#c3c6d7] dark:border-[#2e3148] text-[#434655] dark:text-[#c4c8e8] disabled:opacity-40 hover:bg-[#edeef0] dark:hover:bg-[#252840] transition"
                          >
                            Rechazar
                          </button>
                        </div>
                      )}
                    </div>
                    {!n.read && (
                      <span className="relative flex-shrink-0 mt-1.5">
                        <span className="block w-2.5 h-2.5 rounded-full" style={{ background: '#10B981' }} />
                        <span className="absolute inset-0 rounded-full animate-ping" style={{ background: '#10B98166' }} />
                      </span>
                    )}
                  </div>
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
