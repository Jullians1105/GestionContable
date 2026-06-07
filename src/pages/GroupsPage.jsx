import { useState } from 'react'
import { useGroups } from '../context/GroupContext'
import { useTeam } from '../hooks/useTeam'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { useTasks } from '../hooks/useTasks'
import GroupForm from '../components/Groups/GroupForm'

function ConfirmModal({ message, onConfirm, onCancel }) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-[#1e2030] rounded-2xl shadow-2xl p-6 max-w-sm w-full">
        <p className="text-sm text-[#191c1e] dark:text-[#e4e6f0] mb-4">{message}</p>
        <div className="flex gap-3">
          <button onClick={onCancel} className="flex-1 h-10 rounded-lg border border-[#c3c6d7] dark:border-[#2e3148] text-sm font-semibold text-[#434655] dark:text-[#c4c8e8] hover:bg-[#edeef0] dark:hover:bg-[#252840] transition">Cancelar</button>
          <button onClick={onConfirm} className="flex-1 h-10 rounded-lg text-sm font-semibold text-white transition hover:opacity-90" style={{ background: '#EF4444' }}>Eliminar</button>
        </div>
      </div>
    </div>
  )
}

export default function GroupsPage() {
  const { groups, deleteGroup } = useGroups()
  const { members } = useTeam()
  const { tasks } = useTasks()
  const { hasPermission } = useAuth()
  const { addToast } = useToast()
  const [showForm, setShowForm] = useState(false)
  const [editGroup, setEditGroup] = useState(null)
  const [deleteId, setDeleteId] = useState(null)

  const canManage = hasPermission('canManageGroups')

  const guardedManage = (fn) => {
    if (canManage) fn()
    else addToast('No tienes permiso para gestionar grupos', 'error')
  }

  const handleDelete = () => {
    deleteGroup(deleteId)
    addToast('Grupo eliminado', 'info')
    setDeleteId(null)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[#191c1e] dark:text-[#e4e6f0]">Grupos de Trabajo</h1>
          <p className="text-sm text-[#434655] dark:text-[#c4c8e8] mt-0.5">{groups.length} grupos activos</p>
        </div>
        <button
          onClick={() => guardedManage(() => setShowForm(true))}
          className="flex items-center gap-2 h-10 px-4 rounded-xl text-sm font-semibold text-white transition hover:opacity-90"
          style={{ background: '#004ac6' }}
        >
          <span className="material-symbols-outlined text-base">add</span>
          Nuevo Grupo
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {groups.map((group) => {
          const leader = members.find((m) => m.id === group.leaderId)
          const groupMembers = members.filter((m) => group.memberIds.includes(m.id))
          const taskCount = tasks.filter((t) => t.groupId === group.id).length

          return (
            <div key={group.id} className="bg-white dark:bg-[#1e2030] rounded-2xl border border-[#c3c6d7] dark:border-[#2e3148] p-5 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white flex-shrink-0" style={{ background: group.color }}>
                    <span className="material-symbols-outlined text-lg">group</span>
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-[#191c1e] dark:text-[#e4e6f0]">{group.name}</h3>
                    {leader && <p className="text-xs text-[#434655] dark:text-[#c4c8e8]">Líder: {leader.name}</p>}
                  </div>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => guardedManage(() => setEditGroup(group))} className="p-1.5 rounded-lg hover:bg-[#edeef0] dark:hover:bg-[#252840] transition">
                    <span className="material-symbols-outlined text-base text-[#434655] dark:text-[#c4c8e8]">edit</span>
                  </button>
                  <button onClick={() => guardedManage(() => setDeleteId(group.id))} className="p-1.5 rounded-lg hover:bg-[#ffdad6] transition">
                    <span className="material-symbols-outlined text-base text-[#EF4444]">delete</span>
                  </button>
                </div>
              </div>

              {group.description && (
                <p className="text-sm text-[#434655] dark:text-[#c4c8e8] mb-3 line-clamp-2">{group.description}</p>
              )}

              <div className="flex items-center justify-between pt-3 border-t border-[#edeef0] dark:border-[#2e3148]">
                <div className="flex items-center gap-1">
                  <div className="flex -space-x-1.5">
                    {groupMembers.slice(0, 4).map((m) => (
                      <div key={m.id} className="w-6 h-6 rounded-full border-2 border-white dark:border-[#1e2030] flex items-center justify-center text-white text-[9px] font-bold bg-blue-500" title={m.name}>
                        {m.name[0]}
                      </div>
                    ))}
                  </div>
                  <span className="text-xs text-[#434655] dark:text-[#c4c8e8] ml-1">{groupMembers.length} miembros</span>
                </div>
                <div className="flex items-center gap-1 text-xs text-[#434655] dark:text-[#c4c8e8]">
                  <span className="material-symbols-outlined text-sm">task_alt</span>
                  {taskCount} tareas
                </div>
              </div>
            </div>
          )
        })}

        {groups.length === 0 && (
          <div className="col-span-full py-20 text-center">
            <span className="material-symbols-outlined text-5xl text-[#c3c6d7]">group_add</span>
            <p className="text-lg font-semibold text-[#434655] dark:text-[#c4c8e8] mt-3">Sin grupos de trabajo</p>
            <p className="text-sm text-[#888] mt-1">Crea el primer grupo para organizar tu equipo</p>
          </div>
        )}
      </div>

      {(showForm || editGroup) && (
        <GroupForm group={editGroup} onClose={() => { setShowForm(false); setEditGroup(null) }} />
      )}

      {deleteId && (
        <ConfirmModal
          message="¿Eliminar este grupo? Las tareas no serán eliminadas."
          onConfirm={handleDelete}
          onCancel={() => setDeleteId(null)}
        />
      )}
    </div>
  )
}
