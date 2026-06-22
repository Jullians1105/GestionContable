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
import StatsCard from "./StatsCard"
import { formatDate, isDueDateOverdue, isDueDateSoon, getInitials, getAvatarColor, PRIORITY_LABELS } from "../utils/helpers"

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
  const visibleTasks = (isAdmin() || isLeader()) ? tasks : tasks.filter((t) => normalizeAssignedTo(t.assignedTo).includes(user?.id))
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
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatsCard title="Total de Tareas" value={stats.total} icon="analytics" borderColor="#004ac6" iconColor="#004ac6" sub={`${completionPct}% completadas`} />
        <StatsCard title="Completadas" value={stats.completed} icon="check_circle" borderColor="#10B981" iconColor="#10B981" sub={stats.total > 0 ? `${completionPct}% del total` : "Sin tareas"} subColor="#434655" />
        <StatsCard title="En Progreso" value={stats.inProgress} icon="pending" borderColor="#FBBF24" iconColor="#FBBF24" sub="Tareas activas" subColor="#434655" />
        <StatsCard title="Pendientes" value={stats.pending} icon="priority_high" borderColor="#EF4444" iconColor="#EF4444" sub={stats.pending > 0 ? "Por iniciar" : "Todo al dia"} subColor={stats.pending > 0 ? "#EF4444" : "#10B981"} />
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
