import { useState, useRef, useEffect } from 'react'
import { validators } from '../utils/validators'
import { today, generateId, getInitials, getAvatarColor, normalizeAssignedTo } from '../utils/helpers'
import { useTeam } from '../hooks/useTeam'
import { useGroups } from '../context/GroupContext'
import TagSelector from './Tags/TagSelector'
import FondoLinkSelector from './FondoLinkSelector'

const EMPTY_TASK = {
  title: '',
  description: '',
  status: 'pending',
  priority: 'medium',
  assignedTo: [],
  dueDate: '',
  dueTime: '',
  groupId: '',
  tagIds: [],
  subtasks: [],
  isRecurring: false,
  recurrence: null,
}

const labelCls = 'block text-xs font-semibold text-[#434655] dark:text-[#c4c8e8] mb-1.5'
const inputCls = 'w-full border border-[#c3c6d7] dark:border-[#2e3148] rounded-lg px-3 h-10 text-sm text-[#191c1e] dark:text-[#e4e6f0] bg-[#edeef0] dark:bg-[#252840] focus:outline-none focus:ring-2 focus:ring-[#004ac6] transition'
const inputErrCls = 'border-[#EF4444] focus:ring-[#EF4444]'

export default function TaskForm({ task, onSubmit, onCancel, forceRecurring = false }) {
  const { members } = useTeam()
  const { groups } = useGroups()
  const [form, setForm] = useState(task
    ? { ...task, dueTime: task.dueTime ?? '', assignedTo: normalizeAssignedTo(task.assignedTo), isRecurring: task.isRecurring ?? false, recurrence: task.recurrence ?? null }
    : { ...EMPTY_TASK, isRecurring: forceRecurring, recurrence: forceRecurring ? { type: 'monthly', approx_day: '' } : null }
  )
  const [errors, setErrors] = useState({})
  const [subtaskInput, setSubtaskInput] = useState('')
  const [assigneeOpen, setAssigneeOpen] = useState(false)
  const [assigneeSearch, setAssigneeSearch] = useState('')
  const assigneeRef = useRef(null)
  const [fondoLink, setFondoLink] = useState(null)

  useEffect(() => {
    if (!assigneeOpen) { setAssigneeSearch(''); return }
    const handler = (e) => {
      if (assigneeRef.current && !assigneeRef.current.contains(e.target)) setAssigneeOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [assigneeOpen])

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
    onSubmit(form, fondoLink)
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

      <div ref={assigneeRef} className="relative">
        <label className={labelCls}>Asignado a <span className="text-[#EF4444]">*</span></label>

        {/* Trigger */}
        <button
          type="button"
          onClick={() => setAssigneeOpen(v => !v)}
          className={`w-full min-h-[40px] px-3 py-1.5 rounded-lg border text-left flex items-center gap-2 flex-wrap bg-[#edeef0] dark:bg-[#252840] transition ${errors.assignedTo ? 'border-[#EF4444]' : 'border-[#c3c6d7] dark:border-[#2e3148]'} ${assigneeOpen ? 'ring-2 ring-[#004ac6]' : ''}`}
        >
          {(form.assignedTo || []).length === 0 ? (
            <span className="text-sm text-[#888]">Seleccionar personas...</span>
          ) : (
            <>
              {(form.assignedTo || []).map(id => {
                const m = members.find(x => x.id === id)
                if (!m) return null
                return (
                  <span key={id} className="flex items-center gap-1 bg-[#dbe1ff] dark:bg-[#1e2252] text-[#004ac6] dark:text-[#a5b4fc] text-xs font-semibold px-2 py-0.5 rounded-full">
                    <span className={`w-4 h-4 rounded-full flex items-center justify-center text-white text-[9px] font-bold ${getAvatarColor(m.name)}`}>
                      {getInitials(m.name)}
                    </span>
                    {m.name}
                    <span
                      role="button"
                      tabIndex={-1}
                      onMouseDown={e => {
                        e.stopPropagation()
                        handleChange('assignedTo', (form.assignedTo || []).filter(x => x !== id))
                      }}
                      className="ml-0.5 text-[#004ac6] hover:text-[#EF4444] cursor-pointer"
                    >×</span>
                  </span>
                )
              })}
            </>
          )}
          <span className="material-symbols-outlined text-sm text-[#434655] dark:text-[#c4c8e8] ml-auto flex-shrink-0">
            {assigneeOpen ? 'expand_less' : 'expand_more'}
          </span>
        </button>

        {/* Dropdown */}
        {assigneeOpen && (
          <div className="absolute z-20 mt-1 w-full bg-white dark:bg-[#1e2030] border border-[#c3c6d7] dark:border-[#2e3148] rounded-xl shadow-xl overflow-hidden">
            <div className="px-2 pt-2 pb-1">
              <div className="relative">
                <span className="material-symbols-outlined absolute left-2 top-1/2 -translate-y-1/2 text-[#434655] dark:text-[#c4c8e8] text-base pointer-events-none">search</span>
                <input
                  type="text"
                  value={assigneeSearch}
                  onChange={e => setAssigneeSearch(e.target.value)}
                  placeholder="Buscar persona..."
                  autoFocus
                  className="w-full h-8 pl-7 pr-2 rounded-lg border border-[#c3c6d7] dark:border-[#2e3148] bg-[#edeef0] dark:bg-[#252840] text-sm text-[#191c1e] dark:text-[#e4e6f0] focus:outline-none focus:ring-2 focus:ring-[#004ac6] transition"
                />
              </div>
            </div>
            <div className="max-h-48 overflow-y-auto">
              {members.filter(m => m.name.toLowerCase().includes(assigneeSearch.toLowerCase())).map((m) => {
                const selected = (form.assignedTo || []).includes(m.id)
                return (
                  <label
                    key={m.id}
                    className={`flex items-center gap-2.5 px-3 py-2.5 cursor-pointer transition select-none ${selected ? 'bg-[#dbe1ff] dark:bg-[#1e2252]' : 'hover:bg-[#edeef0] dark:hover:bg-[#252840]'}`}
                  >
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() => {
                        const current = form.assignedTo || []
                        handleChange('assignedTo', selected ? current.filter(id => id !== m.id) : [...current, m.id])
                      }}
                      className="accent-[#004ac6] w-3.5 h-3.5 flex-shrink-0"
                    />
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0 ${getAvatarColor(m.name)}`}>
                      {getInitials(m.name)}
                    </div>
                    <span className="text-sm text-[#191c1e] dark:text-[#e4e6f0] flex-1">{m.name}</span>
                    {selected && <span className="material-symbols-outlined text-sm text-[#004ac6]">check</span>}
                  </label>
                )
              })}
            </div>
            {(form.assignedTo || []).length > 0 && (
              <div className="px-3 py-2 border-t border-[#edeef0] dark:border-[#2e3148] flex justify-between items-center">
                <span className="text-xs text-[#434655] dark:text-[#c4c8e8]">{(form.assignedTo || []).length} seleccionado{(form.assignedTo || []).length !== 1 ? 's' : ''}</span>
                <button type="button" onClick={() => setAssigneeOpen(false)} className="text-xs font-semibold text-[#004ac6] hover:underline">Listo</button>
              </div>
            )}
          </div>
        )}

        {errors.assignedTo && <p className="text-[#EF4444] text-xs mt-1">{errors.assignedTo}</p>}
      </div>

      {form.isRecurring ? (
        <div>
          <label className={labelCls}>Vigencia del template <span className="text-[#888] font-normal">(opcional)</span></label>
          <div className="flex items-center gap-2">
            <div className="flex-1">
              <p className="text-[10px] text-[#888] mb-1">Fecha inicio</p>
              <input
                type="date"
                value={form.recurrence?.start_date ?? ''}
                onChange={(e) => setForm(prev => ({ ...prev, recurrence: { ...prev.recurrence, start_date: e.target.value || undefined } }))}
                className={inputCls}
              />
            </div>
            <span className="material-symbols-outlined text-[#888] mt-4 flex-shrink-0">arrow_forward</span>
            <div className="flex-1">
              <p className="text-[10px] text-[#888] mb-1">Fecha fin</p>
              <input
                type="date"
                value={form.recurrence?.end_date ?? ''}
                onChange={(e) => setForm(prev => ({ ...prev, recurrence: { ...prev.recurrence, end_date: e.target.value || undefined } }))}
                className={inputCls}
              />
            </div>
          </div>
          <p className="text-[10px] text-[#888] mt-1">Sin rango definido el template genera instancias indefinidamente</p>
        </div>
      ) : (
        <>
          <div>
            <label className={labelCls}>Fecha límite <span className="text-[#EF4444]">*</span></label>
            <input type="date" value={form.dueDate} onChange={(e) => handleChange('dueDate', e.target.value)} className={`${inputCls} ${errors.dueDate ? inputErrCls : ''}`} />
            {errors.dueDate && <p className="text-[#EF4444] text-xs mt-1">{errors.dueDate}</p>}
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
        </>
      )}

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

      {/* Vínculo Fondo Emprender */}
      <div>
        <label className={labelCls}>Para tener en cuenta (Fondo Emprender)</label>
        {task?.id
          ? <FondoLinkSelector taskId={task.id} />
          : <FondoLinkSelector onDraftChange={setFondoLink} />
        }
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
          {task ? 'Guardar cambios' : form.isRecurring ? 'Crear template' : 'Crear tarea'}
        </button>
      </div>
    </form>
  )
}
