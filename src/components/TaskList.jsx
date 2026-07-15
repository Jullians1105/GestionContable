import { useState, useEffect } from 'react'
import TaskCard from './TaskCard'
import TaskModal from './TaskModal'
import TaskDetailModal from './TaskDetailModal'
import TaskFilters from './TaskFilters'
import { useTasks } from '../hooks/useTasks'
import { useGroups } from '../context/GroupContext'
import { useToast } from '../context/ToastContext'
import { useAuth } from '../context/AuthContext'
import { normalizeAssignedTo } from '../utils/helpers'

const PAGE_SIZE = 9
const EMPTY_FILTERS = { search: '', status: '', priority: '', assignedTo: '', groupId: '', tagId: '', createdByMe: false }

export default function TaskList({ initialFilters = {}, openTaskId = null, openCommentId = null }) {
  const { tasks, updateTask, deleteTask } = useTasks()
  const { currentGroupId } = useGroups()
  const { addToast } = useToast()
  const { user, hasPermission, isLeader } = useAuth()
  const canSeeAll = isLeader()
  const [filters, setFilters] = useState({ ...EMPTY_FILTERS, ...initialFilters })
  const [modalOpen, setModalOpen] = useState(false)
  const [editingTask, setEditingTask] = useState(null)
  const [detailTask, setDetailTask] = useState(null)
  const [detailCommentId, setDetailCommentId] = useState(null)
  const [page, setPage] = useState(1)
  const [deleteConfirm, setDeleteConfirm] = useState(null)

  useEffect(() => {
    if (!openTaskId || tasks.length === 0) return
    const task = tasks.find(t => t.id === openTaskId)
    if (task) {
      setDetailTask(task)
      setDetailCommentId(openCommentId)
    }
  }, [openTaskId, openCommentId, tasks])

  const filtered = tasks.filter((t) => {
    if (!canSeeAll && !normalizeAssignedTo(t.assignedTo).includes(user?.id)) return false
    if (currentGroupId && t.groupId !== currentGroupId) return false
    if (filters.search) {
      const q = filters.search.toLowerCase()
      if (!t.title.toLowerCase().includes(q) && !t.description?.toLowerCase().includes(q)) return false
    }
    if (filters.status && t.status !== filters.status) return false
    if (filters.priority && t.priority !== filters.priority) return false
    if (filters.assignedTo && !normalizeAssignedTo(t.assignedTo).includes(filters.assignedTo)) return false
    if (filters.groupId && t.groupId !== filters.groupId) return false
    if (filters.tagId && !(t.tagIds || []).includes(filters.tagId)) return false
    if (filters.createdByMe && t.createdBy !== user?.id) return false
    return true
  })

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const handleFilterChange = (newFilters) => { setFilters(newFilters); setPage(1) }
  const openCreate = () => { setEditingTask(null); setModalOpen(true) }
  const openEdit = (task) => { setEditingTask(task); setModalOpen(true) }

  const handleDelete = (id) => { setDeleteConfirm(id) }
  const confirmDelete = () => {
    deleteTask(deleteConfirm)
    addToast('Tarea eliminada', 'info')
    setDeleteConfirm(null)
  }

  const handleStatusChange = (id, status) => {
    if (!hasPermission('canEditTask')) {
      addToast('No tienes permiso para cambiar el estado de tareas', 'error')
      return
    }
    updateTask(id, { status })
    addToast('Estado actualizado', 'success')
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center gap-4 justify-between mb-2">
        <p className="text-sm text-[#434655] dark:text-[#c4c8e8]">
          <span className="font-semibold text-[#191c1e] dark:text-[#e4e6f0]">{filtered.length}</span> {filtered.length === 1 ? 'tarea' : 'tareas'} encontradas
        </p>
        <button
          onClick={() => {
            if (hasPermission('canCreateTask')) openCreate()
            else addToast('No tienes permiso para crear tareas', 'error')
          }}
          className="flex items-center gap-1.5 h-10 px-4 rounded-xl text-sm font-semibold text-white hover:opacity-90 transition shrink-0"
          style={{ background: '#004ac6' }}
        >
          <span className="material-symbols-outlined text-lg">add</span>
          Nueva Tarea
        </button>
      </div>

      {canSeeAll && (
        <TaskFilters filters={filters} onChange={handleFilterChange} onClear={() => { setFilters(EMPTY_FILTERS); setPage(1) }} />
      )}

      {paginated.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {paginated.map((task) => (
            <TaskCard key={task.id} task={task} onEdit={openEdit} onDelete={handleDelete} onStatusChange={handleStatusChange} onView={(t) => { setDetailTask(t); setDetailCommentId(null) }} />
          ))}
        </div>
      ) : (
        <div className="text-center py-16 text-[#434655] dark:text-[#c4c8e8]">
          <span className="material-symbols-outlined block mb-3 mx-auto text-5xl text-[#c3c6d7]">assignment</span>
          <p className="text-sm font-semibold">No hay tareas</p>
          <p className="text-xs mt-1">Crea una nueva tarea o ajusta los filtros</p>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-4">
          <button disabled={page === 1} onClick={() => setPage((p) => p - 1)} className="px-3 h-9 text-xs font-semibold border border-[#c3c6d7] dark:border-[#2e3148] rounded-lg hover:bg-[#f3f4f6] dark:hover:bg-[#252840] disabled:opacity-40 transition">
            Anterior
          </button>
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
            <button key={p} onClick={() => setPage(p)} className={`w-9 h-9 text-xs font-semibold rounded-lg border transition ${p === page ? 'text-white border-[#004ac6]' : 'border-[#c3c6d7] dark:border-[#2e3148] hover:bg-[#f3f4f6] dark:hover:bg-[#252840] text-[#434655] dark:text-[#c4c8e8]'}`} style={p === page ? { background: '#004ac6' } : {}}>
              {p}
            </button>
          ))}
          <button disabled={page === totalPages} onClick={() => setPage((p) => p + 1)} className="px-3 h-9 text-xs font-semibold border border-[#c3c6d7] dark:border-[#2e3148] rounded-lg hover:bg-[#f3f4f6] dark:hover:bg-[#252840] disabled:opacity-40 transition">
            Siguiente
          </button>
        </div>
      )}

      <TaskModal isOpen={modalOpen} task={editingTask} onClose={() => { setModalOpen(false); setEditingTask(null) }} />

      {detailTask && (
        <TaskDetailModal
          task={detailTask}
          scrollToCommentId={detailCommentId}
          onClose={() => { setDetailTask(null); setDetailCommentId(null) }}
          onEdit={(t) => { setDetailTask(null); setDetailCommentId(null); openEdit(t) }}
        />
      )}

      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-[#1e2030] rounded-2xl shadow-2xl p-6 max-w-sm w-full">
            <p className="text-sm text-[#191c1e] dark:text-[#e4e6f0] mb-4">¿Eliminar esta tarea? Esta acción no se puede deshacer.</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteConfirm(null)} className="flex-1 h-10 rounded-lg border border-[#c3c6d7] dark:border-[#2e3148] text-sm font-semibold text-[#434655] dark:text-[#c4c8e8] hover:bg-[#edeef0] dark:hover:bg-[#252840] transition">Cancelar</button>
              <button onClick={confirmDelete} className="flex-1 h-10 rounded-lg text-sm font-semibold text-white hover:opacity-90 transition" style={{ background: '#EF4444' }}>Eliminar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
