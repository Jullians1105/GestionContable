import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../context/AuthContext'
import { useNavigate } from 'react-router-dom'
import { api } from '../services/api'
import { useToast } from '../context/ToastContext'
import { PRIORITY_LABELS } from '../utils/helpers'
import TaskModal from '../components/TaskModal'

const PRIORITY_COLORS = { high: 'bg-[#fef2f2] text-[#EF4444]', medium: 'bg-[#fffbeb] text-[#FBBF24]', low: 'bg-[#f0fdf4] text-[#10B981]' }

export default function RecurringTasksPage() {
  const { isAdmin, isLeader } = useAuth()
  const navigate = useNavigate()
  const { addToast } = useToast()
  const [templates, setTemplates] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editTask, setEditTask] = useState(null)

  // Solo líderes y admin pueden acceder
  useEffect(() => {
    if (!isAdmin() && !isLeader()) navigate('/tasks', { replace: true })
  }, [isAdmin, isLeader, navigate])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await api.getTemplates()
      setTemplates(Array.isArray(data) ? data : [])
    } catch {
      addToast('Error cargando templates recurrentes', 'error')
    } finally {
      setLoading(false)
    }
  }, [addToast])

  useEffect(() => { load() }, [load])

  const handleDelete = async (id) => {
    if (!window.confirm('¿Eliminar este template? Las instancias generadas no se eliminan.')) return
    try {
      await api.deleteTask(id)
      setTemplates(prev => prev.filter(t => t.id !== id))
      addToast('Template eliminado', 'success')
    } catch {
      addToast('Error eliminando template', 'error')
    }
  }

  const handleModalClose = () => {
    setShowModal(false)
    setEditTask(null)
    load()
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[#191c1e] dark:text-[#e4e6f0]">Tareas recurrentes</h1>
          <p className="text-sm text-[#888] mt-0.5">Templates que generan instancias automáticamente al inicio de cada mes</p>
        </div>
        <button
          onClick={() => { setEditTask(null); setShowModal(true) }}
          className="flex items-center gap-2 h-10 px-4 rounded-xl text-sm font-semibold text-white hover:opacity-90 transition"
          style={{ background: '#004ac6' }}
        >
          <span className="material-symbols-outlined text-base">add</span>
          Nuevo template
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <span className="material-symbols-outlined animate-spin text-3xl text-[#004ac6]">progress_activity</span>
        </div>
      ) : templates.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <span className="material-symbols-outlined text-5xl text-[#c3c6d7] dark:text-[#2e3148] mb-3">repeat</span>
          <p className="text-[#888] text-sm">No hay templates recurrentes.</p>
          <p className="text-[#888] text-xs mt-1">Crea uno para automatizar tareas que se repiten cada mes.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {templates.map(t => (
            <div key={t.id} className="bg-white dark:bg-[#1e2030] rounded-xl border border-[#c3c6d7] dark:border-[#2e3148] p-4 flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-[#dbe1ff] dark:bg-[#1e2252] flex items-center justify-center flex-shrink-0">
                <span className="material-symbols-outlined text-[#004ac6]">repeat</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-[#191c1e] dark:text-[#e4e6f0] truncate">{t.title}</p>
                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                  <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${PRIORITY_COLORS[t.priority]}`}>
                    {PRIORITY_LABELS[t.priority]}
                  </span>
                  {(t.recurrence?.start_date || t.recurrence?.end_date) && (
                    <span className="text-[10px] text-[#888] flex items-center gap-0.5">
                      <span className="material-symbols-outlined" style={{ fontSize: 11 }}>date_range</span>
                      {t.recurrence.start_date ?? '∞'} → {t.recurrence.end_date ?? '∞'}
                    </span>
                  )}
                  {t.assignedToName && (
                    <span className="text-[10px] text-[#888] flex items-center gap-0.5">
                      <span className="material-symbols-outlined" style={{ fontSize: 11 }}>person</span>
                      {t.assignedToName}
                    </span>
                  )}
                  {t.groupName && (
                    <span className="text-[10px] text-[#888] flex items-center gap-0.5">
                      <span className="material-symbols-outlined" style={{ fontSize: 11 }}>group_work</span>
                      {t.groupName}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <button
                  onClick={() => { setEditTask(t); setShowModal(true) }}
                  className="p-2 rounded-lg text-[#434655] dark:text-[#c4c8e8] hover:text-[#004ac6] hover:bg-[#dbe1ff] transition"
                  title="Editar"
                >
                  <span className="material-symbols-outlined text-base">edit</span>
                </button>
                <button
                  onClick={() => handleDelete(t.id)}
                  className="p-2 rounded-lg text-[#434655] dark:text-[#c4c8e8] hover:text-[#93000a] hover:bg-[#ffdad6] transition"
                  title="Eliminar"
                >
                  <span className="material-symbols-outlined text-base">delete</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <TaskModal
          task={editTask}
          forceRecurring={!editTask}
          onClose={handleModalClose}
        />
      )}
    </div>
  )
}
