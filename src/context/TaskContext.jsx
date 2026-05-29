import { createContext, useState, useEffect, useCallback, useContext } from 'react'
import { storage } from '../utils/storage'
import { generateId, today } from '../utils/helpers'
import { SAMPLE_TASKS } from '../utils/sampleData'

export const TaskContext = createContext(null)

export function TaskProvider({ children }) {
  const [tasks, setTasks] = useState(() => {
    const saved = storage.getTasks()
    return saved ?? SAMPLE_TASKS
  })

  useEffect(() => {
    storage.saveTasks(tasks)
  }, [tasks])

  const addTask = useCallback((taskData) => {
    const newTask = {
      groupId: null,
      tagIds: [],
      subtasks: [],
      comments: [],
      ...taskData,
      id: generateId('task'),
      createdAt: today(),
      updatedAt: today(),
    }
    setTasks((prev) => [newTask, ...prev])
    return newTask
  }, [])

  const updateTask = useCallback((id, updates) => {
    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, ...updates, updatedAt: today() } : t))
    )
  }, [])

  const deleteTask = useCallback((id) => {
    setTasks((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const getTaskById = useCallback((id) => tasks.find((t) => t.id === id), [tasks])

  const getTasksByMember = useCallback(
    (memberId) => tasks.filter((t) => t.assignedTo === memberId),
    [tasks]
  )

  const getTasksByGroup = useCallback(
    (groupId) => tasks.filter((t) => t.groupId === groupId),
    [tasks]
  )

  const addSubtask = useCallback((taskId, title) => {
    const subtask = {
      id: generateId('subtask'),
      title,
      completed: false,
      createdAt: today(),
    }
    setTasks((prev) =>
      prev.map((t) =>
        t.id === taskId
          ? { ...t, subtasks: [...(t.subtasks || []), subtask], updatedAt: today() }
          : t
      )
    )
    return subtask
  }, [])

  const toggleSubtask = useCallback((taskId, subtaskId) => {
    setTasks((prev) =>
      prev.map((t) =>
        t.id === taskId
          ? {
              ...t,
              subtasks: (t.subtasks || []).map((s) =>
                s.id === subtaskId ? { ...s, completed: !s.completed } : s
              ),
              updatedAt: today(),
            }
          : t
      )
    )
  }, [])

  const deleteSubtask = useCallback((taskId, subtaskId) => {
    setTasks((prev) =>
      prev.map((t) =>
        t.id === taskId
          ? {
              ...t,
              subtasks: (t.subtasks || []).filter((s) => s.id !== subtaskId),
              updatedAt: today(),
            }
          : t
      )
    )
  }, [])

  const addComment = useCallback((taskId, authorId, text) => {
    const comment = {
      id: generateId('comment'),
      authorId,
      text,
      mentions: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    setTasks((prev) =>
      prev.map((t) =>
        t.id === taskId
          ? { ...t, comments: [...(t.comments || []), comment], updatedAt: today() }
          : t
      )
    )
    return comment
  }, [])

  const updateComment = useCallback((taskId, commentId, text) => {
    setTasks((prev) =>
      prev.map((t) =>
        t.id === taskId
          ? {
              ...t,
              comments: (t.comments || []).map((c) =>
                c.id === commentId ? { ...c, text, updatedAt: new Date().toISOString() } : c
              ),
              updatedAt: today(),
            }
          : t
      )
    )
  }, [])

  const deleteComment = useCallback((taskId, commentId) => {
    setTasks((prev) =>
      prev.map((t) =>
        t.id === taskId
          ? {
              ...t,
              comments: (t.comments || []).filter((c) => c.id !== commentId),
              updatedAt: today(),
            }
          : t
      )
    )
  }, [])

  return (
    <TaskContext.Provider
      value={{
        tasks,
        addTask,
        updateTask,
        deleteTask,
        getTaskById,
        getTasksByMember,
        getTasksByGroup,
        addSubtask,
        toggleSubtask,
        deleteSubtask,
        addComment,
        updateComment,
        deleteComment,
      }}
    >
      {children}
    </TaskContext.Provider>
  )
}

export function useTasks() {
  const ctx = useContext(TaskContext)
  if (!ctx) throw new Error('useTasks must be used inside TaskProvider')
  return ctx
}
