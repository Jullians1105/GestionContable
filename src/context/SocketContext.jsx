import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { useAuth } from './AuthContext'

export const SocketContext = createContext(null)

export function SocketProvider({ children }) {
  const { token, isAuthenticated } = useAuth()
  const [socket, setSocket] = useState(null)
  const socketRef = useRef(null)

  useEffect(() => {
    if (!isAuthenticated || !token) {
      if (socketRef.current) {
        socketRef.current.disconnect()
        socketRef.current = null
        setSocket(null)
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

      s.on('connect', () => console.debug('[Socket] Connected:', s.id))
      s.on('disconnect', () => console.debug('[Socket] Disconnected'))
      s.on('connect_error', (err) => console.debug('[Socket] Error:', err.message))

      socketRef.current = s
      setSocket(s)
    }).catch(() => {
      // socket.io-client no instalado, modo sin WebSockets
    })

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect()
        socketRef.current = null
      }
    }
  }, [isAuthenticated, token])

  return (
    <SocketContext.Provider value={socket}>
      {children}
    </SocketContext.Provider>
  )
}

export function useSocket() {
  return useContext(SocketContext)
}
