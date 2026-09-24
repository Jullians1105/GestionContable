import { useEffect, useState } from 'react'
import TaskForm from './TaskForm'
import SubtaskList from './Subtasks/SubtaskList'
import CommentSection from './Comments/CommentSection'
import { useTasks } from '../hooks/useTasks'
import { useToast } from '../context/ToastContext'
import { api } from '../services/api'

export default function TaskModal({ isOpen, task, onClose, forceRecurring = false }) {
  const { addTask, updateTask, getTaskById } = useTasks()
  const { addToast } = useToast()
  const [activeTab, setActiveTab] = useState('form')

  const isEdit = !!task
  const liveTask = task ? getTaskById(task.id) : null

  useEffect(() => {
    document.body.style.overflow = isOpen !== false ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [isOpen])

  if (isOpen === false) return null

  const handleSubmit = async (formData, fondoLink) => {
    if (isEdit) {
      updateTask(task.id, formData)
      addToast('Tarea actualizada', 'success')
      onClose()
    } else {
      try {
        const newTask = await addTask(formData)
        if (fondoLink && newTask?.id) {
          await api.setFondoLink(newTask.id, fondoLink).catch(() => {})
        }
        addToast('Tarea creada', 'success')
        onClose()
      } catch {
        addToast('Error al crear la tarea', 'error')
      }
    }
  }

  const tabs = [
    { id: 'form', label: 'Detalles', icon: 'edit_note' },
    ...(isEdit ? [
      { id: 'subtasks', label: 'Subtareas', icon: 'checklist' },
      { id: 'comments', label: 'Comentarios', icon: 'chat' },
    ] : []),
  ]

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/50" />
      <div className="absolute inset-0 flex items-center justify-center p-4">
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col border border-[#c3c6d7]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#edeef0]">
          <h2 className="text-lg font-bold text-[#191c1e]">
            {isEdit ? 'Editar tarea' : forceRecurring ? 'Nuevo template recurrente' : 'Nueva tarea'}
          </h2>
          <button onClick={onClose} className="p-1.5 text-[#434655] hover:bg-[#edeef0] rounded-lg transition">
            <span className="material-symbols-outlined text-xl">close</span>
          </button>
        </div>

        {tabs.length > 1 && (
          <div className="flex border-b border-[#edeef0] px-6">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-semibold border-b-2 transition -mb-px ${activeTab === tab.id ? 'border-[#004ac6] text-[#004ac6]' : 'border-transparent text-[#434655] hover:text-[#191c1e]'}`}
              >
                <span className="material-symbols-outlined text-sm">{tab.icon}</span>
                {tab.label}
              </button>
            ))}
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {activeTab === 'form' && (
            <TaskForm task={task} onSubmit={handleSubmit} onCancel={onClose} forceRecurring={forceRecurring} />
          )}
          {activeTab === 'subtasks' && liveTask && (
            <SubtaskList task={liveTask} />
          )}
          {activeTab === 'comments' && liveTask && (
            <CommentSection task={liveTask} />
          )}
        </div>
      </div>
      </div>
    </div>
  )
}
