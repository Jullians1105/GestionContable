import { useState } from 'react'
import { useNotifications } from '../context/NotificationContext'
import { useTasks } from '../hooks/useTasks'
import { useToast } from '../context/ToastContext'
import { formatDistanceToNow, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { useNavigate } from 'react-router-dom'

const TYPE_ICONS = {
  task_assigned:   { icon: 'assignment_ind',  color: '#004ac6' },
  task_completed:  { icon: 'check_circle',    color: '#10B981' },
  task_in_progress:{ icon: 'pending_actions', color: '#6366f1' },
  task_overdue:    { icon: 'warning',         color: '#EF4444' },
  task_reminder:   { icon: 'notifications_active', color: '#FBBF24' },
  comment_added:   { icon: 'chat_bubble',     color: '#0891b2' },
  comment:         { icon: 'chat',            color: '#10B981' },
  subtask_done:    { icon: 'task_alt',        color: '#8b5cf6' },
  due_soon:        { icon: 'schedule',        color: '#FBBF24' },
  overdue:         { icon: 'warning',         color: '#EF4444' },
  delete_request:          { icon: 'report', color: '#93000a' },
  delete_request_approved: { icon: 'delete', color: '#93000a' },
  delete_request_rejected: { icon: 'block',  color: '#434655' },
}

function timeAgo(str) {
  try { return formatDistanceToNow(parseISO(str), { addSuffix: true, locale: es }) } catch { return '' }
}

export default function NotificationsPage() {
  const { notifications, markAsRead, markAllAsRead, deleteNotification, clearAll } = useNotifications()
  const { resolveDeleteRequest } = useTasks()
  const { addToast } = useToast()
  const [resolvingId, setResolvingId] = useState(null)
  const navigate = useNavigate()
  const unread = notifications.filter((n) => !n.read).length

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
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[#191c1e] dark:text-[#e4e6f0]">Notificaciones</h1>
          {unread > 0 && <p className="text-sm text-[#434655] dark:text-[#c4c8e8] mt-0.5">{unread} sin leer</p>}
        </div>
        <div className="flex gap-2">
          {unread > 0 && (
            <button onClick={markAllAsRead} className="h-9 px-3 rounded-lg text-sm font-semibold border border-[#c3c6d7] dark:border-[#2e3148] text-[#434655] dark:text-[#c4c8e8] hover:bg-[#edeef0] dark:hover:bg-[#252840] transition">
              Marcar todas como leídas
            </button>
          )}
          {notifications.length > 0 && (
            <button onClick={clearAll} className="h-9 px-3 rounded-lg text-sm font-semibold text-[#EF4444] border border-[#EF4444] hover:bg-[#ffdad6] transition">
              Limpiar todo
            </button>
          )}
        </div>
      </div>

      <div className="bg-white dark:bg-[#1e2030] rounded-2xl border border-[#c3c6d7] dark:border-[#2e3148] overflow-hidden">
        {notifications.length === 0 ? (
          <div className="py-20 text-center">
            <span className="material-symbols-outlined text-5xl text-[#c3c6d7]">notifications_none</span>
            <p className="text-lg font-semibold text-[#434655] dark:text-[#c4c8e8] mt-3">Sin notificaciones</p>
            <p className="text-sm text-[#888] mt-1">Aquí aparecerán las notificaciones de tus tareas</p>
          </div>
        ) : (
          notifications.map((n) => {
            const meta = TYPE_ICONS[n.type] || { icon: 'notifications', color: '#004ac6' }
            const handleRowClick = () => {
              if (!n.taskId) return
              markAsRead(n.id)
              const params = new URLSearchParams({ openTask: n.taskId })
              if (n.extra?.commentId) params.set('comment', n.extra.commentId)
              navigate(`/tasks?${params}`)
            }
            return (
              <div
                key={n.id}
                onClick={handleRowClick}
                className={`flex items-start gap-4 px-5 py-4 border-b border-[#edeef0] dark:border-[#252840] last:border-0 ${!n.read ? 'bg-blue-50 dark:bg-[#1a2040]' : ''} ${n.taskId ? 'cursor-pointer hover:bg-[#f3f4f6] dark:hover:bg-[#252840]' : ''} transition`}
              >
                <div className="relative flex-shrink-0">
                  <div className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: `${meta.color}22` }}>
                    <span className="material-symbols-outlined text-base" style={{ color: meta.color }}>{meta.icon}</span>
                  </div>
                  {!n.read && (
                    <span className="absolute -top-0.5 -right-0.5">
                      <span className="block w-2.5 h-2.5 rounded-full" style={{ background: '#10B981' }} />
                      <span className="absolute inset-0 rounded-full animate-ping" style={{ background: '#10B98166' }} />
                    </span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-[#191c1e] dark:text-[#e4e6f0]">{n.message}</p>
                  <p className="text-xs text-[#888] mt-0.5">{timeAgo(n.createdAt)}</p>
                  {n.type === 'delete_request' && (
                    <div className="flex gap-2 mt-2" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => handleResolve(n, 'approve')}
                        disabled={resolvingId === n.id}
                        className="h-8 px-3 rounded-lg text-xs font-semibold text-white disabled:opacity-40 hover:opacity-90 transition"
                        style={{ background: '#93000a' }}
                      >
                        Aprobar
                      </button>
                      <button
                        onClick={() => handleResolve(n, 'reject')}
                        disabled={resolvingId === n.id}
                        className="h-8 px-3 rounded-lg text-xs font-semibold border border-[#c3c6d7] dark:border-[#2e3148] text-[#434655] dark:text-[#c4c8e8] disabled:opacity-40 hover:bg-[#edeef0] dark:hover:bg-[#252840] transition"
                      >
                        Rechazar
                      </button>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                  {!n.read && (
                    <button onClick={() => markAsRead(n.id)} className="p-1.5 rounded-lg hover:bg-[#edeef0] dark:hover:bg-[#252840] transition" title="Marcar como leída">
                      <span className="material-symbols-outlined text-sm text-[#004ac6]">done</span>
                    </button>
                  )}
                  <button onClick={() => deleteNotification(n.id)} className="p-1.5 rounded-lg hover:bg-[#ffdad6] transition" title="Eliminar">
                    <span className="material-symbols-outlined text-sm text-[#EF4444]">delete</span>
                  </button>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
