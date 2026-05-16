import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend,
} from 'recharts'
import { useTasks } from '../hooks/useTasks'
import { useTeam } from '../hooks/useTeam'
import StatsCard from './StatsCard'
import { formatDate, isDueDateOverdue, isDueDateSoon, getInitials, getAvatarColor, PRIORITY_LABELS } from '../utils/helpers'

const STATUS_COLORS = {
  pending: '#6B7280',
  in_progress: '#2563EB',
  completed: '#10B981',
}

const PRIORITY_COLORS = {
  high: '#EF4444',
  medium: '#FBBF24',
  low: '#10B981',
}

export default function Dashboard() {
  const { tasks } = useTasks()
  const { getMemberById } = useTeam()

  const stats = useMemo(() => {
    const total = tasks.length
    const completed = tasks.filter((t) => t.status === 'completed').length
    const inProgress = tasks.filter((t) => t.status === 'in_progress').length
    const pending = tasks.filter((t) => t.status === 'pending').length
    return { total, completed, inProgress, pending }
  }, [tasks])

  const pieData = useMemo(() => [
    { name: 'Pendientes', value: stats.pending, color: STATUS_COLORS.pending },
    { name: 'En Progreso', value: stats.inProgress, color: STATUS_COLORS.in_progress },
    { name: 'Completadas', value: stats.completed, color: STATUS_COLORS.completed },
  ].filter((d) => d.value > 0), [stats])

  const barData = useMemo(() => [
    { name: 'Alta', value: tasks.filter((t) => t.priority === 'high').length, fill: PRIORITY_COLORS.high },
    { name: 'Media', value: tasks.filter((t) => t.priority === 'medium').length, fill: PRIORITY_COLORS.medium },
    { name: 'Baja', value: tasks.filter((t) => t.priority === 'low').length, fill: PRIORITY_COLORS.low },
  ], [tasks])

  const urgentTasks = useMemo(() =>
    tasks
      .filter((t) => t.status !== 'completed' && t.dueDate && (isDueDateOverdue(t.dueDate) || isDueDateSoon(t.dueDate)))
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
      .slice(0, 5),
    [tasks]
  )

  return (
    <div className="space-y-6">
      {/* Stats cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatsCard title="Total de Tareas" value={stats.total} icon="📋" colorClass="bg-blue-50 text-blue-600" />
        <StatsCard title="Completadas" value={stats.completed} icon="✅" colorClass="bg-green-50 text-green-600" />
        <StatsCard title="En Progreso" value={stats.inProgress} icon="🔄" colorClass="bg-indigo-50 text-indigo-600" />
        <StatsCard title="Pendientes" value={stats.pending} icon="⏳" colorClass="bg-gray-100 text-gray-600" />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Pie chart */}
        <div className="card">
          <h2 className="font-semibold text-gray-900 mb-4">Distribución por Estado</h2>
          {pieData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={85}
                  paddingAngle={3}
                  dataKey="value"
                >
                  {pieData.map((entry, index) => (
                    <Cell key={index} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(value, name) => [value, name]} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[220px] flex items-center justify-center text-gray-400">
              <p>No hay tareas</p>
            </div>
          )}
        </div>

        {/* Bar chart */}
        <div className="card">
          <h2 className="font-semibold text-gray-900 mb-4">Distribución por Prioridad</h2>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={barData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="value" name="Tareas" radius={[4, 4, 0, 0]}>
                {barData.map((entry, index) => (
                  <Cell key={index} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Urgent tasks */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-gray-900">Próximas a Vencer</h2>
          <Link to="/tasks" className="text-sm text-blue-600 hover:text-blue-700 font-medium">
            Ver todas →
          </Link>
        </div>

        {urgentTasks.length > 0 ? (
          <div className="space-y-3">
            {urgentTasks.map((task) => {
              const overdue = isDueDateOverdue(task.dueDate)
              const member = task.assignedTo ? getMemberById(task.assignedTo) : null
              return (
                <div
                  key={task.id}
                  className={`flex items-center gap-4 p-3 rounded-xl border ${
                    overdue ? 'border-red-200 bg-red-50' : 'border-yellow-200 bg-yellow-50'
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{task.title}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className={`text-xs font-medium ${overdue ? 'text-red-700' : 'text-yellow-700'}`}>
                        {overdue ? '⚠ Vencida' : '⏰ Próxima'} · {formatDate(task.dueDate)}
                      </span>
                      <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${
                        task.priority === 'high' ? 'bg-red-100 text-red-700' :
                        task.priority === 'medium' ? 'bg-yellow-100 text-yellow-700' :
                        'bg-green-100 text-green-700'
                      }`}>
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
          <div className="text-center py-8 text-gray-400">
            <p className="text-sm">No hay tareas urgentes. Todo está al día.</p>
          </div>
        )}
      </div>
    </div>
  )
}
