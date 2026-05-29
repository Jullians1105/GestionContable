import { useState } from 'react'
import { useTasks } from '../../context/TaskContext'
import { useToast } from '../../context/ToastContext'

export default function SubtaskList({ task }) {
  const { addSubtask, toggleSubtask, deleteSubtask } = useTasks()
  const { addToast } = useToast()
  const [newTitle, setNewTitle] = useState('')

  const subtasks = task.subtasks || []
  const completed = subtasks.filter((s) => s.completed).length
  const total = subtasks.length
  const pct = total ? Math.round((completed / total) * 100) : 0

  const handleAdd = (e) => {
    e.preventDefault()
    if (!newTitle.trim()) return
    addSubtask(task.id, newTitle.trim())
    addToast('Subtarea agregada', 'success')
    setNewTitle('')
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-[#191c1e] dark:text-[#e4e6f0] flex items-center gap-1.5">
          <span className="material-symbols-outlined text-base text-[#004ac6]">checklist</span>
          Subtareas
          {total > 0 && <span className="text-xs text-[#434655] font-normal">({completed}/{total})</span>}
        </h3>
      </div>

      {total > 0 && (
        <div className="mb-3">
          <div className="h-1.5 bg-[#edeef0] dark:bg-[#252840] rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{ width: `${pct}%`, background: '#004ac6' }}
            />
          </div>
          <p className="text-xs text-[#434655] mt-0.5">{pct}% completado</p>
        </div>
      )}

      <div className="space-y-1 mb-3">
        {subtasks.map((s) => (
          <div key={s.id} className="flex items-center gap-2 group px-2 py-1 rounded-lg hover:bg-[#edeef0] dark:hover:bg-[#252840] transition">
            <input
              type="checkbox"
              checked={s.completed}
              onChange={() => toggleSubtask(task.id, s.id)}
              className="accent-[#004ac6] cursor-pointer"
            />
            <span className={`text-sm flex-1 ${s.completed ? 'line-through text-[#888]' : 'text-[#191c1e] dark:text-[#e4e6f0]'}`}>
              {s.title}
            </span>
            <button
              onClick={() => deleteSubtask(task.id, s.id)}
              className="opacity-0 group-hover:opacity-100 text-[#EF4444] hover:text-[#c53030] transition"
            >
              <span className="material-symbols-outlined text-base">close</span>
            </button>
          </div>
        ))}
      </div>

      <form onSubmit={handleAdd} className="flex gap-2">
        <input
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          placeholder="Agregar subtarea..."
          className="flex-1 h-9 px-3 rounded-lg border border-[#c3c6d7] dark:border-[#2e3148] bg-[#edeef0] dark:bg-[#252840] text-sm text-[#191c1e] dark:text-[#e4e6f0] focus:outline-none focus:ring-2 focus:ring-[#004ac6] transition"
        />
        <button
          type="submit"
          disabled={!newTitle.trim()}
          className="h-9 px-3 rounded-lg text-sm font-semibold text-white disabled:opacity-40 transition hover:opacity-90"
          style={{ background: '#004ac6' }}
        >
          <span className="material-symbols-outlined text-base">add</span>
        </button>
      </form>
    </div>
  )
}
