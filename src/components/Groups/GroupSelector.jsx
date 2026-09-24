import { useState } from 'react'
import { useGroups } from '../../context/GroupContext'

export default function GroupSelector() {
  const { groups, currentGroupId, setCurrentGroupId } = useGroups()
  const [open, setOpen] = useState(false)

  const current = groups.find((g) => g.id === currentGroupId)

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 h-9 px-3 rounded-lg border border-[#c3c6d7] bg-white text-sm text-[#434655] hover:bg-[#edeef0] transition"
      >
        {current ? (
          <>
            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: current.color }} />
            <span className="max-w-[120px] truncate">{current.name}</span>
          </>
        ) : (
          <>
            <span className="material-symbols-outlined text-base">group_work</span>
            <span>Todos los grupos</span>
          </>
        )}
        <span className="material-symbols-outlined text-base ml-1">expand_more</span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute top-full mt-1 right-0 z-50 bg-white rounded-xl shadow-xl border border-[#c3c6d7] min-w-[180px] overflow-hidden">
            <button
              onClick={() => { setCurrentGroupId(null); setOpen(false) }}
              className={`w-full flex items-center gap-2 px-3 py-2.5 text-sm hover:bg-[#edeef0] transition ${!currentGroupId ? 'text-[#004ac6] font-semibold' : 'text-[#434655]'}`}
            >
              <span className="material-symbols-outlined text-base">group_work</span>
              Todos los grupos
            </button>
            {groups.map((g) => (
              <button
                key={g.id}
                onClick={() => { setCurrentGroupId(g.id); setOpen(false) }}
                className={`w-full flex items-center gap-2 px-3 py-2.5 text-sm hover:bg-[#edeef0] transition ${currentGroupId === g.id ? 'font-semibold' : 'text-[#434655]'}`}
              >
                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: g.color }} />
                {g.name}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
