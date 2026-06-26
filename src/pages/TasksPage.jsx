import { useState, useEffect, useCallback } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import TaskList from '../components/TaskList'
import { useAuth } from '../context/AuthContext'
import { useGroups } from '../context/GroupContext'
import { api } from '../services/api'

const MONTHS = [
  'Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre',
]

const ESTADO_CFG = {
  pending:     { label: 'Pendiente',   color: '#ef4444', bg: '#fee2e2', icon: 'radio_button_unchecked' },
  in_progress: { label: 'En progreso', color: '#d97706', bg: '#fef9c3', icon: 'timelapse' },
}

function FondoPanel({ userId }) {
  const today = new Date()
  const [month, setMonth] = useState(today.getMonth())
  const [year,  setYear]  = useState(today.getFullYear())
  const [tareas, setTareas] = useState([])
  const [loading, setLoading] = useState(true)

  function prevMonth() {
    if (month === 0) { setMonth(11); setYear(y => y - 1) }
    else setMonth(m => m - 1)
  }
  function nextMonth() {
    if (month === 11) { setMonth(0); setYear(y => y + 1) }
    else setMonth(m => m + 1)
  }

  const fetchTareas = useCallback(async () => {
    try {
      setLoading(true)
      const res = await api.getFondoResponsables(year, month + 1)
      const mio = res.responsables.find(r => r.userId === userId)
      setTareas(mio?.tareas ?? [])
    } catch {
      setTareas([])
    } finally {
      setLoading(false)
    }
  }, [year, month, userId])

  useEffect(() => { fetchTareas() }, [fetchTareas])

  return (
    <div className="mb-6 bg-white dark:bg-[#1e2030] border border-[#e2e4ef] dark:border-[#2e3148] rounded-2xl shadow-sm overflow-hidden">

      {/* Panel header */}
      <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-[#f0f2f8] dark:border-[#2e3148]">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-[#004ac6]" style={{ fontSize: 18 }}>rocket_launch</span>
          <span className="text-sm font-bold text-[#191c1e] dark:text-[#e4e6f0]">Fondo Emprender</span>
          {!loading && (
            <span
              className="text-[10px] font-bold px-2 py-0.5 rounded-full"
              style={
                tareas.length === 0
                  ? { background: '#dcfce7', color: '#16a34a' }
                  : { background: '#fee2e2', color: '#ef4444' }
              }
            >
              {tareas.length === 0 ? 'Al día' : `${tareas.length} pendiente${tareas.length !== 1 ? 's' : ''}`}
            </span>
          )}
        </div>

        {/* Month navigator */}
        <div className="flex items-center gap-1">
          <button onClick={prevMonth} className="p-0.5 rounded hover:bg-[#f3f4f6] dark:hover:bg-[#252840] transition text-[#6b7280]">
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>chevron_left</span>
          </button>
          <span className="text-xs font-semibold text-[#434655] dark:text-[#c4c8e8] min-w-[110px] text-center">
            {MONTHS[month]} {year}
          </span>
          <button onClick={nextMonth} className="p-0.5 rounded hover:bg-[#f3f4f6] dark:hover:bg-[#252840] transition text-[#6b7280]">
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>chevron_right</span>
          </button>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-5 text-[#8890b5] dark:text-[#5a5f7a] text-xs gap-2">
          <span className="material-symbols-outlined" style={{ fontSize: 16, animation: 'spin 1s linear infinite' }}>progress_activity</span>
          Cargando…
        </div>
      ) : tareas.length === 0 ? (
        <div className="flex items-center justify-center gap-2 py-5 text-xs text-[#16a34a] font-semibold">
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>check_circle</span>
          Sin tareas pendientes en {MONTHS[month]}
        </div>
      ) : (
        <div className="divide-y divide-[#f0f2f8] dark:divide-[#2e3148]">
          {tareas.map((t, i) => {
            const cfg = ESTADO_CFG[t.estado] ?? ESTADO_CFG.pending
            return (
              <Link
                key={i}
                to={`/fondo-emprender/empresas/${t.empresaId}?anio=${year}&mes=${month + 1}`}
                className="flex items-center gap-3 px-5 py-2.5 hover:bg-[#f8f9fe] dark:hover:bg-[#252840] transition group"
              >
                <span className="material-symbols-outlined flex-shrink-0" style={{ fontSize: 16, color: cfg.color }}>
                  {cfg.icon}
                </span>
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-semibold text-[#191c1e] dark:text-[#e4e6f0] truncate block">
                    {t.empresaNombre}
                  </span>
                  <span className="text-[11px] text-[#6b7280] dark:text-[#8890b5] truncate block">
                    {t.macroNombre}
                  </span>
                </div>
                <span
                  className="text-[9px] font-bold px-2 py-0.5 rounded-full flex-shrink-0"
                  style={{ background: cfg.bg, color: cfg.color }}
                >
                  {cfg.label}
                </span>
                <span className="material-symbols-outlined text-[#c3c6d7] group-hover:text-[#004ac6] transition flex-shrink-0" style={{ fontSize: 16 }}>
                  chevron_right
                </span>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default function TasksPage() {
  const [searchParams] = useSearchParams()
  const search        = searchParams.get('search') || ''
  const openTaskId    = searchParams.get('openTask') || null
  const openCommentId = searchParams.get('comment') || null

  const { user } = useAuth()
  const { groups } = useGroups()
  const [showFondo, setShowFondo] = useState(false)

  const fondoGroup    = groups.find(g => g.name === 'Fondo Emprender')
  const isInFondo     = fondoGroup?.memberIds?.includes(user?.id) ?? false

  return (
    <div>
      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-[24px] font-bold text-[#191c1e] dark:text-[#e4e6f0]">Mis Tareas</h2>
          <p className="text-[14px] text-[#434655] dark:text-[#c4c8e8] mt-1">Gestiona y organiza tus entregables activos</p>
        </div>

        {isInFondo && (
          <button
            onClick={() => setShowFondo(v => !v)}
            className="flex items-center gap-2 h-10 px-4 rounded-xl text-sm font-semibold border-2 transition-all active:scale-[0.97]"
            style={
              showFondo
                ? { borderColor: '#004ac6', background: '#f0f4ff', color: '#004ac6' }
                : { borderColor: '#e2e4ef', background: 'white', color: '#434655' }
            }
          >
            <span className="material-symbols-outlined text-base">rocket_launch</span>
            Fondo Emprender
            <span className="material-symbols-outlined text-sm">
              {showFondo ? 'expand_less' : 'expand_more'}
            </span>
          </button>
        )}
      </div>

      {isInFondo && showFondo && <FondoPanel userId={user.id} />}

      <TaskList
        initialFilters={search ? { search } : {}}
        openTaskId={openTaskId}
        openCommentId={openCommentId}
      />
    </div>
  )
}
