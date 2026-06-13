import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({ email: '', password: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.email || !form.password) {
      setError('Completa todos los campos')
      return
    }
    setLoading(true)
    setError('')
    const result = await login(form.email, form.password)
    setLoading(false)
    if (result.success) {
      navigate('/')
    } else {
      setError(result.error)
    }
  }

  return (
    <div className="min-h-screen bg-[#f3f4f6] dark:bg-[#0f1117] flex items-center justify-center p-4">
      <div className="bg-white dark:bg-[#1e2030] rounded-2xl shadow-lg p-8 w-full max-w-md border border-[#c3c6d7] dark:border-[#2e3148]">
        <div className="flex items-center gap-3 mb-8">
          <img src="/logo.jpeg" alt="Gestor de Tareas" className="w-10 h-10 rounded-xl object-cover" />
          <h1 className="text-2xl font-bold text-[#191c1e] dark:text-[#e4e6f0]">Gestor de Tareas</h1>
        </div>

        <h2 className="text-xl font-bold text-[#191c1e] dark:text-[#e4e6f0] mb-1">Iniciar sesión</h2>
        <p className="text-sm text-[#434655] dark:text-[#c4c8e8] mb-6">Accede a tu espacio de trabajo</p>

        {error && (
          <div className="bg-[#ffdad6] text-[#EF4444] rounded-lg px-4 py-3 text-sm mb-4 flex items-center gap-2">
            <span className="material-symbols-outlined text-base">error</span>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-[#434655] dark:text-[#c4c8e8] mb-1.5">Email</label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="tu@empresa.com"
              className="w-full h-10 px-3 rounded-lg border border-[#c3c6d7] dark:border-[#2e3148] bg-[#edeef0] dark:bg-[#252840] text-sm text-[#191c1e] dark:text-[#e4e6f0] placeholder-[#888] focus:outline-none focus:ring-2 focus:ring-[#004ac6] focus:border-transparent transition"
            />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-semibold text-[#434655] dark:text-[#c4c8e8]">Contraseña</label>
              <Link to="/forgot-password" className="text-xs font-semibold" style={{ color: '#004ac6' }}>
                ¿Olvidaste tu contraseña?
              </Link>
            </div>
            <input
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              placeholder="••••••••"
              className="w-full h-10 px-3 rounded-lg border border-[#c3c6d7] dark:border-[#2e3148] bg-[#edeef0] dark:bg-[#252840] text-sm text-[#191c1e] dark:text-[#e4e6f0] placeholder-[#888] focus:outline-none focus:ring-2 focus:ring-[#004ac6] focus:border-transparent transition"
            />
          </div>

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
                <span className="material-symbols-outlined text-base">login</span>
                Iniciar sesión
              </>
            )}
          </button>
        </form>

        <p className="text-sm text-center text-[#434655] dark:text-[#c4c8e8] mt-6">
          ¿No tienes cuenta?{' '}
          <Link to="/register" className="font-semibold" style={{ color: '#004ac6' }}>
            Regístrate
          </Link>
        </p>
      </div>
    </div>
  )
}
