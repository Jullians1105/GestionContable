import { useRef, useEffect } from 'react'
import { useCountUp } from 'react-countup'

export default function StatsCard({
  title, value, icon, borderColor = '#004ac6', iconColor = '#004ac6', sub, subColor = '#434655',
  // Selector de mes — opcional. Si no se pasa monthLabel, la tarjeta se ve y
  // comporta exactamente igual que antes (usada también por Dashboard y
  // FondoEmprenderEmpresasPage, que no necesitan esto).
  monthLabel, onPrevMonth, onNextMonth, prevMonthDisabled, nextMonthDisabled,
}) {
  const countUpRef = useRef(null)
  const { update } = useCountUp({
    ref: countUpRef,
    start: 0,
    end: value,
    duration: 0.7,
    useEasing: true,
  })

  // Re-animate whenever value changes (skip first render — initial anim handles it)
  const isFirst = useRef(true)
  useEffect(() => {
    if (isFirst.current) { isFirst.current = false; return }
    update(value)
  }, [value, update])

  return (
    <div
      className="bg-white dark:bg-[#1e2030] p-6 rounded-xl shadow-sm border-l-4 flex flex-col justify-between hover:shadow-md transition-shadow"
      style={{ borderLeftColor: borderColor }}
    >
      <div className="flex justify-between items-start">
        <span className="text-[12px] font-semibold text-[#434655] dark:text-[#c4c8e8]">{title}</span>
        <span className="material-symbols-outlined" style={{ color: iconColor, fontSize: 22 }}>{icon}</span>
      </div>
      {monthLabel && (
        <div className="flex items-center gap-0.5 mt-1">
          <button
            onClick={onPrevMonth}
            disabled={prevMonthDisabled}
            title="Mes anterior"
            className="p-0.5 rounded hover:bg-[#f3f4f6] dark:hover:bg-[#252840] transition text-[#8890b5] disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent"
          >
            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>chevron_left</span>
          </button>
          <span className="text-[11px] font-medium text-[#8890b5] dark:text-[#5a5f7a] min-w-[64px] text-center">{monthLabel}</span>
          <button
            onClick={onNextMonth}
            disabled={nextMonthDisabled}
            title="Mes siguiente"
            className="p-0.5 rounded hover:bg-[#f3f4f6] dark:hover:bg-[#252840] transition text-[#8890b5] disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent"
          >
            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>chevron_right</span>
          </button>
        </div>
      )}
      <div className="mt-4">
        <h3 className="text-[32px] font-bold text-[#191c1e] dark:text-[#e4e6f0] leading-none">
          <span ref={countUpRef} />
        </h3>
        {sub && (
          <p className="text-[12px] mt-1 flex items-center gap-1" style={{ color: subColor }}>{sub}</p>
        )}
      </div>
    </div>
  )
}
