import { useState } from 'react'
import TaskCard from './TaskCard'
import TaskModal from './TaskModal'
import TaskFilters from './TaskFilters'
import { useTasks } from '../hooks/useTasks'

const PAGE_SIZE = 9

const EMPTY_FILTERS = { search: '', status: '', priority: '', assignedTo: '' }

export default function TaskList({ initialFilters = {} }) {
  const { tasks, addTask, updateTask, deleteTask } = useTasks()
  const [filters, setFilters] = useState({ ...EMPTY_FILTERS, ...initialFilters })
  const [modalOpen, setModalOpen] = useState(false)
  const [editingTask, setEditingTask] = useState(null)
  const [page, setPage] = useState(1)

  const filtered = tasks.filter((t) => {
    if (filters.search) {
      const q = filters.search.toLowerCase()
      if (!t.title.toLowerCase().includes(q) && !t.description?.toLowerCase().includes(q)) return false
    }
    if (filters.status && t.status !== filters.status) return false
    if (filters.priority && t.priority !== filters.priority) return false
    if (filters.assignedTo && t.assignedTo !== filters.assignedTo) return false
    return true
  })

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const handleFilterChange = (newFilters) => {
    setFilters(newFilters)
    setPage(1)
  }

  const openCreate = () => {
    setEditingTask(null)
    setModalOpen(true)
  }

  const openEdit = (task) => {
    setEditingTask(task)
    setModalOpen(true)
  }

  const handleSubmit = (formData) => {
    if (editingTask) {
      updateTask(editingTask.id, formData)
    } else {
      addTask(formData)
    }
    setModalOpen(false)
    setEditingTask(null)
  }

  const handleDelete = (id) => {
    if (window.confirm('¿Eliminar esta tarea?')) {
      deleteTask(id)
    }
  }

  const handleStatusChange = (id, status) => {
    updateTask(id, { status })
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-4 justify-between">
        <div className="flex-1">
          <TaskFilters
            filters={filters}
            onChange={handleFilterChange}
            onClear={() => { setFilters(EMPTY_FILTERS); setPage(1) }}
          />
        </div>
        <button onClick={openCreate} className="btn-primary shrink-0 flex items-center gap-2">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Nueva Tarea
        </button>
      </div>

      {/* Results count */}
      <p className="text-sm text-gray-500">
        {filtered.length} {filtered.length === 1 ? 'tarea' : 'tareas'} encontradas
      </p>

      {/* Grid */}
      {paginated.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {paginated.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              onEdit={openEdit}
              onDelete={handleDelete}
              onStatusChange={handleStatusChange}
            />
          ))}
        </div>
      ) : (
        <div className="text-center py-16 text-gray-400">
          <svg className="w-12 h-12 mx-auto mb-3 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
          <p className="font-medium">No hay tareas</p>
          <p className="text-sm mt-1">Crea una nueva tarea o ajusta los filtros</p>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-2">
          <button
            disabled={page === 1}
            onClick={() => setPage((p) => p - 1)}
            className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Anterior
          </button>
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
            <button
              key={p}
              onClick={() => setPage(p)}
              className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                p === page
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'border-gray-200 hover:bg-gray-50'
              }`}
            >
              {p}
            </button>
          ))}
          <button
            disabled={page === totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Siguiente
          </button>
        </div>
      )}

      <TaskModal
        isOpen={modalOpen}
        task={editingTask}
        onSubmit={handleSubmit}
        onClose={() => { setModalOpen(false); setEditingTask(null) }}
      />
    </div>
  )
}
