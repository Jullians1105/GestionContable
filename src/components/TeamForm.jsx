import { useState } from 'react'
import { validators } from '../utils/validators'

const EMPTY_MEMBER = {
  name: '',
  email: '',
  role: 'member',
}

const ROLE_COLORS = {
  admin: 'text-red-700 bg-red-50',
  leader: 'text-blue-700 bg-blue-50',
  member: 'text-green-700 bg-green-50',
  viewer: 'text-gray-700 bg-gray-100',
}

export default function TeamForm({ member, onSubmit, onCancel }) {
  const [form, setForm] = useState(member ?? EMPTY_MEMBER)
  const [errors, setErrors] = useState({})

  const handleChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }))
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: null }))
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    const validationErrors = validators.validateMember(form)
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors)
      return
    }
    onSubmit(form)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Nombre */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Nombre <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={form.name}
          onChange={(e) => handleChange('name', e.target.value)}
          placeholder="Nombre completo"
          className={`input-field ${errors.name ? 'input-error' : ''}`}
        />
        {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name}</p>}
      </div>

      {/* Email */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Email <span className="text-red-500">*</span>
        </label>
        <input
          type="email"
          value={form.email}
          onChange={(e) => handleChange('email', e.target.value)}
          placeholder="correo@empresa.com"
          className={`input-field ${errors.email ? 'input-error' : ''}`}
        />
        {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email}</p>}
      </div>

      {/* Rol */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Rol <span className="text-red-500">*</span>
        </label>
        <select
          value={form.role}
          onChange={(e) => handleChange('role', e.target.value)}
          className={`input-field ${errors.role ? 'input-error' : ''}`}
        >
          <option value="">Seleccionar rol...</option>
          <option value="admin">Administrador</option>
          <option value="leader">Líder</option>
          <option value="member">Miembro</option>
          <option value="viewer">Viewer</option>
        </select>
        {errors.role && <p className="text-red-500 text-xs mt-1">{errors.role}</p>}
        {form.role && (
          <span className={`inline-block mt-2 text-xs font-medium px-2.5 py-1 rounded-full ${ROLE_COLORS[form.role]}`}>
            {form.role === 'admin' && 'Administrador - Acceso completo'}
            {form.role === 'leader' && 'Líder - Gestiona y asigna tareas'}
            {form.role === 'member' && 'Miembro - Crea y actualiza tareas'}
            {form.role === 'viewer' && 'Viewer - Solo lectura'}
          </span>
        )}
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-3 pt-2">
        <button type="button" onClick={onCancel} className="btn-secondary">
          Cancelar
        </button>
        <button type="submit" className="btn-primary">
          {member ? 'Guardar cambios' : 'Agregar miembro'}
        </button>
      </div>
    </form>
  )
}
