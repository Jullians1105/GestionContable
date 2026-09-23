import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import logoIcono from '../assets/logo-icono.png'

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
    <div className="min-h-screen bg-[#f3f4f6] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-lg p-8 w-full max-w-md border border-[#c3c6d7]">
        <div className="flex items-center gap-3 mb-8">
          <img src={logoIcono} alt="Gestcon" className="w-10 h-10 object-contain" />
          <h1 className="text-2xl font-bold text-[#191c1e]">Gestcon</h1>
        </div>

        <h2 className="text-xl font-bold text-[#191c1e] mb-1">Iniciar sesión</h2>
        <p className="text-sm text-[#434655] mb-6">Accede a tu espacio de trabajo</p>

        {error && (
          <div className="bg-[#ffdad6] text-[#EF4444] rounded-lg px-4 py-3 text-sm mb-4 flex items-center gap-2">
            <span className="material-symbols-outlined text-base">error</span>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-[#434655] mb-1.5">Email</label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="tu@gmail.com"
              className="w-full h-10 px-3 rounded-lg border border-[#c3c6d7] bg-[#edeef0] text-sm text-[#191c1e] placeholder-[#888] focus:outline-none focus:ring-2 focus:ring-[#004ac6] focus:border-transparent transition"
            />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-semibold text-[#434655]">Contraseña</label>
              <Link to="/forgot-password" className="text-xs font-semibold" style={{ color: '#004ac6' }}>
                ¿Olvidaste tu contraseña?
              </Link>
            </div>
            <input
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              placeholder="••••••••"
              className="w-full h-10 px-3 rounded-lg border border-[#c3c6d7] bg-[#edeef0] text-sm text-[#191c1e] placeholder-[#888] focus:outline-none focus:ring-2 focus:ring-[#004ac6] focus:border-transparent transition"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full h-10 rounded-lg text-sm font-semibold text-white transition flex items-center justify-center gap-2 disabled:opacity-60"
            style={{ background: '#2563eb' }}
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

        <p className="text-sm text-center text-[#434655] mt-6">
          ¿No tienes cuenta?{' '}
          <Link to="/register" className="font-semibold" style={{ color: '#004ac6' }}>
            Regístrate
          </Link>
        </p>
      </div>
    </div>
  )
}
