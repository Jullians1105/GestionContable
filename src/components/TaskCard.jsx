import { formatDate, isDueDateOverdue, isDueDateSoon, getInitials, getAvatarColor, PRIORITY_LABELS, STATUS_LABELS } from '../utils/helpers'
import { useTeam } from '../hooks/useTeam'

const PRIORITY_BADGE = {
  high: 'badge-high',
  medium: 'badge-medium',
  low: 'badge-low',
}

const STATUS_BADGE = {
  pending: 'badge-pending',
  in_progress: 'badge-in_progress',
  completed: 'badge-completed',
}

export default function TaskCard({ task, onEdit, onDelete, onStatusChange }) {
  const { getMemberById } = useTeam()
  const member = task.assignedTo ? getMemberById(task.assignedTo) : null

  const overdue = isDueDateOverdue(task.dueDate) && task.status !== 'completed'
  const soon = isDueDateSoon(task.dueDate) && task.status !== 'completed'

  return (
    <div className="card hover:shadow-md transition-shadow duration-200 flex flex-col gap-3">
      {/* Header row */}
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-semibold text-gray-900 text-sm leading-snug line-clamp-2 flex-1">
          {task.title}
        </h3>
        <div className="flex gap-1.5 shrink-0">
          <button
            onClick={() => onEdit(task)}
            className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
            title="Editar"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </button>
          <button
            onClick={() => onDelete(task.id)}
            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
            title="Eliminar"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </div>

      {/* Description */}
      {task.description && (
        <p className="text-xs text-gray-500 line-clamp-2">{task.description}</p>
      )}

      {/* Badges */}
      <div className="flex flex-wrap gap-1.5">
        <span className={PRIORITY_BADGE[task.priority]}>{PRIORITY_LABELS[task.priority]}</span>
        <span className={STATUS_BADGE[task.status]}>{STATUS_LABELS[task.status]}</span>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between pt-1 border-t border-gray-100">
        {/* Member avatar */}
        {member ? (
          <div className="flex items-center gap-1.5">
            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-semibold ${getAvatarColor(member.name)}`}>
              {getInitials(member.name)}
            </div>
            <span className="text-xs text-gray-500 truncate max-w-[100px]">{member.name}</span>
          </div>
        ) : (
          <span className="text-xs text-gray-400 italic">Sin asignar</span>
        )}

        {/* Due date */}
        {task.dueDate && (
          <span className={`text-xs font-medium ${
            overdue ? 'text-red-600' : soon ? 'text-yellow-600' : 'text-gray-500'
          }`}>
            {overdue ? '⚠ ' : soon ? '⏰ ' : ''}{formatDate(task.dueDate)}
          </span>
        )}
      </div>

      {/* Status change */}
      <select
        value={task.status}
        onChange={(e) => onStatusChange(task.id, e.target.value)}
        className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-gray-50 text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-400 cursor-pointer"
      >
        <option value="pending">Pendiente</option>
        <option value="in_progress">En Progreso</option>
        <option value="completed">Completada</option>
      </select>
    </div>
  )
}
