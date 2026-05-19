import { useEffect } from "react"
import TaskForm from "./TaskForm"

export default function TaskModal({ isOpen, task, onSubmit, onClose }) {
  useEffect(() => {
    document.body.style.overflow = isOpen ? "hidden" : ""
    return () => { document.body.style.overflow = "" }
  }, [isOpen])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto border border-[#c3c6d7]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#edeef0]">
          <h2 className="text-[18px] font-bold text-[#191c1e]">
            {task ? "Editar tarea" : "Nueva tarea"}
          </h2>
          <button
            onClick={onClose}
            className="p-2 text-[#434655] hover:text-[#191c1e] hover:bg-[#edeef0] rounded-lg transition-colors"
          >
            <span className="material-symbols-outlined" style={{ fontSize: 20 }}>close</span>
          </button>
        </div>
        <div className="px-6 py-4">
          <TaskForm task={task} onSubmit={onSubmit} onCancel={onClose} />
        </div>
      </div>
    </div>
  )
}
