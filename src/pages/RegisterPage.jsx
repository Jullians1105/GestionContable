import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import logo from '../assets/logo.jpeg'

export default function RegisterPage() {
  const { register } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({ name: '', email: '', password: '', confirm: '' })
  const [errors, setErrors] = useState({})
  const [loading, setLoading] = useState(false)
  const [showSuccess, setShowSuccess] = useState(false)

  const validate = () => {
    const e = {}
    if (!form.name.trim()) e.name = 'El nombre es requerido'
    if (!form.email.trim()) e.email = 'El email es requerido'
    else if (!/\S+@\S+\.\S+/.test(form.email)) e.email = 'Email inválido'
    if (!form.password) e.password = 'La contraseña es requerida'
    else if (form.password.length < 6) e.password = 'Mínimo 6 caracteres'
    if (form.password !== form.confirm) e.confirm = 'Las contraseñas no coinciden'
    return e
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const errs = validate()
    if (Object.keys(errs).length > 0) { setErrors(errs); return }
    setLoading(true)
    const result = await register(form.name.trim(), form.email.trim(), form.password)
    setLoading(false)
    if (result.success) {
      setShowSuccess(true)
    } else {
      setErrors({ email: result.error })
    }
  }

  const goToLogin = () => navigate('/login')

  const field = (name, label, type = 'text', placeholder = '') => (
    <div>
      <label className="block text-xs font-semibold text-[#434655] dark:text-[#c4c8e8] mb-1.5">{label}</label>
      <input
        type={type}
        value={form[name]}
        onChange={(e) => { setForm({ ...form, [name]: e.target.value }); setErrors({ ...errors, [name]: '' }) }}
        placeholder={placeholder}
        className={`w-full h-10 px-3 rounded-lg border bg-[#edeef0] dark:bg-[#252840] text-sm text-[#191c1e] dark:text-[#e4e6f0] placeholder-[#888] focus:outline-none focus:ring-2 focus:ring-[#004ac6] focus:border-transparent transition ${errors[name] ? 'border-[#EF4444]' : 'border-[#c3c6d7] dark:border-[#2e3148]'}`}
      />
      {errors[name] && <p className="text-xs text-[#EF4444] mt-1">{errors[name]}</p>}
    </div>
  )

  return (
    <div className="min-h-screen bg-[#f3f4f6] dark:bg-[#0f1117] flex items-center justify-center p-4">
      <div className="bg-white dark:bg-[#1e2030] rounded-2xl shadow-lg p-8 w-full max-w-md border border-[#c3c6d7] dark:border-[#2e3148]">
        <div className="flex items-center gap-3 mb-8">
          <img src={logo} alt="Gestor de Tareas" className="w-10 h-10 rounded-xl object-cover" />
          <h1 className="text-2xl font-bold text-[#191c1e] dark:text-[#e4e6f0]">Gestor de Tareas</h1>
        </div>

        <h2 className="text-xl font-bold text-[#191c1e] dark:text-[#e4e6f0] mb-1">Crear cuenta</h2>
        <p className="text-sm text-[#434655] dark:text-[#c4c8e8] mb-6">Únete a tu equipo de trabajo</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          {field('name', 'Nombre completo', 'text', 'María García')}
          {field('email', 'Email', 'email', 'tu@empresa.com')}
          {field('password', 'Contraseña', 'password', '••••••••')}
          {field('confirm', 'Confirmar contraseña', 'password', '••••••••')}

          <button
            type="submit"
            disabled={loading}
            className="w-full h-10 rounded-lg text-sm font-semibold text-white transition flex items-center justify-center gap-2 disabled:opacity-60"
            style={{ background: '#004ac6' }}
          >
            {loading ? (
              <span className="material-symbols-outlined animate-spin text-base">refresh</span>
            ) : (
              <>
                <span className="material-symbols-outlined text-base">person_add</span>
                Crear cuenta
              </>
            )}
          </button>
        </form>

        <p className="text-sm text-center text-[#434655] dark:text-[#c4c8e8] mt-6">
          ¿Ya tienes cuenta?{' '}
          <Link to="/login" className="font-semibold" style={{ color: '#004ac6' }}>
            Iniciar sesión
          </Link>
        </p>
      </div>

      {showSuccess && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" />
          <div className="relative bg-white dark:bg-[#1e2030] rounded-2xl shadow-2xl w-full max-w-sm p-6 border border-[#c3c6d7] dark:border-[#2e3148] text-center">
            <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4" style={{ background: '#d1fae5' }}>
              <span className="material-symbols-outlined text-3xl" style={{ color: '#10B981' }}>check_circle</span>
            </div>
            <h3 className="text-lg font-bold text-[#191c1e] dark:text-[#e4e6f0] mb-1">¡Cuenta creada!</h3>
            <p className="text-sm text-[#434655] dark:text-[#c4c8e8] mb-6">
              El usuario se registró exitosamente. Ya puedes iniciar sesión.
            </p>
            <button
              onClick={goToLogin}
              className="w-full h-10 rounded-lg text-sm font-semibold text-white transition"
              style={{ background: '#004ac6' }}
            >
              Ir a iniciar sesión
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
