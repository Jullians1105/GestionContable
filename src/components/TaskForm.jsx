import { useState } from 'react'
import { validators } from '../utils/validators'
import { today } from '../utils/helpers'
import { useTeam } from '../hooks/useTeam'

const EMPTY_TASK = {
  title: '',
  description: '',
  status: 'pending',
  priority: 'medium',
  assignedTo: '',
  dueDate: '',
}

export default function TaskForm({ task, onSubmit, onCancel }) {
  const { members } = useTeam()
  const [form, setForm] = useState(task ?? EMPTY_TASK)
  const [errors, setErrors] = useState({})

  const handleChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }))
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: null }))
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    const validationErrors = validators.validateTask(form)
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors)
      return
    }
    onSubmit(form)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Título */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Título <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={form.title}
          onChange={(e) => handleChange('title', e.target.value)}
          placeholder="Nombre de la tarea"
          className={`input-field ${errors.title ? 'input-error' : ''}`}
        />
        {errors.title && <p className="text-red-500 text-xs mt-1">{errors.title}</p>}
      </div>

      {/* Descripción */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Descripción</label>
        <textarea
          value={form.description}
          onChange={(e) => handleChange('description', e.target.value)}
          placeholder="Descripción detallada de la tarea..."
          rows={3}
          className="input-field resize-none"
        />
      </div>

      {/* Prioridad + Estado */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Prioridad <span className="text-red-500">*</span>
          </label>
          <select
            value={form.priority}
            onChange={(e) => handleChange('priority', e.target.value)}
            className={`input-field ${errors.priority ? 'input-error' : ''}`}
          >
            <option value="">Seleccionar...</option>
            <option value="high">Alta</option>
            <option value="medium">Media</option>
            <option value="low">Baja</option>
          </select>
          {errors.priority && <p className="text-red-500 text-xs mt-1">{errors.priority}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Estado <span className="text-red-500">*</span>
          </label>
          <select
            value={form.status}
            onChange={(e) => handleChange('status', e.target.value)}
            className={`input-field ${errors.status ? 'input-error' : ''}`}
          >
            <option value="pending">Pendiente</option>
            <option value="in_progress">En Progreso</option>
            <option value="completed">Completada</option>
          </select>
          {errors.status && <p className="text-red-500 text-xs mt-1">{errors.status}</p>}
        </div>
      </div>

      {/* Asignado + Fecha */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Asignado a</label>
          <select
            value={form.assignedTo}
            onChange={(e) => handleChange('assignedTo', e.target.value)}
            className="input-field"
          >
            <option value="">Sin asignar</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Fecha límite</label>
          <input
            type="date"
            value={form.dueDate}
            min={today()}
            onChange={(e) => handleChange('dueDate', e.target.value)}
            className="input-field"
          />
        </div>
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-3 pt-2">
        <button type="button" onClick={onCancel} className="btn-secondary">
          Cancelar
        </button>
        <button type="submit" className="btn-primary">
          {task ? 'Guardar cambios' : 'Crear tarea'}
        </button>
      </div>
    </form>
  )
}
