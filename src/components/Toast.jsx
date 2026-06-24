import { createPortal } from 'react-dom'
import { useToast } from '../context/ToastContext'

const ICONS = {
  success: 'check_circle',
  error: 'error',
  warning: 'warning',
  info: 'info',
}

const COLORS = {
  success: { bg: '#10B981', ring: '#d1fae5' },
  error: { bg: '#EF4444', ring: '#ffdad6' },
  warning: { bg: '#FBBF24', ring: '#fef3c7' },
  info: { bg: '#004ac6', ring: '#dbeafe' },
}

export default function Toast() {
  const { toasts, removeToast } = useToast()

  return createPortal(
    <div className="fixed bottom-6 right-6 z-[9999] flex flex-col gap-2 pointer-events-none" style={{ transform: 'translateZ(0)' }}>
      {toasts.map((t) => {
        const c = COLORS[t.type] || COLORS.info
        return (
          <div
            key={t.id}
            className="pointer-events-auto flex items-center gap-3 bg-white dark:bg-[#1e2030] rounded-xl shadow-xl px-4 py-3 min-w-[260px] max-w-sm border"
            style={{ borderColor: c.ring }}
          >
            <span className="material-symbols-outlined text-xl flex-shrink-0" style={{ color: c.bg }}>
              {ICONS[t.type] || 'info'}
            </span>
            <p className="text-sm text-[#191c1e] dark:text-[#e4e6f0] flex-1">{t.message}</p>
            {t.action && (
              <button
                onClick={() => { t.action.onClick(); removeToast(t.id) }}
                className="flex-shrink-0 text-xs font-semibold px-2.5 h-6 rounded-lg border transition hover:opacity-80"
                style={{ color: c.bg, borderColor: c.bg }}
              >
                {t.action.label}
              </button>
            )}
            <button onClick={() => removeToast(t.id)} className="text-[#434655] hover:text-[#191c1e] ml-1 flex-shrink-0">
              <span className="material-symbols-outlined text-base">close</span>
            </button>
          </div>
        )
      })}
    </div>,
    document.body
  )
}
