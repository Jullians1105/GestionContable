import { createContext, useState, useEffect, useCallback, useContext, useRef } from 'react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { api } from '../services/api'
import { storage } from '../utils/storage'
import { generateId, today } from '../utils/helpers'
import { useAuth } from './AuthContext'
import { useTeam } from './TeamContext'

export const TaskContext = createContext(null)

function push(userId, type, message, taskId, extra = null) {
  storage.pushNotificationToUser(userId, {
    id: generateId('notif'),
    type,
    message,
    taskId,
    read: false,
    createdAt: new Date().toISOString(),
    ...(extra && { extra }),
  })
}

function notifyLeaders(members, type, message, taskId, excludeId, extra = null) {
  members
    .filter(m => (m.role === 'admin' || m.role === 'leader') && m.id !== excludeId)
    .forEach(m => push(m.id, type, message, taskId, extra))
}

export function TaskProvider({ children }) {
  const { user } = useAuth()
  const { members } = useTeam()
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const addingRef = useRef(false)
  const tasksRef = useRef(tasks)
  const sentOverdueRef = useRef(new Set())

  useEffect(() => { tasksRef.current = tasks }, [tasks])

  useEffect(() => {
    api.getTasks()
      .then(data => { setTasks(data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (!user) return
    const interval = setInterval(() => {
      api.getTasks().then(fresh => {
        setTasks(prev => {
          if (fresh.length !== prev.length || fresh[0]?.updatedAt !== prev[0]?.updatedAt) return fresh
          return prev
        })
        const todayStr = today()
        fresh.forEach(task => {
          if (
            task.assignedTo === user.id &&
            task.status !== 'completed' &&
            task.dueDate &&
            task.dueDate < todayStr &&
            !sentOverdueRef.current.has(task.id)
          ) {
            sentOverdueRef.current.add(task.id)
            push(user.id, 'task_overdue', `La tarea "${task.title}" está vencida`, task.id)
          }
        })
      }).catch(() => {})
    }, 3000)
    return () => clearInterval(interval)
  }, [user])

  const addTask = useCallback(async (taskData) => {
    if (addingRef.current) return null
    addingRef.current = true
    const payload = {
      groupId: null,
      tagIds: [],
      subtasks: [],
      comments: [],
      ...taskData,
      createdAt: today(),
      updatedAt: today(),
    }
    try {
      const newTask = await api.createTask(payload)
      setTasks(prev => { addingRef.current = false; return [newTask, ...prev] })
      if (newTask.assignedTo && newTask.assignedTo !== user?.id) {
        push(newTask.assignedTo, 'task_assigned',
          `${user?.name ?? 'Alguien'} te asignó la tarea "${newTask.title}"`, newTask.id)
      }
      return newTask
    } catch (e) {
      addingRef.current = false
      throw e
    }
  }, [user])

  const updateTask = useCallback((id, updates) => {
    const current = tasksRef.current.find(t => t.id === id)
    if (!current) return

    if (updates.assignedTo && updates.assignedTo !== current.assignedTo && updates.assignedTo !== user?.id) {
      push(updates.assignedTo, 'task_assigned',
        `${user?.name ?? 'Alguien'} te asignó la tarea "${current.title}"`, id)
    }

    if (updates.status === 'completed' && current.status !== 'completed') {
      const cuando = format(new Date(), "dd/MM/yyyy 'a las' HH:mm", { locale: es })
      notifyLeaders(members, 'task_completed',
        `${user?.name ?? 'Alguien'} completó "${current.title}" — ${cuando}`, id, user?.id)
      if (current.assignedTo && current.assignedTo !== user?.id) {
        push(current.assignedTo, 'task_completed',
          `"${current.title}" fue marcada como completada el ${cuando}`, id)
      }
    }

    if (updates.status === 'in_progress' && current.status !== 'in_progress') {
      notifyLeaders(members, 'task_in_progress',
        `"${current.title}" está ahora en progreso`, id, user?.id)
    }

    const updated = { ...current, ...updates, updatedAt: today() }
    setTasks(prev => prev.map(t => t.id === id ? updated : t))
    api.updateTask(id, updated).catch(() => {})
  }, [user, members])

  const deleteTask = useCallback((id) => {
    setTasks(prev => prev.filter(t => t.id !== id))
    api.deleteTask(id).catch(() => {})
  }, [])

  const getTaskById = useCallback((id) => tasksRef.current.find(t => t.id === id), [])
  const getTasksByMember = useCallback((memberId) => tasksRef.current.filter(t => t.assignedTo === memberId), [])
  const getTasksByGroup = useCallback((groupId) => tasksRef.current.filter(t => t.groupId === groupId), [])

  const addSubtask = useCallback((taskId, title) => {
    const task = tasksRef.current.find(t => t.id === taskId)
    if (!task) return null
    const subtask = { id: generateId('subtask'), title, completed: false, createdAt: today() }
    const updated = { ...task, subtasks: [...(task.subtasks || []), subtask], updatedAt: today() }
    setTasks(prev => prev.map(t => t.id === taskId ? updated : t))
    api.updateTask(taskId, updated).catch(() => {})
    return subtask
  }, [])

  const toggleSubtask = useCallback((taskId, subtaskId) => {
    const task = tasksRef.current.find(t => t.id === taskId)
    if (!task) return
    const subtask = (task.subtasks || []).find(s => s.id === subtaskId)
    const completing = subtask && !subtask.completed
    const updated = {
      ...task,
      subtasks: (task.subtasks || []).map(s => s.id === subtaskId ? { ...s, completed: !s.completed } : s),
      updatedAt: today(),
    }
    setTasks(prev => prev.map(t => t.id === taskId ? updated : t))
    api.updateTask(taskId, updated).catch(() => {})
    if (completing) {
      notifyLeaders(members, 'subtask_done',
        `Subtarea completada en "${task.title}": ${subtask.title}`, taskId, user?.id)
    }
  }, [members, user])

  const deleteSubtask = useCallback((taskId, subtaskId) => {
    const task = tasksRef.current.find(t => t.id === taskId)
    if (!task) return
    const updated = { ...task, subtasks: (task.subtasks || []).filter(s => s.id !== subtaskId), updatedAt: today() }
    setTasks(prev => prev.map(t => t.id === taskId ? updated : t))
    api.updateTask(taskId, updated).catch(() => {})
  }, [])

  const addComment = useCallback((taskId, authorId, text) => {
    const task = tasksRef.current.find(t => t.id === taskId)
    if (!task) return null
    const comment = {
      id: generateId('comment'),
      authorId,
      text,
      mentions: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    const updated = { ...task, comments: [...(task.comments || []), comment], updatedAt: today() }
    setTasks(prev => prev.map(t => t.id === taskId ? updated : t))
    api.updateTask(taskId, updated).catch(() => {})

    const extra = { commentId: comment.id }
    notifyLeaders(members, 'comment_added',
      `${user?.name ?? 'Alguien'} comentó en "${task.title}"`, taskId, authorId, extra)

    if (task.assignedTo && task.assignedTo !== authorId) {
      push(task.assignedTo, 'comment_added',
        `${user?.name ?? 'Alguien'} comentó en tu tarea "${task.title}"`, taskId, extra)
    }

    return comment
  }, [members, user])

  const updateComment = useCallback((taskId, commentId, text) => {
    const task = tasksRef.current.find(t => t.id === taskId)
    if (!task) return
    const updated = {
      ...task,
      comments: (task.comments || []).map(c =>
        c.id === commentId ? { ...c, text, updatedAt: new Date().toISOString() } : c
      ),
      updatedAt: today(),
    }
    setTasks(prev => prev.map(t => t.id === taskId ? updated : t))
    api.updateTask(taskId, updated).catch(() => {})
  }, [])

  const deleteComment = useCallback((taskId, commentId) => {
    const task = tasksRef.current.find(t => t.id === taskId)
    if (!task) return
    const updated = { ...task, comments: (task.comments || []).filter(c => c.id !== commentId), updatedAt: today() }
    setTasks(prev => prev.map(t => t.id === taskId ? updated : t))
    api.updateTask(taskId, updated).catch(() => {})
  }, [])

  return (
    <TaskContext.Provider value={{
      tasks,
      loading,
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
    }}>
      {children}
    </TaskContext.Provider>
  )
}

export function useTasks() {
  const ctx = useContext(TaskContext)
  if (!ctx) throw new Error('useTasks must be used inside TaskProvider')
  return ctx
}
