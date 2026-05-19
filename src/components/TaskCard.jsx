import { formatDate, isDueDateOverdue, isDueDateSoon, getInitials, getAvatarColor, PRIORITY_LABELS, STATUS_LABELS } from "../utils/helpers"
import { useTeam } from "../hooks/useTeam"

const PRIORITY_BADGE = {
  high: "badge-high",
  medium: "badge-medium",
  low: "badge-low",
}

const STATUS_BADGE = {
  pending: "badge-pending",
  in_progress: "badge-in_progress",
  completed: "badge-completed",
}

export default function TaskCard({ task, onEdit, onDelete, onStatusChange }) {
  const { getMemberById } = useTeam()
  const member = task.assignedTo ? getMemberById(task.assignedTo) : null

  const overdue = isDueDateOverdue(task.dueDate) && task.status !== "completed"
  const soon = isDueDateSoon(task.dueDate) && task.status !== "completed"

  return (
    <div className="bg-white rounded-xl shadow-sm border border-[#c3c6d7] p-5 hover:shadow-md transition-shadow duration-200 flex flex-col gap-3">
      {/* Header row */}
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-[14px] font-semibold text-[#191c1e] leading-snug line-clamp-2 flex-1">
          {task.title}
        </h3>
        <div className="flex gap-1 shrink-0">
          <button
            onClick={() => onEdit(task)}
            className="p-1.5 text-[#434655] hover:text-[#004ac6] hover:bg-[#dbe1ff] rounded-lg transition-colors"
            title="Editar"
          >
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>edit</span>
          </button>
          <button
            onClick={() => onDelete(task.id)}
            className="p-1.5 text-[#434655] hover:text-[#93000a] hover:bg-[#ffdad6] rounded-lg transition-colors"
            title="Eliminar"
          >
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>delete</span>
          </button>
        </div>
      </div>

      {/* Description */}
      {task.description && (
        <p className="text-[12px] text-[#434655] line-clamp-2">{task.description}</p>
      )}

      {/* Badges */}
      <div className="flex flex-wrap gap-1.5">
        <span className={PRIORITY_BADGE[task.priority]}>{PRIORITY_LABELS[task.priority]}</span>
        <span className={STATUS_BADGE[task.status]}>{STATUS_LABELS[task.status]}</span>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between pt-2 border-t border-[#edeef0]">
        {member ? (
          <div className="flex items-center gap-1.5">
            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-semibold ${getAvatarColor(member.name)}`}>
              {getInitials(member.name)}
            </div>
            <span className="text-[12px] text-[#434655] truncate max-w-[100px]">{member.name}</span>
          </div>
        ) : (
          <span className="text-[12px] text-[#737686] italic">Sin asignar</span>
        )}

        {task.dueDate && (
          <span className={`text-[12px] font-semibold flex items-center gap-1 ${
            overdue ? "text-[#93000a]" : soon ? "text-yellow-700" : "text-[#434655]"
          }`}>
            {overdue && <span className="material-symbols-outlined" style={{ fontSize: 13 }}>warning</span>}
            {soon && !overdue && <span className="material-symbols-outlined" style={{ fontSize: 13 }}>schedule</span>}
            {formatDate(task.dueDate)}
          </span>
        )}
      </div>

      {/* Status change */}
      <select
        value={task.status}
        onChange={(e) => onStatusChange(task.id, e.target.value)}
        className="text-[12px] border border-[#c3c6d7] rounded-lg px-2 h-8 bg-[#f3f4f6] text-[#191c1e] focus:outline-none focus:ring-1 focus:ring-[#004ac6] cursor-pointer"
      >
        <option value="pending">Pendiente</option>
        <option value="in_progress">En Progreso</option>
        <option value="completed">Completada</option>
      </select>
    </div>
  )
}
