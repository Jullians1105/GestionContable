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

  const addMember = useCallback((memberData) => {
    const newMember = {
      groupIds: [],
      preferences: { theme: 'light', notifications: true },
      ...memberData,
      id: generateId('user'),
      createdAt: today(),
    }
    setMembers((prev) => [...prev, newMember])
    return newMember
  }, [])

  const updateMember = useCallback((id, updates) => {
    setMembers((prev) => prev.map((m) => (m.id === id ? { ...m, ...updates } : m)))
  }, [])

  const deleteMember = useCallback((id) => {
    setMembers((prev) => prev.filter((m) => m.id !== id))
  }, [])

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
