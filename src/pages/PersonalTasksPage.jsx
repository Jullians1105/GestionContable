import { useState, useEffect, useCallback } from 'react'
import { api } from '../services/api'
import { useToast } from '../context/ToastContext'

function PersonalTaskCard({ task, onToggleTask, onDeleteTask, onAddItem, onToggleItem, onDeleteItem }) {
  const [newItemTitle, setNewItemTitle] = useState('')
  const items = task.items || []
  const completedCount = items.filter(i => i.completed).length
  const pct = items.length ? Math.round((completedCount / items.length) * 100) : 0

  const handleAddItem = (e) => {
    e.preventDefault()
    if (!newItemTitle.trim()) return
    onAddItem(task.id, newItemTitle.trim())
    setNewItemTitle('')
  }

  return (
    <div className="bg-white dark:bg-[#1e2030] rounded-xl border border-[#c3c6d7] dark:border-[#2e3148] p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={task.completed}
          onChange={() => onToggleTask(task)}
          className="mt-0.5 accent-[#004ac6] cursor-pointer w-4 h-4 flex-shrink-0"
        />
        <span className={`flex-1 min-w-0 font-semibold text-sm ${task.completed ? 'line-through text-[#8890b5]' : 'text-[#191c1e] dark:text-[#e4e6f0]'}`}>
          {task.title}
        </span>
        <button
          onClick={() => onDeleteTask(task.id)}
          className="flex-shrink-0 text-[#c3c6d7] dark:text-[#3e4260] hover:text-[#EF4444] transition"
          title="Eliminar"
        >
          <span className="material-symbols-outlined text-lg">delete</span>
        </button>
      </div>

      {items.length > 0 && (
        <div className="mt-3 ml-7">
          <div className="h-1.5 bg-[#edeef0] dark:bg-[#252840] rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{ width: `${pct}%`, background: '#004ac6' }}
            />
          </div>
          <p className="text-xs text-[#434655] dark:text-[#c4c8e8] mt-0.5">{completedCount}/{items.length} completado</p>
        </div>
      )}

      <div className="mt-2 ml-7 space-y-1">
        {items.map(item => (
          <div key={item.id} className="flex items-center gap-2 group px-2 py-1 rounded-lg hover:bg-[#edeef0] dark:hover:bg-[#252840] transition">
            <input
              type="checkbox"
              checked={item.completed}
              onChange={() => onToggleItem(task.id, item)}
              className="accent-[#004ac6] cursor-pointer"
            />
            <span className={`flex-1 min-w-0 text-sm ${item.completed ? 'line-through text-[#888]' : 'text-[#191c1e] dark:text-[#e4e6f0]'}`}>
              {item.title}
            </span>
            <button
              onClick={() => onDeleteItem(task.id, item.id)}
              className="opacity-0 group-hover:opacity-100 text-[#EF4444] hover:text-[#c53030] transition flex-shrink-0"
            >
              <span className="material-symbols-outlined text-base">close</span>
            </button>
          </div>
        ))}

        <form onSubmit={handleAddItem} className="flex gap-2 pt-1">
          <input
            value={newItemTitle}
            onChange={(e) => setNewItemTitle(e.target.value)}
            placeholder="Agregar subtarea..."
            className="flex-1 h-8 px-3 rounded-lg border border-[#c3c6d7] dark:border-[#2e3148] bg-[#edeef0] dark:bg-[#252840] text-sm text-[#191c1e] dark:text-[#e4e6f0] focus:outline-none focus:ring-2 focus:ring-[#004ac6] transition"
          />
          <button
            type="submit"
            disabled={!newItemTitle.trim()}
            className="h-8 px-2.5 rounded-lg text-sm font-semibold text-white disabled:opacity-40 transition hover:opacity-90"
            style={{ background: '#004ac6' }}
          >
            <span className="material-symbols-outlined text-base block">add</span>
          </button>
        </form>
      </div>
    </div>
  )
}

export default function PersonalTasksPage() {
  const { addToast } = useToast()
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [newTitle, setNewTitle] = useState('')
  const [hideCompleted, setHideCompleted] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await api.getPersonalTasks()
      setTasks(Array.isArray(data) ? data : [])
    } catch {
      addToast('Error cargando tus pendientes', 'error')
    } finally {
      setLoading(false)
    }
  }, [addToast])

  useEffect(() => { load() }, [load])

  const handleAddTask = async (e) => {
    e.preventDefault()
    if (!newTitle.trim()) return
    try {
      const created = await api.createPersonalTask({ title: newTitle.trim() })
      setTasks(prev => [...prev, created])
      setNewTitle('')
    } catch {
      addToast('No se pudo crear la tarea', 'error')
    }
  }

  const handleToggleTask = async (task) => {
    const optimistic = { ...task, completed: !task.completed }
    setTasks(prev => prev.map(t => t.id === task.id ? optimistic : t))
    try {
      await api.updatePersonalTask(task.id, { completed: optimistic.completed })
    } catch {
      addToast('No se pudo actualizar', 'error')
      setTasks(prev => prev.map(t => t.id === task.id ? task : t))
    }
  }

  const handleDeleteTask = async (id) => {
    const prev = tasks
    setTasks(prev.filter(t => t.id !== id))
    try {
      await api.deletePersonalTask(id)
    } catch {
      addToast('No se pudo eliminar', 'error')
      setTasks(prev)
    }
  }

  const handleAddItem = async (taskId, title) => {
    try {
      const updated = await api.addPersonalTaskItem(taskId, title)
      setTasks(prev => prev.map(t => t.id === taskId ? updated : t))
    } catch {
      addToast('No se pudo agregar', 'error')
    }
  }

  const handleToggleItem = async (taskId, item) => {
    try {
      const updated = await api.updatePersonalTaskItem(taskId, item.id, { completed: !item.completed })
      setTasks(prev => prev.map(t => t.id === taskId ? updated : t))
    } catch {
      addToast('No se pudo actualizar', 'error')
    }
  }

  const handleDeleteItem = async (taskId, itemId) => {
    try {
      const updated = await api.deletePersonalTaskItem(taskId, itemId)
      setTasks(prev => prev.map(t => t.id === taskId ? updated : t))
    } catch {
      addToast('No se pudo eliminar', 'error')
    }
  }

  const visibleTasks = hideCompleted ? tasks.filter(t => !t.completed) : tasks

  return (
    <div className="max-w-2xl mx-auto flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-bold text-[#191c1e] dark:text-[#e4e6f0]">Mis Pendientes</h1>
        <p className="text-sm text-[#434655] dark:text-[#c4c8e8] mt-0.5">
          Un espacio personal para tus propias tareas — nadie más las ve.
        </p>
      </div>

      <form onSubmit={handleAddTask} className="flex gap-2">
        <input
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          placeholder="Agregar un pendiente..."
          className="flex-1 h-10 px-4 rounded-xl border border-[#c3c6d7] dark:border-[#2e3148] bg-white dark:bg-[#1e2030] text-sm text-[#191c1e] dark:text-[#e4e6f0] focus:outline-none focus:ring-2 focus:ring-[#004ac6] transition"
        />
        <button
          type="submit"
          disabled={!newTitle.trim()}
          className="h-10 px-4 rounded-xl text-sm font-semibold text-white disabled:opacity-40 transition hover:opacity-90 active:scale-[0.97] flex items-center gap-1.5"
          style={{ background: '#004ac6' }}
        >
          <span className="material-symbols-outlined text-lg">add</span>
          Agregar
        </button>
      </form>

      {tasks.length > 0 && (
        <label className="flex items-center gap-2 text-xs font-semibold text-[#434655] dark:text-[#c4c8e8] cursor-pointer select-none">
          <input
            type="checkbox"
            checked={hideCompleted}
            onChange={(e) => setHideCompleted(e.target.checked)}
            className="accent-[#004ac6]"
          />
          Ocultar completados
        </label>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16 text-[#8890b5] dark:text-[#5a5f7a]">
          <span className="material-symbols-outlined animate-spin">progress_activity</span>
        </div>
      ) : visibleTasks.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-16 text-[#8890b5] dark:text-[#5a5f7a]">
          <span className="material-symbols-outlined text-4xl">checklist</span>
          <p className="text-sm">
            {tasks.length === 0 ? 'Todavía no agregaste ningún pendiente.' : 'Nada pendiente por acá.'}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {visibleTasks.map(task => (
            <PersonalTaskCard
              key={task.id}
              task={task}
              onToggleTask={handleToggleTask}
              onDeleteTask={handleDeleteTask}
              onAddItem={handleAddItem}
              onToggleItem={handleToggleItem}
              onDeleteItem={handleDeleteItem}
            />
          ))}
        </div>
      )}
    </div>
  )
}
