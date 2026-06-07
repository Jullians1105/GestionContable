import { useCallback, useMemo, useState } from 'react'
import { useTasks } from '../hooks/useTasks'
import { useTeam } from '../hooks/useTeam'
import { useGroups } from '../context/GroupContext'
import { useToast } from '../context/ToastContext'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts'
import jsPDF from 'jspdf'
import * as XLSX from 'xlsx'
import { isBefore, isAfter, parseISO } from 'date-fns'

const REPORT_TYPES = [
  { value: 'by_person', label: 'Tareas completadas por persona' },
  { value: 'productivity', label: 'Productividad general' },
  { value: 'compliance', label: 'Cumplimiento de fechas' },
]

export default function ReportsPage() {
  const { tasks } = useTasks()
  const { members } = useTeam()
  const { groups } = useGroups()
  const { addToast } = useToast()

  const [filters, setFilters] = useState({
    type: 'by_person',
    dateFrom: '',
    dateTo: '',
    groupId: '',
    memberId: '',
  })
  const [generated, setGenerated] = useState(false)

  const applyFilters = useCallback((taskList) => {
    return taskList.filter((t) => {
      if (filters.groupId && t.groupId !== filters.groupId) return false
      if (filters.memberId && t.assignedTo !== filters.memberId) return false
      if (filters.dateFrom && t.dueDate && isBefore(parseISO(t.dueDate), parseISO(filters.dateFrom))) return false
      if (filters.dateTo && t.dueDate && isAfter(parseISO(t.dueDate), parseISO(filters.dateTo))) return false
      return true
    })
  }, [filters])

  const reportData = useMemo(() => {
    if (!generated) return null
    const filtered = applyFilters(tasks)

    if (filters.type === 'by_person') {
      return members.map((m) => {
        const memberTasks = filtered.filter((t) => t.assignedTo === m.id)
        const completed = memberTasks.filter((t) => t.status === 'completed').length
        const inProgress = memberTasks.filter((t) => t.status === 'in_progress').length
        const pending = memberTasks.filter((t) => t.status === 'pending').length
        const pct = memberTasks.length ? Math.round((completed / memberTasks.length) * 100) : 0
        return { name: m.name, completed, inProgress, pending, total: memberTasks.length, pct }
      }).filter((r) => r.total > 0)
    }

    if (filters.type === 'productivity') {
      return members.map((m) => ({
        name: m.name.split(' ')[0],
        completadas: filtered.filter((t) => t.assignedTo === m.id && t.status === 'completed').length,
      })).filter((r) => r.completadas > 0)
    }

    if (filters.type === 'compliance') {
      const withDue = filtered.filter((t) => t.dueDate)
      const onTime = withDue.filter((t) => t.status === 'completed').length
      const overdue = withDue.filter((t) => t.status !== 'completed' && isBefore(parseISO(t.dueDate), new Date())).length
      return [
        { name: 'A tiempo', value: onTime, color: '#10B981' },
        { name: 'Vencidas', value: overdue, color: '#EF4444' },
        { name: 'Pendientes', value: withDue.length - onTime - overdue, color: '#FBBF24' },
      ]
    }
    return null
  }, [generated, tasks, members, filters, applyFilters])

  const totalCompleted = useMemo(() => {
    if (!generated) return 0
    return applyFilters(tasks).filter((t) => t.status === 'completed').length
  }, [generated, tasks, applyFilters])

  const handleExportPDF = () => {
    const doc = new jsPDF()
    doc.setFontSize(18)
    doc.text('Reporte TaskFlow Pro', 20, 20)
    doc.setFontSize(12)
    doc.text(`Tipo: ${REPORT_TYPES.find((r) => r.value === filters.type)?.label}`, 20, 35)
    doc.text(`Total completadas: ${totalCompleted}`, 20, 45)
    if (reportData && filters.type === 'by_person') {
      doc.text('Detalle por persona:', 20, 60)
      reportData.forEach((r, i) => {
        doc.text(`${r.name}: ${r.completed} completadas / ${r.total} total (${r.pct}%)`, 25, 70 + i * 8)
      })
    }
    doc.save('reporte-taskflow.pdf')
    addToast('PDF descargado', 'success')
  }

  const handleExportExcel = () => {
    const ws = XLSX.utils.json_to_sheet(reportData || [])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Reporte')
    XLSX.writeFile(wb, 'reporte-taskflow.xlsx')
    addToast('Excel descargado', 'success')
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[#191c1e] dark:text-[#e4e6f0]">Reportes</h1>
        <p className="text-sm text-[#434655] dark:text-[#c4c8e8] mt-0.5">Analiza el rendimiento de tu equipo</p>
      </div>

      <div className="bg-white dark:bg-[#1e2030] rounded-2xl border border-[#c3c6d7] dark:border-[#2e3148] p-5 mb-5">
        <h2 className="text-sm font-bold text-[#191c1e] dark:text-[#e4e6f0] mb-4">Filtros</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-[#434655] dark:text-[#c4c8e8] mb-1.5">Tipo de reporte</label>
            <select
              value={filters.type}
              onChange={(e) => setFilters({ ...filters, type: e.target.value })}
              className="w-full h-10 px-3 rounded-lg border border-[#c3c6d7] dark:border-[#2e3148] bg-[#edeef0] dark:bg-[#252840] text-sm text-[#191c1e] dark:text-[#e4e6f0] focus:outline-none focus:ring-2 focus:ring-[#004ac6]"
            >
              {REPORT_TYPES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#434655] dark:text-[#c4c8e8] mb-1.5">Grupo</label>
            <select
              value={filters.groupId}
              onChange={(e) => setFilters({ ...filters, groupId: e.target.value })}
              className="w-full h-10 px-3 rounded-lg border border-[#c3c6d7] dark:border-[#2e3148] bg-[#edeef0] dark:bg-[#252840] text-sm text-[#191c1e] dark:text-[#e4e6f0] focus:outline-none focus:ring-2 focus:ring-[#004ac6]"
            >
              <option value="">Todos los grupos</option>
              {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#434655] dark:text-[#c4c8e8] mb-1.5">Miembro</label>
            <select
              value={filters.memberId}
              onChange={(e) => setFilters({ ...filters, memberId: e.target.value })}
              className="w-full h-10 px-3 rounded-lg border border-[#c3c6d7] dark:border-[#2e3148] bg-[#edeef0] dark:bg-[#252840] text-sm text-[#191c1e] dark:text-[#e4e6f0] focus:outline-none focus:ring-2 focus:ring-[#004ac6]"
            >
              <option value="">Todos</option>
              {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-[#434655] dark:text-[#c4c8e8] mb-1.5">Desde</label>
              <input type="date" value={filters.dateFrom} onChange={(e) => setFilters({ ...filters, dateFrom: e.target.value })} className="w-full h-10 px-3 rounded-lg border border-[#c3c6d7] dark:border-[#2e3148] bg-[#edeef0] dark:bg-[#252840] text-sm text-[#191c1e] dark:text-[#e4e6f0] focus:outline-none focus:ring-2 focus:ring-[#004ac6]" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#434655] dark:text-[#c4c8e8] mb-1.5">Hasta</label>
              <input type="date" value={filters.dateTo} onChange={(e) => setFilters({ ...filters, dateTo: e.target.value })} className="w-full h-10 px-3 rounded-lg border border-[#c3c6d7] dark:border-[#2e3148] bg-[#edeef0] dark:bg-[#252840] text-sm text-[#191c1e] dark:text-[#e4e6f0] focus:outline-none focus:ring-2 focus:ring-[#004ac6]" />
            </div>
          </div>
        </div>
        <button
          onClick={() => setGenerated(true)}
          className="mt-4 flex items-center gap-2 h-10 px-5 rounded-xl text-sm font-semibold text-white hover:opacity-90 transition"
          style={{ background: '#004ac6' }}
        >
          <span className="material-symbols-outlined text-base">bar_chart</span>
          Generar Reporte
        </button>
      </div>

      {generated && reportData && (
        <div className="bg-white dark:bg-[#1e2030] rounded-2xl border border-[#c3c6d7] dark:border-[#2e3148] p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-bold text-[#191c1e] dark:text-[#e4e6f0]">{REPORT_TYPES.find((r) => r.value === filters.type)?.label}</h2>
              <p className="text-sm text-[#434655] dark:text-[#c4c8e8] mt-0.5">{totalCompleted} tareas completadas en este período</p>
            </div>
            <div className="flex gap-2">
              <button onClick={handleExportPDF} className="flex items-center gap-1.5 h-9 px-3 rounded-lg text-xs font-semibold text-white hover:opacity-90 transition" style={{ background: '#EF4444' }}>
                <span className="material-symbols-outlined text-sm">picture_as_pdf</span>
                PDF
              </button>
              <button onClick={handleExportExcel} className="flex items-center gap-1.5 h-9 px-3 rounded-lg text-xs font-semibold text-white hover:opacity-90 transition" style={{ background: '#10B981' }}>
                <span className="material-symbols-outlined text-sm">table_chart</span>
                Excel
              </button>
            </div>
          </div>

          {filters.type === 'by_person' && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#edeef0] dark:border-[#252840]">
                    {['Nombre', 'Completadas', 'En Progreso', 'Pendientes', 'Total', '% Completado'].map((h) => (
                      <th key={h} className="text-left text-xs font-semibold text-[#434655] dark:text-[#c4c8e8] py-2 px-3">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {reportData.map((r) => (
                    <tr key={r.name} className="border-b border-[#edeef0] dark:border-[#252840] hover:bg-[#f8f9ff] dark:hover:bg-[#252840]">
                      <td className="py-2 px-3 font-semibold text-[#191c1e] dark:text-[#e4e6f0]">{r.name}</td>
                      <td className="py-2 px-3"><span className="text-[#10B981] font-semibold">{r.completed}</span></td>
                      <td className="py-2 px-3"><span className="text-[#004ac6] font-semibold">{r.inProgress}</span></td>
                      <td className="py-2 px-3"><span className="text-[#888] font-semibold">{r.pending}</span></td>
                      <td className="py-2 px-3 text-[#434655] dark:text-[#c4c8e8]">{r.total}</td>
                      <td className="py-2 px-3">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-1.5 bg-[#edeef0] dark:bg-[#252840] rounded-full">
                            <div className="h-full rounded-full" style={{ width: `${r.pct}%`, background: '#004ac6' }} />
                          </div>
                          <span className="text-xs text-[#434655] dark:text-[#c4c8e8] w-8">{r.pct}%</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {(filters.type === 'productivity' || filters.type === 'compliance') && (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={reportData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#edeef0" />
                <XAxis dataKey={filters.type === 'productivity' ? 'name' : 'name'} tick={{ fontSize: 12, fill: '#434655' }} />
                <YAxis tick={{ fontSize: 12, fill: '#434655' }} allowDecimals={false} />
                <Tooltip />
                <Bar dataKey={filters.type === 'productivity' ? 'completadas' : 'value'} radius={[4, 4, 0, 0]}>
                  {reportData.map((entry, i) => (
                    <Cell key={i} fill={entry.color || '#004ac6'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      )}
    </div>
  )
}
