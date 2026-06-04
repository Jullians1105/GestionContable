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
    <div className="min-h-screen bg-[#f3f4f6] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-lg p-8 w-full max-w-md">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: '#004ac6' }}>
            <span className="material-symbols-outlined text-white text-xl">task_alt</span>
          </div>
          <h1 className="text-2xl font-bold text-[#191c1e]">TaskFlow Pro</h1>
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
              placeholder="tu@empresa.com"
              className="w-full h-10 px-3 rounded-lg border border-[#c3c6d7] bg-[#edeef0] text-sm text-[#191c1e] placeholder-[#888] focus:outline-none focus:ring-2 focus:ring-[#004ac6] focus:border-transparent transition"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#434655] mb-1.5">Contraseña</label>
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

        <div className="mt-6 pt-6 border-t border-[#c3c6d7]">
          <p className="text-xs text-[#434655] text-center mb-3">Usuarios de prueba:</p>
          <div className="grid grid-cols-2 gap-2 text-xs text-[#434655]">
            <div className="bg-[#edeef0] rounded-lg p-2">
              <p className="font-semibold">Admin</p>
              <p>maria@empresa.com</p>
              <p>admin123</p>
            </div>
            <div className="bg-[#edeef0] rounded-lg p-2">
              <p className="font-semibold">Líder</p>
              <p>carlos@empresa.com</p>
              <p>leader123</p>
            </div>
          </div>
        </div>

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
