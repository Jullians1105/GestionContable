import { createContext, useState, useCallback, useContext, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { generateId } from '../utils/helpers'
import { storage } from '../utils/storage'
import { api } from '../services/api'
import { useAuth } from './AuthContext'
import { useSocket } from './SocketContext'
import { useToast } from './ToastContext'

const NOTIF_TITLES = {
  task_assigned:   'Tarea asignada',
  task_completed:  'Tarea completada',
  task_overdue:    'Tarea vencida',
  task_in_progress:'Tarea en progreso',
  comment_added:   'Nuevo comentario',
  subtask_done:    'Subtarea completada',
}

export const NotificationContext = createContext(null)

export function NotificationProvider({ children }) {
  const { user, useRealBackend } = useAuth()
  const { socket, connected } = useSocket()
  const { addToast } = useToast()
  const navigate = useNavigate()
  const userId = user?.id ?? null

  const [notifications, setNotifications] = useState(() =>
    storage.getNotifications(userId)
  )

  useEffect(() => {
    setNotifications(storage.getNotifications(userId))
  }, [userId])

  // Solicitar permiso de notificaciones del SO al iniciar sesión
  useEffect(() => {
    if (!userId) return
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission()
    }
  }, [userId])

  // Cargar desde API real cuando backend disponible
  useEffect(() => {
    if (!useRealBackend || !userId) return
    api.getNotifications()
      .then(data => setNotifications(Array.isArray(data) ? data : []))
      .catch(() => {})
  }, [useRealBackend, userId])

  // Suscripción a notificaciones en tiempo real vía socket
  useEffect(() => {
    if (!socket) return

    const onNotification = (notif) => {
      setNotifications(prev => [{ ...notif, read: false }, ...prev].slice(0, 50))

      // Toast in-app con botón "Ver" si hay tarea asociada
      addToast(notif.message, 'info', 6000, notif.taskId
        ? { label: 'Ver', onClick: () => navigate('/tasks') }
        : null
      )

      // Notificación del SO (cuando la app está en background o en otra pestaña)
      if ('Notification' in window && Notification.permission === 'granted') {
        const title = NOTIF_TITLES[notif.type] || 'Notificación'
        const osNotif = new Notification(title, {
          body: notif.message,
          icon: '/app-icon.png',
          tag: notif.id,
        })
        osNotif.onclick = () => {
          window.focus()
          if (notif.taskId) navigate('/tasks')
        }
      }
    }

    socket.on('notification:received', onNotification)
    return () => socket.off('notification:received', onNotification)
  }, [socket])

  // Polling fallback (solo sin socket activo y sin backend real)
  useEffect(() => {
    if (!userId || connected || useRealBackend) return
    const interval = setInterval(() => {
      const fresh = storage.getNotifications(userId)
      setNotifications((prev) => {
        if (fresh.length !== prev.length || fresh[0]?.id !== prev[0]?.id) return fresh
        return prev
      })
    }, 3000)
    return () => clearInterval(interval)
  }, [userId, connected, useRealBackend])

  const persist = useCallback((updater) => {
    setNotifications((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater
      if (!useRealBackend) storage.saveNotifications(next, userId)
      return next
    })
  }, [userId, useRealBackend])

  const addNotification = useCallback((type, message, taskId = null, targetUserId = null) => {
    const notif = {
      id: generateId('notif'), type, message, taskId,
      read: false, createdAt: new Date().toISOString(),
    }
    const dest = targetUserId ?? userId
    if (dest && dest !== userId) {
      storage.pushNotificationToUser(dest, notif)
    } else {
      persist((prev) => [notif, ...prev].slice(0, 50))
    }
  }, [userId, persist])

  const markAsRead = useCallback((notifId) => {
    if (!notifId) return
    persist((prev) => prev.map((n) => (n.id === notifId ? { ...n, read: true } : n)))
    if (useRealBackend) api.markNotificationRead(notifId).catch(() => {})
  }, [persist, useRealBackend])

  const markAllAsRead = useCallback(() => {
    persist((prev) => prev.map((n) => ({ ...n, read: true })))
    if (useRealBackend) api.markAllNotificationsRead().catch(() => {})
  }, [persist, useRealBackend])

  const deleteNotification = useCallback((notifId) => {
    persist((prev) => prev.filter((n) => n.id !== notifId))
    if (useRealBackend) api.deleteNotification(notifId).catch(() => {})
  }, [persist, useRealBackend])

  const clearAll = useCallback(() => persist([]), [persist])

  const unreadCount = notifications.filter((n) => !n.read).length

  return (
    <NotificationContext.Provider
      value={{ notifications, unreadCount, addNotification, markAsRead, markAllAsRead, deleteNotification, clearAll }}
    >
      {children}
    </NotificationContext.Provider>
  )
}

export function useNotifications() {
  const ctx = useContext(NotificationContext)
  if (!ctx) throw new Error('useNotifications must be used inside NotificationProvider')
  return ctx
}
