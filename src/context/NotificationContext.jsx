import { createContext, useState, useCallback, useContext } from 'react'
import { generateId, today } from '../utils/helpers'

const STORAGE_KEY = 'notifications'

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function save(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
}

export const NotificationContext = createContext(null)

export function NotificationProvider({ children }) {
  const [notifications, setNotifications] = useState(load)

  const persist = (updated) => {
    setNotifications(updated)
    save(updated)
  }

  const addNotification = useCallback((type, message, taskId = null) => {
    const notif = {
      id: generateId('notif'),
      type,
      message,
      taskId,
      read: false,
      createdAt: new Date().toISOString(),
    }
    persist((prev) => [notif, ...prev].slice(0, 50))
  }, [])

  const markAsRead = useCallback((notifId) => {
    persist((prev) =>
      prev.map((n) => (n.id === notifId ? { ...n, read: true } : n))
    )
  }, [])

  const markAllAsRead = useCallback(() => {
    persist((prev) => prev.map((n) => ({ ...n, read: true })))
  }, [])

  const deleteNotification = useCallback((notifId) => {
    persist((prev) => prev.filter((n) => n.id !== notifId))
  }, [])

  const clearAll = useCallback(() => {
    persist([])
  }, [])

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
