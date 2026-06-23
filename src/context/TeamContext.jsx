import { createContext, useState, useEffect, useCallback, useContext } from 'react'
import { storage } from '../utils/storage'
import { generateId, today } from '../utils/helpers'
import { SAMPLE_MEMBERS } from '../utils/sampleData'
import { api } from '../services/api'
import { useAuth } from './AuthContext'

export const TeamContext = createContext(null)

export function TeamProvider({ children }) {
  const { user, useRealBackend } = useAuth()
  const [members, setMembers] = useState(() => {
    const saved = storage.getMembers()
    return (saved && saved.length > 0) ? saved : SAMPLE_MEMBERS
  })
  const [allUsers, setAllUsers] = useState([])

  useEffect(() => {
    if (!useRealBackend || !user) return

    api.getEmployees()
      .then(data => {
        const raw = Array.isArray(data) ? data : []
        const users = raw.map(u => ({
          ...u,
          createdAt: u.createdAt ?? u.created_at,
          // permissions viene como JSONB parseado por pg; si es string (migración
          // anterior sin cast) lo parseamos manualmente
          permissions: typeof u.permissions === 'string'
            ? (() => { try { return JSON.parse(u.permissions) } catch { return null } })()
            : (u.permissions ?? null),
        }))
        setAllUsers(users)
        setMembers(users)
      })
      .catch(() => {})
  }, [useRealBackend, user?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (useRealBackend) return
    storage.saveMembers(members)
  }, [members, useRealBackend])

  // Create a brand-new user account (used by UsersManager admin CRUD)
  const createUser = useCallback(async (userData) => {
    if (useRealBackend) {
      const created = await api.createEmployee(userData)
      const newUser = {
        id: created.id,
        name: created.name,
        email: created.email,
        role: created.role,
        createdAt: created.created_at,
        groupIds: [],
        preferences: { theme: 'light', notifications: true },
      }
      setAllUsers(prev => [...prev, newUser])
      setMembers(prev => [...prev, newUser])
      return newUser
    }
    const newUser = {
      groupIds: [],
      preferences: { theme: 'light', notifications: true },
      ...userData,
      id: generateId('user'),
      createdAt: today(),
    }
    setMembers(prev => [...prev, newUser])
    return newUser
  }, [useRealBackend])

  // Add an existing user account to the team view (used by TeamManager picker)
  const addMember = useCallback(async (memberData) => {
    if (useRealBackend) {
      const user = allUsers.find(u => u.id === memberData.id)
      if (!user) return null
      setMembers(prev => prev.some(m => m.id === user.id) ? prev : [...prev, user])
      return user
    }
    const newMember = {
      groupIds: [],
      preferences: { theme: 'light', notifications: true },
      ...memberData,
      id: generateId('user'),
      createdAt: today(),
    }
    setMembers(prev => [...prev, newMember])
    return newMember
  }, [useRealBackend, allUsers])

  const updateMember = useCallback(async (id, updates) => {
    if (useRealBackend) {
      const payload = {}
      if (updates.name !== undefined) payload.name = updates.name
      if (updates.email !== undefined) payload.email = updates.email
      if (updates.role !== undefined) payload.role = updates.role
      if (updates.password) payload.password = updates.password
      if (updates.permissions !== undefined) payload.permissions = updates.permissions

      // Actualización optimista inmediata para que el checkbox cambie de una
      setMembers(prev => prev.map(m => m.id === id ? { ...m, ...updates } : m))
      setAllUsers(prev => prev.map(u => u.id === id ? { ...u, ...updates } : u))

      const updated = await api.updateEmployee(id, payload)
      // Reconciliar: nombre/email/rol vienen del servidor; permisos usan el
      // valor enviado si el servidor devuelve null (garantiza persistencia)
      const patch = { name: updated.name, email: updated.email, role: updated.role }
      if (updates.permissions !== undefined) {
        patch.permissions = updated.permissions ?? updates.permissions
      } else if (updated.permissions !== undefined) {
        patch.permissions = updated.permissions
      }
      setMembers(prev => prev.map(m => m.id === id ? { ...m, ...patch } : m))
      setAllUsers(prev => prev.map(u => u.id === id ? { ...u, ...patch } : u))
      return
    }
    setMembers(prev => prev.map(m => m.id === id ? { ...m, ...updates } : m))
  }, [useRealBackend])

  // removeFromTeam: removes from team view without deleting the account (TeamManager)
  const removeFromTeam = useCallback((id) => {
    const savedIds = (storage.getTeamMemberIds() ?? []).filter(x => x !== id)
    storage.saveTeamMemberIds(savedIds)
    setMembers(prev => prev.filter(m => m.id !== id))
  }, [])

  // deleteMember: deletes the account from the system (UsersManager)
  const deleteMember = useCallback(async (id) => {
    if (useRealBackend) {
      await api.deleteEmployee(id)
      const savedIds = (storage.getTeamMemberIds() ?? []).filter(x => x !== id)
      storage.saveTeamMemberIds(savedIds)
      setAllUsers(prev => prev.filter(u => u.id !== id))
    }
    setMembers(prev => prev.filter(m => m.id !== id))
  }, [useRealBackend])

  const getMemberById = useCallback((id) => members.find(m => m.id === id), [members])

  return (
    <TeamContext.Provider value={{ members, allUsers, createUser, addMember, updateMember, deleteMember, removeFromTeam, getMemberById }}>
      {children}
    </TeamContext.Provider>
  )
}

export function useTeam() {
  const ctx = useContext(TeamContext)
  if (!ctx) throw new Error('useTeam must be used inside TeamProvider')
  return ctx
}
