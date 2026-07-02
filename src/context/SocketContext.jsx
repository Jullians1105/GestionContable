import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { useAuth } from './AuthContext'

export const SocketContext = createContext({ socket: null, connected: false, onlineUserIds: new Set() })

export function SocketProvider({ children }) {
  const { token, isAuthenticated } = useAuth()
  const [socket, setSocket] = useState(null)
  const [connected, setConnected] = useState(false)
  const [onlineUserIds, setOnlineUserIds] = useState(new Set())
  const socketRef = useRef(null)

  useEffect(() => {
    if (!isAuthenticated || !token) {
      if (socketRef.current) {
        socketRef.current.disconnect()
        socketRef.current = null
        setSocket(null)
        setConnected(false)
      }
      return
    }

    // Importar socket.io-client dinámicamente (opcional — no bloquea si no está instalado)
    import('socket.io-client').then(({ io }) => {
      if (socketRef.current) socketRef.current.disconnect()

      const apiUrl = import.meta.env.VITE_API_URL || ''
      const s = io(apiUrl, {
        auth: { token },
        autoConnect: true,
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
      })

      s.on('connect', () => { console.debug('[Socket] Connected:', s.id); setConnected(true) })
      s.on('disconnect', () => { console.debug('[Socket] Disconnected'); setConnected(false) })
      s.on('connect_error', (err) => { console.debug('[Socket] Error:', err.message); setConnected(false) })
      s.on('user:online',  ({ userId }) => setOnlineUserIds(prev => new Set([...prev, userId])))
      s.on('user:offline', ({ userId }) => setOnlineUserIds(prev => { const n = new Set(prev); n.delete(userId); return n }))

      socketRef.current = s
      setSocket(s)
    }).catch(() => {
      // socket.io-client no instalado, modo sin WebSockets
    })

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect()
        socketRef.current = null
        setConnected(false)
      }
    }
  }, [isAuthenticated, token])

  return (
    <SocketContext.Provider value={{ socket, connected, onlineUserIds }}>
      {children}
    </SocketContext.Provider>
  )
}

export function useSocket() {
  return useContext(SocketContext)
}
