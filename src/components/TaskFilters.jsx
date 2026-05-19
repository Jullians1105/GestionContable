import { useTeam } from "../hooks/useTeam"

export default function TaskFilters({ filters, onChange, onClear }) {
  const { members } = useTeam()

  const handleChange = (field, value) => {
    onChange({ ...filters, [field]: value })
  }

  const hasActiveFilters = filters.search || filters.status || filters.priority || filters.assignedTo

  const selectCls = "h-10 border border-[#c3c6d7] rounded-lg px-3 text-[14px] text-[#191c1e] bg-white focus:outline-none focus:ring-2 focus:ring-[#004ac6] focus:border-[#004ac6] hover:bg-[#f3f4f6] transition-colors min-w-[140px]"

  return (
    <div className="bg-white rounded-xl border border-[#c3c6d7] p-4 mb-6 flex flex-wrap items-end gap-4 shadow-sm">
      {/* Search */}
      <div className="flex flex-col gap-1">
        <label className="text-[12px] font-semibold text-[#434655] px-1">Buscar</label>
        <div className="relative">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[#434655]" style={{ fontSize: 16 }}>search</span>
          <input
            type="text"
            value={filters.search}
            onChange={(e) => handleChange("search", e.target.value)}
            placeholder="Buscar tareas..."
            className="h-10 pl-9 pr-4 border border-[#c3c6d7] rounded-lg text-[14px] text-[#191c1e] bg-white focus:outline-none focus:ring-2 focus:ring-[#004ac6] hover:bg-[#f3f4f6] transition-colors min-w-[180px]"
          />
        </div>
      </div>

      {/* Estado */}
      <div className="flex flex-col gap-1">
        <label className="text-[12px] font-semibold text-[#434655] px-1">Estado</label>
        <select value={filters.status} onChange={(e) => handleChange("status", e.target.value)} className={selectCls}>
          <option value="">Todos</option>
          <option value="pending">Pendiente</option>
          <option value="in_progress">En Progreso</option>
          <option value="completed">Completada</option>
        </select>
      </div>

      {/* Prioridad */}
      <div className="flex flex-col gap-1">
        <label className="text-[12px] font-semibold text-[#434655] px-1">Prioridad</label>
        <select value={filters.priority} onChange={(e) => handleChange("priority", e.target.value)} className={selectCls}>
          <option value="">Todas</option>
          <option value="high">Alta</option>
          <option value="medium">Media</option>
          <option value="low">Baja</option>
        </select>
      </div>

      {/* Asignado */}
      <div className="flex flex-col gap-1">
        <label className="text-[12px] font-semibold text-[#434655] px-1">Asignado</label>
        <select value={filters.assignedTo} onChange={(e) => handleChange("assignedTo", e.target.value)} className={selectCls}>
          <option value="">Todos</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </select>
      </div>

      <div className="flex-1" />

      {/* Clear */}
      {hasActiveFilters && (
        <button
          onClick={onClear}
          className="h-10 px-4 text-[12px] font-semibold text-[#434655] flex items-center gap-2 hover:bg-[#f3f4f6] rounded-lg transition-colors border border-[#c3c6d7]"
        >
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>close</span>
          Limpiar
        </button>
      )}
    </div>
  )
}
