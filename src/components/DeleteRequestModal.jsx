import { useState } from 'react'

export default function DeleteRequestModal({ taskTitle, onSubmit, onClose }) {
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!reason.trim() || submitting) return
    setSubmitting(true)
    try {
      await onSubmit(reason.trim())
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <form
        onSubmit={handleSubmit}
        className="relative bg-white dark:bg-[#1e2030] rounded-2xl shadow-2xl w-full max-w-sm border border-[#c3c6d7] dark:border-[#2e3148] p-6"
      >
        <h3 className="text-base font-bold text-[#191c1e] dark:text-[#e4e6f0] mb-1">
          Solicitar eliminación
        </h3>
        <p className="text-sm text-[#434655] dark:text-[#c4c8e8] mb-4">
          Se le notificará al admin o líder del grupo de <strong>{taskTitle}</strong> para que apruebe o rechace la solicitud.
        </p>
        <label className="block text-xs font-semibold text-[#434655] dark:text-[#c4c8e8] mb-1.5">
          Motivo <span className="text-[#EF4444]">*</span>
        </label>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="¿Por qué debería eliminarse esta tarea?"
          rows={3}
          autoFocus
          className="w-full border border-[#c3c6d7] dark:border-[#2e3148] rounded-lg px-3 py-2 text-sm text-[#191c1e] dark:text-[#e4e6f0] bg-[#edeef0] dark:bg-[#252840] focus:outline-none focus:ring-2 focus:ring-[#004ac6] transition resize-none mb-4"
        />
        <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose} className="h-10 px-4 rounded-lg border border-[#c3c6d7] dark:border-[#2e3148] text-sm font-semibold text-[#434655] dark:text-[#c4c8e8] hover:bg-[#edeef0] dark:hover:bg-[#252840] transition">
            Cancelar
          </button>
          <button
            type="submit"
            disabled={!reason.trim() || submitting}
            className="h-10 px-4 rounded-lg text-sm font-semibold text-white disabled:opacity-40 transition hover:opacity-90"
            style={{ background: '#EF4444' }}
          >
            {submitting ? 'Enviando…' : 'Enviar solicitud'}
          </button>
        </div>
      </form>
    </div>
  )
}
