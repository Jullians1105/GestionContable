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

function normalizeGroup(g) {
  return {
    ...g,
    leaderId: g.leaderId ?? g.leader_id ?? null,
    memberIds: g.memberIds ?? (g.members || []).map((m) => m.id),
    taskIds: g.taskIds ?? [],
  }
}

export const GroupContext = createContext(null)

export function GroupProvider({ children }) {
  const { user, useRealBackend } = useAuth()
  const [groups, setGroups] = useState(() => loadGroups() ?? SAMPLE_GROUPS)
  const [currentGroupId, setCurrentGroupId] = useState(null)

  useEffect(() => {
    if (!useRealBackend || !user) return
    api.getGroups()
      .then(data => {
        const loaded = Array.isArray(data) ? data.map(normalizeGroup) : []
        if (loaded.length > 0) setGroups(loaded)
        // backend vacío → mantener estado actual (localStorage o muestra)
      })
      .catch(() => {})
  }, [useRealBackend, user?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const persist = (updater) => {
    setGroups((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater
      if (!useRealBackend) saveGroups(next)
      return next
    })
  }

  const createGroup = useCallback(async (groupData) => {
    if (useRealBackend) {
      const created = await api.createGroup(groupData)
      const memberIds = [...new Set([user.id, ...(groupData.memberIds || [])])]
      const newGroup = normalizeGroup({ ...created, memberIds })
      setGroups((prev) => [...prev, newGroup])
      return newGroup
    }
    const newGroup = {
      ...groupData,
      id: generateId('group'),
      createdAt: today(),
      updatedAt: today(),
    }
    persist((prev) => [...prev, newGroup])
    return newGroup
  }, [useRealBackend]) // eslint-disable-line react-hooks/exhaustive-deps

  const updateGroup = useCallback(async (id, updates) => {
    if (useRealBackend) {
      const current = groups.find((g) => g.id === id)
      const oldIds = new Set(current?.memberIds ?? [])
      const newIds = new Set(updates.memberIds ?? oldIds)

      // updateGroup endpoint only handles metadata; member changes need separate calls
      const updated = await api.updateGroup(id, updates)
      await Promise.all([
        ...[...newIds].filter((uid) => !oldIds.has(uid)).map((uid) =>
          api.addGroupMember(id, uid).catch(() => {})
        ),
        ...[...oldIds].filter((uid) => !newIds.has(uid)).map((uid) =>
          api.removeGroupMember(id, uid).catch(() => {})
        ),
      ])

      setGroups((prev) =>
        prev.map((g) =>
          g.id === id ? normalizeGroup({ ...updated, memberIds: [...newIds] }) : g
        )
      )
      return
    }
    persist((prev) =>
      prev.map((g) => (g.id === id ? { ...g, ...updates, updatedAt: today() } : g))
    )
  }, [useRealBackend, groups]) // eslint-disable-line react-hooks/exhaustive-deps

  const deleteGroup = useCallback(async (id) => {
    if (useRealBackend) {
      await api.deleteGroup(id)
      setGroups((prev) => prev.filter((g) => g.id !== id))
      setCurrentGroupId((prev) => (prev === id ? null : prev))
      return
    }
    persist((prev) => prev.filter((g) => g.id !== id))
    setCurrentGroupId((prev) => (prev === id ? null : prev))
  }, [useRealBackend]) // eslint-disable-line react-hooks/exhaustive-deps

  const addMemberToGroup = useCallback(async (groupId, userId) => {
    if (useRealBackend) {
      await api.addGroupMember(groupId, userId)
      setGroups((prev) =>
        prev.map((g) =>
          g.id === groupId && !g.memberIds.includes(userId)
            ? { ...g, memberIds: [...g.memberIds, userId] }
            : g
        )
      )
      return
    }
    persist((prev) =>
      prev.map((g) =>
        g.id === groupId && !g.memberIds.includes(userId)
          ? { ...g, memberIds: [...g.memberIds, userId], updatedAt: today() }
          : g
      )
    )
  }, [useRealBackend]) // eslint-disable-line react-hooks/exhaustive-deps

  const removeMemberFromGroup = useCallback(async (groupId, userId) => {
    if (useRealBackend) {
      await api.removeGroupMember(groupId, userId)
      setGroups((prev) =>
        prev.map((g) =>
          g.id === groupId
            ? { ...g, memberIds: g.memberIds.filter((id) => id !== userId) }
            : g
        )
      )
      return
    }
    persist((prev) =>
      prev.map((g) =>
        g.id === groupId
          ? { ...g, memberIds: g.memberIds.filter((id) => id !== userId), updatedAt: today() }
          : g
      )
    )
  }, [useRealBackend]) // eslint-disable-line react-hooks/exhaustive-deps

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
