// Misma política que el backend (middleware/security.js passwordRules)
export const validarPassword = (p) => {
  if (!p || p.length < 8) return 'La contraseña debe tener al menos 8 caracteres'
  if (!/[A-Z]/.test(p)) return 'La contraseña debe tener al menos una mayúscula'
  if (!/[0-9]/.test(p)) return 'La contraseña debe tener al menos un número'
  return null
}

export const validators = {
  required: (value) => {
    if (!value || (typeof value === 'string' && value.trim() === '')) {
      return 'Este campo es obligatorio'
    }
    return null
  },

  maxLength: (max) => (value) => {
    if (value && value.length > max) {
      return `Máximo ${max} caracteres`
    }
    return null
  },

  email: (value) => {
    if (!value) return 'El email es obligatorio'
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(value)) {
      return 'Email inválido'
    }
    return null
  },

  validateTask: (task) => {
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    const errors = {}
    const titleError = validators.required(task.title) || validators.maxLength(255)(task.title)
    if (titleError) errors.title = titleError
    if (!task.priority) errors.priority = 'La prioridad es obligatoria'
    if (!task.status) errors.status = 'El estado es obligatorio'
    const assignedArr = Array.isArray(task.assignedTo) ? task.assignedTo : (task.assignedTo ? [task.assignedTo] : [])
    if (assignedArr.length === 0) errors.assignedTo = 'Debes asignar la tarea a alguien'
    else if (!assignedArr.every(id => UUID_RE.test(id))) errors.assignedTo = 'Selecciona miembros válidos del equipo'
    if (!task.isRecurring && !task.dueDate) errors.dueDate = 'La fecha límite es obligatoria'
    return errors
  },

  validateMember: (member, isNew = false) => {
    const errors = {}
    const nameError = validators.required(member.name) || validators.maxLength(100)(member.name)
    if (nameError) errors.name = nameError
    if (isNew || member.email) {
      const emailError = validators.email(member.email)
      if (emailError) errors.email = emailError
    }
    if (isNew) {
      const passError = validarPassword(member.password)
      if (passError) errors.password = passError
    }
    if (!member.role) errors.role = 'El rol es obligatorio'
    return errors
  },
}
