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
    const errors = {}
    const titleError = validators.required(task.title) || validators.maxLength(255)(task.title)
    if (titleError) errors.title = titleError
    if (!task.priority) errors.priority = 'La prioridad es obligatoria'
    if (!task.status) errors.status = 'El estado es obligatorio'
    return errors
  },

  validateMember: (member) => {
    const errors = {}
    const nameError = validators.required(member.name) || validators.maxLength(100)(member.name)
    if (nameError) errors.name = nameError
    const emailError = validators.email(member.email)
    if (emailError) errors.email = emailError
    if (!member.role) errors.role = 'El rol es obligatorio'
    return errors
  },
}
