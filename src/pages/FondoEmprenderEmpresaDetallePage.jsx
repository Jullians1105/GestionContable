import { useState, useEffect, useCallback } from 'react'
import { useParams, Link, useSearchParams } from 'react-router-dom'
import { api } from '../services/api'
import { getInitials, getAvatarColor, PRIORITY_LABELS } from '../utils/helpers'

const MONTHS = [
  'Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre',
]

const MACRO_STATUS = {
  pending:     { label: 'Pendiente',   icon: 'radio_button_unchecked', color: '#6b7280', bg: '#f3f4f6' },
  in_progress: { label: 'En progreso', icon: 'timelapse',              color: '#d97706', bg: '#fef9c3' },
  done:        { label: 'Completado',  icon: 'check_circle',           color: '#16a34a', bg: '#dcfce7' },
}

const TASK_STATUS = {
  pending:    { icon: 'radio_button_unchecked', color: '#6b7280' },
  in_progress:{ icon: 'timelapse',              color: '#d97706' },
  completed:  { icon: 'check_circle',           color: '#16a34a' },
}

const PRIORITY_COLORS = { high: '#ef4444', medium: '#f59e0b', low: '#10b981' }

// Responsables fijos por macroproceso (id numérico → lista de { name, note? })
const MACRO_RESPONSABLES = {
  1: [{ name: 'Diego Quintero' }],
  2: [{ name: 'Katerin Pineda' }],
  3: [{ name: 'Diego Quintero' }, { name: 'Daniela Ruiz', note: 'temporal' }],
  4: [{ name: 'Diego Quintero' }],
  5: [{ name: 'Katerin Pineda' }, { name: 'Ruben Parada' }],
  6: [{ name: 'Diana Gutierrez' }],
  7: [{ name: 'Diana Gutierrez', note: 'Producción' }, { name: 'Mauricio Gutierrez', note: 'Ventas' }],
}

function ResponsableBadges({ macroId }) {
  const lista = MACRO_RESPONSABLES[macroId] ?? []
  if (!lista.length) return null
  return (
    <div>
      <label className="block text-[10px] font-semibold text-[#8890b5] uppercase tracking-wide mb-1.5">
        {lista.length > 1 ? 'Responsables' : 'Responsable'}
      </label>
      <div className="flex flex-wrap gap-1.5">
        {lista.map(({ name, note }) => (
          <span
            key={name}
            className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-[#f3f4f6] dark:bg-[#252840]"
          >
            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white flex-shrink-0 ${getAvatarColor(name)}`}>
              {getInitials(name)}
            </span>
            <span className="text-xs font-semibold text-[#434655] dark:text-[#c4c8e8]">
              {name.split(' ')[0]}
            </span>
            {note && (
              <span className="text-[9px] text-[#8890b5] italic">{note}</span>
            )}
          </span>
        ))}
      </div>
    </div>
  )
}

export default function FondoEmprenderEmpresaDetallePage() {
  const { empresaId } = useParams()
  const [searchParams] = useSearchParams()
  const today = new Date()
  const mes  = parseInt(searchParams.get('mes')  ?? today.getMonth() + 1, 10)
  const anio = parseInt(searchParams.get('anio') ?? today.getFullYear(),   10)

  const [company, setCompany]           = useState(null)
  const [macroprocesos, setMacros]      = useState([])
  const [loading, setLoading]           = useState(true)
  const [error, setError]               = useState(null)
  // notasDraft tracks in-progress edits; saves on blur to avoid per-keystroke API calls
  const [notasDraft, setNotasDraft]     = useState({})

  const fetchDetalle = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const [empresaData, detalleData] = await Promise.all([
        api.getFondoEmpresa(empresaId),
        api.getFondoDetalle(empresaId, anio, mes),
      ])
      setCompany(empresaData)
      setMacros(detalleData.macroprocesos)
      const drafts = {}
      detalleData.macroprocesos.forEach(m => { drafts[m.id] = m.nota ?? '' })
      setNotasDraft(drafts)
    } catch (err) {
      setError(err.message || 'Error al cargar detalle')
    } finally {
      setLoading(false)
    }
  }, [empresaId, anio, mes])

  useEffect(() => { fetchDetalle() }, [fetchDetalle])

  const handleToggleTarea = useCallback(async (macroId, tareaId, currentStatus) => {
    const newStatus = currentStatus === 'completed' ? 'pending' : 'completed'
    setMacros(prev => prev.map(m => m.id !== macroId ? m : {
      ...m,
      tareasVinculadas: m.tareasVinculadas.map(t =>
        t.id === tareaId ? { ...t, status: newStatus } : t
      ),
    }))
    try {
      await api.updateTask(tareaId, { status: newStatus })
    } catch {
      setMacros(prev => prev.map(m => m.id !== macroId ? m : {
        ...m,
        tareasVinculadas: m.tareasVinculadas.map(t =>
          t.id === tareaId ? { ...t, status: currentStatus } : t
        ),
      }))
    }
  }, [])

  const handleEditarMacro = useCallback(async (macroId, updates) => {
    if (macroId === 5) {
      alert('mp5/Contabilidad no se puede editar directamente')
      return
    }
    try {
      const actualizado = await api.updateFondoDetalle(empresaId, macroId, anio, mes, updates)
      setMacros(prev => prev.map(m => m.id === macroId ? { ...m, ...actualizado } : m))
      if ('nota' in updates) {
        setNotasDraft(prev => ({ ...prev, [macroId]: actualizado.nota ?? '' }))
      }
    } catch (err) {
      if (err.status === 403) {
        alert('No tienes permiso para editar macroprocesos')
      } else {
        alert('Error: ' + err.message)
      }
    }
  }, [empresaId])

  // Progress summary
  const mp5        = macroprocesos.find(m => m.id === 5)
  const contabDone = mp5?.confirmed ?? false
  const manualDone = macroprocesos.filter(m => m.id !== 5 && m.estado === 'done').length
  const totalDone  = manualDone + (contabDone ? 1 : 0)

  // ── Loading / error ───────────────────────────────────────────────────────
  if (loading) return (
    <div className="flex items-center justify-center py-20 text-[#8890b5] dark:text-[#5a5f7a]">
      <span className="material-symbols-outlined mr-2" style={{ fontSize: 20, animation: 'spin 1s linear infinite' }}>
        progress_activity
      </span>
      Cargando macroprocesos…
    </div>
  )

  if (error) return (
    <div className="flex flex-col items-center gap-3 py-20">
      <span className="material-symbols-outlined text-[#ef4444]" style={{ fontSize: 32 }}>error</span>
      <p className="text-sm text-[#ef4444]">{error}</p>
      <button
        onClick={fetchDetalle}
        className="px-4 py-2 text-sm rounded-lg border border-[#e2e4ef] dark:border-[#2e3148] hover:bg-[#f3f4f6] dark:hover:bg-[#252840] transition"
      >
        Reintentar
      </button>
    </div>
  )

  const companyName = company?.name ?? '…'

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-5 min-w-0">

      {/* ── Breadcrumb ───────────────────────────────────────────────────── */}
      <div>
        <Link
          to={`/fondo-emprender/empresas?anio=${anio}&mes=${mes}`}
          className="inline-flex items-center gap-1 text-sm text-[#6b7280] dark:text-[#8890b5] hover:text-[#004ac6] dark:hover:text-[#7ba8f0] transition"
        >
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>arrow_back</span>
          Empresas
        </Link>
      </div>

      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-[#191c1e] dark:text-[#e4e6f0] leading-tight">{companyName}</h1>
          <p className="text-sm text-[#6b7280] dark:text-[#8890b5] mt-0.5">
            Procesos macro · {MONTHS[mes - 1]} {anio}
          </p>
        </div>
        {/* Progress pill */}
        <div
          className="flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold"
          style={{
            background: totalDone === 7 ? '#dcfce7' : totalDone > 0 ? '#fef9c3' : '#f3f4f6',
            color:      totalDone === 7 ? '#16a34a' : totalDone > 0 ? '#d97706' : '#6b7280',
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
            {totalDone === 7 ? 'check_circle' : 'timelapse'}
          </span>
          {totalDone} / 7 completos
        </div>
      </div>

      {/* ── Macro process cards ───────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {macroprocesos.map(proc => {
          const isContabilidad = proc.id === 5
          const cfgStatus = isContabilidad
            ? (proc.confirmed ? MACRO_STATUS.done : MACRO_STATUS.pending)
            : (MACRO_STATUS[proc.estado] ?? MACRO_STATUS.pending)

          return (
            <div
              key={proc.id}
              className="bg-white dark:bg-[#1e2030] border border-[#e2e4ef] dark:border-[#2e3148] rounded-xl p-4 shadow-sm flex flex-col gap-3"
            >
              {/* Process header */}
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span
                    className="material-symbols-outlined flex-shrink-0"
                    style={{ color: cfgStatus.color, fontSize: 18 }}
                  >
                    {cfgStatus.icon}
                  </span>
                  <h3 className="text-sm font-bold text-[#191c1e] dark:text-[#e4e6f0] leading-tight">
                    {proc.nombre}
                  </h3>
                </div>
                {isContabilidad && (
                  <span className="text-[9px] font-bold uppercase tracking-wide text-[#8890b5] bg-[#f3f4f6] dark:bg-[#252840] px-1.5 py-0.5 rounded flex-shrink-0">
                    Auto
                  </span>
                )}
              </div>

              {/* Status — readonly for mp5, buttons for the rest */}
              {isContabilidad ? (
                <div className="rounded-lg p-2.5 text-xs leading-relaxed" style={{ background: cfgStatus.bg }}>
                  {proc.confirmed ? (
                    <p className="font-semibold" style={{ color: '#16a34a' }}>
                      Confirmado
                    </p>
                  ) : (
                    <p className="text-[#6b7280] dark:text-[#8890b5]">
                      Sin confirmar ·{' '}
                      <Link
                        to="/fondo-emprender"
                        className="underline underline-offset-2 font-medium"
                        style={{ color: '#004ac6' }}
                      >
                        ir al checklist
                      </Link>
                    </p>
                  )}
                  <p className="text-[#9ca3af] mt-1" style={{ fontSize: 10 }}>
                    Estado calculado desde el checklist mensual
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-1">
                  {Object.entries(MACRO_STATUS).map(([key, cfg]) => {
                    const active = proc.estado === key
                    return (
                      <button
                        key={key}
                        onClick={() => handleEditarMacro(proc.id, { estado: key })}
                        className="py-1.5 rounded-lg text-[10px] font-semibold transition-all hover:opacity-90 active:scale-95"
                        style={{
                          background: active ? cfg.bg : 'transparent',
                          color:      active ? cfg.color : '#9ca3af',
                          border:     `1.5px solid ${active ? cfg.color : '#e2e4ef'}`,
                        }}
                      >
                        {cfg.label}
                      </button>
                    )
                  })}
                </div>
              )}

              {/* Responsables */}
              <ResponsableBadges macroId={proc.id} />

              {/* Tareas vinculadas desde el Gestor de Tareas */}
              {proc.tareasVinculadas?.length > 0 && (
                <div>
                  <label className="block text-[10px] font-semibold text-[#8890b5] uppercase tracking-wide mb-1.5">
                    Tareas vinculadas
                  </label>
                  <div className="space-y-1">
                    {proc.tareasVinculadas.map(tarea => {
                      const ts = TASK_STATUS[tarea.status] ?? TASK_STATUS.pending
                      return (
                        <div
                          key={tarea.id}
                          className="flex items-start gap-2 px-2 py-1.5 rounded-lg bg-[#f8f9fc] dark:bg-[#252840]"
                        >
                          <button
                            onClick={() => handleToggleTarea(proc.id, tarea.id, tarea.status)}
                            className="flex-shrink-0 mt-0.5 hover:scale-110 transition-transform"
                            title={tarea.status === 'completed' ? 'Marcar pendiente' : 'Marcar completada'}
                          >
                            <span
                              className="material-symbols-outlined"
                              style={{ fontSize: 13, color: ts.color }}
                            >
                              {ts.icon}
                            </span>
                          </button>
                          <div className="flex-1 min-w-0">
                            <p className={`text-xs font-semibold line-clamp-1 transition-colors ${
                              tarea.status === 'completed'
                                ? 'line-through text-[#9ca3af] dark:text-[#5a5f7a]'
                                : 'text-[#434655] dark:text-[#c4c8e8]'
                            }`}>
                              {tarea.title}
                            </p>
                            {tarea.description && (
                              <p className={`text-[10px] line-clamp-2 mt-0.5 ${
                                tarea.status === 'completed' ? 'text-[#c3c6d7]' : 'text-[#8890b5]'
                              }`}>
                                {tarea.description}
                              </p>
                            )}
                          </div>
                          {tarea.priority && (
                            <span
                              className="w-1.5 h-1.5 rounded-full flex-shrink-0 mt-1.5"
                              style={{ background: PRIORITY_COLORS[tarea.priority] }}
                              title={PRIORITY_LABELS[tarea.priority]}
                            />
                          )}
                          {tarea.assignedToName && (
                            <span
                              title={tarea.assignedToName}
                              className={`w-5 h-5 rounded-full flex items-center justify-center text-white text-[9px] font-bold flex-shrink-0 ${getAvatarColor(tarea.assignedToName)}`}
                            >
                              {getInitials(tarea.assignedToName)}
                            </span>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Nota — saves on blur */}
              {!isContabilidad && (
                <div>
                  <label className="block text-[10px] font-semibold text-[#8890b5] uppercase tracking-wide mb-1">
                    Nota
                  </label>
                  <textarea
                    value={notasDraft[proc.id] ?? ''}
                    onChange={e => setNotasDraft(prev => ({ ...prev, [proc.id]: e.target.value }))}
                    onBlur={e => {
                      const newNota = e.target.value
                      if (newNota !== (proc.nota ?? '')) {
                        handleEditarMacro(proc.id, { nota: newNota })
                      }
                    }}
                    placeholder="Notas adicionales..."
                    rows={2}
                    className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-[#e2e4ef] dark:border-[#2e3148] bg-[#f8f9fc] dark:bg-[#252840] text-[#191c1e] dark:text-[#e4e6f0] outline-none focus:ring-2 focus:ring-[#004ac6]/30 resize-none"
                  />
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
