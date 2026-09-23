import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import logoIcono from '../assets/logo-icono.png'

export default function ForgotPasswordPage() {
  const { requestPasswordReset } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [devToken, setDevToken] = useState(null)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!email.trim() || !/\S+@\S+\.\S+/.test(email)) {
      setError('Ingresa un email válido')
      return
    }
    setLoading(true)
    setError('')
    const result = await requestPasswordReset(email.trim())
    setLoading(false)
    if (result.success) {
      setSent(true)
      if (result.devToken) setDevToken(result.devToken)
    } else {
      setError(result.error)
    }
  }

  return (
    <div className="min-h-screen bg-[#f3f4f6] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-lg p-8 w-full max-w-md border border-[#c3c6d7]">
        <div className="flex items-center gap-3 mb-8">
          <img src={logoIcono} alt="Gestcon" className="w-10 h-10 rounded-xl object-cover" />
          <h1 className="text-2xl font-bold text-[#191c1e]">Gestcon</h1>
        </div>

        <h2 className="text-xl font-bold text-[#191c1e] mb-1">Recuperar contraseña</h2>
        <p className="text-sm text-[#434655] mb-6">
          Ingresa tu email y te enviaremos instrucciones para restablecer tu contraseña
        </p>

        {error && (
          <div className="bg-[#ffdad6] text-[#EF4444] rounded-lg px-4 py-3 text-sm mb-4 flex items-center gap-2">
            <span className="material-symbols-outlined text-base">error</span>
            {error}
          </div>
        )}

        {sent ? (
          <div className="space-y-4">
            <div className="bg-[#d1fae5] text-[#10B981] rounded-lg px-4 py-3 text-sm flex items-center gap-2">
              <span className="material-symbols-outlined text-base">check_circle</span>
              Si el email existe, se enviaron instrucciones para restablecer la contraseña.
            </div>
            {devToken ? (
              <button
                onClick={() => navigate(`/reset-password?token=${devToken}`)}
                className="w-full h-10 rounded-lg text-sm font-semibold text-white transition flex items-center justify-center gap-2"
                style={{ background: '#2563eb' }}
              >
                <span className="material-symbols-outlined text-base">lock_reset</span>
                Restablecer contraseña ahora
              </button>
            ) : (
              <button
                onClick={() => navigate('/reset-password')}
                className="w-full h-10 rounded-lg text-sm font-semibold text-white transition"
                style={{ background: '#2563eb' }}
              >
                Ya tengo mi token
              </button>
            )}
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-[#434655] mb-1.5">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setError('') }}
                placeholder="tu@empresa.com"
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
                  <span className="material-symbols-outlined text-base">send</span>
                  Enviar instrucciones
                </>
              )}
            </button>
          </form>
        )}

        <p className="text-sm text-center text-[#434655] mt-6">
          <Link to="/login" className="font-semibold" style={{ color: '#004ac6' }}>
            Volver a iniciar sesión
          </Link>
        </p>
      </div>
    </div>
  )
}
