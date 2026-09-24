import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import logoTexto from '../assets/logo-texto.png'

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
    <div className="min-h-screen relative overflow-hidden" style={{ background: '#003B43' }}>
      {/* Resplandores de fondo, inspirados en numbi.ai: dos tonos claros del mismo teal de
          marca, recorriendo las 4 esquinas pegadas al borde de la pantalla. */}
      <div aria-hidden="true" className="login-motion-backdrop">
        <div className="login-motion-glow login-motion-glow--teal-light" />
        <div className="login-motion-glow login-motion-glow--teal-soft" />
      </div>

      {/* Misma posición que antes (logo a la izquierda, formulario a la derecha). La columna
          derecha centra la tarjeta con flex (no con cálculos de padding, que quedaban
          descuadrados), así que el margen arriba/abajo del recuadro blanco es siempre igual.
          Adentro, el título+form quedan centrados en la mitad de la tarjeta y el link de
          registro anclado abajo. */}
      <div className="relative min-h-screen flex flex-col lg:flex-row">
        <div className="login-fade flex-1 flex items-center justify-center px-8 py-10 lg:py-16">
          <img src={logoTexto} alt="Gestcon" className="h-16 w-auto lg:h-24" />
        </div>

        <div className="login-fade login-fade-delay-0 w-full lg:w-[44%] flex items-center justify-center px-6 pb-10 lg:pb-0 lg:pr-12 lg:py-12">
          <div className="w-full max-w-md lg:max-w-lg lg:min-h-[70vh] flex flex-col bg-white rounded-[2rem] shadow-[0_20px_60px_rgba(6,39,46,0.35)] px-10 py-12">
            <div className="flex-1 flex flex-col justify-center">
              <h1 className="text-2xl font-bold text-[#191c1e] mb-1 text-center">Iniciar sesión</h1>
              <p className="text-sm text-[#6b7280] mb-8 text-center">Accede a tu espacio de trabajo</p>

              {error && (
                <div className="bg-[#ffdad6] text-[#93000a] rounded-lg px-4 py-3 text-sm mb-5 flex items-center gap-2">
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
                    className="w-full h-11 px-3.5 rounded-lg border border-[#d1d5db] bg-white text-sm text-[#191c1e] placeholder-[#9ca3af] focus:outline-none focus:ring-2 focus:ring-[#003B43]/30 focus:border-[#003B43] transition"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-semibold text-[#434655]">Contraseña</label>
                    <Link to="/forgot-password" className="text-xs font-semibold text-[#003B43] hover:opacity-80 transition-opacity">
                      ¿Olvidaste tu contraseña?
                    </Link>
                  </div>
                  <input
                    type="password"
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    placeholder="••••••••"
                    className="w-full h-11 px-3.5 rounded-lg border border-[#d1d5db] bg-white text-sm text-[#191c1e] placeholder-[#9ca3af] focus:outline-none focus:ring-2 focus:ring-[#003B43]/30 focus:border-[#003B43] transition"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full h-11 rounded-lg text-sm font-semibold text-white transition flex items-center justify-center gap-2 disabled:opacity-60 hover:opacity-90 active:scale-[0.98]"
                  style={{ background: '#003B43' }}
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
            </div>

            <p className="text-sm text-center text-[#6b7280] mt-8">
              ¿No tienes cuenta?{' '}
              <Link to="/register" className="font-semibold text-[#003B43] hover:opacity-80 transition-opacity">
                Regístrate
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
