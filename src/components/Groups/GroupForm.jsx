import { useState } from 'react'
import { useGroups } from '../../context/GroupContext'
import { useTeam } from '../../hooks/useTeam'
import { useToast } from '../../context/ToastContext'

const COLORS = ['#004ac6', '#10B981', '#EF4444', '#FBBF24', '#F97316', '#8B5CF6', '#EC4899', '#06B6D4']

export default function GroupForm({ group, onClose }) {
  const { createGroup, updateGroup } = useGroups()
  const { members } = useTeam()
  const { addToast } = useToast()
  const [form, setForm] = useState({
    name: group?.name || '',
    description: group?.description || '',
    color: group?.color || '#004ac6',
    memberIds: group?.memberIds || [],
    leaderId: group?.leaderId || '',
  })
  const [errors, setErrors] = useState({})

  const validate = () => {
    const e = {}
    if (!form.name.trim()) e.name = 'El nombre es requerido'
    return e
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    const errs = validate()
    if (Object.keys(errs).length) { setErrors(errs); return }
    if (group) {
      updateGroup(group.id, form)
      addToast('Grupo actualizado', 'success')
    } else {
      createGroup({ ...form, taskIds: [] })
      addToast('Grupo creado', 'success')
    }
    onClose()
  }

  const toggleMember = (id) => {
    setForm((prev) => ({
      ...prev,
      memberIds: prev.memberIds.includes(id)
        ? prev.memberIds.filter((m) => m !== id)
        : [...prev.memberIds, id],
    }))
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-[#1e2030] rounded-2xl shadow-2xl w-full max-w-lg">
        <div className="flex items-center justify-between p-6 border-b border-[#c3c6d7] dark:border-[#2e3148]">
          <h2 className="text-lg font-bold text-[#191c1e] dark:text-[#e4e6f0]">
            {group ? 'Editar grupo' : 'Nuevo grupo'}
          </h2>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-[#edeef0] dark:hover:bg-[#2e3148] transition">
            <span className="material-symbols-outlined text-[#434655]">close</span>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-[#434655] mb-1.5">Nombre *</label>
            <input
              value={form.name}
              onChange={(e) => { setForm({ ...form, name: e.target.value }); setErrors({}) }}
              placeholder="Frontend Team"
              className={`w-full h-10 px-3 rounded-lg border bg-[#edeef0] dark:bg-[#252840] text-sm text-[#191c1e] dark:text-[#e4e6f0] focus:outline-none focus:ring-2 focus:ring-[#004ac6] transition ${errors.name ? 'border-[#EF4444]' : 'border-[#c3c6d7] dark:border-[#2e3148]'}`}
            />
            {errors.name && <p className="text-xs text-[#EF4444] mt-1">{errors.name}</p>}
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#434655] mb-1.5">Descripción</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={2}
              placeholder="Descripción opcional..."
              className="w-full px-3 py-2 rounded-lg border border-[#c3c6d7] dark:border-[#2e3148] bg-[#edeef0] dark:bg-[#252840] text-sm text-[#191c1e] dark:text-[#e4e6f0] focus:outline-none focus:ring-2 focus:ring-[#004ac6] transition resize-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#434655] mb-2">Color</label>
            <div className="flex flex-wrap gap-2">
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setForm({ ...form, color: c })}
                  className="w-7 h-7 rounded-full transition-transform hover:scale-110"
                  style={{
                    background: c,
                    outline: form.color === c ? `3px solid ${c}` : 'none',
                    outlineOffset: '2px',
                  }}
                />
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#434655] mb-2">Miembros</label>
            <div className="space-y-1 max-h-40 overflow-y-auto">
              {members.map((m) => (
                <label key={m.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-[#edeef0] dark:hover:bg-[#252840] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.memberIds.includes(m.id)}
                    onChange={() => toggleMember(m.id)}
                    className="accent-[#004ac6]"
                  />
                  <span className="text-sm text-[#191c1e] dark:text-[#e4e6f0]">{m.name}</span>
                  <span className="text-xs text-[#434655] ml-auto">{m.role}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 h-10 rounded-lg border border-[#c3c6d7] text-sm font-semibold text-[#434655] hover:bg-[#edeef0] transition">
              Cancelar
            </button>
            <button type="submit" className="flex-1 h-10 rounded-lg text-sm font-semibold text-white transition hover:opacity-90" style={{ background: '#004ac6' }}>
              {group ? 'Guardar cambios' : 'Crear grupo'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
