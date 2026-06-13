import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function ResetPasswordPage() {
  const { confirmPasswordReset } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const tokenFromUrl = searchParams.get('token') ?? ''

  const [token, setToken] = useState(tokenFromUrl)
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [errors, setErrors] = useState({})
  const [loading, setLoading] = useState(false)
  const [showSuccess, setShowSuccess] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    const newErrors = {}
    if (!token.trim()) newErrors.token = 'El token es obligatorio'
    if (password.length < 8) newErrors.password = 'La contraseña debe tener al menos 8 caracteres'
    if (password !== confirmPassword) newErrors.confirmPassword = 'Las contraseñas no coinciden'
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      return
    }
    setLoading(true)
    setErrors({})
    const result = await confirmPasswordReset(token.trim(), password)
    setLoading(false)
    if (result.success) {
      setShowSuccess(true)
    } else {
      setErrors({ token: result.error })
    }
  }

  const goToLogin = () => navigate('/login')

  return (
    <div className="min-h-screen bg-[#f3f4f6] dark:bg-[#0f1117] flex items-center justify-center p-4">
      <div className="bg-white dark:bg-[#1e2030] rounded-2xl shadow-lg p-8 w-full max-w-md border border-[#c3c6d7] dark:border-[#2e3148]">
        <div className="flex items-center gap-3 mb-8">
          <img src="/logo.jpeg" alt="Gestor de Tareas" className="w-10 h-10 rounded-xl object-cover" />
          <h1 className="text-2xl font-bold text-[#191c1e] dark:text-[#e4e6f0]">Gestor de Tareas</h1>
        </div>

        <h2 className="text-xl font-bold text-[#191c1e] dark:text-[#e4e6f0] mb-1">Restablecer contraseña</h2>
        <p className="text-sm text-[#434655] dark:text-[#c4c8e8] mb-6">
          Ingresa el token que recibiste y tu nueva contraseña
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-[#434655] dark:text-[#c4c8e8] mb-1.5">Token</label>
            <input
              type="text"
              value={token}
              onChange={(e) => { setToken(e.target.value); setErrors((prev) => ({ ...prev, token: undefined })) }}
              placeholder="Token de recuperación"
              className="w-full h-10 px-3 rounded-lg border border-[#c3c6d7] dark:border-[#2e3148] bg-[#edeef0] dark:bg-[#252840] text-sm text-[#191c1e] dark:text-[#e4e6f0] placeholder-[#888] focus:outline-none focus:ring-2 focus:ring-[#004ac6] focus:border-transparent transition font-mono"
            />
            {errors.token && <p className="text-xs text-[#EF4444] mt-1">{errors.token}</p>}
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#434655] dark:text-[#c4c8e8] mb-1.5">Nueva contraseña</label>
            <input
              type="password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setErrors((prev) => ({ ...prev, password: undefined })) }}
              placeholder="Mínimo 8 caracteres"
              className="w-full h-10 px-3 rounded-lg border border-[#c3c6d7] dark:border-[#2e3148] bg-[#edeef0] dark:bg-[#252840] text-sm text-[#191c1e] dark:text-[#e4e6f0] placeholder-[#888] focus:outline-none focus:ring-2 focus:ring-[#004ac6] focus:border-transparent transition"
            />
            {errors.password && <p className="text-xs text-[#EF4444] mt-1">{errors.password}</p>}
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#434655] dark:text-[#c4c8e8] mb-1.5">Confirmar contraseña</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => { setConfirmPassword(e.target.value); setErrors((prev) => ({ ...prev, confirmPassword: undefined })) }}
              placeholder="Repite la contraseña"
              className="w-full h-10 px-3 rounded-lg border border-[#c3c6d7] dark:border-[#2e3148] bg-[#edeef0] dark:bg-[#252840] text-sm text-[#191c1e] dark:text-[#e4e6f0] placeholder-[#888] focus:outline-none focus:ring-2 focus:ring-[#004ac6] focus:border-transparent transition"
            />
            {errors.confirmPassword && <p className="text-xs text-[#EF4444] mt-1">{errors.confirmPassword}</p>}
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
                <span className="material-symbols-outlined text-base">lock_reset</span>
                Restablecer contraseña
              </>
            )}
          </button>
        </form>

        <p className="text-sm text-center text-[#434655] dark:text-[#c4c8e8] mt-6">
          <Link to="/login" className="font-semibold" style={{ color: '#004ac6' }}>
            Volver a iniciar sesión
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
            <h3 className="text-lg font-bold text-[#191c1e] dark:text-[#e4e6f0] mb-1">¡Contraseña actualizada!</h3>
            <p className="text-sm text-[#434655] dark:text-[#c4c8e8] mb-6">
              Tu contraseña se restableció correctamente. Ya puedes iniciar sesión.
            </p>
            <button onClick={goToLogin} className="w-full h-10 rounded-lg text-sm font-semibold text-white transition" style={{ background: '#004ac6' }}>
              Ir a iniciar sesión
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
