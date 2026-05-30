import { useState } from "react"
import { useTeam } from "../hooks/useTeam"
import { useTasks } from "../hooks/useTasks"
import TeamForm from "./TeamForm"
import { getInitials, getAvatarColor, ROLE_LABELS } from "../utils/helpers"
import { useToast } from "../context/ToastContext"

const ROLE_BADGE = {
  admin: "bg-[#ffdad6] text-[#93000a]",
  leader: "bg-[#dbe1ff] text-[#003ea8]",
  member: "bg-green-100 text-green-800",
  viewer: "bg-[#edeef0] text-[#434655]",
}

export default function TeamManager() {
  const { members, addMember, updateMember, deleteMember } = useTeam()
  const { getTasksByMember } = useTasks()
  const { addToast } = useToast()
  const [modalOpen, setModalOpen] = useState(false)
  const [editingMember, setEditingMember] = useState(null)
  const [deleteConfirm, setDeleteConfirm] = useState(null)

  const openCreate = () => { setEditingMember(null); setModalOpen(true) }
  const openEdit = (m) => { setEditingMember(m); setModalOpen(true) }

  const handleSubmit = (formData) => {
    if (editingMember) {
      updateMember(editingMember.id, formData)
      addToast('Miembro actualizado', 'success')
    } else {
      addMember(formData)
      addToast('Miembro agregado al equipo', 'success')
    }
    setModalOpen(false)
    setEditingMember(null)
  }

  const handleDelete = (id) => {
    setDeleteConfirm(id)
  }

  const confirmDelete = () => {
    deleteMember(deleteConfirm)
    addToast('Miembro eliminado', 'info')
    setDeleteConfirm(null)
  }

  return (
    <div className="space-y-6">
      {/* Header bar */}
      <div className="flex items-center justify-between">
        <p className="text-[14px] text-[#434655]">
          <span className="font-semibold text-[#191c1e]">{members.length}</span> miembros en el equipo
        </p>
        <button onClick={openCreate} className="btn-primary">
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>person_add</span>
          Agregar Miembro
        </button>
      </div>

      {/* Member cards grid */}
      {members.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {members.map((m) => {
            const taskCount = getTasksByMember(m.id).length
            return (
              <div key={m.id} className="bg-white p-6 rounded-xl shadow-sm border border-[#c3c6d7] hover:shadow-md transition-shadow flex flex-col items-center text-center">
                {/* Avatar */}
                <div className="relative mb-4">
                  <div className={`w-20 h-20 rounded-full flex items-center justify-center text-white text-2xl font-bold border-4 border-white shadow-sm ${getAvatarColor(m.name)}`}>
                    {getInitials(m.name)}
                  </div>
                  <div className="absolute bottom-0 right-0 w-5 h-5 bg-[#10B981] border-2 border-white rounded-full"></div>
                </div>

                {/* Info */}
                <h3 className="text-[18px] font-bold text-[#191c1e]">{m.name}</h3>
                <p className="text-[14px] text-[#434655] mb-3">{m.email}</p>
                <span className={`text-[11px] font-semibold px-3 py-1 rounded-full mb-4 ${ROLE_BADGE[m.role]}`}>
                  {ROLE_LABELS[m.role]}
                </span>

                {/* Stats */}
                <div className="w-full flex justify-around items-center border-t border-[#edeef0] pt-4 mb-4">
                  <div className="text-center">
                    <span className="block text-[18px] font-bold text-[#004ac6]">{taskCount}</span>
                    <span className="text-[12px] text-[#434655]">Tareas</span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex w-full gap-2">
                  <button
                    onClick={() => openEdit(m)}
                    className="flex-1 h-10 border border-[#c3c6d7] text-[#191c1e] rounded-lg text-[12px] font-semibold hover:bg-[#f3f4f6] transition-colors flex items-center justify-center gap-1"
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: 16 }}>edit</span>
                    Editar
                  </button>
                  <button
                    onClick={() => handleDelete(m.id)}
                    className="w-10 h-10 border border-[#c3c6d7] text-[#93000a] rounded-lg hover:bg-[#ffdad6] hover:border-[#EF4444] transition-colors flex items-center justify-center"
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: 16 }}>delete</span>
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="text-center py-16 text-[#434655]">
          <span className="material-symbols-outlined block mb-3 mx-auto" style={{ fontSize: 48, color: "#c3c6d7" }}>group</span>
          <p className="text-[14px] font-semibold">No hay miembros en el equipo</p>
          <p className="text-[12px] mt-1">Agrega el primer miembro</p>
        </div>
      )}

      {/* Modal editar/crear */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setModalOpen(false)} />
          <div className="relative bg-white dark:bg-[#1e2030] rounded-xl shadow-xl w-full max-w-md border border-[#c3c6d7] dark:border-[#2e3148]">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#edeef0] dark:border-[#2e3148]">
              <h2 className="text-[18px] font-bold text-[#191c1e] dark:text-[#e4e6f0]">
                {editingMember ? "Editar miembro" : "Nuevo miembro"}
              </h2>
              <button
                onClick={() => setModalOpen(false)}
                className="p-2 text-[#434655] hover:text-[#191c1e] hover:bg-[#edeef0] dark:hover:bg-[#252840] rounded-lg transition-colors"
              >
                <span className="material-symbols-outlined" style={{ fontSize: 20 }}>close</span>
              </button>
            </div>
            <div className="px-6 py-4">
              <TeamForm
                member={editingMember}
                onSubmit={handleSubmit}
                onCancel={() => setModalOpen(false)}
              />
            </div>
          </div>
        </div>
      )}

      {/* Modal confirmación eliminar */}
      {deleteConfirm && (() => {
        const m = members.find((x) => x.id === deleteConfirm)
        const taskCount = getTasksByMember(deleteConfirm).length
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/50" onClick={() => setDeleteConfirm(null)} />
            <div className="relative bg-white dark:bg-[#1e2030] rounded-xl shadow-xl w-full max-w-sm border border-[#c3c6d7] dark:border-[#2e3148] p-6">
              <h3 className="text-base font-bold text-[#191c1e] dark:text-[#e4e6f0] mb-2">Eliminar miembro</h3>
              <p className="text-sm text-[#434655] dark:text-[#c4c8e8] mb-4">
                ¿Eliminar a <strong>{m?.name}</strong>?
                {taskCount > 0 && <span className="block mt-1 text-[#FBBF24]">Tiene {taskCount} tarea{taskCount > 1 ? 's' : ''} asignada{taskCount > 1 ? 's' : ''}.</span>}
              </p>
              <div className="flex justify-end gap-3">
                <button onClick={() => setDeleteConfirm(null)} className="btn-secondary">Cancelar</button>
                <button onClick={confirmDelete} className="btn-danger">Eliminar</button>
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
