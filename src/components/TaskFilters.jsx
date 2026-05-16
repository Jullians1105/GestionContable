import { useTeam } from '../hooks/useTeam'

export default function TaskFilters({ filters, onChange, onClear }) {
  const { members } = useTeam()

  const handleChange = (field, value) => {
    onChange({ ...filters, [field]: value })
  }

  const hasActiveFilters = filters.search || filters.status || filters.priority || filters.assignedTo

  return (
    <div className="flex flex-wrap gap-3 items-end">
      {/* Search */}
      <div className="relative flex-1 min-w-[180px]">
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          type="text"
          value={filters.search}
          onChange={(e) => handleChange('search', e.target.value)}
          placeholder="Buscar tareas..."
          className="input-field pl-9"
        />
      </div>

      {/* Estado */}
      <select
        value={filters.status}
        onChange={(e) => handleChange('status', e.target.value)}
        className="input-field w-auto min-w-[140px]"
      >
        <option value="">Todos los estados</option>
        <option value="pending">Pendiente</option>
        <option value="in_progress">En Progreso</option>
        <option value="completed">Completada</option>
      </select>

      {/* Prioridad */}
      <select
        value={filters.priority}
        onChange={(e) => handleChange('priority', e.target.value)}
        className="input-field w-auto min-w-[140px]"
      >
        <option value="">Todas las prioridades</option>
        <option value="high">Alta</option>
        <option value="medium">Media</option>
        <option value="low">Baja</option>
      </select>

      {/* Asignado */}
      <select
        value={filters.assignedTo}
        onChange={(e) => handleChange('assignedTo', e.target.value)}
        className="input-field w-auto min-w-[150px]"
      >
        <option value="">Todos los miembros</option>
        {members.map((m) => (
          <option key={m.id} value={m.id}>{m.name}</option>
        ))}
      </select>

      {/* Clear */}
      {hasActiveFilters && (
        <button onClick={onClear} className="btn-secondary text-sm">
          Limpiar filtros
        </button>
      )}
    </div>
  )
}
