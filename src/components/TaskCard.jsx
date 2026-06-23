import { formatDate, isDueDateOverdue, isDueDateSoon, getInitials, getAvatarColor, PRIORITY_LABELS, STATUS_LABELS, normalizeAssignedTo } from '../utils/helpers'
import { useTeam } from '../hooks/useTeam'
import { useTags } from '../context/TagContext'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'

const PRIORITY_COLORS = { high: '#EF4444', medium: '#FBBF24', low: '#10B981' }
const STATUS_COLORS = { pending: '#888', in_progress: '#004ac6', completed: '#10B981' }

export default function TaskCard({ task, onEdit, onDelete, onStatusChange, onView }) {
  const { getMemberById } = useTeam()
  const { getTagById } = useTags()
  const { hasPermission } = useAuth()
  const { addToast } = useToast()
  const assignedIds = normalizeAssignedTo(task.assignedTo)
  const assignedMembers = assignedIds.map(id => getMemberById(id)).filter(Boolean)
  const overdue = isDueDateOverdue(task.dueDate, task.dueTime) && task.status !== 'completed'
  const soon = isDueDateSoon(task.dueDate, task.dueTime) && task.status !== 'completed'

  const guard = (key, fn) => {
    if (hasPermission(key)) fn()
    else addToast('No tienes permiso para realizar esta acción', 'error')
  }

  const subtasks = task.subtasks || []
  const completedSubtasks = subtasks.filter((s) => s.completed).length
  const tags = (task.tagIds || []).map(getTagById).filter(Boolean)
  const commentCount = (task.comments || []).length

  return (
    <div
      className="bg-white dark:bg-[#1e2030] rounded-xl shadow-sm border border-[#c3c6d7] dark:border-[#2e3148] p-5 hover:shadow-md hover:border-[#004ac6] transition-all flex flex-col gap-3 cursor-pointer"
      onClick={() => onView && onView(task)}
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-semibold text-[#191c1e] dark:text-[#e4e6f0] leading-snug line-clamp-2 flex-1">{task.title}</h3>
        <div className="flex gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
          <button onClick={() => guard('canEditTask', () => onEdit(task))} className="p-1.5 text-[#434655] dark:text-[#c4c8e8] hover:text-[#004ac6] hover:bg-[#dbe1ff] rounded-lg transition" title="Editar">
            <span className="material-symbols-outlined text-base">edit</span>
          </button>
          <button onClick={() => guard('canDeleteTask', () => onDelete(task.id))} className="p-1.5 text-[#434655] dark:text-[#c4c8e8] hover:text-[#93000a] hover:bg-[#ffdad6] rounded-lg transition" title="Eliminar">
            <span className="material-symbols-outlined text-base">delete</span>
          </button>
        </div>
      </div>

      {task.description && <p className="text-xs text-[#434655] dark:text-[#c4c8e8] line-clamp-2">{task.description}</p>}

      <div className="flex flex-wrap gap-1.5">
        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold text-white" style={{ background: PRIORITY_COLORS[task.priority] }}>
          {PRIORITY_LABELS[task.priority]}
        </span>
        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold text-white" style={{ background: STATUS_COLORS[task.status] }}>
          {STATUS_LABELS[task.status]}
        </span>
        {tags.map((tag) => (
          <span key={tag.id} className="px-2 py-0.5 rounded-full text-[10px] font-semibold text-white" style={{ background: tag.color }}>
            {tag.name}
          </span>
        ))}
      </div>

      {subtasks.length > 0 && (
        <div>
          <div className="h-1 bg-[#edeef0] dark:bg-[#252840] rounded-full overflow-hidden">
            <div className="h-full rounded-full" style={{ width: `${Math.round((completedSubtasks / subtasks.length) * 100)}%`, background: '#004ac6' }} />
          </div>
          <p className="text-[10px] text-[#888] mt-0.5">{completedSubtasks}/{subtasks.length} subtareas</p>
        </div>
      )}

      <div className="flex items-center justify-between pt-2 border-t border-[#edeef0] dark:border-[#252840]">
        {assignedMembers.length > 0 ? (
          <div className="flex items-center gap-1.5">
            <div className="flex -space-x-1.5">
              {assignedMembers.slice(0, 3).map((m) => (
                <div key={m.id} title={m.name} className={`w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-semibold ring-2 ring-white dark:ring-[#1e2030] ${getAvatarColor(m.name)}`}>
                  {getInitials(m.name)}
                </div>
              ))}
              {assignedMembers.length > 3 && (
                <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-semibold bg-[#434655] ring-2 ring-white dark:ring-[#1e2030]">
                  +{assignedMembers.length - 3}
                </div>
              )}
            </div>
            {assignedMembers.length === 1 && (
              <span className="text-xs text-[#434655] dark:text-[#c4c8e8] truncate max-w-[80px]">{assignedMembers[0].name}</span>
            )}
          </div>
        ) : (
          <span className="text-xs text-[#888] italic">Sin asignar</span>
        )}
        <div className="flex items-center gap-2">
          {commentCount > 0 && (
            <span className="flex items-center gap-0.5 text-[10px] text-[#888]">
              <span className="material-symbols-outlined text-xs">chat</span>
              {commentCount}
            </span>
          )}
          {task.dueDate && (
            <span className={`text-xs font-semibold flex items-center gap-0.5 ${overdue ? 'text-[#EF4444]' : soon ? 'text-[#FBBF24]' : 'text-[#434655] dark:text-[#c4c8e8]'}`}>
              {overdue && <span className="material-symbols-outlined text-xs">warning</span>}
              {soon && !overdue && <span className="material-symbols-outlined text-xs">schedule</span>}
              {formatDate(task.dueDate, task.dueTime)}
            </span>
          )}
        </div>
      </div>

      <div onClick={(e) => e.stopPropagation()}>
        <select
          value={task.status}
          onChange={(e) => onStatusChange(task.id, e.target.value)}
          className="w-full text-xs border border-[#c3c6d7] dark:border-[#2e3148] rounded-lg px-2 h-8 bg-[#f3f4f6] dark:bg-[#252840] text-[#191c1e] dark:text-[#e4e6f0] focus:outline-none focus:ring-1 focus:ring-[#004ac6] cursor-pointer"
        >
          <option value="pending">Pendiente</option>
          <option value="in_progress">En Progreso</option>
          <option value="completed">Completada</option>
        </select>
      </div>
    </div>
  )
}
