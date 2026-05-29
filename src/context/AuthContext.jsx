import { createContext, useState, useCallback, useContext } from 'react'
import { generateId, today } from '../utils/helpers'
import { storage } from '../utils/storage'
import { SAMPLE_MEMBERS } from '../utils/sampleData'

export const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem('auth_user')
    return saved ? JSON.parse(saved) : null
  })
  const [token, setToken] = useState(() => localStorage.getItem('auth_token'))

  const isAuthenticated = !!user && !!token

  const login = useCallback((email, password) => {
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

  const logout = useCallback(() => {
    localStorage.removeItem('auth_user')
    localStorage.removeItem('auth_token')
    setUser(null)
    setToken(null)
  }, [])

  const register = useCallback((name, email, password) => {
    const members = storage.getMembers() ?? SAMPLE_MEMBERS
    if (members.find((m) => m.email.toLowerCase() === email.toLowerCase())) {
      return { success: false, error: 'Ya existe un usuario con ese email' }
    }
    const newMember = {
      id: generateId('user'),
      name,
      email,
      password,
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
    const members = storage.getMembers() ?? []
    storage.saveMembers(members.map((m) => (m.id === updated.id ? updated : m)))
  }, [user])

  const canEdit = useCallback(() => {
    if (!user) return false
    return user.role !== 'viewer'
  }, [user])

  const isAdmin = useCallback(() => user?.role === 'admin', [user])
  const isLeader = useCallback(() => ['admin', 'leader'].includes(user?.role), [user])

  return (
    <AuthContext.Provider value={{ user, token, isAuthenticated, login, logout, register, updateCurrentUser, canEdit, isAdmin, isLeader }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
