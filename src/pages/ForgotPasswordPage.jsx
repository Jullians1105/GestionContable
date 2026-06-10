import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function ForgotPasswordPage() {
  const { resetPassword } = useAuth()
  const [form, setForm] = useState({ email: '', password: '', confirm: '' })
  const [errors, setErrors] = useState({})
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)

  const validate = () => {
    const e = {}
    if (!form.email.trim()) e.email = 'El email es requerido'
    else if (!/\S+@\S+\.\S+/.test(form.email)) e.email = 'Email inválido'
    if (!form.password) e.password = 'La nueva contraseña es requerida'
    else if (form.password.length < 6) e.password = 'Mínimo 6 caracteres'
    if (form.password !== form.confirm) e.confirm = 'Las contraseñas no coinciden'
    return e
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const errs = validate()
    if (Object.keys(errs).length > 0) { setErrors(errs); return }
    setLoading(true)
    const result = await resetPassword(form.email.trim(), form.password)
    setLoading(false)
    if (result.success) {
      setSuccess(true)
    } else {
      setErrors({ email: result.error })
    }
  }

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
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: '#004ac6' }}>
            <span className="material-symbols-outlined text-white text-xl">task_alt</span>
          </div>
          <h1 className="text-2xl font-bold text-[#191c1e] dark:text-[#e4e6f0]">TaskFlow Pro</h1>
        </div>

        <h2 className="text-xl font-bold text-[#191c1e] dark:text-[#e4e6f0] mb-1">Recuperar contraseña</h2>
        <p className="text-sm text-[#434655] dark:text-[#c4c8e8] mb-6">Ingresa tu email y la nueva contraseña</p>

        {success ? (
          <div className="bg-[#d1fae5] text-[#10B981] rounded-lg px-4 py-3 text-sm flex items-center gap-2">
            <span className="material-symbols-outlined text-base">check_circle</span>
            Contraseña actualizada. Ya puedes iniciar sesión.
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {field('email', 'Email', 'email', 'tu@empresa.com')}
            {field('password', 'Nueva contraseña', 'password', '••••••••')}
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
                  <span className="material-symbols-outlined text-base">lock_reset</span>
                  Restablecer contraseña
                </>
              )}
            </button>
          </form>
        )}

        <p className="text-sm text-center text-[#434655] dark:text-[#c4c8e8] mt-6">
          <Link to="/login" className="font-semibold" style={{ color: '#004ac6' }}>
            Volver a iniciar sesión
          </Link>
        </p>
      </div>
    </div>
  )
}
