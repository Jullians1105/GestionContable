import { createContext, useState, useEffect, useCallback, useContext, useRef } from 'react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { api } from '../services/api'
import { storage } from '../utils/storage'
import { generateId, today, normalizeAssignedTo, isDueDateOverdue, computeAggregateStatus } from '../utils/helpers'
import { useAuth } from './AuthContext'
import { useTeam } from './TeamContext'
import { useSocket } from './SocketContext'

export const TaskContext = createContext(null)

function push(userId, type, message, taskId, extra = null) {
  storage.pushNotificationToUser(userId, {
    id: generateId('notif'),
    type, message, taskId,
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
  const { user, useRealBackend } = useAuth()
  const { members } = useTeam()
  const { socket, connected } = useSocket()
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const addingRef = useRef(false)
  const tasksRef = useRef(tasks)
  const sentOverdueRef = useRef(new Set())
  const pollingRef = useRef(null)

  useEffect(() => { tasksRef.current = tasks }, [tasks])

  // Carga inicial (solo cuando hay sesión activa)
  useEffect(() => {
    if (!user) { setLoading(false); return }
    if (!useRealBackend) {
      setTasks(storage.getTasks() ?? [])
      setLoading(false)
      return
    }
    api.getTasks()
      .then(data => {
        const tasks = Array.isArray(data) ? data : (data.tasks || [])
        setTasks(tasks)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [user?.id, useRealBackend]) // eslint-disable-line react-hooks/exhaustive-deps

  // Suscripción a eventos Socket.io (reemplaza polling cuando backend real está disponible)
  useEffect(() => {
    if (!socket) return

    const onTaskCreated = (task) => setTasks(prev => [task, ...prev.filter(t => t.id !== task.id)])
    const onTaskUpdated = (task) => setTasks(prev => prev.map(t => t.id === task.id ? { ...t, ...task } : t))
    const onTaskDeleted = ({ id }) => setTasks(prev => prev.filter(t => t.id !== id))

    socket.on('task:created', onTaskCreated)
    socket.on('task:updated', onTaskUpdated)
    socket.on('task:deleted', onTaskDeleted)

    return () => {
      socket.off('task:created', onTaskCreated)
      socket.off('task:updated', onTaskUpdated)
      socket.off('task:deleted', onTaskDeleted)
    }
  }, [socket])

  // Polling fallback (solo cuando no hay socket conectado)
  // En modo backend real: 15s (evita saturar el rate limiter de 200 req/15min)
  // En modo localStorage: 3s (sin restricciones de red)
  useEffect(() => {
    if (!user || connected) return

    const delay = useRealBackend ? 15000 : 3000
    const interval = setInterval(() => {
      api.getTasks().then(data => {
        const fresh = Array.isArray(data) ? data : (data.tasks || [])
        setTasks(prev => {
          if (fresh.length !== prev.length || fresh[0]?.updatedAt !== prev[0]?.updatedAt) return fresh
          return prev
        })
        fresh.forEach(task => {
          if (
            normalizeAssignedTo(task.assignedTo).includes(user.id) &&
            task.status !== 'completed' &&
            isDueDateOverdue(task.dueDate, task.dueTime ?? '') &&
            !sentOverdueRef.current.has(task.id)
          ) {
            sentOverdueRef.current.add(task.id)
            push(user.id, 'task_overdue', `La tarea "${task.title}" está vencida`, task.id)
          }
        })
      }).catch(() => {})
    }, delay)

    pollingRef.current = interval
    return () => clearInterval(interval)
  }, [user, connected, useRealBackend])

  const addTask = useCallback(async (taskData) => {
    if (addingRef.current) return null
    addingRef.current = true
    const payload = { groupId: null, tagIds: [], subtasks: [], comments: [], ...taskData, createdAt: today(), updatedAt: today() }
    try {
      let newTask = await api.createTask(payload)
      // Insertar subtareas una por una — el backend no las procesa en createTask
      for (const sub of (taskData.subtasks ?? [])) {
        if (sub.title?.trim()) newTask = await api.addSubtask(newTask.id, sub.title.trim())
      }
      // Actualización local siempre — no depender de que el socket entregue task:created de
      // vuelta al mismo cliente que creó la tarea (en producción, tras el Cloudflare Tunnel,
      // el evento puede no llegar por reconexiones/latencia, dejando la tarea invisible para
      // quien la creó hasta recargar). onTaskCreated dedupea por id, así que no hay riesgo de
      // duplicado si el socket también la entrega.
      setTasks(prev => [newTask, ...prev.filter(t => t.id !== newTask.id)])
      addingRef.current = false
      if (!useRealBackend) {
        normalizeAssignedTo(newTask.assignedTo)
          .filter(id => id !== user?.id)
          .forEach(id => push(id, 'task_assigned',
            `${user?.name ?? 'Alguien'} te asignó la tarea "${newTask.title}"`, newTask.id))
      }
      return newTask
    } catch (e) {
      addingRef.current = false
      throw e
    }
  }, [user, useRealBackend])

  const updateTask = useCallback((id, updates) => {
    const current = tasksRef.current.find(t => t.id === id)
    if (!current) return

    if (!useRealBackend) {
      if (updates.assignedTo !== undefined) {
        const prevIds = normalizeAssignedTo(current.assignedTo)
        const newIds = normalizeAssignedTo(updates.assignedTo)
        newIds
          .filter(uid => !prevIds.includes(uid) && uid !== user?.id)
          .forEach(uid => push(uid, 'task_assigned',
            `${user?.name ?? 'Alguien'} te asignó la tarea "${current.title}"`, id))
      }
      if (updates.status === 'completed' && current.status !== 'completed') {
        const cuando = format(new Date(), "dd/MM/yyyy 'a las' HH:mm", { locale: es })
        notifyLeaders(members, 'task_completed',
          `${user?.name ?? 'Alguien'} completó "${current.title}" — ${cuando}`, id, user?.id)
      }
      if (updates.status === 'in_progress' && current.status !== 'in_progress') {
        notifyLeaders(members, 'task_in_progress', `"${current.title}" está ahora en progreso`, id, user?.id)
      }
    }

    const updated = { ...current, ...updates, updatedAt: today() }
    // Actualización optimista local (socket revertirá si falla)
    setTasks(prev => prev.map(t => t.id === id ? updated : t))
    api.updateTask(id, updated).catch(() => {
      // Revertir en caso de error
      setTasks(prev => prev.map(t => t.id === id ? current : t))
    })
  }, [user, members, useRealBackend])

  const deleteTask = useCallback((id) => {
    setTasks(prev => prev.filter(t => t.id !== id))
    api.deleteTask(id).catch(() => {})
  }, [])

  // Pide eliminar una tarea sin permiso directo de borrado (member): queda pendiente
  // hasta que un admin o el líder del grupo de la tarea la apruebe o rechace.
  const requestDeleteTask = useCallback(async (id, reason) => {
    if (!user) return

    if (useRealBackend) {
      const res = await api.createDeleteRequest(id, reason)
      const pendingDeleteRequest = {
        id: res.id, reason: res.reason, requestedBy: user.id, requestedByName: user.name, createdAt: today(),
      }
      setTasks(prev => prev.map(t => t.id === id ? { ...t, pendingDeleteRequest } : t))
      return
    }

    const task = tasksRef.current.find(t => t.id === id)
    if (!task) return
    if (task.pendingDeleteRequest) throw new Error('Ya hay una solicitud de eliminación pendiente para esta tarea')
    const pendingDeleteRequest = {
      id: generateId('delreq'), reason, requestedBy: user.id, requestedByName: user.name, createdAt: today(),
    }
    setTasks(prev => prev.map(t => t.id === id ? { ...t, pendingDeleteRequest } : t))
    notifyLeaders(members, 'delete_request',
      `${user.name} solicitó eliminar la tarea "${task.title}"`, id, user.id, { requestId: pendingDeleteRequest.id, reason })
  }, [user, members, useRealBackend])

  // Resuelve (aprueba/rechaza) una solicitud de eliminación pendiente. En aprobación,
  // borra la tarea; en rechazo, solo limpia el flag pendiente.
  const resolveDeleteRequest = useCallback(async (id, requestId, action) => {
    // En modo backend real, la llamada a la API es la fuente de verdad — no depende de
    // que la tarea siga en el estado local (p.ej. una notificación vieja que apunta a una
    // solicitud ya resuelta debe fallar con el error del servidor, no devolver éxito falso).
    if (useRealBackend) {
      await api.respondDeleteRequest(id, requestId, action)
      if (action === 'approve') {
        setTasks(prev => prev.filter(t => t.id !== id))
      } else {
        setTasks(prev => prev.map(t => t.id === id ? { ...t, pendingDeleteRequest: null } : t))
      }
      return
    }

    const task = tasksRef.current.find(t => t.id === id)
    if (!task) return
    const requesterId = task.pendingDeleteRequest?.requestedBy
    if (action === 'approve') {
      setTasks(prev => prev.filter(t => t.id !== id))
      api.deleteTask(id).catch(() => {})
      if (requesterId) push(requesterId, 'delete_request_approved', `${user?.name ?? 'Alguien'} aprobó tu solicitud para eliminar "${task.title}"`, null)
    } else {
      setTasks(prev => prev.map(t => t.id === id ? { ...t, pendingDeleteRequest: null } : t))
      if (requesterId) push(requesterId, 'delete_request_rejected', `${user?.name ?? 'Alguien'} rechazó tu solicitud para eliminar "${task.title}"`, id)
    }
  }, [user, useRealBackend])

  // Marca el estado individual del usuario actual como asignado de la tarea.
  // El status agregado de la tarea (usado por el badge/Kanban) se recalcula server-side
  // en modo backend real; en modo localStorage se recalcula acá con el mismo criterio.
  const updateMyAssigneeStatus = useCallback((taskId, status) => {
    const task = tasksRef.current.find(t => t.id === taskId)
    if (!task || !user) return

    if (useRealBackend) {
      api.updateMyAssigneeStatus(taskId, status)
        .then(fullTask => setTasks(prev => prev.map(t => t.id === taskId ? fullTask : t)))
        .catch(() => {})
      return
    }

    const baseAssignees = (task.assignees && task.assignees.length > 0)
      ? task.assignees
      : normalizeAssignedTo(task.assignedTo).map(uid => ({ userId: uid, status: task.status, completedAt: null }))
    const nextAssignees = baseAssignees.map(a =>
      a.userId === user.id ? { ...a, status, completedAt: status === 'completed' ? new Date().toISOString() : null } : a
    )
    const aggregateStatus = computeAggregateStatus(nextAssignees) ?? task.status
    const updated = { ...task, assignees: nextAssignees, status: aggregateStatus, updatedAt: today() }
    setTasks(prev => prev.map(t => t.id === taskId ? updated : t))
    if (aggregateStatus === 'completed' && task.status !== 'completed') {
      notifyLeaders(members, 'task_completed',
        `${user?.name ?? 'Alguien'} completó su parte de "${task.title}" y la tarea quedó completa`, taskId, user?.id)
    }
    api.updateTask(taskId, updated).catch(() => {})
  }, [user, members, useRealBackend])

  const getTaskById = useCallback((id) => tasksRef.current.find(t => t.id === id), [])
  const getTasksByMember = useCallback((memberId) => tasksRef.current.filter(t => normalizeAssignedTo(t.assignedTo).includes(memberId)), [])
  const getTasksByGroup = useCallback((groupId) => tasksRef.current.filter(t => t.groupId === groupId), [])

  const addSubtask = useCallback((taskId, title) => {
    const task = tasksRef.current.find(t => t.id === taskId)
    if (!task) return null
    if (useRealBackend) {
      api.addSubtask(taskId, title)
        .then(fullTask => setTasks(prev => prev.map(t => t.id === taskId ? fullTask : t)))
        .catch(() => {})
      return null
    }
    const subtask = { id: generateId('subtask'), title, completed: false, createdAt: today() }
    const updated = { ...task, subtasks: [...(task.subtasks || []), subtask], updatedAt: today() }
    setTasks(prev => prev.map(t => t.id === taskId ? updated : t))
    api.updateTask(taskId, updated).catch(() => {})
    return subtask
  }, [useRealBackend])

  const toggleSubtask = useCallback((taskId, subtaskId) => {
    const task = tasksRef.current.find(t => t.id === taskId)
    if (!task) return
    const subtask = (task.subtasks || []).find(s => s.id === subtaskId)
    if (!subtask) return

    const nextCompleted = !subtask.completed
    const optimistic = {
      ...task,
      subtasks: (task.subtasks || []).map(s => s.id === subtaskId ? {
        ...s,
        completed: nextCompleted,
        completedBy: nextCompleted ? (user?.id ?? null) : null,
        completedByName: nextCompleted ? (user?.name ?? null) : null,
        completedAt: nextCompleted ? today() : null,
      } : s),
      updatedAt: today(),
    }
    setTasks(prev => prev.map(t => t.id === taskId ? optimistic : t))

    if (useRealBackend) {
      api.updateSubtask(taskId, subtaskId, { completed: nextCompleted })
        .then(fullTask => setTasks(prev => prev.map(t => t.id === taskId ? fullTask : t)))
        .catch(() => setTasks(prev => prev.map(t => t.id === taskId ? task : t)))
      return
    }

    api.updateTask(taskId, optimistic).catch(() => {})
    if (nextCompleted) {
      notifyLeaders(members, 'subtask_done',
        `Subtarea completada en "${task.title}": ${subtask.title}`, taskId, user?.id)
    }
  }, [useRealBackend, members, user])

  const deleteSubtask = useCallback((taskId, subtaskId) => {
    const task = tasksRef.current.find(t => t.id === taskId)
    if (!task) return
    const optimistic = { ...task, subtasks: (task.subtasks || []).filter(s => s.id !== subtaskId), updatedAt: today() }
    setTasks(prev => prev.map(t => t.id === taskId ? optimistic : t))
    if (useRealBackend) {
      api.deleteSubtask(taskId, subtaskId)
        .then(fullTask => setTasks(prev => prev.map(t => t.id === taskId ? fullTask : t)))
        .catch(() => setTasks(prev => prev.map(t => t.id === taskId ? task : t)))
      return
    }
    api.updateTask(taskId, optimistic).catch(() => {})
  }, [useRealBackend])

  const addComment = useCallback((taskId, authorId, text) => {
    const task = tasksRef.current.find(t => t.id === taskId)
    if (!task) return null
    if (useRealBackend) {
      api.addComment(taskId, text)
        .then(fullTask => setTasks(prev => prev.map(t => t.id === taskId ? fullTask : t)))
        .catch(() => {})
      return null
    }
    const comment = {
      id: generateId('comment'), authorId, text,
      mentions: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    const updated = { ...task, comments: [...(task.comments || []), comment], updatedAt: today() }
    setTasks(prev => prev.map(t => t.id === taskId ? updated : t))
    api.updateTask(taskId, updated).catch(() => {})
    const snippet = text.length > 80 ? text.slice(0, 77) + '…' : text
    const message = `${user?.name ?? 'Alguien'} comentó en "${task.title}": "${snippet}"`
    const extra = { commentId: comment.id }
    notifyLeaders(members, 'comment_added', message, taskId, authorId, extra)
    normalizeAssignedTo(task.assignedTo)
      .filter(id => id !== authorId)
      .forEach(id => push(id, 'comment_added', message, taskId, extra))
    return comment
  }, [useRealBackend, members, user])

  const updateComment = useCallback((taskId, commentId, text) => {
    const task = tasksRef.current.find(t => t.id === taskId)
    if (!task) return
    if (useRealBackend) {
      api.updateComment(taskId, commentId, text)
        .then(fullTask => setTasks(prev => prev.map(t => t.id === taskId ? fullTask : t)))
        .catch(() => {})
      return
    }
    const updated = {
      ...task,
      comments: (task.comments || []).map(c =>
        c.id === commentId ? { ...c, text, updatedAt: new Date().toISOString() } : c
      ),
      updatedAt: today(),
    }
    setTasks(prev => prev.map(t => t.id === taskId ? updated : t))
    api.updateTask(taskId, updated).catch(() => {})
  }, [useRealBackend])

  const deleteComment = useCallback((taskId, commentId) => {
    const task = tasksRef.current.find(t => t.id === taskId)
    if (!task) return
    const optimistic = { ...task, comments: (task.comments || []).filter(c => c.id !== commentId), updatedAt: today() }
    setTasks(prev => prev.map(t => t.id === taskId ? optimistic : t))
    if (useRealBackend) {
      api.deleteComment(taskId, commentId)
        .then(fullTask => setTasks(prev => prev.map(t => t.id === taskId ? fullTask : t)))
        .catch(() => setTasks(prev => prev.map(t => t.id === taskId ? task : t)))
      return
    }
    api.updateTask(taskId, optimistic).catch(() => {})
  }, [useRealBackend])

  return (
    <TaskContext.Provider value={{
      tasks, loading,
      addTask, updateTask, deleteTask, updateMyAssigneeStatus,
      requestDeleteTask, resolveDeleteRequest,
      getTaskById, getTasksByMember, getTasksByGroup,
      addSubtask, toggleSubtask, deleteSubtask,
      addComment, updateComment, deleteComment,
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
