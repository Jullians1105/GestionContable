import { useState } from 'react'
import { validators } from '../utils/validators'
import { today, generateId } from '../utils/helpers'
import { useTeam } from '../hooks/useTeam'
import { useGroups } from '../context/GroupContext'
import TagSelector from './Tags/TagSelector'

const EMPTY_TASK = {
  title: '',
  description: '',
  status: 'pending',
  priority: 'medium',
  assignedTo: '',
  dueDate: '',
  dueTime: '',
  groupId: '',
  tagIds: [],
  subtasks: [],
}

const labelCls = 'block text-xs font-semibold text-[#434655] dark:text-[#c4c8e8] mb-1.5'
const inputCls = 'w-full border border-[#c3c6d7] dark:border-[#2e3148] rounded-lg px-3 h-10 text-sm text-[#191c1e] dark:text-[#e4e6f0] bg-[#edeef0] dark:bg-[#252840] focus:outline-none focus:ring-2 focus:ring-[#004ac6] transition'
const inputErrCls = 'border-[#EF4444] focus:ring-[#EF4444]'

export default function TaskForm({ task, onSubmit, onCancel }) {
  const { members } = useTeam()
  const { groups } = useGroups()
  const [form, setForm] = useState(task ? { ...task, dueTime: task.dueTime ?? '' } : EMPTY_TASK)
  const [errors, setErrors] = useState({})
  const [subtaskInput, setSubtaskInput] = useState('')

  const handleChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }))
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: null }))
  }

  const handleAddSubtask = (e) => {
    e.preventDefault()
    const title = subtaskInput.trim()
    if (!title) return
    const newSub = { id: generateId('st'), title, completed: false, createdAt: today() }
    setForm((prev) => ({ ...prev, subtasks: [...(prev.subtasks || []), newSub] }))
    setSubtaskInput('')
  }

  const handleRemoveSubtask = (id) => {
    setForm((prev) => ({ ...prev, subtasks: prev.subtasks.filter((s) => s.id !== id) }))
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    const validationErrors = validators.validateTask(form)
    if (Object.keys(validationErrors).length > 0) { setErrors(validationErrors); return }
    onSubmit(form)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className={labelCls}>Título <span className="text-[#EF4444]">*</span></label>
        <input
          type="text"
          value={form.title}
          onChange={(e) => handleChange('title', e.target.value)}
          placeholder="Nombre de la tarea"
          className={`${inputCls} ${errors.title ? inputErrCls : ''}`}
        />
        {errors.title && <p className="text-[#EF4444] text-xs mt-1">{errors.title}</p>}
      </div>

      <div>
        <label className={labelCls}>Descripción</label>
        <textarea
          value={form.description}
          onChange={(e) => handleChange('description', e.target.value)}
          placeholder="Descripción detallada..."
          rows={3}
          className="w-full border border-[#c3c6d7] dark:border-[#2e3148] rounded-lg px-3 py-2 text-sm text-[#191c1e] dark:text-[#e4e6f0] bg-[#edeef0] dark:bg-[#252840] focus:outline-none focus:ring-2 focus:ring-[#004ac6] transition resize-none"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>Prioridad <span className="text-[#EF4444]">*</span></label>
          <select value={form.priority} onChange={(e) => handleChange('priority', e.target.value)} className={`${inputCls} ${errors.priority ? inputErrCls : ''}`}>
            <option value="">Seleccionar...</option>
            <option value="high">Alta</option>
            <option value="medium">Media</option>
            <option value="low">Baja</option>
          </select>
          {errors.priority && <p className="text-[#EF4444] text-xs mt-1">{errors.priority}</p>}
        </div>
        <div>
          <label className={labelCls}>Estado <span className="text-[#EF4444]">*</span></label>
          <select value={form.status} onChange={(e) => handleChange('status', e.target.value)} className={`${inputCls} ${errors.status ? inputErrCls : ''}`}>
            <option value="pending">Pendiente</option>
            <option value="in_progress">En Progreso</option>
            <option value="completed">Completada</option>
          </select>
          {errors.status && <p className="text-[#EF4444] text-xs mt-1">{errors.status}</p>}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>Asignado a <span className="text-[#EF4444]">*</span></label>
          <select value={form.assignedTo} onChange={(e) => handleChange('assignedTo', e.target.value)} className={`${inputCls} ${errors.assignedTo ? inputErrCls : ''}`}>
            <option value="">Seleccionar...</option>
            {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
          {errors.assignedTo && <p className="text-[#EF4444] text-xs mt-1">{errors.assignedTo}</p>}
        </div>
        <div>
          <label className={labelCls}>Fecha límite <span className="text-[#EF4444]">*</span></label>
          <input type="date" value={form.dueDate} onChange={(e) => handleChange('dueDate', e.target.value)} className={`${inputCls} ${errors.dueDate ? inputErrCls : ''}`} />
          {errors.dueDate && <p className="text-[#EF4444] text-xs mt-1">{errors.dueDate}</p>}
        </div>
      </div>

      <div className="flex flex-col items-center gap-1">
        <label className="text-[10px] text-[#888]">
          Hora límite <span className="italic text-[#EF4444]">(opcional de lo contario hasta las 7:00 p.m.)</span>
        </label>
        <input
          type="time"
          value={form.dueTime}
          onChange={(e) => handleChange('dueTime', e.target.value)}
          className="border border-[#c3c6d7] dark:border-[#2e3148] rounded-lg px-3 h-9 text-sm text-[#191c1e] dark:text-[#e4e6f0] bg-[#edeef0] dark:bg-[#252840] focus:outline-none focus:ring-2 focus:ring-[#004ac6] transition"
        />
      </div>

      <div>
        <label className={labelCls}>Grupo</label>
        <select value={form.groupId || ''} onChange={(e) => handleChange('groupId', e.target.value)} className={inputCls}>
          <option value="">Sin grupo</option>
          {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
        </select>
      </div>

      <div>
        <label className={labelCls}>Etiquetas</label>
        <TagSelector selectedIds={form.tagIds || []} onChange={(ids) => handleChange('tagIds', ids)} />
      </div>

      <div>
        <label className={labelCls}>Subtareas</label>
        {(form.subtasks || []).length > 0 && (
          <ul className="mb-2 space-y-1">
            {form.subtasks.map((s) => (
              <li key={s.id} className="flex items-center gap-2 px-2 py-1 rounded-lg bg-[#edeef0] dark:bg-[#252840] group">
                <span className="material-symbols-outlined text-sm text-[#004ac6]">radio_button_unchecked</span>
                <span className="flex-1 text-sm text-[#191c1e] dark:text-[#e4e6f0]">{s.title}</span>
                <button
                  type="button"
                  onClick={() => handleRemoveSubtask(s.id)}
                  className="opacity-0 group-hover:opacity-100 text-[#EF4444] transition"
                >
                  <span className="material-symbols-outlined text-sm">close</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex gap-2">
          <input
            value={subtaskInput}
            onChange={(e) => setSubtaskInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAddSubtask(e)}
            placeholder="Agregar subtarea..."
            className="flex-1 h-9 px-3 rounded-lg border border-[#c3c6d7] dark:border-[#2e3148] bg-[#edeef0] dark:bg-[#252840] text-sm text-[#191c1e] dark:text-[#e4e6f0] focus:outline-none focus:ring-2 focus:ring-[#004ac6] transition"
          />
          <button
            type="button"
            onClick={handleAddSubtask}
            disabled={!subtaskInput.trim()}
            className="h-9 px-3 rounded-lg text-sm font-semibold text-white disabled:opacity-40 transition hover:opacity-90"
            style={{ background: '#004ac6' }}
          >
            <span className="material-symbols-outlined text-base">add</span>
          </button>
        </div>
      </div>

      <div className="flex justify-end gap-3 pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="h-10 px-4 rounded-lg border border-[#c3c6d7] dark:border-[#2e3148] text-sm font-semibold text-[#434655] dark:text-[#c4c8e8] hover:bg-[#edeef0] dark:hover:bg-[#252840] transition"
        >
          Cancelar
        </button>
        <button
          type="submit"
          className="h-10 px-4 rounded-lg text-sm font-semibold text-white flex items-center gap-1.5 hover:opacity-90 transition"
          style={{ background: '#004ac6' }}
        >
          <span className="material-symbols-outlined text-base">save</span>
          {task ? 'Guardar cambios' : 'Crear tarea'}
        </button>
      </div>
    </form>
  )
}
