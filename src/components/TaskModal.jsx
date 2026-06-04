import { useEffect, useState } from 'react'
import TaskForm from './TaskForm'
import SubtaskList from './Subtasks/SubtaskList'
import CommentSection from './Comments/CommentSection'
import { useTasks } from '../context/TaskContext'
import { useToast } from '../context/ToastContext'

export default function TaskModal({ isOpen, task, onClose }) {
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

  const handleSubmit = (formData) => {
    if (isEdit) {
      updateTask(task.id, formData)
      addToast('Tarea actualizada', 'success')
    } else {
      addTask(formData)
      addToast('Tarea creada', 'success')
    }
    onClose()
  }

  const tabs = [
    { id: 'form', label: 'Detalles', icon: 'edit_note' },
    ...(isEdit ? [
      { id: 'subtasks', label: 'Subtareas', icon: 'checklist' },
      { id: 'comments', label: 'Comentarios', icon: 'chat' },
    ] : []),
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white dark:bg-[#1e2030] rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col border border-[#c3c6d7] dark:border-[#2e3148]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#edeef0] dark:border-[#2e3148]">
          <h2 className="text-lg font-bold text-[#191c1e] dark:text-[#e4e6f0]">
            {isEdit ? 'Editar tarea' : 'Nueva tarea'}
          </h2>
          <button onClick={onClose} className="p-1.5 text-[#434655] hover:bg-[#edeef0] dark:hover:bg-[#252840] rounded-lg transition">
            <span className="material-symbols-outlined text-xl">close</span>
          </button>
        </div>

        {tabs.length > 1 && (
          <div className="flex border-b border-[#edeef0] dark:border-[#2e3148] px-6">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-semibold border-b-2 transition -mb-px ${activeTab === tab.id ? 'border-[#004ac6] text-[#004ac6]' : 'border-transparent text-[#434655] dark:text-[#c4c8e8] hover:text-[#191c1e] dark:hover:text-[#e4e6f0]'}`}
              >
                <span className="material-symbols-outlined text-sm">{tab.icon}</span>
                {tab.label}
              </button>
            ))}
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {activeTab === 'form' && (
            <TaskForm task={task} onSubmit={handleSubmit} onCancel={onClose} />
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
  )
}
