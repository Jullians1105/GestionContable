import { useState } from "react"
import { useTeam } from "../hooks/useTeam"
import { useTasks } from "../hooks/useTasks"
import TeamForm from "./TeamForm"
import { getInitials, getAvatarColor, ROLE_LABELS } from "../utils/helpers"

const ROLE_BADGE = {
  admin: "bg-[#ffdad6] text-[#93000a]",
  leader: "bg-[#dbe1ff] text-[#003ea8]",
  member: "bg-green-100 text-green-800",
  viewer: "bg-[#edeef0] text-[#434655]",
}

export default function TeamManager() {
  const { members, addMember, updateMember, deleteMember } = useTeam()
  const { getTasksByMember } = useTasks()
  const [modalOpen, setModalOpen] = useState(false)
  const [editingMember, setEditingMember] = useState(null)

  const openCreate = () => { setEditingMember(null); setModalOpen(true) }
  const openEdit = (m) => { setEditingMember(m); setModalOpen(true) }

  const handleSubmit = (formData) => {
    if (editingMember) {
      updateMember(editingMember.id, formData)
    } else {
      addMember(formData)
    }
    setModalOpen(false)
    setEditingMember(null)
  }

  const handleDelete = (id) => {
    const taskCount = getTasksByMember(id).length
    const msg = taskCount > 0
      ? `Este miembro tiene ${taskCount} tareas asignadas. Eliminar de todas formas?`
      : "Eliminar este miembro del equipo?"
    if (window.confirm(msg)) deleteMember(id)
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

      {/* Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setModalOpen(false)} />
          <div className="relative bg-white rounded-xl shadow-xl w-full max-w-md border border-[#c3c6d7]">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#edeef0]">
              <h2 className="text-[18px] font-bold text-[#191c1e]">
                {editingMember ? "Editar miembro" : "Nuevo miembro"}
              </h2>
              <button
                onClick={() => setModalOpen(false)}
                className="p-2 text-[#434655] hover:text-[#191c1e] hover:bg-[#edeef0] rounded-lg transition-colors"
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
    </div>
  )
}
