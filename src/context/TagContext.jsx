import { createContext, useState, useCallback, useContext, useEffect } from 'react'
import { generateId, today } from '../utils/helpers'
import { api } from '../services/api'
import { useAuth } from './AuthContext'

const STORAGE_KEY = 'tags'

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function save(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
}

const SAMPLE_TAGS = [
  { id: 'tag-1', name: 'frontend', color: '#004ac6', createdAt: '2026-05-01' },
  { id: 'tag-2', name: 'backend', color: '#10B981', createdAt: '2026-05-01' },
  { id: 'tag-3', name: 'urgente', color: '#EF4444', createdAt: '2026-05-01' },
  { id: 'tag-4', name: 'diseño', color: '#F97316', createdAt: '2026-05-01' },
]

export const TagContext = createContext(null)

export function TagProvider({ children }) {
  const { useRealBackend } = useAuth()
  const [tags, setTags] = useState(() => load() ?? SAMPLE_TAGS)

  useEffect(() => {
    if (!useRealBackend) return
    api.getTags()
      .then(data => setTags(Array.isArray(data) ? data : []))
      .catch(() => {})
  }, [useRealBackend])

  const persist = (updated) => {
    setTags(updated)
    if (!useRealBackend) save(updated)
  }

  const createTag = useCallback((name, color) => {
    const newTag = { id: generateId('tag'), name, color, createdAt: today() }
    persist((prev) => [...prev, newTag])
    return newTag
  }, [])

  const updateTag = useCallback((id, updates) => {
    persist((prev) => prev.map((t) => (t.id === id ? { ...t, ...updates } : t)))
  }, [])

  const deleteTag = useCallback((id) => {
    persist((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const getTagById = useCallback((id) => tags.find((t) => t.id === id), [tags])

  return (
    <TagContext.Provider value={{ tags, createTag, updateTag, deleteTag, getTagById }}>
      {children}
    </TagContext.Provider>
  )
}

export function useTags() {
  const ctx = useContext(TagContext)
  if (!ctx) throw new Error('useTags must be used inside TagProvider')
  return ctx
}
