import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { ROLE_LABELS, getInitials, getAvatarColor } from '../utils/helpers'

export default function ProfilePage() {
  const { user, updateCurrentUser } = useAuth()
  const { addToast } = useToast()
  const [form, setForm] = useState({ name: user?.name || '', email: user?.email || '' })
  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' })
  const [savingProfile, setSavingProfile] = useState(false)
  const [savingPassword, setSavingPassword] = useState(false)

  const cardCls = 'bg-white dark:bg-[#1e2030] rounded-2xl border border-[#c3c6d7] dark:border-[#2e3148] p-6'
  const inputCls = 'w-full h-10 px-3 rounded-lg border border-[#c3c6d7] dark:border-[#2e3148] bg-[#edeef0] dark:bg-[#252840] text-sm text-[#191c1e] dark:text-[#e4e6f0] focus:outline-none focus:ring-2 focus:ring-[#004ac6] transition'

  const handleSaveProfile = async (e) => {
    e.preventDefault()
    if (!form.name.trim()) return
    setSavingProfile(true)
    const result = await updateCurrentUser({ name: form.name.trim(), email: form.email.trim() })
    setSavingProfile(false)
    if (result.success) {
      addToast('Perfil actualizado', 'success')
    } else {
      addToast(result.error || 'No se pudo actualizar el perfil', 'error')
    }
  }

  const handleChangePassword = async (e) => {
    e.preventDefault()
    if (!passwordForm.currentPassword || !passwordForm.newPassword) return
    if (passwordForm.newPassword.length < 8) {
      addToast('La nueva contraseña debe tener al menos 8 caracteres', 'error')
      return
    }
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      addToast('Las contraseñas no coinciden', 'error')
      return
    }
    setSavingPassword(true)
    const result = await updateCurrentUser({
      currentPassword: passwordForm.currentPassword,
      newPassword: passwordForm.newPassword,
    })
    setSavingPassword(false)
    if (result.success) {
      addToast('Contraseña actualizada', 'success')
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' })
    } else {
      addToast(result.error || 'No se pudo actualizar la contraseña', 'error')
    }
  }

  const avatarBg = user ? getAvatarColor(user.name) : 'bg-[#004ac6]'

  return (
    <div>
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-[#191c1e] dark:text-[#e4e6f0]">Mi Perfil</h2>
        <p className="text-sm text-[#434655] mt-1">Gestiona tu información personal y tu contraseña.</p>
      </div>

      <div className="max-w-3xl space-y-6">
        <div className={cardCls}>
          <div className="flex items-center gap-4 mb-6">
            <div className={`w-16 h-16 rounded-full flex items-center justify-center text-white text-xl font-bold flex-shrink-0 ${avatarBg}`}>
              {getInitials(user?.name || '')}
            </div>
            <div>
              <p className="text-lg font-bold text-[#191c1e] dark:text-[#e4e6f0]">{user?.name}</p>
              <p className="text-sm text-[#434655] dark:text-[#c4c8e8]">{ROLE_LABELS[user?.role]}</p>
            </div>
          </div>
          <form onSubmit={handleSaveProfile} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-[#434655] mb-1.5">Nombre</label>
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputCls} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#434655] mb-1.5">Email</label>
                <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={inputCls} />
              </div>
            </div>
            <div className="flex justify-end">
              <button type="submit" disabled={savingProfile} className="h-10 px-4 rounded-lg text-sm font-semibold text-white hover:opacity-90 transition disabled:opacity-50" style={{ background: '#004ac6' }}>
                {savingProfile ? 'Guardando...' : 'Guardar cambios'}
              </button>
            </div>
          </form>
        </div>

        <div className={cardCls}>
          <h3 className="text-lg font-bold text-[#191c1e] dark:text-[#e4e6f0] mb-1">Cambiar Contraseña</h3>
          <p className="text-sm text-[#434655] mb-4">Introduce tu contraseña actual para establecer una nueva.</p>
          <form onSubmit={handleChangePassword} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-[#434655] mb-1.5">Contraseña actual</label>
              <input type="password" value={passwordForm.currentPassword} onChange={(e) => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })} className={inputCls} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-[#434655] mb-1.5">Nueva contraseña</label>
                <input type="password" value={passwordForm.newPassword} onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })} className={inputCls} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#434655] mb-1.5">Confirmar nueva contraseña</label>
                <input type="password" value={passwordForm.confirmPassword} onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })} className={inputCls} />
              </div>
            </div>
            <div className="flex justify-end">
              <button type="submit" disabled={savingPassword} className="h-10 px-4 rounded-lg text-sm font-semibold text-white hover:opacity-90 transition disabled:opacity-50" style={{ background: '#004ac6' }}>
                {savingPassword ? 'Guardando...' : 'Actualizar contraseña'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
