import { createContext, useState, useEffect, useCallback } from 'react'
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
      prev.map((t) =>
        t.id === id ? { ...t, ...updates, updatedAt: today() } : t
      )
    )
  }, [])

  const deleteTask = useCallback((id) => {
    setTasks((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const getTaskById = useCallback(
    (id) => tasks.find((t) => t.id === id),
    [tasks]
  )

  const getTasksByMember = useCallback(
    (memberId) => tasks.filter((t) => t.assignedTo === memberId),
    [tasks]
  )

  return (
    <TaskContext.Provider
      value={{ tasks, addTask, updateTask, deleteTask, getTaskById, getTasksByMember }}
    >
      {children}
    </TaskContext.Provider>
  )
}
