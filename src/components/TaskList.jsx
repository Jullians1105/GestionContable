import { useState } from "react"
import TaskCard from "./TaskCard"
import TaskModal from "./TaskModal"
import TaskFilters from "./TaskFilters"
import { useTasks } from "../hooks/useTasks"

const PAGE_SIZE = 9

const EMPTY_FILTERS = { search: "", status: "", priority: "", assignedTo: "" }

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

  const openCreate = () => { setEditingTask(null); setModalOpen(true) }
  const openEdit = (task) => { setEditingTask(task); setModalOpen(true) }

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
    if (window.confirm("Eliminar esta tarea?")) deleteTask(id)
  }

  const handleStatusChange = (id, status) => {
    updateTask(id, { status })
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-4 justify-between mb-2">
        <p className="text-[14px] text-[#434655]">
          <span className="font-semibold text-[#191c1e]">{filtered.length}</span> {filtered.length === 1 ? "tarea" : "tareas"} encontradas
        </p>
        <button onClick={openCreate} className="btn-primary shrink-0">
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>add</span>
          Nueva Tarea
        </button>
      </div>

      {/* Filters */}
      <TaskFilters
        filters={filters}
        onChange={handleFilterChange}
        onClear={() => { setFilters(EMPTY_FILTERS); setPage(1) }}
      />

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
        <div className="text-center py-16 text-[#434655]">
          <span className="material-symbols-outlined block mb-3 mx-auto" style={{ fontSize: 48, color: "#c3c6d7" }}>assignment</span>
          <p className="text-[14px] font-semibold">No hay tareas</p>
          <p className="text-[12px] mt-1">Crea una nueva tarea o ajusta los filtros</p>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-4">
          <button
            disabled={page === 1}
            onClick={() => setPage((p) => p - 1)}
            className="px-3 h-9 text-[12px] font-semibold border border-[#c3c6d7] rounded-lg hover:bg-[#f3f4f6] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Anterior
          </button>
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
            <button
              key={p}
              onClick={() => setPage(p)}
              className={`w-9 h-9 text-[12px] font-semibold rounded-lg border transition-colors ${
                p === page
                  ? "bg-[#004ac6] text-white border-[#004ac6]"
                  : "border-[#c3c6d7] hover:bg-[#f3f4f6]"
              }`}
            >
              {p}
            </button>
          ))}
          <button
            disabled={page === totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="px-3 h-9 text-[12px] font-semibold border border-[#c3c6d7] rounded-lg hover:bg-[#f3f4f6] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
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
