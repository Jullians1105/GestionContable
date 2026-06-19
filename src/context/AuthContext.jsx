import { createContext, useState, useCallback, useContext, useEffect } from 'react'
import { api } from '../services/api'
import { generateId, today } from '../utils/helpers'
import { storage } from '../utils/storage'
import { SAMPLE_MEMBERS } from '../utils/sampleData'
import { getEffectivePermissions } from '../utils/permissions'

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
      // useRealBackend solo se activa si el backend valida el token — no solo por el health check
      const tokenToValidate = localStorage.getItem('auth_token')
      if (available && tokenToValidate) {
        api.me()
          .then(({ user: serverUser }) => {
            setUseRealBackend(true)
            localStorage.setItem('auth_user', JSON.stringify(serverUser))
            setUser(serverUser)
          })
          .catch(() => {
            // Token inválido para el backend → permanecer en modo localStorage (no limpiar sesión)
          })
      }
    })
  }, [])

  const login = useCallback(async (email, password) => {
    const hasBackend = await checkBackend()
    if (hasBackend) {
      // Limpiar tokens previos antes de hacer login para evitar que refresh de token viejo interfiera
      localStorage.removeItem('auth_token')
      localStorage.removeItem('auth_refresh_token')
      try {
        const data = await api.login(email, password)
        localStorage.setItem('auth_user', JSON.stringify(data.user))
        setUser(data.user)
        setToken(data.token)
        setUseRealBackend(true)
        return { success: true }
      } catch {
        // Backend corriendo pero sin este usuario → caer a localStorage
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
        await api.register({ name, email, password })
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
    return { success: true }
  }, [])

  const requestPasswordReset = useCallback(async (email) => {
    const hasBackend = await checkBackend()
    if (hasBackend) {
      let devToken
      try {
        const data = await api.forgotPassword(email)
        devToken = data?.devToken
      } catch { /* respuesta genérica de todas formas */ }
      return { success: true, message: 'Si el email existe, se enviaron instrucciones para restablecer la contraseña', devToken }
    }
    // Fallback localStorage: no hay servicio de email, generamos un token visible para pruebas
    const members = storage.getMembers() ?? SAMPLE_MEMBERS
    const found = members.find((m) => m.email.toLowerCase() === email.toLowerCase())
    if (!found) return { success: false, error: 'No existe ninguna cuenta con ese email' }
    const token = generateId('reset')
    const tokens = storage.getPasswordResetTokens()
    tokens[token] = { email: found.email, expires: Date.now() + 30 * 60 * 1000 }
    storage.savePasswordResetTokens(tokens)
    return { success: true, devToken: token }
  }, [])

  const confirmPasswordReset = useCallback(async (token, newPassword) => {
    const hasBackend = await checkBackend()
    if (hasBackend) {
      try {
        await api.resetPassword(token, newPassword)
        return { success: true }
      } catch (err) {
        return { success: false, error: err.message }
      }
    }
    // Fallback localStorage
    const tokens = storage.getPasswordResetTokens()
    const entry = tokens[token]
    if (!entry || entry.expires < Date.now()) {
      return { success: false, error: 'Token inválido o expirado' }
    }
    const members = storage.getMembers() ?? SAMPLE_MEMBERS
    const updatedMembers = members.map((m) => (m.email.toLowerCase() === entry.email.toLowerCase() ? { ...m, password: newPassword } : m))
    storage.saveMembers(updatedMembers)
    delete tokens[token]
    storage.savePasswordResetTokens(tokens)
    return { success: true }
  }, [])

  const updateCurrentUser = useCallback(async (updates) => {
    const { currentPassword, newPassword, ...rest } = updates

    if (useRealBackend) {
      try {
        const data = await api.updateMe({ ...rest, currentPassword, newPassword })
        const updated = { ...user, ...data.user }
        localStorage.setItem('auth_user', JSON.stringify(updated))
        setUser(updated)
        return { success: true }
      } catch (err) {
        return { success: false, error: err.message }
      }
    }

    // Fallback localStorage
    if (newPassword) {
      if (user?.password !== currentPassword) {
        return { success: false, error: 'La contraseña actual es incorrecta' }
      }
    }
    const updated = { ...user, ...rest, ...(newPassword ? { password: newPassword } : {}) }
    localStorage.setItem('auth_user', JSON.stringify(updated))
    setUser(updated)
    const members = storage.getMembers() ?? []
    storage.saveMembers(members.map((m) => (m.id === updated.id ? updated : m)))
    return { success: true }
  }, [user, useRealBackend])

  const canEdit = useCallback(() => !user ? false : user.role !== 'viewer', [user])
  const isAdmin = useCallback(() => user?.role === 'admin', [user])
  const isLeader = useCallback(() => ['admin', 'leader'].includes(user?.role), [user])
  const hasPermission = useCallback((key) => getEffectivePermissions(user)[key] ?? false, [user])

  return (
    <AuthContext.Provider value={{
      user, token, isAuthenticated, useRealBackend,
      login, logout, register, requestPasswordReset, confirmPasswordReset, updateCurrentUser, canEdit, isAdmin, isLeader, hasPermission,
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
