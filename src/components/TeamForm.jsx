import { useState } from "react"
import { validators } from "../utils/validators"

const labelCls = "block text-[12px] font-semibold text-[#434655] dark:text-[#c4c8e8] mb-1"
const inputCls = "w-full border border-[#c3c6d7] dark:border-[#2e3148] rounded-lg px-3 h-10 text-[14px] text-[#191c1e] dark:text-[#e4e6f0] bg-white dark:bg-[#252840] focus:outline-none focus:ring-2 focus:ring-[#004ac6] hover:bg-[#f3f4f6] dark:hover:bg-[#2e3148] transition-colors"
const inputErrCls = "border-[#EF4444] focus:ring-[#EF4444] focus:border-[#EF4444]"

const ROLE_HINTS = {
  admin: "Administrador - Acceso completo",
  leader: "Lider - Gestiona y asigna tareas",
  member: "Miembro - Crea y actualiza tareas",
  viewer: "Viewer - Solo lectura",
}

const ROLE_HINT_COLORS = {
  admin: "bg-[#ffdad6] text-[#93000a]",
  leader: "bg-[#dbe1ff] text-[#003ea8]",
  member: "bg-green-100 text-green-800",
  viewer: "bg-[#edeef0] text-[#434655]",
}

export default function TeamForm({ member, onSubmit, onCancel }) {
  const [form, setForm] = useState(member ?? { name: "", email: "", role: "member" })
  const [errors, setErrors] = useState({})

  const handleChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }))
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: null }))
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    const validationErrors = validators.validateMember(form, !member)
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors)
      return
    }
    onSubmit(form)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className={labelCls}>Nombre <span className="text-[#EF4444]">*</span></label>
        <input
          type="text"
          value={form.name}
          onChange={(e) => handleChange("name", e.target.value)}
          placeholder="Nombre completo"
          className={`${inputCls} ${errors.name ? inputErrCls : ""}`}
        />
        {errors.name && <p className="text-[#EF4444] text-[12px] mt-1">{errors.name}</p>}
      </div>

      {!member && (
        <>
          <div>
            <label className={labelCls}>Email <span className="text-[#EF4444]">*</span></label>
            <input
              type="email"
              value={form.email ?? ""}
              onChange={(e) => handleChange("email", e.target.value)}
              placeholder="correo@empresa.com"
              className={`${inputCls} ${errors.email ? inputErrCls : ""}`}
            />
            {errors.email && <p className="text-[#EF4444] text-[12px] mt-1">{errors.email}</p>}
          </div>
          <div>
            <label className={labelCls}>Contraseña <span className="text-[#EF4444]">*</span></label>
            <input
              type="password"
              value={form.password ?? ""}
              onChange={(e) => handleChange("password", e.target.value)}
              placeholder="Mínimo 8 caracteres"
              className={`${inputCls} ${errors.password ? inputErrCls : ""}`}
            />
            {errors.password && <p className="text-[#EF4444] text-[12px] mt-1">{errors.password}</p>}
          </div>
        </>
      )}

      <div>
        <label className={labelCls}>Rol <span className="text-[#EF4444]">*</span></label>
        <select
          value={form.role}
          onChange={(e) => handleChange("role", e.target.value)}
          className={`${inputCls} ${errors.role ? inputErrCls : ""}`}
        >
          <option value="">Seleccionar rol...</option>
          <option value="admin">Administrador</option>
          <option value="leader">Lider</option>
          <option value="member">Miembro</option>
          <option value="viewer">Viewer</option>
        </select>
        {errors.role && <p className="text-[#EF4444] text-[12px] mt-1">{errors.role}</p>}
        {form.role && (
          <span className={`inline-block mt-2 text-[11px] font-semibold px-2.5 py-1 rounded-full ${ROLE_HINT_COLORS[form.role]}`}>
            {ROLE_HINTS[form.role]}
          </span>
        )}
      </div>

      <div className="flex justify-end gap-3 pt-2">
        <button type="button" onClick={onCancel} className="btn-secondary">
          Cancelar
        </button>
        <button type="submit" className="btn-primary">
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>save</span>
          {member ? "Guardar cambios" : "Agregar miembro"}
        </button>
      </div>
    </form>
  )
}
