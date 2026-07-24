import { useMemo, useState } from 'react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
} from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { useDroppable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { useTasks } from '../hooks/useTasks'
import { useGroups } from '../context/GroupContext'
import { useTeam } from '../hooks/useTeam'
import { normalizeAssignedTo } from '../utils/helpers'
import { useToast } from '../context/ToastContext'
import { useAuth } from '../context/AuthContext'
import { formatDate, isDueDateOverdue, isDueDateSoon, getInitials, getAvatarColor, PRIORITY_LABELS } from '../utils/helpers'

const COLUMNS = [
  { id: 'pending', label: 'Pendiente', icon: 'radio_button_unchecked', bg: 'bg-[#f3f4f6] dark:bg-[#1a1c2e]', border: 'border-[#c3c6d7] dark:border-[#2e3148]', dot: '#888' },
  { id: 'in_progress', label: 'En Progreso', icon: 'pending', bg: 'bg-blue-50 dark:bg-[#1a2040]', border: 'border-blue-200 dark:border-blue-900', dot: '#004ac6' },
  { id: 'completed', label: 'Completada', icon: 'check_circle', bg: 'bg-green-50 dark:bg-[#1a2a20]', border: 'border-green-200 dark:border-green-900', dot: '#10B981' },
]

const PRIORITY_COLORS = { high: '#EF4444', medium: '#FBBF24', low: '#10B981' }

function KanbanCard({ task, members, isDragging }) {
  const assignedIds = normalizeAssignedTo(task.assignedTo)
  const member = members.find((m) => m.id === assignedIds[0])
  const overdue = isDueDateOverdue(task.dueDate, task.dueTime)
  const soon = isDueDateSoon(task.dueDate, task.dueTime)
  const subtasks = task.subtasks || []
  const completed = subtasks.filter((s) => s.completed).length

  return (
    <div className={`bg-white dark:bg-[#1e2030] rounded-xl border border-[#c3c6d7] dark:border-[#2e3148] p-3 shadow-sm cursor-grab transition-all ${isDragging ? 'opacity-50 shadow-lg rotate-2' : 'hover:shadow-md hover:border-[#004ac6]'}`}>
      <div className="flex items-start justify-between gap-2 mb-2">
        <p className="text-sm font-semibold text-[#191c1e] dark:text-[#e4e6f0] leading-snug flex-1">{task.title}</p>
        <span
          className="px-1.5 py-0.5 rounded text-[10px] font-bold text-white flex-shrink-0"
          style={{ background: PRIORITY_COLORS[task.priority] }}
        >
          {PRIORITY_LABELS[task.priority]}
        </span>
      </div>

      {subtasks.length > 0 && (
        <div className="mb-2">
          <div className="h-1 bg-[#edeef0] dark:bg-[#252840] rounded-full overflow-hidden">
            <div className="h-full rounded-full" style={{ width: `${Math.round((completed / subtasks.length) * 100)}%`, background: '#004ac6' }} />
          </div>
          <p className="text-[10px] text-[#888] mt-0.5">{completed}/{subtasks.length} subtareas</p>
        </div>
      )}

      <div className="flex items-center justify-between mt-2">
        {task.dueDate ? (
          <span className={`text-[10px] font-semibold flex items-center gap-0.5 ${overdue ? 'text-[#EF4444]' : soon ? 'text-[#FBBF24]' : 'text-[#888]'}`}>
            <span className="material-symbols-outlined text-xs">calendar_today</span>
            {formatDate(task.dueDate, task.dueTime)}
          </span>
        ) : <span />}
        {member && (
          <div className={`w-6 h-6 rounded-full flex items-center justify-center text-white text-[9px] font-bold flex-shrink-0 ${getAvatarColor(member.name)}`}>
            {getInitials(member.name)}
          </div>
        )}
      </div>
    </div>
  )
}

function SortableKanbanCard({ task, members }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id })
  const style = { transform: CSS.Transform.toString(transform), transition }
  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <KanbanCard task={task} members={members} isDragging={isDragging} />
    </div>
  )
}

function KanbanColumn({ column, tasks, members }) {
  const { setNodeRef } = useDroppable({ id: column.id })
  return (
    <div ref={setNodeRef} className={`flex flex-col rounded-2xl border ${column.bg} ${column.border} min-h-[400px] w-full`}>
      <div className="flex items-center gap-2 px-4 py-3 border-b border-inherit">
        <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: column.dot }} />
        <span className="text-sm font-bold text-[#191c1e] dark:text-[#e4e6f0]">{column.label}</span>
        <span className="ml-auto text-xs text-white font-bold px-2 py-0.5 rounded-full" style={{ background: column.dot }}>{tasks.length}</span>
      </div>
      <div className="flex-1 p-3 space-y-2 overflow-y-auto">
        <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
          {tasks.map((task) => (
            <SortableKanbanCard key={task.id} task={task} members={members} />
          ))}
        </SortableContext>
        {tasks.length === 0 && (
          <div className="flex flex-col items-center justify-center py-8 text-[#c3c6d7]">
            <span className="material-symbols-outlined text-3xl">inbox</span>
            <p className="text-xs mt-1">Sin tareas</p>
          </div>
        )}
      </div>
    </div>
  )
}

export default function KanbanPage() {
  const { tasks, updateTask } = useTasks()
  const { currentGroupId } = useGroups()
  const { members } = useTeam()
  const { addToast } = useToast()
  const { hasPermission, isLeader, user } = useAuth()
  const canSeeAll = isLeader()
  const [activeTask, setActiveTask] = useState(null)

  const filtered = useMemo(() => {
    let result = canSeeAll ? tasks : tasks.filter((t) => normalizeAssignedTo(t.assignedTo).includes(user?.id) || t.createdBy === user?.id)
    if (currentGroupId) result = result.filter((t) => t.groupId === currentGroupId)
    return result
  }, [tasks, currentGroupId, canSeeAll, user])

  const byStatus = useMemo(() => ({
    pending: filtered.filter((t) => t.status === 'pending'),
    in_progress: filtered.filter((t) => t.status === 'in_progress'),
    completed: filtered.filter((t) => t.status === 'completed'),
  }), [filtered])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  )

  const findStatus = (taskId) => {
    for (const col of COLUMNS) {
      if (byStatus[col.id].find((t) => t.id === taskId)) return col.id
    }
    return null
  }

  const handleDragStart = ({ active }) => {
    setActiveTask(tasks.find((t) => t.id === active.id) || null)
  }

  const handleDragEnd = ({ active, over }) => {
    setActiveTask(null)
    if (!over) return
    const fromStatus = findStatus(active.id)
    const toStatus = COLUMNS.find((c) => c.id === over.id)?.id || findStatus(over.id)
    if (!fromStatus || !toStatus || fromStatus === toStatus) return
    if (!hasPermission('canEditTask')) {
      addToast('No tienes permiso para mover tareas', 'error')
      return
    }
    updateTask(active.id, { status: toStatus })
    const col = COLUMNS.find((c) => c.id === toStatus)
    addToast(`Tarea movida a "${col.label}"`, 'success')
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[#191c1e] dark:text-[#e4e6f0]">Tablero Kanban</h1>
          <p className="text-sm text-[#434655] dark:text-[#c4c8e8] mt-0.5">{filtered.length} tareas en total</p>
        </div>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="flex gap-4 items-start overflow-x-auto pb-2 -mx-1 px-1">
          {COLUMNS.map((col) => (
            <div key={col.id} className="min-w-[280px] flex-1">
              <KanbanColumn column={col} tasks={byStatus[col.id]} members={members} />
            </div>
          ))}
        </div>
        <DragOverlay>
          {activeTask && <KanbanCard task={activeTask} members={members} isDragging={false} />}
        </DragOverlay>
      </DndContext>
    </div>
  )
}
