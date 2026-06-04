import { createContext, useState, useEffect, useCallback, useContext } from 'react'
import { storage } from '../utils/storage'
import { generateId, today } from '../utils/helpers'
import { SAMPLE_MEMBERS } from '../utils/sampleData'
import { api } from '../services/api'
import { useAuth } from './AuthContext'

export const TeamContext = createContext(null)

export function TeamProvider({ children }) {
  const { useRealBackend } = useAuth()
  const [members, setMembers] = useState(() => {
    const saved = storage.getMembers()
    return saved ?? SAMPLE_MEMBERS
  })

  useEffect(() => {
    if (!useRealBackend) return
    api.getEmployees()
      .then(data => setMembers(Array.isArray(data) ? data : []))
      .catch(() => {})
  }, [useRealBackend])

  useEffect(() => {
    if (useRealBackend) return
    storage.saveMembers(members)
  }, [members, useRealBackend])

  const addMember = useCallback(async (memberData) => {
    if (useRealBackend) {
      const created = await api.createEmployee({
        name: memberData.name,
        email: memberData.email,
        role: memberData.role,
        password: memberData.password,
      })
      const newMember = {
        id: created.id,
        name: created.name,
        email: created.email,
        role: created.role,
        createdAt: created.created_at,
        groupIds: [],
        preferences: { theme: 'light', notifications: true },
      }
      setMembers((prev) => [...prev, newMember])
      return newMember
    }
    const newMember = {
      groupIds: [],
      preferences: { theme: 'light', notifications: true },
      ...memberData,
      id: generateId('user'),
      createdAt: today(),
    }
    setMembers((prev) => [...prev, newMember])
    return newMember
  }, [useRealBackend])

  const updateMember = useCallback(async (id, updates) => {
    if (useRealBackend) {
      const payload = {}
      if (updates.name !== undefined) payload.name = updates.name
      if (updates.role !== undefined) payload.role = updates.role
      if (updates.password) payload.password = updates.password
      if (updates.permissions !== undefined) payload.permissions = updates.permissions
      const updated = await api.updateEmployee(id, payload)
      setMembers((prev) => prev.map((m) => m.id === id ? { ...m, ...updates, name: updated.name, role: updated.role } : m))
      return
    }
    setMembers((prev) => prev.map((m) => (m.id === id ? { ...m, ...updates } : m)))
  }, [useRealBackend])

  const deleteMember = useCallback(async (id) => {
    if (useRealBackend) {
      await api.deleteEmployee(id)
    }
    setMembers((prev) => prev.filter((m) => m.id !== id))
  }, [useRealBackend])

  const getMemberById = useCallback((id) => members.find((m) => m.id === id), [members])

  return (
    <TeamContext.Provider value={{ members, addMember, updateMember, deleteMember, getMemberById }}>
      {children}
    </TeamContext.Provider>
  )
}

export function useTeam() {
  const ctx = useContext(TeamContext)
  if (!ctx) throw new Error('useTeam must be used inside TeamProvider')
  return ctx
}
