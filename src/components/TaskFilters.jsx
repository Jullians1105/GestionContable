import { useState } from 'react'
import { useTeam } from '../hooks/useTeam'
import { useGroups } from '../context/GroupContext'
import { useTags } from '../context/TagContext'

export default function TaskFilters({ filters, onChange, onClear }) {
  const { members } = useTeam()
  const { groups } = useGroups()
  const { tags } = useTags()
  const [expanded, setExpanded] = useState(false)

  const handleChange = (field, value) => onChange({ ...filters, [field]: value })

  const hasActive = filters.search || filters.status || filters.priority || filters.assignedTo || filters.groupId || filters.tagId || filters.createdByMe

  const selectCls = 'h-10 border border-[#c3c6d7] dark:border-[#2e3148] rounded-lg px-3 text-sm text-[#191c1e] dark:text-[#e4e6f0] bg-white dark:bg-[#252840] focus:outline-none focus:ring-2 focus:ring-[#004ac6] transition w-full'

  return (
    <div className="bg-white dark:bg-[#1e2030] rounded-xl border border-[#c3c6d7] dark:border-[#2e3148] mb-6 shadow-sm overflow-hidden">

      {/* Mobile toggle header */}
      <button
        className="lg:hidden w-full flex items-center justify-between px-4 py-3 text-left"
        onClick={() => setExpanded(v => !v)}
      >
        <span className="text-sm font-semibold text-[#191c1e] dark:text-[#e4e6f0] flex items-center gap-2">
          <span className="material-symbols-outlined text-base" style={{ color: '#004ac6' }}>filter_list</span>
          Filtros
          {hasActive && <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: '#004ac6' }} />}
        </span>
        <span className="material-symbols-outlined text-base text-[#434655] dark:text-[#c4c8e8]">
          {expanded ? 'expand_less' : 'expand_more'}
        </span>
      </button>

      {/* Filters body */}
      <div className={`p-4 flex flex-wrap items-end gap-3 ${expanded ? 'flex' : 'hidden'} lg:flex`}>

        <div className="flex flex-col gap-1 w-full sm:w-auto">
          <label className="text-xs font-semibold text-[#434655] dark:text-[#c4c8e8] px-1">Buscar</label>
          <div className="relative">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[#434655] dark:text-[#c4c8e8] text-base">search</span>
            <input
              type="text"
              value={filters.search}
              onChange={(e) => handleChange('search', e.target.value)}
              placeholder="Buscar tareas..."
              className="h-10 pl-9 pr-4 border border-[#c3c6d7] dark:border-[#2e3148] rounded-lg text-sm text-[#191c1e] dark:text-[#e4e6f0] bg-white dark:bg-[#252840] focus:outline-none focus:ring-2 focus:ring-[#004ac6] transition w-full sm:min-w-[180px]"
            />
          </div>
        </div>

        <div className="flex flex-col gap-1 w-full sm:w-auto">
          <label className="text-xs font-semibold text-[#434655] dark:text-[#c4c8e8] px-1">Estado</label>
          <select value={filters.status} onChange={(e) => handleChange('status', e.target.value)} className={selectCls} style={{ minWidth: 130 }}>
            <option value="">Todos</option>
            <option value="pending">Pendiente</option>
            <option value="in_progress">En Progreso</option>
            <option value="completed">Completada</option>
          </select>
        </div>

        <div className="flex flex-col gap-1 w-full sm:w-auto">
          <label className="text-xs font-semibold text-[#434655] dark:text-[#c4c8e8] px-1">Prioridad</label>
          <select value={filters.priority} onChange={(e) => handleChange('priority', e.target.value)} className={selectCls} style={{ minWidth: 130 }}>
            <option value="">Todas</option>
            <option value="high">Alta</option>
            <option value="medium">Media</option>
            <option value="low">Baja</option>
          </select>
        </div>

        <div className="flex flex-col gap-1 w-full sm:w-auto">
          <label className="text-xs font-semibold text-[#434655] dark:text-[#c4c8e8] px-1">Asignado</label>
          <select value={filters.assignedTo} onChange={(e) => handleChange('assignedTo', e.target.value)} className={selectCls} style={{ minWidth: 130 }}>
            <option value="">Todos</option>
            {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </div>

        <div className="flex flex-col gap-1 w-full sm:w-auto">
          <label className="text-xs font-semibold text-[#434655] dark:text-[#c4c8e8] px-1">Grupo</label>
          <select value={filters.groupId} onChange={(e) => handleChange('groupId', e.target.value)} className={selectCls} style={{ minWidth: 130 }}>
            <option value="">Todos</option>
            {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        </div>

        <div className="flex flex-col gap-1 w-full sm:w-auto">
          <label className="text-xs font-semibold text-[#434655] dark:text-[#c4c8e8] px-1">Etiqueta</label>
          <select value={filters.tagId} onChange={(e) => handleChange('tagId', e.target.value)} className={selectCls} style={{ minWidth: 130 }}>
            <option value="">Todas</option>
            {tags.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>

        <div className="flex flex-col gap-1 w-full sm:w-auto">
          <label className="text-xs font-semibold text-[#434655] dark:text-[#c4c8e8] px-1">&nbsp;</label>
          <label className="h-10 flex items-center gap-2 px-3 border border-[#c3c6d7] dark:border-[#2e3148] rounded-lg text-sm text-[#191c1e] dark:text-[#e4e6f0] bg-white dark:bg-[#252840] cursor-pointer select-none w-full sm:w-auto">
            <input
              type="checkbox"
              checked={filters.createdByMe}
              onChange={(e) => handleChange('createdByMe', e.target.checked)}
              className="accent-[#004ac6] cursor-pointer"
            />
            Creadas por mí
          </label>
        </div>

        <div className="flex-1" />

        {hasActive && (
          <button
            onClick={onClear}
            className="h-10 px-4 text-xs font-semibold text-[#434655] dark:text-[#c4c8e8] flex items-center gap-1.5 hover:bg-[#edeef0] dark:hover:bg-[#252840] rounded-lg transition border border-[#c3c6d7] dark:border-[#2e3148] w-full sm:w-auto justify-center sm:justify-start"
          >
            <span className="material-symbols-outlined text-base">close</span>
            Limpiar filtros
          </button>
        )}
      </div>
    </div>
  )
}
