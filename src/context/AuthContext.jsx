import { createContext, useState, useCallback, useContext, useEffect } from 'react'
import { api } from '../services/api'
import { generateId, today } from '../utils/helpers'
import { storage } from '../utils/storage'
import { SAMPLE_MEMBERS } from '../utils/sampleData'

export const AuthContext = createContext(null)

// Detecta si el backend real está disponible
let backendAvailable = null
async function checkBackend() {
  if (backendAvailable !== null) return backendAvailable
  try {
    const res = await fetch('/api/health', { signal: AbortSignal.timeout(2000) })
    backendAvailable = res.ok
  } catch {
    backendAvailable = false
  }
  return backendAvailable
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem('auth_user')
    return saved ? JSON.parse(saved) : null
  })
  const [token, setToken] = useState(() => localStorage.getItem('auth_token'))
  const [useRealBackend, setUseRealBackend] = useState(false)

  const isAuthenticated = !!user && !!token

  useEffect(() => {
    checkBackend().then(available => {
      setUseRealBackend(available)
      // Verificar que el token guardado sigue siendo válido
      if (available && token) {
        api.me().then(({ user: serverUser }) => {
          const merged = { ...serverUser }
          localStorage.setItem('auth_user', JSON.stringify(merged))
          setUser(merged)
        }).catch(() => {
          // Token expirado sin posibilidad de refresh
          localStorage.removeItem('auth_user')
          localStorage.removeItem('auth_token')
          localStorage.removeItem('auth_refresh_token')
          setUser(null)
          setToken(null)
        })
      }
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const login = useCallback(async (email, password) => {
    const hasBackend = await checkBackend()
    if (hasBackend) {
      try {
        const data = await api.login(email, password)
        localStorage.setItem('auth_user', JSON.stringify(data.user))
        setUser(data.user)
        setToken(data.token)
        setUseRealBackend(true)
        return { success: true }
      } catch (err) {
        return { success: false, error: err.message }
      }
    }
    // Fallback localStorage
    const members = storage.getMembers() ?? SAMPLE_MEMBERS
    const found = members.find(
      (m) => m.email.toLowerCase() === email.toLowerCase() && m.password === password
    )
    if (!found) return { success: false, error: 'Email o contraseña incorrectos' }
    const newToken = `token-${generateId('tk')}`
    localStorage.setItem('auth_user', JSON.stringify(found))
    localStorage.setItem('auth_token', newToken)
    setUser(found)
    setToken(newToken)
    return { success: true }
  }, [])

  const logout = useCallback(async () => {
    if (useRealBackend) {
      const refreshToken = localStorage.getItem('auth_refresh_token')
      try { await api.logout(refreshToken) } catch { /* ignore */ }
    }
    localStorage.removeItem('auth_user')
    localStorage.removeItem('auth_token')
    localStorage.removeItem('auth_refresh_token')
    setUser(null)
    setToken(null)
  }, [useRealBackend])

  const register = useCallback(async (name, email, password) => {
    const hasBackend = await checkBackend()
    if (hasBackend) {
      try {
        const data = await api.register({ name, email, password })
        localStorage.setItem('auth_user', JSON.stringify(data.user))
        setUser(data.user)
        setToken(data.token)
        return { success: true }
      } catch (err) {
        return { success: false, error: err.message }
      }
    }
    // Fallback localStorage
    const members = storage.getMembers() ?? SAMPLE_MEMBERS
    if (members.find((m) => m.email.toLowerCase() === email.toLowerCase())) {
      return { success: false, error: 'Ya existe un usuario con ese email' }
    }
    const newMember = {
      id: generateId('user'),
      name, email, password,
      role: 'member',
      groupIds: [],
      preferences: { theme: 'light', notifications: true },
      createdAt: today(),
    }
    storage.saveMembers([...members, newMember])
    const newToken = `token-${generateId('tk')}`
    localStorage.setItem('auth_user', JSON.stringify(newMember))
    localStorage.setItem('auth_token', newToken)
    setUser(newMember)
    setToken(newToken)
    return { success: true }
  }, [])

  const updateCurrentUser = useCallback((updates) => {
    const updated = { ...user, ...updates }
    localStorage.setItem('auth_user', JSON.stringify(updated))
    setUser(updated)
    if (!useRealBackend) {
      const members = storage.getMembers() ?? []
      storage.saveMembers(members.map((m) => (m.id === updated.id ? updated : m)))
    }
  }, [user, useRealBackend])

  const canEdit = useCallback(() => !user ? false : user.role !== 'viewer', [user])
  const isAdmin = useCallback(() => user?.role === 'admin', [user])
  const isLeader = useCallback(() => ['admin', 'leader'].includes(user?.role), [user])

  return (
    <AuthContext.Provider value={{
      user, token, isAuthenticated, useRealBackend,
      login, logout, register, updateCurrentUser, canEdit, isAdmin, isLeader,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
