import { createContext, useState, useEffect, useCallback, useContext, useRef } from 'react'
import { storage } from '../utils/storage'
import { generateId, today } from '../utils/helpers'
import { SAMPLE_TASKS } from '../utils/sampleData'
import { useAuth } from './AuthContext'

export const TaskContext = createContext(null)

function pushAssignNotif(assignedTo, actorName, taskTitle, taskId) {
  if (!assignedTo) return
  storage.pushNotificationToUser(assignedTo, {
    id: generateId('notif'),
    type: 'task_assigned',
    message: `${actorName} te asignó la tarea "${taskTitle}"`,
    taskId,
    read: false,
    createdAt: new Date().toISOString(),
  })
}

export function TaskProvider({ children }) {
  const { user } = useAuth()
  const [tasks, setTasks] = useState(() => {
    const saved = storage.getTasks()
    return saved ?? SAMPLE_TASKS
  })
  const addingRef = useRef(false)

  const savingRef = useRef(false)

  useEffect(() => {
    savingRef.current = true
    storage.saveTasks(tasks)
    savingRef.current = false
  }, [tasks])

  useEffect(() => {
    const interval = setInterval(() => {
      if (savingRef.current) return
      const fresh = storage.getTasks()
      if (!fresh) return
      setTasks((prev) => {
        if (fresh.length !== prev.length || fresh[0]?.updatedAt !== prev[0]?.updatedAt) return fresh
        return prev
      })
    }, 3000)
    return () => clearInterval(interval)
  }, [])

  const addTask = useCallback((taskData) => {
    if (addingRef.current) return null
    addingRef.current = true
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
    setTasks((prev) => {
      addingRef.current = false
      return [newTask, ...prev]
    })
    if (newTask.assignedTo && newTask.assignedTo !== user?.id) {
      pushAssignNotif(newTask.assignedTo, user?.name ?? 'Alguien', newTask.title, newTask.id)
    }
    return newTask
  }, [user])

  const updateTask = useCallback((id, updates, prevAssignedTo) => {
    setTasks((prev) => {
      const current = prev.find((t) => t.id === id)
      if (
        updates.assignedTo &&
        updates.assignedTo !== current?.assignedTo &&
        updates.assignedTo !== user?.id
      ) {
        pushAssignNotif(updates.assignedTo, user?.name ?? 'Alguien', current?.title ?? '', id)
      }
      return prev.map((t) => (t.id === id ? { ...t, ...updates, updatedAt: today() } : t))
    })
  }, [user])

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
