import { createContext, useState, useCallback, useContext, useEffect } from 'react'
import { generateId } from '../utils/helpers'
import { storage } from '../utils/storage'
import { useAuth } from './AuthContext'

export const NotificationContext = createContext(null)

export function NotificationProvider({ children }) {
  const { user } = useAuth()
  const userId = user?.id ?? null

  const [notifications, setNotifications] = useState(() =>
    storage.getNotifications(userId)
  )

  useEffect(() => {
    setNotifications(storage.getNotifications(userId))
  }, [userId])

  useEffect(() => {
    if (!userId) return
    const interval = setInterval(() => {
      const fresh = storage.getNotifications(userId)
      setNotifications((prev) => {
        if (fresh.length !== prev.length || fresh[0]?.id !== prev[0]?.id) return fresh
        return prev
      })
    }, 3000)
    return () => clearInterval(interval)
  }, [userId])

  const persist = useCallback((updater) => {
    setNotifications((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater
      storage.saveNotifications(next, userId)
      return next
    })
  }, [userId])

  const addNotification = useCallback((type, message, taskId = null, targetUserId = null) => {
    const notif = {
      id: generateId('notif'),
      type,
      message,
      taskId,
      read: false,
      createdAt: new Date().toISOString(),
    }
    const dest = targetUserId ?? userId
    if (dest && dest !== userId) {
      storage.pushNotificationToUser(dest, notif)
    } else {
      persist((prev) => [notif, ...prev].slice(0, 50))
    }
  }, [userId, persist])

  const markAsRead = useCallback((notifId) => {
    persist((prev) => prev.map((n) => (n.id === notifId ? { ...n, read: true } : n)))
  }, [persist])

  const markAllAsRead = useCallback(() => {
    persist((prev) => prev.map((n) => ({ ...n, read: true })))
  }, [persist])

  const deleteNotification = useCallback((notifId) => {
    persist((prev) => prev.filter((n) => n.id !== notifId))
  }, [persist])

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
