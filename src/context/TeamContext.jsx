import { createContext, useState, useEffect, useCallback } from 'react'
import { storage } from '../utils/storage'
import { generateId, today } from '../utils/helpers'
import { SAMPLE_MEMBERS } from '../utils/sampleData'

export const TeamContext = createContext(null)

export function TeamProvider({ children }) {
  const [members, setMembers] = useState(() => {
    const saved = storage.getMembers()
    return saved ?? SAMPLE_MEMBERS
  })

  useEffect(() => {
    storage.saveMembers(members)
  }, [members])

  const addMember = useCallback((memberData) => {
    const newMember = {
      ...memberData,
      id: generateId('user'),
      createdAt: today(),
    }
    setMembers((prev) => [...prev, newMember])
    return newMember
  }, [])

  const updateMember = useCallback((id, updates) => {
    setMembers((prev) =>
      prev.map((m) => (m.id === id ? { ...m, ...updates } : m))
    )
  }, [])

  const deleteMember = useCallback((id) => {
    setMembers((prev) => prev.filter((m) => m.id !== id))
  }, [])

  const getMemberById = useCallback(
    (id) => members.find((m) => m.id === id),
    [members]
  )

  return (
    <TeamContext.Provider
      value={{ members, addMember, updateMember, deleteMember, getMemberById }}
    >
      {children}
    </TeamContext.Provider>
  )
}
