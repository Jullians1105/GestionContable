import { useEffect } from 'react'
import { useTasks } from '../context/TaskContext'
import { useAuth } from '../context/AuthContext'
import { useTeam } from '../hooks/useTeam'
import { useTags } from '../context/TagContext'
import { useToast } from '../context/ToastContext'
import { formatDate, isDueDateOverdue, isDueDateSoon, getInitials, getAvatarColor, PRIORITY_LABELS, STATUS_LABELS } from '../utils/helpers'
import SubtaskList from './Subtasks/SubtaskList'
import CommentSection from './Comments/CommentSection'

const PRIORITY_COLORS = { high: '#EF4444', medium: '#FBBF24', low: '#10B981' }
const STATUS_COLORS = { pending: '#888', in_progress: '#004ac6', completed: '#10B981' }
const STATUS_OPTIONS = [
  { value: 'pending', label: 'Pendiente' },
  { value: 'in_progress', label: 'En Progreso' },
  { value: 'completed', label: 'Completada' },
]

export default function TaskDetailModal({ task, onClose, onEdit, scrollToCommentId = null }) {
  const { getTaskById, updateTask } = useTasks()
  const { user, isAdmin, isLeader } = useAuth()
  const { getMemberById } = useTeam()
  const { getTagById } = useTags()
  const { addToast } = useToast()

  const liveTask = getTaskById(task?.id) ?? task

  useEffect(() => {
    if (!liveTask) return
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [liveTask])

  if (!liveTask) return null

  const member = liveTask.assignedTo ? getMemberById(liveTask.assignedTo) : null
  const tags = (liveTask.tagIds || []).map(getTagById).filter(Boolean)
  const overdue = isDueDateOverdue(liveTask.dueDate) && liveTask.status !== 'completed'
  const soon = isDueDateSoon(liveTask.dueDate) && liveTask.status !== 'completed'
  const canEdit = isAdmin() || isLeader()
  const canComment = user?.role !== 'viewer'

  const handleStatusChange = (e) => {
    updateTask(liveTask.id, { status: e.target.value })
    addToast('Estado actualizado', 'success')
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 py-8">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-white dark:bg-[#1e2030] rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col border border-[#c3c6d7] dark:border-[#2e3148] animate-in my-auto">

        {/* Header */}
        <div className="flex items-start justify-between px-6 py-5 border-b border-[#edeef0] dark:border-[#2e3148]">
          <div className="flex-1 pr-4">
            <h2 className="text-lg font-bold text-[#191c1e] dark:text-[#e4e6f0] leading-snug mb-2">
              {liveTask.title}
            </h2>
            <div className="flex flex-wrap gap-1.5">
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold text-white" style={{ background: PRIORITY_COLORS[liveTask.priority] }}>
                {PRIORITY_LABELS[liveTask.priority]}
              </span>
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold text-white" style={{ background: STATUS_COLORS[liveTask.status] }}>
                {STATUS_LABELS[liveTask.status]}
              </span>
              {tags.map((tag) => (
                <span key={tag.id} className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold text-white" style={{ background: tag.color }}>
                  {tag.name}
                </span>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {canEdit && (
              <button
                onClick={() => { onClose(); onEdit(liveTask) }}
                className="flex items-center gap-1 h-9 px-3 rounded-lg border border-[#c3c6d7] dark:border-[#2e3148] text-xs font-semibold text-[#434655] dark:text-[#c4c8e8] hover:bg-[#edeef0] dark:hover:bg-[#252840] transition"
              >
                <span className="material-symbols-outlined text-base">edit</span>
                Editar
              </button>
            )}
            <button onClick={onClose} className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-[#edeef0] dark:hover:bg-[#252840] transition text-[#434655] dark:text-[#c4c8e8]">
              <span className="material-symbols-outlined text-xl">close</span>
            </button>
          </div>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

          {/* Meta row */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-[#f3f4f6] dark:bg-[#252840] rounded-xl p-3">
              <p className="text-[10px] font-semibold text-[#888] uppercase tracking-wide mb-1">Asignado a</p>
              {member ? (
                <div className="flex items-center gap-2">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-white text-[11px] font-semibold ${getAvatarColor(member.name)}`}>
                    {getInitials(member.name)}
                  </div>
                  <span className="text-sm font-semibold text-[#191c1e] dark:text-[#e4e6f0]">{member.name}</span>
                </div>
              ) : (
                <span className="text-sm text-[#888] italic">Sin asignar</span>
              )}
            </div>
            <div className="bg-[#f3f4f6] dark:bg-[#252840] rounded-xl p-3">
              <p className="text-[10px] font-semibold text-[#888] uppercase tracking-wide mb-1">Fecha límite</p>
              {liveTask.dueDate ? (
                <span className={`text-sm font-semibold flex items-center gap-1 ${overdue ? 'text-[#EF4444]' : soon ? 'text-[#FBBF24]' : 'text-[#191c1e] dark:text-[#e4e6f0]'}`}>
                  {overdue && <span className="material-symbols-outlined text-sm">warning</span>}
                  {soon && !overdue && <span className="material-symbols-outlined text-sm">schedule</span>}
                  {formatDate(liveTask.dueDate)}
                  {overdue && <span className="text-xs font-normal">(vencida)</span>}
                </span>
              ) : (
                <span className="text-sm text-[#888] italic">Sin fecha</span>
              )}
            </div>
          </div>

          {/* Cambiar estado */}
          <div className="bg-[#f3f4f6] dark:bg-[#252840] rounded-xl p-3">
            <p className="text-[10px] font-semibold text-[#888] uppercase tracking-wide mb-2">Cambiar estado</p>
            <div className="flex gap-2">
              {STATUS_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => liveTask.status !== opt.value && handleStatusChange({ target: { value: opt.value } })}
                  className="flex-1 h-9 rounded-lg text-xs font-semibold border-2 transition"
                  style={
                    liveTask.status === opt.value
                      ? { background: STATUS_COLORS[opt.value], color: '#fff', borderColor: STATUS_COLORS[opt.value] }
                      : { background: 'transparent', color: STATUS_COLORS[opt.value], borderColor: STATUS_COLORS[opt.value] + '60' }
                  }
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Descripción */}
          {liveTask.description && (
            <div>
              <p className="text-[10px] font-semibold text-[#888] uppercase tracking-wide mb-1.5">Descripción</p>
              <p className="text-sm text-[#434655] dark:text-[#c4c8e8] leading-relaxed bg-[#f3f4f6] dark:bg-[#252840] rounded-xl p-3">
                {liveTask.description}
              </p>
            </div>
          )}

          {/* Subtareas */}
          <div className="border-t border-[#edeef0] dark:border-[#2e3148] pt-4">
            <SubtaskList task={liveTask} />
          </div>

          {/* Comentarios */}
          <div className="border-t border-[#edeef0] dark:border-[#2e3148] pt-4">
            <CommentSection task={liveTask} readOnly={!canComment} scrollToCommentId={scrollToCommentId} />
          </div>
        </div>
      </div>
    </div>
  )
}
