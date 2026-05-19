import { useState } from "react"
import { validators } from "../utils/validators"
import { today } from "../utils/helpers"
import { useTeam } from "../hooks/useTeam"

const EMPTY_TASK = {
  title: "",
  description: "",
  status: "pending",
  priority: "medium",
  assignedTo: "",
  dueDate: "",
}

const labelCls = "block text-[12px] font-semibold text-[#434655] mb-1"
const inputCls = "w-full border border-[#c3c6d7] rounded-lg px-3 h-10 text-[14px] text-[#191c1e] bg-white focus:outline-none focus:ring-2 focus:ring-[#004ac6] focus:border-[#004ac6] hover:bg-[#f3f4f6] transition-colors"
const inputErrCls = "border-[#EF4444] focus:ring-[#EF4444] focus:border-[#EF4444]"

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
      {/* Titulo */}
      <div>
        <label className={labelCls}>Titulo <span className="text-[#EF4444]">*</span></label>
        <input
          type="text"
          value={form.title}
          onChange={(e) => handleChange("title", e.target.value)}
          placeholder="Nombre de la tarea"
          className={`${inputCls} ${errors.title ? inputErrCls : ""}`}
        />
        {errors.title && <p className="text-[#EF4444] text-[12px] mt-1">{errors.title}</p>}
      </div>

      {/* Descripcion */}
      <div>
        <label className={labelCls}>Descripcion</label>
        <textarea
          value={form.description}
          onChange={(e) => handleChange("description", e.target.value)}
          placeholder="Descripcion detallada de la tarea..."
          rows={3}
          className="w-full border border-[#c3c6d7] rounded-lg px-3 py-2 text-[14px] text-[#191c1e] bg-white focus:outline-none focus:ring-2 focus:ring-[#004ac6] focus:border-[#004ac6] hover:bg-[#f3f4f6] transition-colors resize-none"
        />
      </div>

      {/* Prioridad + Estado */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>Prioridad <span className="text-[#EF4444]">*</span></label>
          <select
            value={form.priority}
            onChange={(e) => handleChange("priority", e.target.value)}
            className={`${inputCls} ${errors.priority ? inputErrCls : ""}`}
          >
            <option value="">Seleccionar...</option>
            <option value="high">Alta</option>
            <option value="medium">Media</option>
            <option value="low">Baja</option>
          </select>
          {errors.priority && <p className="text-[#EF4444] text-[12px] mt-1">{errors.priority}</p>}
        </div>
        <div>
          <label className={labelCls}>Estado <span className="text-[#EF4444]">*</span></label>
          <select
            value={form.status}
            onChange={(e) => handleChange("status", e.target.value)}
            className={`${inputCls} ${errors.status ? inputErrCls : ""}`}
          >
            <option value="pending">Pendiente</option>
            <option value="in_progress">En Progreso</option>
            <option value="completed">Completada</option>
          </select>
          {errors.status && <p className="text-[#EF4444] text-[12px] mt-1">{errors.status}</p>}
        </div>
      </div>

      {/* Asignado + Fecha */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>Asignado a</label>
          <select
            value={form.assignedTo}
            onChange={(e) => handleChange("assignedTo", e.target.value)}
            className={inputCls}
          >
            <option value="">Sin asignar</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls}>Fecha limite</label>
          <input
            type="date"
            value={form.dueDate}
            min={today()}
            onChange={(e) => handleChange("dueDate", e.target.value)}
            className={inputCls}
          />
        </div>
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-3 pt-2">
        <button type="button" onClick={onCancel} className="btn-secondary">
          Cancelar
        </button>
        <button type="submit" className="btn-primary">
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>save</span>
          {task ? "Guardar cambios" : "Crear tarea"}
        </button>
      </div>
    </form>
  )
}
