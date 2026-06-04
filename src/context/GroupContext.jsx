import { createContext, useState, useCallback, useContext, useEffect } from 'react'
import { generateId, today } from '../utils/helpers'
import { api } from '../services/api'
import { useAuth } from './AuthContext'

const STORAGE_KEY = 'groups'

function loadGroups() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function saveGroups(groups) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(groups))
}

const SAMPLE_GROUPS = [
  {
    id: 'group-1',
    name: 'Frontend Team',
    description: 'Equipo de desarrollo frontend',
    leaderId: 'user-2',
    memberIds: ['user-1', 'user-2', 'user-3'],
    taskIds: ['task-1', 'task-7'],
    color: '#004ac6',
    createdAt: '2026-05-01',
    updatedAt: '2026-05-01',
  },
  {
    id: 'group-2',
    name: 'Backend Team',
    description: 'Equipo de infraestructura y APIs',
    leaderId: 'user-2',
    memberIds: ['user-2', 'user-4', 'user-5'],
    taskIds: ['task-2', 'task-4', 'task-8'],
    color: '#10B981',
    createdAt: '2026-05-01',
    updatedAt: '2026-05-01',
  },
]

export const GroupContext = createContext(null)

export function GroupProvider({ children }) {
  const { useRealBackend } = useAuth()
  const [groups, setGroups] = useState(() => loadGroups() ?? SAMPLE_GROUPS)
  const [currentGroupId, setCurrentGroupId] = useState(null)

  useEffect(() => {
    if (!useRealBackend) return
    api.getGroups()
      .then(data => setGroups(Array.isArray(data) ? data : []))
      .catch(() => {})
  }, [useRealBackend])

  const persist = (updated) => {
    setGroups(updated)
    if (!useRealBackend) saveGroups(updated)
  }

  const createGroup = useCallback((groupData) => {
    const newGroup = {
      ...groupData,
      id: generateId('group'),
      createdAt: today(),
      updatedAt: today(),
    }
    persist((prev) => [...prev, newGroup])
    return newGroup
  }, [])

  const updateGroup = useCallback((id, updates) => {
    persist((prev) =>
      prev.map((g) => (g.id === id ? { ...g, ...updates, updatedAt: today() } : g))
    )
  }, [])

  const deleteGroup = useCallback((id) => {
    persist((prev) => prev.filter((g) => g.id !== id))
    setCurrentGroupId((prev) => (prev === id ? null : prev))
  }, [])

  const addMemberToGroup = useCallback((groupId, userId) => {
    persist((prev) =>
      prev.map((g) =>
        g.id === groupId && !g.memberIds.includes(userId)
          ? { ...g, memberIds: [...g.memberIds, userId], updatedAt: today() }
          : g
      )
    )
  }, [])

  const removeMemberFromGroup = useCallback((groupId, userId) => {
    persist((prev) =>
      prev.map((g) =>
        g.id === groupId
          ? { ...g, memberIds: g.memberIds.filter((id) => id !== userId), updatedAt: today() }
          : g
      )
    )
  }, [])

  const getGroupById = useCallback((id) => groups.find((g) => g.id === id), [groups])

  const getGroupsByMember = useCallback(
    (memberId) => groups.filter((g) => g.memberIds.includes(memberId)),
    [groups]
  )

  return (
    <GroupContext.Provider
      value={{
        groups,
        currentGroupId,
        setCurrentGroupId,
        createGroup,
        updateGroup,
        deleteGroup,
        addMemberToGroup,
        removeMemberFromGroup,
        getGroupById,
        getGroupsByMember,
      }}
    >
      {children}
    </GroupContext.Provider>
  )
}

export function useGroups() {
  const ctx = useContext(GroupContext)
  if (!ctx) throw new Error('useGroups must be used inside GroupProvider')
  return ctx
}
