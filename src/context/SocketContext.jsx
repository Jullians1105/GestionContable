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
      // reconnectionAttempts sin límite (default real de Socket.IO, Infinity) — con un tope
      // bajo (antes 5, ~5s de reintentos), cualquier corte más largo que eso (un deploy
      // reiniciando el backend, un blip de Cloudflare, un WiFi que se cae un momento) hacía
      // que el socket se rindiera para siempre: quedaba "Sin conexión" aunque el servidor ya
      // estuviera disponible de nuevo, hasta recargar la página a mano.
      //
      // `auth` como función (no `{ token }` fijo) — api.js refresca el access token en
      // localStorage por su cuenta (fetchWithAuth) SIN pasar por este `token` de AuthContext,
      // que solo se fija al hacer login y nunca se actualiza. Con `{ token }` fijo, cada
      // reintento de reconexión (tras un reinicio del backend, un rato largo de sesión
      // abierta) volvía a mandar el token viejo — si ya había expirado, el servidor lo
      // rechazaba una y otra vez y el socket quedaba en "Sin conexión" para siempre, aunque el
      // servidor estuviera perfectamente sano. Como función, Socket.IO la llama de nuevo en
      // cada intento y siempre manda el token vigente.
      const s = io(apiUrl, {
        auth: (cb) => cb({ token: localStorage.getItem('auth_token') || token }),
        autoConnect: true,
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
      })

      s.on('connect', () => { console.debug('[Socket] Connected:', s.id); setConnected(true) })
      s.on('disconnect', () => { console.debug('[Socket] Disconnected'); setConnected(false) })
      s.on('connect_error', (err) => { console.debug('[Socket] Error:', err.message); setConnected(false) })
      s.on('users:online:list', (userIds) => setOnlineUserIds(new Set(userIds)))
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
