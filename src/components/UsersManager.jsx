import React, { useState, useMemo } from 'react'
import { useTeam } from '../hooks/useTeam'
import { useToast } from '../context/ToastContext'
import { useAuth } from '../context/AuthContext'
import { useGroups } from '../context/GroupContext'
import { validators } from '../utils/validators'
import { getAvatarColor, ROLE_LABELS } from '../utils/helpers'
import { PERMISSIONS, getEffectivePermissions } from '../utils/permissions'

const TASK_PERMS = [
  { key: 'canCreateTask',   icon: 'add_task',        label: 'Crear tareas' },
  { key: 'canEditTask',     icon: 'edit_note',       label: 'Editar tareas' },
  { key: 'canDeleteTask',   icon: 'delete',          label: 'Eliminar tareas' },
  { key: 'canComment',      icon: 'chat',            label: 'Comentar' },
  { key: 'canViewReports',  icon: 'bar_chart',       label: 'Ver reportes' },
  { key: 'canManageGroups', icon: 'group_work',      label: 'Gestionar grupos' },
]

const FONDO_PERMS = [
  { key: 'canEditar',      icon: 'edit',            label: 'Editar macroprocesos' },
  { key: 'canGestionar',   icon: 'corporate_fare',  label: 'Gestionar empresas' },
  { key: 'canEditarPagos', icon: 'payments',        label: 'Editar pagos' },
]

function getFondoPerm(user, key) {
  return user.permissions?.modulos?.fondoEmprender?.[key] ?? false
}

const ROLE_OPTIONS = [
  { value: 'admin', label: 'Administrador' },
  { value: 'leader', label: 'Líder' },
  { value: 'member', label: 'Miembro' },
  { value: 'viewer', label: 'Viewer' },
]

const ROLE_COLORS = {
  admin: 'bg-[#fce7f3] text-[#9d174d] dark:bg-[#4a1630] dark:text-[#f9a8d4]',
  leader: 'bg-[#e0e7ff] text-[#3730a3] dark:bg-[#1e1b4b] dark:text-[#a5b4fc]',
  member: 'bg-[#dcfce7] text-[#166534] dark:bg-[#14532d] dark:text-[#86efac]',
  viewer: 'bg-[#f3f4f6] text-[#374151] dark:bg-[#252840] dark:text-[#c4c8e8]',
}

const EMPTY_FORM = { name: '', email: '', role: '', password: '' }

const ROLE_ORDER = { admin: 0, leader: 1, member: 2, viewer: 3 }

const labelCls = 'block text-xs font-semibold text-[#434655] dark:text-[#c4c8e8] mb-1.5'
const inputCls = 'w-full border border-[#c3c6d7] dark:border-[#2e3148] rounded-lg px-3 h-10 text-sm text-[#191c1e] dark:text-[#e4e6f0] bg-[#edeef0] dark:bg-[#252840] focus:outline-none focus:ring-2 focus:ring-[#004ac6] transition'
const inputErrCls = 'border-[#EF4444] focus:ring-[#EF4444]'

export default function UsersManager() {
  const { members, createUser, updateMember, deleteMember } = useTeam()
  const { addToast } = useToast()
  const { isAdmin } = useAuth()
  const { groups } = useGroups()
  const showPermCols = isAdmin()

  const fondoGroup = groups?.find(g => g.name === 'Fondo Emprender')
  const isFondoMember = (userId) => fondoGroup?.memberIds?.includes(userId) ?? false

  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState(null)
  const [sortDir, setSortDir] = useState('asc')
  const [modalOpen, setModalOpen] = useState(false)
  const [editingUser, setEditingUser] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [errors, setErrors] = useState({})
  const [deleteConfirm, setDeleteConfirm] = useState(null)
  const [expandedPermsId, setExpandedPermsId] = useState(null)

  const handleSort = (col) => {
    if (sortBy === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortBy(col); setSortDir('asc') }
  }

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    let list = members.filter(m =>
      m.name.toLowerCase().includes(q) || m.email.toLowerCase().includes(q)
    )
    if (sortBy) {
      list = [...list].sort((a, b) => {
        let cmp = 0
        if (sortBy === 'name') cmp = a.name.localeCompare(b.name, 'es')
        if (sortBy === 'role') cmp = (ROLE_ORDER[a.role] ?? 99) - (ROLE_ORDER[b.role] ?? 99)
        if (sortBy === 'date') cmp = new Date(a.createdAt || 0) - new Date(b.createdAt || 0)
        return sortDir === 'asc' ? cmp : -cmp
      })
    }
    return list
  }, [members, search, sortBy, sortDir])

  const openCreate = () => {
    setEditingUser(null)
    setForm(EMPTY_FORM)
    setErrors({})
    setModalOpen(true)
  }

  const openEdit = (user) => {
    setEditingUser(user)
    setForm({ name: user.name, email: user.email, role: user.role, password: '' })
    setErrors({})
    setModalOpen(true)
  }

  const closeModal = () => {
    setModalOpen(false)
    setEditingUser(null)
    setErrors({})
  }

  const handleChange = (field, value) => {
    setForm(prev => ({ ...prev, [field]: value }))
    if (errors[field]) setErrors(prev => ({ ...prev, [field]: null }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const errs = validators.validateMember(form)
    if (!editingUser && !form.password.trim()) {
      errs.password = 'La contraseña es obligatoria'
    } else if (form.password.trim() && form.password.trim().length < 8) {
      errs.password = 'Mínimo 8 caracteres'
    }
    if (Object.keys(errs).length > 0) { setErrors(errs); return }

    try {
      if (editingUser) {
        const updates = { name: form.name, email: form.email, role: form.role }
        if (form.password.trim()) updates.password = form.password
        await updateMember(editingUser.id, updates)
        addToast('Usuario actualizado', 'success')
      } else {
        await createUser({ name: form.name, email: form.email, role: form.role, password: form.password })
        addToast('Usuario creado', 'success')
      }
      closeModal()
    } catch (err) {
      addToast(err.message || 'Error al guardar el usuario', 'error')
    }
  }

  const handleTogglePermission = async (user, key) => {
    const effective = getEffectivePermissions(user)
    const updated = {
      ...effective,
      [key]: !effective[key],
      // preservar permisos de módulos externos (ej: Fondo Emprender)
      ...(user.permissions?.modulos ? { modulos: user.permissions.modulos } : {}),
    }
    try {
      await updateMember(user.id, { permissions: updated })
    } catch (err) {
      addToast(err.message || 'Error al actualizar permisos', 'error')
    }
  }

  const handleToggleFondoPerm = async (user, key) => {
    const currentModulos = user.permissions?.modulos ?? {}
    const current = currentModulos.fondoEmprender?.[key] ?? false
    const updated = {
      ...(user.permissions ?? {}),
      modulos: {
        ...currentModulos,
        fondoEmprender: { ...currentModulos.fondoEmprender, [key]: !current },
      },
    }
    try {
      await updateMember(user.id, { permissions: updated })
    } catch (err) {
      addToast(err.message || 'Error al actualizar permisos de Fondo', 'error')
    }
  }

  const handleDelete = async (userId) => {
    try {
      await deleteMember(userId)
      setDeleteConfirm(null)
      addToast('Usuario eliminado', 'success')
    } catch (err) {
      addToast(err.message || 'Error al eliminar el usuario', 'error')
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-xl font-bold text-[#191c1e] dark:text-[#e4e6f0]">Gestión de Usuarios</h2>
          <p className="text-sm text-[#434655] dark:text-[#c4c8e8] mt-0.5">
            {members.length} usuario{members.length !== 1 ? 's' : ''} registrado{members.length !== 1 ? 's' : ''}
          </p>
        </div>
        <button
          onClick={openCreate}
          className="h-10 px-4 rounded-lg text-sm font-semibold text-white flex items-center gap-2 hover:opacity-90 transition"
          style={{ background: '#004ac6' }}
        >
          <span className="material-symbols-outlined text-base">person_add</span>
          Nuevo usuario
        </button>
      </div>

      <div className="relative">
        <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[#434655] dark:text-[#c4c8e8] text-lg pointer-events-none">search</span>
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar por nombre o email..."
          className="w-full border border-[#c3c6d7] dark:border-[#2e3148] rounded-lg pl-10 pr-4 h-10 text-sm text-[#191c1e] dark:text-[#e4e6f0] bg-white dark:bg-[#1e2030] focus:outline-none focus:ring-2 focus:ring-[#004ac6] transition"
        />
      </div>

      <div className="rounded-xl border border-[#c3c6d7] dark:border-[#2e3148] overflow-hidden overflow-x-auto">
        <table className="w-full min-w-[480px] text-sm">
          <thead className="bg-[#edeef0] dark:bg-[#252840]">
            <tr>
              {[
                { col: 'name', label: 'Usuario', cls: 'text-left' },
                { col: 'role', label: 'Rol', cls: 'text-left' },
                { col: 'date', label: 'Creado', cls: 'text-left hidden sm:table-cell' },
              ].map(({ col, label, cls }) => (
                <th
                  key={col}
                  onClick={() => handleSort(col)}
                  className={`${cls} px-4 py-3 text-xs font-semibold text-[#434655] dark:text-[#c4c8e8] cursor-pointer select-none hover:text-[#004ac6] dark:hover:text-[#a5b4fc] transition`}
                >
                  <span className="inline-flex items-center gap-1">
                    {label}
                    <span className={`material-symbols-outlined text-xs ${sortBy === col ? 'text-[#004ac6]' : 'opacity-30'}`}>
                      {sortBy === col ? (sortDir === 'asc' ? 'keyboard_arrow_up' : 'keyboard_arrow_down') : 'unfold_more'}
                    </span>
                  </span>
                </th>
              ))}
              {showPermCols && (
                <th className="px-4 py-3 text-xs font-semibold text-[#434655] dark:text-[#c4c8e8] text-left hidden lg:table-cell">
                  Gestor de Tareas
                </th>
              )}
              {showPermCols && (
                <th className="px-4 py-3 text-xs font-semibold text-[#434655] dark:text-[#c4c8e8] text-left hidden lg:table-cell">
                  Fondo Emprender
                </th>
              )}
              <th className="px-4 py-3 text-xs font-semibold text-[#434655] dark:text-[#c4c8e8] text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#edeef0] dark:divide-[#2e3148]">
            {filtered.length === 0 && (
              <tr>
                <td colSpan={showPermCols ? 6 : 4} className="text-center py-10 text-sm text-[#434655] dark:text-[#c4c8e8]">
                  No se encontraron usuarios
                </td>
              </tr>
            )}
            {filtered.map(user => {
              const isExpanded = expandedPermsId === user.id
              const effectivePerms = getEffectivePermissions(user)
              return (
                <React.Fragment key={user.id}>
                  <tr className="bg-white dark:bg-[#1e2030] hover:bg-[#f8f9ff] dark:hover:bg-[#252840] transition">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div
                          className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                          style={{ background: getAvatarColor(user.name) }}
                        >
                          {user.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-semibold text-[#191c1e] dark:text-[#e4e6f0]">{user.name}</p>
                          <p className="text-xs text-[#434655] dark:text-[#c4c8e8]">{user.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${ROLE_COLORS[user.role] ?? ROLE_COLORS.viewer}`}>
                        {ROLE_LABELS[user.role] ?? user.role}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-[#434655] dark:text-[#c4c8e8] hidden sm:table-cell">
                      {user.createdAt ? new Date(user.createdAt).toLocaleDateString('es-ES') : '—'}
                    </td>

                    {/* ── Gestor de Tareas perms ─────────────────────── */}
                    {showPermCols && (
                      <td className="px-4 py-3 hidden lg:table-cell">
                        <div className="flex flex-wrap gap-1">
                          {TASK_PERMS.map(({ key, icon, label }) => {
                            const active = effectivePerms[key] ?? false
                            return (
                              <button
                                key={key}
                                title={label}
                                onClick={() => handleTogglePermission(user, key)}
                                className="w-6 h-6 rounded flex items-center justify-center transition hover:scale-110"
                                style={{
                                  background: active ? '#dcfce7' : '#f3f4f6',
                                  color:      active ? '#16a34a' : '#9ca3af',
                                }}
                              >
                                <span className="material-symbols-outlined" style={{ fontSize: 13 }}>{icon}</span>
                              </button>
                            )
                          })}
                        </div>
                      </td>
                    )}

                    {/* ── Fondo Emprender perms ──────────────────────── */}
                    {showPermCols && (
                      <td className="px-4 py-3 hidden lg:table-cell">
                        {isFondoMember(user.id) ? (
                          <div className="flex flex-wrap gap-1">
                            {FONDO_PERMS.map(({ key, icon, label }) => {
                              const active = getFondoPerm(user, key)
                              return (
                                <button
                                  key={key}
                                  title={label}
                                  onClick={() => handleToggleFondoPerm(user, key)}
                                  className="w-6 h-6 rounded flex items-center justify-center transition hover:scale-110"
                                  style={{
                                    background: active ? '#dcfce7' : '#f3f4f6',
                                    color:      active ? '#16a34a' : '#9ca3af',
                                  }}
                                >
                                  <span className="material-symbols-outlined" style={{ fontSize: 13 }}>{icon}</span>
                                </button>
                              )
                            })}
                          </div>
                        ) : (
                          <span className="text-xs text-[#c3c6d7] dark:text-[#3a3f5c]">—</span>
                        )}
                      </td>
                    )}

                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        {showPermCols && (
                          <button
                            onClick={() => setExpandedPermsId(isExpanded ? null : user.id)}
                            className={`flex items-center gap-1 px-2 h-7 rounded-lg text-xs font-semibold border transition ${isExpanded ? 'bg-[#004ac6] text-white border-[#004ac6]' : 'border-[#c3c6d7] dark:border-[#2e3148] text-[#434655] dark:text-[#c4c8e8] hover:bg-[#edeef0] dark:hover:bg-[#252840]'}`}
                            title="Permisos"
                          >
                            <span className="material-symbols-outlined text-sm">shield</span>
                            <span className="hidden sm:inline">Permisos</span>
                          </button>
                        )}
                        <button
                          onClick={() => openEdit(user)}
                          className="p-1.5 rounded-lg hover:bg-[#edeef0] dark:hover:bg-[#252840] text-[#434655] dark:text-[#c4c8e8] transition"
                          title="Editar"
                        >
                          <span className="material-symbols-outlined text-base">edit</span>
                        </button>
                        {deleteConfirm === user.id ? (
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => handleDelete(user.id)}
                              className="px-2 h-7 rounded-lg text-xs font-semibold text-white bg-[#EF4444] hover:opacity-90 transition"
                            >
                              Confirmar
                            </button>
                            <button
                              onClick={() => setDeleteConfirm(null)}
                              className="px-2 h-7 rounded-lg text-xs font-semibold border border-[#c3c6d7] dark:border-[#2e3148] text-[#434655] dark:text-[#c4c8e8] hover:bg-[#edeef0] dark:hover:bg-[#252840] transition"
                            >
                              Cancelar
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setDeleteConfirm(user.id)}
                            className="p-1.5 rounded-lg hover:bg-[#fce7f3] dark:hover:bg-[#4a1630] text-[#434655] hover:text-[#EF4444] dark:text-[#c4c8e8] transition"
                            title="Eliminar"
                          >
                            <span className="material-symbols-outlined text-base">delete</span>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr className="bg-[#f8f9ff] dark:bg-[#181a2e]">
                      <td colSpan={showPermCols ? 6 : 4} className="px-6 py-4 space-y-4">
                        {/* Gestor de Tareas */}
                        <div>
                          <p className="text-xs font-semibold text-[#434655] dark:text-[#c4c8e8] mb-3 flex items-center gap-1.5">
                            <span className="material-symbols-outlined text-sm">shield</span>
                            Permisos de {user.name}
                            {user.permissions && Object.keys(user.permissions).length > 0 && (
                              <span className="ml-1 px-1.5 py-0.5 rounded bg-[#004ac6] text-white text-[10px]">personalizados</span>
                            )}
                          </p>
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                            {PERMISSIONS.map(({ key, label }) => (
                              <label
                                key={key}
                                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white dark:bg-[#1e2030] border border-[#c3c6d7] dark:border-[#2e3148] cursor-pointer hover:border-[#004ac6] transition select-none"
                              >
                                <input
                                  type="checkbox"
                                  checked={effectivePerms[key] ?? false}
                                  onChange={() => handleTogglePermission(user, key)}
                                  className="accent-[#004ac6] w-3.5 h-3.5 flex-shrink-0"
                                />
                                <span className="text-xs text-[#191c1e] dark:text-[#e4e6f0]">{label}</span>
                              </label>
                            ))}
                          </div>
                        </div>

                        {/* Fondo Emprender — solo si el usuario es miembro del grupo */}
                        {isFondoMember(user.id) && (
                          <div>
                            <p className="text-xs font-semibold text-[#434655] dark:text-[#c4c8e8] mb-3 flex items-center gap-1.5">
                              <span className="material-symbols-outlined text-sm">corporate_fare</span>
                              Fondo Emprender
                            </p>
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                              {FONDO_PERMS.map(({ key, icon, label }) => (
                                <label
                                  key={key}
                                  className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white dark:bg-[#1e2030] border border-[#c3c6d7] dark:border-[#2e3148] cursor-pointer hover:border-[#004ac6] transition select-none"
                                >
                                  <input
                                    type="checkbox"
                                    checked={getFondoPerm(user, key)}
                                    onChange={() => handleToggleFondoPerm(user, key)}
                                    className="accent-[#004ac6] w-3.5 h-3.5 flex-shrink-0"
                                  />
                                  <span className="material-symbols-outlined text-[#8890b5]" style={{ fontSize: 13 }}>{icon}</span>
                                  <span className="text-xs text-[#191c1e] dark:text-[#e4e6f0]">{label}</span>
                                </label>
                              ))}
                            </div>
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              )
            })}
          </tbody>
        </table>
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={closeModal} />
          <div className="relative bg-white dark:bg-[#1e2030] rounded-2xl shadow-2xl w-full max-w-md border border-[#c3c6d7] dark:border-[#2e3148]">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#edeef0] dark:border-[#2e3148]">
              <h3 className="text-base font-bold text-[#191c1e] dark:text-[#e4e6f0]">
                {editingUser ? 'Editar usuario' : 'Nuevo usuario'}
              </h3>
              <button onClick={closeModal} className="p-1.5 rounded-lg hover:bg-[#edeef0] dark:hover:bg-[#252840] text-[#434655] dark:text-[#c4c8e8] transition">
                <span className="material-symbols-outlined text-xl">close</span>
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className={labelCls}>Nombre <span className="text-[#EF4444]">*</span></label>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => handleChange('name', e.target.value)}
                  placeholder="Nombre completo"
                  className={`${inputCls} ${errors.name ? inputErrCls : ''}`}
                />
                {errors.name && <p className="text-[#EF4444] text-xs mt-1">{errors.name}</p>}
              </div>
              <div>
                <label className={labelCls}>Email <span className="text-[#EF4444]">*</span></label>
                <input
                  type="email"
                  value={form.email}
                  onChange={e => handleChange('email', e.target.value)}
                  placeholder="correo@empresa.com"
                  className={`${inputCls} ${errors.email ? inputErrCls : ''}`}
                />
                {errors.email && <p className="text-[#EF4444] text-xs mt-1">{errors.email}</p>}
              </div>
              <div>
                <label className={labelCls}>Rol <span className="text-[#EF4444]">*</span></label>
                <select
                  value={form.role}
                  onChange={e => handleChange('role', e.target.value)}
                  className={`${inputCls} ${errors.role ? inputErrCls : ''}`}
                >
                  <option value="">Seleccionar rol...</option>
                  {ROLE_OPTIONS.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
                {errors.role && <p className="text-[#EF4444] text-xs mt-1">{errors.role}</p>}
              </div>
              <div>
                <label className={labelCls}>
                  Contraseña{' '}
                  {editingUser
                    ? <span className="text-[#434655] dark:text-[#8b8fa8] font-normal">(dejar vacío para no cambiar)</span>
                    : <span className="text-[#EF4444]">*</span>
                  }
                </label>
                <input
                  type="password"
                  value={form.password}
                  onChange={e => handleChange('password', e.target.value)}
                  placeholder={editingUser ? '••••••••' : 'Contraseña'}
                  className={`${inputCls} ${errors.password ? inputErrCls : ''}`}
                />
                {errors.password && <p className="text-[#EF4444] text-xs mt-1">{errors.password}</p>}
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeModal}
                  className="h-10 px-4 rounded-lg border border-[#c3c6d7] dark:border-[#2e3148] text-sm font-semibold text-[#434655] dark:text-[#c4c8e8] hover:bg-[#edeef0] dark:hover:bg-[#252840] transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="h-10 px-4 rounded-lg text-sm font-semibold text-white flex items-center gap-1.5 hover:opacity-90 transition"
                  style={{ background: '#004ac6' }}
                >
                  <span className="material-symbols-outlined text-base">save</span>
                  {editingUser ? 'Guardar cambios' : 'Crear usuario'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
