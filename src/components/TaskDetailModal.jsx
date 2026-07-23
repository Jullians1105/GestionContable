import { useEffect, useState } from 'react'
import { useTasks } from '../hooks/useTasks'
import { useAuth } from '../context/AuthContext'
import { useTeam } from '../hooks/useTeam'
import { useTags } from '../context/TagContext'
import { useToast } from '../context/ToastContext'
import { formatDate, formatReminder, isDueDateOverdue, isDueDateSoon, getInitials, getAvatarColor, PRIORITY_LABELS, STATUS_LABELS, normalizeAssignedTo, getTaskProgress } from '../utils/helpers'
import SubtaskList from './Subtasks/SubtaskList'
import CommentSection from './Comments/CommentSection'
import DeleteRequestModal from './DeleteRequestModal'

const PRIORITY_COLORS = { high: '#EF4444', medium: '#FBBF24', low: '#10B981' }
const STATUS_COLORS = { pending: '#888', in_progress: '#004ac6', completed: '#10B981' }
const STATUS_OPTIONS = [
  { value: 'pending', label: 'Pendiente' },
  { value: 'in_progress', label: 'En Progreso' },
  { value: 'completed', label: 'Completada' },
]

export default function TaskDetailModal({ task, onClose, onEdit, scrollToCommentId = null }) {
  const { getTaskById, updateTask, updateMyAssigneeStatus, requestDeleteTask, resolveDeleteRequest } = useTasks()
  const { user, hasPermission } = useAuth()
  const { getMemberById } = useTeam()
  const { getTagById } = useTags()
  const { addToast } = useToast()
  const [showDeleteRequestModal, setShowDeleteRequestModal] = useState(false)
  const [resolvingRequest, setResolvingRequest] = useState(false)

  const liveTask = getTaskById(task?.id) ?? task

  useEffect(() => {
    if (!liveTask) return
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [liveTask])

  if (!liveTask) return null

  const assignedMembers = normalizeAssignedTo(liveTask.assignedTo).map(id => getMemberById(id)).filter(Boolean)
  const tags = (liveTask.tagIds || []).map(getTagById).filter(Boolean)
  const progress = getTaskProgress(liveTask)
  const showAssigneeProgress = progress && progress.total > 1
  const myAssignee = (liveTask.assignees || []).find(a => a.userId === user?.id)
  const overdue = isDueDateOverdue(liveTask.dueDate, liveTask.dueTime) && liveTask.status !== 'completed'
  const soon = isDueDateSoon(liveTask.dueDate, liveTask.dueTime) && liveTask.status !== 'completed'
  const canEdit = hasPermission('canEditTask')
  const canComment = hasPermission('canComment')

  const handleStatusChange = (e) => {
    if (!hasPermission('canEditTask')) {
      addToast('No tienes permiso para cambiar el estado de tareas', 'error')
      return
    }
    updateTask(liveTask.id, { status: e.target.value })
    addToast('Estado actualizado', 'success')
  }

  const handleMyStatusChange = (status) => {
    if (!hasPermission('canEditTask')) {
      addToast('No tienes permiso para cambiar el estado de tareas', 'error')
      return
    }
    updateMyAssigneeStatus(liveTask.id, status)
    addToast('Tu estado se actualizó', 'success')
  }

  const handleDeleteRequest = async (reason) => {
    try {
      await requestDeleteTask(liveTask.id, reason)
      addToast('Solicitud de eliminación enviada', 'success')
      setShowDeleteRequestModal(false)
    } catch (err) {
      addToast(err.message || 'Error al enviar la solicitud', 'error')
    }
  }

  const handleResolveRequest = async (action) => {
    if (resolvingRequest) return
    setResolvingRequest(true)
    try {
      await resolveDeleteRequest(liveTask.id, liveTask.pendingDeleteRequest.id, action)
      addToast(action === 'approve' ? 'Tarea eliminada' : 'Solicitud rechazada', action === 'approve' ? 'info' : 'success')
      if (action === 'approve') onClose()
    } catch (err) {
      addToast(err.message || 'Error al resolver la solicitud', 'error')
    } finally {
      setResolvingRequest(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/60" />

      <div className="absolute inset-0 overflow-y-auto flex items-start justify-center p-4 py-8">
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
            <button
              onClick={() => {
                if (canEdit) { onClose(); onEdit(liveTask) }
                else addToast('No tienes permiso para editar tareas', 'error')
              }}
              className="flex items-center gap-1 h-9 px-3 rounded-lg border border-[#c3c6d7] dark:border-[#2e3148] text-xs font-semibold text-[#434655] dark:text-[#c4c8e8] hover:bg-[#edeef0] dark:hover:bg-[#252840] transition"
            >
              <span className="material-symbols-outlined text-base">edit</span>
              Editar
            </button>
            {!hasPermission('canDeleteTask') && hasPermission('canComment') && !liveTask.pendingDeleteRequest && (
              <button
                onClick={() => setShowDeleteRequestModal(true)}
                className="flex items-center gap-1 h-9 px-3 rounded-lg border border-[#EF4444] text-xs font-semibold text-[#EF4444] hover:bg-[#ffdad6] transition"
                title="Solicitar eliminación"
              >
                <span className="material-symbols-outlined text-base">delete_outline</span>
                Solicitar eliminación
              </button>
            )}
            <button onClick={onClose} className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-[#edeef0] dark:hover:bg-[#252840] transition text-[#434655] dark:text-[#c4c8e8]">
              <span className="material-symbols-outlined text-xl">close</span>
            </button>
          </div>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

          {/* Solicitud de eliminación pendiente */}
          {liveTask.pendingDeleteRequest && (
            <div className="rounded-xl border border-[#EF4444] bg-[#ffdad6]/40 dark:bg-[#3a1a1a] p-4">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="material-symbols-outlined text-[#93000a]" style={{ fontSize: 18 }}>report</span>
                <p className="text-sm font-bold text-[#93000a] dark:text-[#ff9b93]">Solicitud de eliminación pendiente</p>
              </div>
              <p className="text-sm text-[#434655] dark:text-[#c4c8e8] mb-1">
                <strong>{liveTask.pendingDeleteRequest.requestedByName}</strong> pidió eliminar esta tarea:
              </p>
              <p className="text-sm text-[#191c1e] dark:text-[#e4e6f0] italic bg-white/60 dark:bg-black/20 rounded-lg px-3 py-2 mb-3">
                “{liveTask.pendingDeleteRequest.reason}”
              </p>
              {hasPermission('canDeleteTask') ? (
                <div className="flex gap-2">
                  <button
                    onClick={() => handleResolveRequest('approve')}
                    disabled={resolvingRequest}
                    className="flex-1 h-9 rounded-lg text-xs font-semibold text-white disabled:opacity-40 transition hover:opacity-90"
                    style={{ background: '#93000a' }}
                  >
                    Aprobar y eliminar
                  </button>
                  <button
                    onClick={() => handleResolveRequest('reject')}
                    disabled={resolvingRequest}
                    className="flex-1 h-9 rounded-lg text-xs font-semibold border border-[#c3c6d7] dark:border-[#2e3148] text-[#434655] dark:text-[#c4c8e8] disabled:opacity-40 hover:bg-[#edeef0] dark:hover:bg-[#252840] transition"
                  >
                    Rechazar
                  </button>
                </div>
              ) : (
                <p className="text-xs text-[#888] italic">
                  {liveTask.pendingDeleteRequest.requestedBy === user?.id
                    ? 'Tu solicitud está pendiente de revisión.'
                    : 'Pendiente de revisión por un admin o líder.'}
                </p>
              )}
            </div>
          )}

          {/* Meta row */}
          <div className="grid grid-cols-2 gap-4">
            {liveTask.createdByName && (
              <div className="col-span-2 flex items-center gap-2 px-3 py-2 bg-[#f3f4f6] dark:bg-[#252840] rounded-xl">
                <span className="material-symbols-outlined text-[#888]" style={{ fontSize: 15 }}>person</span>
                <span className="text-[10px] font-semibold text-[#888] uppercase tracking-wide">Creado por</span>
                <div className={`w-5 h-5 rounded-full flex items-center justify-center text-white text-[9px] font-bold flex-shrink-0 ${getAvatarColor(liveTask.createdByName)}`}>
                  {getInitials(liveTask.createdByName)}
                </div>
                <span className="text-sm font-semibold text-[#191c1e] dark:text-[#e4e6f0]">{liveTask.createdByName}</span>
              </div>
            )}
            <div className="bg-[#f3f4f6] dark:bg-[#252840] rounded-xl p-3">
              <p className="text-[10px] font-semibold text-[#888] uppercase tracking-wide mb-1">Asignado a</p>
              {assignedMembers.length > 0 ? (
                <div className="flex flex-col gap-1.5">
                  {assignedMembers.map((m) => {
                    const assignee = (liveTask.assignees || []).find(a => a.userId === m.id)
                    return (
                      <div key={m.id} className="flex items-center gap-2">
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-white text-[11px] font-semibold flex-shrink-0 ${getAvatarColor(m.name)}`}>
                          {getInitials(m.name)}
                        </div>
                        <span className="text-sm font-semibold text-[#191c1e] dark:text-[#e4e6f0] flex-1">{m.name}</span>
                        {showAssigneeProgress && assignee && (
                          <span
                            className="px-1.5 py-0.5 rounded-full text-[9px] font-bold text-white"
                            style={{ background: STATUS_COLORS[assignee.status] }}
                          >
                            {STATUS_LABELS[assignee.status]}
                          </span>
                        )}
                      </div>
                    )
                  })}
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
                  {formatDate(liveTask.dueDate, liveTask.dueTime)}
                  {overdue && <span className="text-xs font-normal">(vencida)</span>}
                </span>
              ) : (
                <span className="text-sm text-[#888] italic">Sin fecha</span>
              )}
            </div>
            {liveTask.reminderAt && (
              <div className="col-span-2 bg-[#f3f4f6] dark:bg-[#252840] rounded-xl p-3">
                <p className="text-[10px] font-semibold text-[#888] uppercase tracking-wide mb-1">Recordatorio</p>
                <span className="text-sm font-semibold text-[#b45309] flex items-center gap-1">
                  <span className="material-symbols-outlined text-sm">notifications_active</span>
                  {formatReminder(liveTask.reminderAt)}
                </span>
              </div>
            )}
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
            {showAssigneeProgress && (
              <p className="text-[10px] text-[#888] italic mt-2">
                Este cambio aplica el mismo estado a los {progress.total} asignados. Para marcar solo tu parte, usá “Mi progreso” abajo.
              </p>
            )}
          </div>

          {/* Progreso por asignados (tareas con 2+ personas) */}
          {showAssigneeProgress && (
            <div className="bg-[#f3f4f6] dark:bg-[#252840] rounded-xl p-3">
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-[10px] font-semibold text-[#888] uppercase tracking-wide">Progreso del equipo</p>
                <span className="text-xs font-semibold text-[#191c1e] dark:text-[#e4e6f0]">{progress.completed}/{progress.total} completaron</span>
              </div>
              <div className="h-1.5 bg-[#edeef0] dark:bg-[#1e2030] rounded-full overflow-hidden mb-3">
                <div className="h-full rounded-full transition-all" style={{ width: `${progress.pct}%`, background: '#10B981' }} />
              </div>

              {myAssignee && (
                <>
                  <p className="text-[10px] font-semibold text-[#888] uppercase tracking-wide mb-2">Mi progreso</p>
                  <div className="flex gap-2">
                    {STATUS_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        onClick={() => myAssignee.status !== opt.value && handleMyStatusChange(opt.value)}
                        className="flex-1 h-9 rounded-lg text-xs font-semibold border-2 transition"
                        style={
                          myAssignee.status === opt.value
                            ? { background: STATUS_COLORS[opt.value], color: '#fff', borderColor: STATUS_COLORS[opt.value] }
                            : { background: 'transparent', color: STATUS_COLORS[opt.value], borderColor: STATUS_COLORS[opt.value] + '60' }
                        }
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

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
            {!canComment && (
              <p className="text-xs text-[#888] italic bg-[#f3f4f6] dark:bg-[#252840] rounded-lg px-3 py-2 mb-3 flex items-center gap-1.5">
                <span className="material-symbols-outlined text-sm">lock</span>
                No tienes permiso para agregar comentarios
              </p>
            )}
            <CommentSection task={liveTask} readOnly={!canComment} scrollToCommentId={scrollToCommentId} />
          </div>
        </div>
      </div>
      </div>

      {showDeleteRequestModal && (
        <DeleteRequestModal
          taskTitle={liveTask.title}
          onSubmit={handleDeleteRequest}
          onClose={() => setShowDeleteRequestModal(false)}
        />
      )}
    </div>
  )
}
