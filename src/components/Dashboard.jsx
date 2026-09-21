import { useMemo } from "react"
import { normalizeAssignedTo } from "../utils/helpers"
import { Link } from "react-router-dom"
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from "recharts"
import { useTasks } from "../hooks/useTasks"
import { useTeam } from "../hooks/useTeam"
import { useAuth } from "../context/AuthContext"
import { useTheme } from "../context/ThemeContext"
import { DIAN_NAV, FONDO_NAV, EMPRESAS_MAESTRO_NAV, MODULE_TITLES } from "../config/navigation"
import { formatDate, isDueDateOverdue, isDueDateSoon, getInitials, getAvatarColor, PRIORITY_LABELS } from "../utils/helpers"

// Grupos de accesos directos — mismos datos que ya usan Sidebar.jsx y el buscador del Header
// (config/navigation.js), no una lista aparte que se pueda desincronizar.
const GRUPOS_ACCESOS = [
  { id: "dian", items: DIAN_NAV },
  { id: "fondo", items: FONDO_NAV },
  { id: "empresas-directorio", items: EMPRESAS_MAESTRO_NAV },
]

function AccesosDirectos() {
  return (
    <div className="card">
      <h2 className="text-[18px] font-bold text-[#191c1e] dark:text-[#e4e6f0] mb-4">Accesos directos</h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
        {GRUPOS_ACCESOS.flatMap((g) => g.items.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            className="flex items-center gap-3 p-3 rounded-xl border border-[#e2e4ef] dark:border-[#2e3148] hover:border-[#004ac6] hover:bg-[#f8f9ff] dark:hover:bg-[#1a2040] transition-colors"
          >
            <span className="w-9 h-9 rounded-lg bg-[#eef3ff] dark:bg-[#1a2550] flex items-center justify-center flex-shrink-0">
              <span className="material-symbols-outlined text-[#004ac6] dark:text-[#7ba8f0] text-lg">{item.icon}</span>
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-[#191c1e] dark:text-[#e4e6f0] truncate">{item.label}</span>
              <span className="block text-[11px] text-[#8890b5] truncate">{MODULE_TITLES[g.id]}</span>
            </span>
          </Link>
        )))}
      </div>
    </div>
  )
}

const STATUS_COLORS = {
  pending: "#737686",
  in_progress: "#004ac6",
  completed: "#10B981",
}

const PRIORITY_COLORS = {
  high: "#EF4444",
  medium: "#FBBF24",
  low: "#10B981",
}

export default function Dashboard() {
  const { tasks } = useTasks()
  const { getMemberById } = useTeam()
  const { user, isAdmin, isLeader } = useAuth()
  const { theme } = useTheme()
  const visibleTasks = (isAdmin() || isLeader()) ? tasks : tasks.filter((t) => normalizeAssignedTo(t.assignedTo).includes(user?.id) || t.createdBy === user?.id)
  const isDark = theme === 'dark'
  const axisColor = isDark ? '#c4c8e8' : '#434655'
  const gridColor = isDark ? '#2e3148' : '#edeef0'
  const tooltipStyle = {
    borderRadius: 8,
    border: `1px solid ${isDark ? '#2e3148' : '#c3c6d7'}`,
    background: isDark ? '#1e2030' : '#ffffff',
    color: isDark ? '#e4e6f0' : '#191c1e',
    fontSize: 12,
  }

  const stats = useMemo(() => {
    const total = visibleTasks.length
    const completed = visibleTasks.filter((t) => t.status === "completed").length
    const inProgress = visibleTasks.filter((t) => t.status === "in_progress").length
    const pending = visibleTasks.filter((t) => t.status === "pending").length
    return { total, completed, inProgress, pending }
  }, [visibleTasks])

  const pieData = useMemo(() => [
    { name: "Pendientes", value: stats.pending, color: STATUS_COLORS.pending },
    { name: "En Progreso", value: stats.inProgress, color: STATUS_COLORS.in_progress },
    { name: "Completadas", value: stats.completed, color: STATUS_COLORS.completed },
  ].filter((d) => d.value > 0), [stats])

  const barData = useMemo(() => [
    { name: "Alta", value: visibleTasks.filter((t) => t.priority === "high").length, fill: PRIORITY_COLORS.high },
    { name: "Media", value: visibleTasks.filter((t) => t.priority === "medium").length, fill: PRIORITY_COLORS.medium },
    { name: "Baja", value: visibleTasks.filter((t) => t.priority === "low").length, fill: PRIORITY_COLORS.low },
  ], [visibleTasks])

  const urgentTasks = useMemo(() =>
    visibleTasks
      .filter((t) => t.status !== "completed" && t.dueDate && (isDueDateOverdue(t.dueDate, t.dueTime) || isDueDateSoon(t.dueDate, t.dueTime)))
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
      .slice(0, 5),
    [visibleTasks]
  )

  const completionPct = stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0

  return (
    <div className="space-y-6">
      <AccesosDirectos />

      {/* Antes eran 4 StatsCard grandes (Total/Completadas/En Progreso/Pendientes) ocupando la
          fila más prominente del dashboard — el mismo peso visual que los accesos directos de
          arriba, para un módulo (Tareas) que hoy casi no se usa. Se queda la misma info, pero en
          una sola tira compacta en vez de 4 tarjetas grandes. */}
      <div className="card">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-bold text-[#8890b5] uppercase tracking-wide">Tus tareas</h2>
          <Link to="/tasks" className="text-xs font-semibold text-[#004ac6] hover:text-[#2563eb] flex items-center gap-1 transition-colors">
            Ver todas
            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>arrow_forward</span>
          </Link>
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          {[
            { label: "Total", value: stats.total, color: "#004ac6" },
            { label: "Completadas", value: stats.completed, color: "#10B981" },
            { label: "En progreso", value: stats.inProgress, color: "#FBBF24" },
            { label: "Pendientes", value: stats.pending, color: "#EF4444" },
          ].map((s) => (
            <div key={s.label} className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: s.color }} />
              <span className="text-lg font-bold text-[#191c1e] dark:text-[#e4e6f0]">{s.value}</span>
              <span className="text-xs text-[#6b7280] dark:text-[#8890b5]">{s.label}</span>
            </div>
          ))}
          {stats.total > 0 && (
            <span className="text-xs text-[#8890b5] self-center">({completionPct}% completadas)</span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="card lg:col-span-1">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-[18px] font-bold text-[#191c1e] dark:text-[#e4e6f0]">Distribucion por Estado</h2>
            <span className="material-symbols-outlined text-[#434655] dark:text-[#c4c8e8]" style={{ fontSize: 20 }}>more_vert</span>
          </div>
          {pieData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={3} dataKey="value">
                  {pieData.map((entry, index) => (
                    <Cell key={index} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} formatter={(value, name) => [value, name]} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[220px] flex items-center justify-center">
              <p className="text-[14px] text-[#434655] dark:text-[#c4c8e8]">No hay tareas</p>
            </div>
          )}
          <div className="grid grid-cols-3 gap-2 mt-4">
            {[
              { label: "Pendientes", color: STATUS_COLORS.pending },
              { label: "En Progreso", color: STATUS_COLORS.in_progress },
              { label: "Completadas", color: STATUS_COLORS.completed },
            ].map(({ label, color }) => (
              <div key={label} className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
                <span className="text-[11px] text-[#434655] dark:text-[#c4c8e8] leading-tight">{label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="card lg:col-span-2">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-[18px] font-bold text-[#191c1e] dark:text-[#e4e6f0]">Tareas por Prioridad</h2>
            <span className="material-symbols-outlined text-[#434655] dark:text-[#c4c8e8]" style={{ fontSize: 20 }}>filter_list</span>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={barData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
              <CartesianGrid vertical={false} stroke={gridColor} />
              <XAxis dataKey="name" tick={{ fontSize: 12, fill: axisColor }} />
              <YAxis tick={{ fontSize: 12, fill: axisColor }} allowDecimals={false} />
              <Tooltip contentStyle={tooltipStyle} cursor={{ fill: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)' }} />
              <Bar dataKey="value" name="Tareas" radius={[4, 4, 0, 0]}>
                {barData.map((entry, index) => (
                  <Cell key={index} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="card">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-[18px] font-bold text-[#191c1e] dark:text-[#e4e6f0]">Proximas a Vencer</h2>
          <Link to="/tasks" className="text-[12px] font-semibold text-[#004ac6] hover:text-[#2563eb] flex items-center gap-1 transition-colors">
            Ver todas
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>arrow_forward</span>
          </Link>
        </div>
        {urgentTasks.length > 0 ? (
          <div className="space-y-3">
            {urgentTasks.map((task) => {
              const overdue = isDueDateOverdue(task.dueDate, task.dueTime)
              const firstId = normalizeAssignedTo(task.assignedTo)[0]
              const member = firstId ? getMemberById(firstId) : null
              return (
                <div key={task.id} className={`flex items-center gap-4 p-3 rounded-xl border ${overdue ? "border-[#ffdad6] bg-[#fff5f5] dark:border-[#5c1a1a] dark:bg-[#2a1718]" : "border-yellow-200 bg-yellow-50 dark:border-[#5c4a1a] dark:bg-[#2a2417]"}`}>
                  <div className="flex-1 min-w-0">
                    <p className="text-[14px] font-semibold text-[#191c1e] dark:text-[#e4e6f0] truncate">{task.title}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className={`text-[12px] font-semibold flex items-center gap-1 ${overdue ? "text-[#93000a] dark:text-[#ff8a80]" : "text-yellow-700 dark:text-yellow-400"}`}>
                        <span className="material-symbols-outlined" style={{ fontSize: 14 }}>{overdue ? "warning" : "schedule"}</span>
                        {overdue ? "Vencida" : "Proxima"} · {formatDate(task.dueDate, task.dueTime)}
                      </span>
                      <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${task.priority === "high" ? "bg-[#ffdad6] text-[#93000a] dark:bg-[#5c1a1a] dark:text-[#ff8a80]" : task.priority === "medium" ? "bg-yellow-100 text-yellow-800 dark:bg-[#5c4a1a] dark:text-yellow-300" : "bg-green-100 text-green-800 dark:bg-[#16412c] dark:text-green-300"}`}>
                        {PRIORITY_LABELS[task.priority]}
                      </span>
                    </div>
                  </div>
                  {member && (
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-semibold shrink-0 ${getAvatarColor(member.name)}`}>
                      {getInitials(member.name)}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        ) : (
          <div className="text-center py-8">
            <span className="material-symbols-outlined block mb-2 mx-auto" style={{ fontSize: 40, color: "#c3c6d7" }}>check_circle</span>
            <p className="text-[14px] font-semibold text-[#434655] dark:text-[#c4c8e8]">Todo al dia</p>
            <p className="text-[12px] mt-1 text-[#434655] dark:text-[#c4c8e8]">No hay tareas urgentes por el momento</p>
          </div>
        )}
      </div>
    </div>
  )
}
