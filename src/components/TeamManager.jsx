import { useState, useMemo } from "react"
import { useTeam } from "../hooks/useTeam"
import { useTasks } from "../hooks/useTasks"
import { useAuth } from "../context/AuthContext"
import TeamForm from "./TeamForm"
import { getInitials, getAvatarColor, ROLE_LABELS } from "../utils/helpers"
import { useToast } from "../context/ToastContext"

const ROLE_BADGE = {
  admin: "bg-[#ffdad6] text-[#93000a]",
  leader: "bg-[#dbe1ff] text-[#003ea8]",
  member: "bg-green-100 text-green-800",
  viewer: "bg-[#edeef0] text-[#434655]",
}

const inputCls = "w-full border border-[#c3c6d7] dark:border-[#2e3148] rounded-lg pl-9 pr-3 h-10 text-[14px] text-[#191c1e] dark:text-[#e4e6f0] bg-white dark:bg-[#252840] focus:outline-none focus:ring-2 focus:ring-[#004ac6]"

function MemberPicker({ allUsers, members, onAdd, onClose }) {
  const [search, setSearch] = useState("")
  const memberIds = useMemo(() => new Set(members.map(m => m.id)), [members])

  const available = useMemo(() =>
    allUsers.filter(u =>
      !memberIds.has(u.id) &&
      (u.name?.toLowerCase().includes(search.toLowerCase()) ||
       u.email?.toLowerCase().includes(search.toLowerCase()))
    ),
    [allUsers, memberIds, search]
  )

  return (
    <div className="flex flex-col gap-4">
      <div className="relative">
        <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[#888] pointer-events-none" style={{ fontSize: 18 }}>search</span>
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar por nombre o email..."
          className={inputCls}
          autoFocus
        />
      </div>

      {available.length === 0 ? (
        <p className="text-center py-8 text-[14px] text-[#888]">
          {allUsers.length === members.length
            ? "Todos los usuarios ya están en el equipo"
            : "No se encontraron usuarios"}
        </p>
      ) : (
        <ul className="max-h-72 overflow-y-auto divide-y divide-[#edeef0] dark:divide-[#2e3148]">
          {available.map(u => (
            <li
              key={u.id}
              onClick={() => onAdd(u)}
              className="flex items-center gap-3 py-3 px-1 rounded-lg hover:bg-[#f3f4f6] dark:hover:bg-[#252840] cursor-pointer transition-colors"
            >
              <div className={`w-9 h-9 rounded-full flex items-center justify-center text-white text-[13px] font-bold flex-shrink-0 ${getAvatarColor(u.name)}`}>
                {getInitials(u.name)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[14px] font-semibold text-[#191c1e] dark:text-[#e4e6f0] truncate">{u.name}</p>
                <p className="text-[12px] text-[#888] truncate">{u.email}</p>
              </div>
              <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${ROLE_BADGE[u.role] ?? ROLE_BADGE.member}`}>
                {ROLE_LABELS[u.role] ?? u.role}
              </span>
              <span className="material-symbols-outlined text-[#004ac6] flex-shrink-0" style={{ fontSize: 20 }}>add_circle</span>
            </li>
          ))}
        </ul>
      )}

      <div className="flex justify-end pt-1">
        <button onClick={onClose} className="btn-secondary">Cerrar</button>
      </div>
    </div>
  )
}

export default function TeamManager() {
  const { members, allUsers, addMember, updateMember, removeFromTeam } = useTeam()
  const { getTasksByMember } = useTasks()
  const { useRealBackend } = useAuth()
  const { addToast } = useToast()
  const [modalOpen, setModalOpen] = useState(false)
  const [editingMember, setEditingMember] = useState(null)
  const [deleteConfirm, setDeleteConfirm] = useState(null)

  const openCreate = () => { setEditingMember(null); setModalOpen(true) }
  const openEdit = (m) => { setEditingMember(m); setModalOpen(true) }
  const closeModal = () => { setModalOpen(false); setEditingMember(null) }

  const handleAdd = async (user) => {
    await addMember({ id: user.id })
    addToast(`${user.name} agregado al equipo`, 'success')
    closeModal()
  }

  const handleSubmit = async (formData) => {
    try {
      if (editingMember) {
        await updateMember(editingMember.id, formData)
        addToast('Miembro actualizado', 'success')
      } else {
        await addMember(formData)
        addToast('Miembro agregado al equipo', 'success')
      }
      closeModal()
    } catch (err) {
      addToast(err.message || 'Error al guardar el miembro', 'error')
    }
  }

  const confirmDelete = () => {
    try {
      removeFromTeam(deleteConfirm)
      addToast('Miembro removido del equipo', 'info')
    } catch (err) {
      addToast(err.message || 'Error al remover', 'error')
    }
    setDeleteConfirm(null)
  }

  const modalTitle = editingMember
    ? "Editar miembro"
    : useRealBackend ? "Agregar al equipo" : "Nuevo miembro"

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-[14px] text-[#434655] dark:text-[#c4c8e8]">
          <span className="font-semibold text-[#191c1e] dark:text-[#e4e6f0]">{members.length}</span> miembros en el equipo
        </p>
        <button onClick={openCreate} className="btn-primary">
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>person_add</span>
          Agregar Miembro
        </button>
      </div>

      {members.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {members.map((m) => {
            const taskCount = getTasksByMember(m.id).length
            return (
              <div key={m.id} className="bg-white dark:bg-[#1e2030] p-6 rounded-xl shadow-sm border border-[#c3c6d7] dark:border-[#2e3148] hover:shadow-md transition-shadow flex flex-col items-center text-center">
                <div className="relative mb-4">
                  <div className={`w-20 h-20 rounded-full flex items-center justify-center text-white text-2xl font-bold border-4 border-white dark:border-[#1e2030] shadow-sm ${getAvatarColor(m.name)}`}>
                    {getInitials(m.name)}
                  </div>
                  <div className="absolute bottom-0 right-0 w-5 h-5 bg-[#10B981] border-2 border-white dark:border-[#1e2030] rounded-full" />
                </div>
                <h3 className="text-[18px] font-bold text-[#191c1e] dark:text-[#e4e6f0]">{m.name}</h3>
                <p className="text-[14px] text-[#434655] dark:text-[#c4c8e8] mb-3">{m.email}</p>
                <span className={`text-[11px] font-semibold px-3 py-1 rounded-full mb-4 ${ROLE_BADGE[m.role]}`}>
                  {ROLE_LABELS[m.role]}
                </span>
                <div className="w-full flex justify-around items-center border-t border-[#edeef0] dark:border-[#2e3148] pt-4 mb-4">
                  <div className="text-center">
                    <span className="block text-[18px] font-bold text-[#004ac6]">{taskCount}</span>
                    <span className="text-[12px] text-[#434655] dark:text-[#c4c8e8]">Tareas</span>
                  </div>
                </div>
                <div className="flex w-full gap-2">
                  <button
                    onClick={() => openEdit(m)}
                    className="flex-1 h-10 border border-[#c3c6d7] dark:border-[#2e3148] text-[#191c1e] dark:text-[#e4e6f0] rounded-lg text-[12px] font-semibold hover:bg-[#f3f4f6] dark:hover:bg-[#252840] transition-colors flex items-center justify-center gap-1"
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: 16 }}>edit</span>
                    Editar
                  </button>
                  <button
                    onClick={() => setDeleteConfirm(m.id)}
                    title={useRealBackend ? "Remover del equipo" : "Eliminar"}
                    className="w-10 h-10 border border-[#c3c6d7] dark:border-[#2e3148] text-[#93000a] rounded-lg hover:bg-[#ffdad6] hover:border-[#EF4444] transition-colors flex items-center justify-center"
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                      {useRealBackend ? "person_remove" : "delete"}
                    </span>
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="text-center py-16 text-[#434655] dark:text-[#c4c8e8]">
          <span className="material-symbols-outlined block mb-3 mx-auto" style={{ fontSize: 48, color: "#c3c6d7" }}>group</span>
          <p className="text-[14px] font-semibold">No hay miembros en el equipo</p>
          <p className="text-[12px] mt-1">
            {useRealBackend ? "Agrega miembros desde las cuentas existentes" : "Agrega el primer miembro"}
          </p>
        </div>
      )}

      {/* Modal agregar / editar */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={closeModal} />
          <div className="relative bg-white dark:bg-[#1e2030] rounded-xl shadow-xl w-full max-w-md border border-[#c3c6d7] dark:border-[#2e3148]">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#edeef0] dark:border-[#2e3148]">
              <h2 className="text-[18px] font-bold text-[#191c1e] dark:text-[#e4e6f0]">{modalTitle}</h2>
              <button onClick={closeModal} className="p-2 text-[#434655] dark:text-[#c4c8e8] hover:bg-[#edeef0] dark:hover:bg-[#252840] rounded-lg transition-colors">
                <span className="material-symbols-outlined" style={{ fontSize: 20 }}>close</span>
              </button>
            </div>
            <div className="px-6 py-4">
              {useRealBackend && !editingMember ? (
                <MemberPicker allUsers={allUsers} members={members} onAdd={handleAdd} onClose={closeModal} />
              ) : (
                <TeamForm member={editingMember} onSubmit={handleSubmit} onCancel={closeModal} />
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal confirmación remover / eliminar */}
      {deleteConfirm && (() => {
        const m = members.find(x => x.id === deleteConfirm)
        const taskCount = getTasksByMember(deleteConfirm).length
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/50" onClick={() => setDeleteConfirm(null)} />
            <div className="relative bg-white dark:bg-[#1e2030] rounded-xl shadow-xl w-full max-w-sm border border-[#c3c6d7] dark:border-[#2e3148] p-6">
              <h3 className="text-base font-bold text-[#191c1e] dark:text-[#e4e6f0] mb-2">
                {useRealBackend ? "Remover del equipo" : "Eliminar miembro"}
              </h3>
              <p className="text-sm text-[#434655] dark:text-[#c4c8e8] mb-4">
                {useRealBackend
                  ? <>¿Remover a <strong>{m?.name}</strong> del equipo? Su cuenta no será eliminada.</>
                  : <>¿Eliminar a <strong>{m?.name}</strong>?</>}
                {taskCount > 0 && (
                  <span className="block mt-1 text-[#FBBF24]">
                    Tiene {taskCount} tarea{taskCount > 1 ? 's' : ''} asignada{taskCount > 1 ? 's' : ''}.
                  </span>
                )}
              </p>
              <div className="flex justify-end gap-3">
                <button onClick={() => setDeleteConfirm(null)} className="btn-secondary">Cancelar</button>
                <button onClick={confirmDelete} className="btn-danger">
                  {useRealBackend ? "Remover" : "Eliminar"}
                </button>
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
