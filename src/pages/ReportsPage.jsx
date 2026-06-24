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
import { isBefore, isAfter, parseISO, format } from 'date-fns'
import { es } from 'date-fns/locale'
import { getInitials, getAvatarColor, normalizeAssignedTo } from '../utils/helpers'

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
  const [openMembers, setOpenMembers] = useState(new Set())

  const toggleMember = (id) => setOpenMembers((prev) => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })

  const applyFilters = useCallback((taskList) => {
    return taskList.filter((t) => {
      if (filters.groupId && t.groupId !== filters.groupId) return false
      if (filters.memberId && !normalizeAssignedTo(t.assignedTo).includes(filters.memberId)) return false
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
        const memberTasks = filtered.filter((t) => normalizeAssignedTo(t.assignedTo).includes(m.id))
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
        completadas: filtered.filter((t) => normalizeAssignedTo(t.assignedTo).includes(m.id) && t.status === 'completed').length,
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

  const memberDetails = useMemo(() => {
    if (!generated) return null
    const filtered = applyFilters(tasks)
    return members
      .map((m) => {
        const all = filtered.filter((t) => normalizeAssignedTo(t.assignedTo).includes(m.id))
        if (!all.length) return null
        return {
          id: m.id,
          name: m.name,
          completedTasks: all.filter((t) => t.status === 'completed'),
          inProgressTasks: all.filter((t) => t.status === 'in_progress'),
          pendingTasks: all.filter((t) => t.status === 'pending'),
        }
      })
      .filter(Boolean)
  }, [generated, tasks, members, applyFilters])

  const reportFileName = useMemo(() => {
    const slugify = (text) => text
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')

    const member = filters.memberId ? members.find((m) => m.id === filters.memberId) : null
    const base = member ? `reporte-${slugify(member.name)}` : 'reporte-general'
    return `${base}-gestor-tareas`
  }, [filters.memberId, members])

  const handleExportPDF = () => {
    const doc = new jsPDF()
    const pageWidth = doc.internal.pageSize.getWidth()
    const pageHeight = doc.internal.pageSize.getHeight()
    const marginX = 18
    const primary = [0, 74, 198]
    const dark = [25, 28, 30]
    const muted = [67, 70, 85]
    const border = [195, 198, 215]
    const reportLabel = REPORT_TYPES.find((r) => r.value === filters.type)?.label ?? ''

    const addFooter = () => {
      const pageCount = doc.internal.getNumberOfPages()
      for (let p = 1; p <= pageCount; p += 1) {
        doc.setPage(p)
        doc.setDrawColor(...border)
        doc.line(marginX, pageHeight - 16, pageWidth - marginX, pageHeight - 16)
        doc.setFontSize(8.5)
        doc.setTextColor(...muted)
        doc.text('Gestor de Tareas · Reporte generado automáticamente', marginX, pageHeight - 10)
        doc.text(`Página ${p} de ${pageCount}`, pageWidth - marginX, pageHeight - 10, { align: 'right' })
      }
    }

    // Header band
    doc.setFillColor(...primary)
    doc.rect(0, 0, pageWidth, 36, 'F')
    doc.setTextColor(255, 255, 255)
    doc.setFontSize(20)
    doc.setFont(undefined, 'bold')
    doc.text('Reporte Gestor de Tareas', marginX, 18)
    doc.setFontSize(11)
    doc.setFont(undefined, 'normal')
    doc.text(reportLabel, marginX, 27)
    doc.setFontSize(9)
    doc.text(format(new Date(), "d 'de' MMMM, yyyy · HH:mm", { locale: es }), pageWidth - marginX, 27, { align: 'right' })

    let y = 52

    // Filter chips
    const chips = []
    if (filters.dateFrom) chips.push(`Desde: ${filters.dateFrom}`)
    if (filters.dateTo) chips.push(`Hasta: ${filters.dateTo}`)
    if (filters.groupId) chips.push(`Grupo: ${groups.find((g) => g.id === filters.groupId)?.name ?? filters.groupId}`)
    if (filters.memberId) chips.push(`Persona: ${members.find((m) => m.id === filters.memberId)?.name ?? filters.memberId}`)
    if (chips.length) {
      doc.setFontSize(9)
      doc.setTextColor(...muted)
      doc.text(`Filtros aplicados: ${chips.join('   ·   ')}`, marginX, y)
      y += 10
    }

    // Summary card
    const cardH = 26
    doc.setFillColor(243, 244, 246)
    doc.roundedRect(marginX, y, pageWidth - marginX * 2, cardH, 3, 3, 'F')
    doc.setTextColor(...muted)
    doc.setFontSize(9)
    doc.text('TOTAL DE TAREAS COMPLETADAS', marginX + 10, y + 11)
    doc.setTextColor(...primary)
    doc.setFontSize(20)
    doc.setFont(undefined, 'bold')
    doc.text(String(totalCompleted), marginX + 10, y + 21)
    doc.setFont(undefined, 'normal')
    y += cardH + 14

    const ensureSpace = (needed) => {
      if (y + needed > pageHeight - 24) {
        doc.addPage()
        y = 24
      }
    }

    const sectionTitle = (title) => {
      ensureSpace(16)
      doc.setTextColor(...dark)
      doc.setFontSize(13)
      doc.setFont(undefined, 'bold')
      doc.text(title, marginX, y)
      doc.setFont(undefined, 'normal')
      y += 8
    }

    if (filters.type === 'by_person' && reportData?.length) {
      sectionTitle('Detalle por persona')

      const colName = marginX + 4
      const colCompleted = marginX + 92
      const colTotal = marginX + 122
      const colPct = pageWidth - marginX - 26
      const rowH = 11

      ensureSpace(rowH)
      doc.setFillColor(...primary)
      doc.rect(marginX, y - 6, pageWidth - marginX * 2, rowH, 'F')
      doc.setTextColor(255, 255, 255)
      doc.setFontSize(9)
      doc.setFont(undefined, 'bold')
      doc.text('Persona', colName, y + 1)
      doc.text('Completadas', colCompleted, y + 1)
      doc.text('Total', colTotal, y + 1)
      doc.text('% Avance', colPct, y + 1)
      doc.setFont(undefined, 'normal')
      y += rowH

      reportData.forEach((r, i) => {
        ensureSpace(rowH)
        if (i % 2 === 0) {
          doc.setFillColor(243, 244, 246)
          doc.rect(marginX, y - 6, pageWidth - marginX * 2, rowH, 'F')
        }
        doc.setTextColor(...dark)
        doc.setFontSize(9.5)
        doc.text(r.name, colName, y + 1)
        doc.text(String(r.completed), colCompleted, y + 1)
        doc.text(String(r.total), colTotal, y + 1)

        // Progress bar
        const barX = colPct
        const barW = 26
        const barH = 3.2
        doc.setFillColor(...border)
        doc.roundedRect(barX, y - 2.5, barW, barH, 1.5, 1.5, 'F')
        const pctColor = r.pct >= 75 ? [16, 185, 129] : r.pct >= 40 ? [251, 191, 36] : [239, 68, 68]
        doc.setFillColor(...pctColor)
        doc.roundedRect(barX, y - 2.5, Math.max((barW * r.pct) / 100, 1.5), barH, 1.5, 1.5, 'F')
        doc.setFontSize(8.5)
        doc.setTextColor(...muted)
        doc.text(`${r.pct}%`, barX + barW + 3, y + 1)

        y += rowH
      })
    }

    if (filters.type === 'productivity' && reportData?.length) {
      sectionTitle('Tareas completadas por persona')

      const maxValue = Math.max(...reportData.map((r) => r.completadas), 1)
      const barAreaW = pageWidth - marginX * 2 - 70
      const rowH = 12

      reportData.forEach((r) => {
        ensureSpace(rowH)
        doc.setTextColor(...dark)
        doc.setFontSize(9.5)
        doc.text(r.name, marginX + 2, y + 1)

        const barX = marginX + 56
        const barH = 5
        doc.setFillColor(243, 244, 246)
        doc.roundedRect(barX, y - 3.5, barAreaW, barH, 2, 2, 'F')
        const w = Math.max((barAreaW * r.completadas) / maxValue, 2)
        doc.setFillColor(...primary)
        doc.roundedRect(barX, y - 3.5, w, barH, 2, 2, 'F')

        doc.setTextColor(...muted)
        doc.setFontSize(9)
        doc.text(String(r.completadas), barX + barAreaW + 6, y + 1)

        y += rowH
      })
    }

    if (filters.type === 'compliance' && reportData?.length) {
      sectionTitle('Cumplimiento de fechas de entrega')

      const total = reportData.reduce((acc, r) => acc + r.value, 0) || 1
      const rowH = 14

      reportData.forEach((r) => {
        ensureSpace(rowH)
        const hex = r.color.replace('#', '')
        const rgb = [0, 2, 4].map((n) => parseInt(hex.slice(n, n + 2), 16))

        doc.setFillColor(...rgb)
        doc.circle(marginX + 4, y - 2, 2.4, 'F')

        doc.setTextColor(...dark)
        doc.setFontSize(10)
        doc.text(r.name, marginX + 11, y)

        const pct = Math.round((r.value / total) * 100)
        const barX = marginX + 60
        const barW = pageWidth - marginX * 2 - 60 - 36
        const barH = 5
        doc.setFillColor(243, 244, 246)
        doc.roundedRect(barX, y - 4, barW, barH, 2, 2, 'F')
        doc.setFillColor(...rgb)
        doc.roundedRect(barX, y - 4, Math.max((barW * pct) / 100, 1.5), barH, 2, 2, 'F')

        doc.setTextColor(...muted)
        doc.setFontSize(9)
        doc.text(`${r.value} (${pct}%)`, barX + barW + 4, y)

        y += rowH
      })
    }

    if (!reportData?.length) {
      doc.setTextColor(...muted)
      doc.setFontSize(10)
      doc.text('No hay datos disponibles para los filtros seleccionados.', marginX, y)
    }

    addFooter()
    doc.save(`${reportFileName}.pdf`)
    addToast('PDF descargado', 'success')
  }

  const handleExportExcel = () => {
    const ws = XLSX.utils.json_to_sheet(reportData || [])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Reporte')
    XLSX.writeFile(wb, `${reportFileName}.xlsx`)
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
          onClick={() => { setGenerated(true); setOpenMembers(new Set()) }}
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

          {memberDetails?.length > 0 && (
            <div className="mt-5 border-t border-[#edeef0] dark:border-[#2e3148] pt-4">
              <p className="text-[10px] font-bold text-[#434655] dark:text-[#c4c8e8] uppercase tracking-widest mb-3">Tareas por persona</p>
              <div className="space-y-1.5">
                {memberDetails.map((m) => (
                  <div key={m.id} className="rounded-xl border border-[#edeef0] dark:border-[#2e3148] overflow-hidden">
                    <button
                      onClick={() => toggleMember(m.id)}
                      className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-[#f8f9ff] dark:hover:bg-[#252840] transition text-left"
                    >
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0 ${getAvatarColor(m.name)}`}>
                        {getInitials(m.name)}
                      </div>
                      <span className="text-sm font-semibold text-[#191c1e] dark:text-[#e4e6f0] flex-1">{m.name}</span>
                      <div className="flex items-center gap-3 text-xs">
                        {m.completedTasks.length > 0 && (
                          <span className="flex items-center gap-1 font-semibold text-[#10B981]">
                            <span className="material-symbols-outlined text-xs">check_circle</span>
                            {m.completedTasks.length}
                          </span>
                        )}
                        {m.inProgressTasks.length > 0 && (
                          <span className="flex items-center gap-1 font-semibold text-[#004ac6]">
                            <span className="material-symbols-outlined text-xs">pending</span>
                            {m.inProgressTasks.length}
                          </span>
                        )}
                        {m.pendingTasks.length > 0 && (
                          <span className="flex items-center gap-1 font-semibold text-[#888]">
                            <span className="material-symbols-outlined text-xs">radio_button_unchecked</span>
                            {m.pendingTasks.length}
                          </span>
                        )}
                      </div>
                      <span className="material-symbols-outlined text-[#888] text-base ml-1">
                        {openMembers.has(m.id) ? 'expand_less' : 'expand_more'}
                      </span>
                    </button>

                    {openMembers.has(m.id) && (
                      <div className="px-4 pb-3 pt-2 border-t border-[#edeef0] dark:border-[#2e3148] space-y-3">
                        {m.completedTasks.length > 0 && (
                          <div>
                            <p className="text-[9px] font-bold text-[#10B981] uppercase tracking-widest mb-1.5">Completadas</p>
                            <div className="space-y-0.5">
                              {m.completedTasks.map((t) => (
                                <div key={t.id} className="flex items-center gap-2 text-xs text-[#888] dark:text-[#6b7280] line-through">
                                  <span className="material-symbols-outlined text-[#10B981] text-xs shrink-0" style={{ textDecoration: 'none' }}>check</span>
                                  {t.title}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        {m.inProgressTasks.length > 0 && (
                          <div>
                            <p className="text-[9px] font-bold text-[#004ac6] uppercase tracking-widest mb-1.5">En Progreso</p>
                            <div className="space-y-0.5">
                              {m.inProgressTasks.map((t) => (
                                <div key={t.id} className="flex items-center gap-2 text-xs text-[#191c1e] dark:text-[#e4e6f0]">
                                  <span className="material-symbols-outlined text-[#004ac6] text-xs shrink-0">arrow_right</span>
                                  {t.title}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        {m.pendingTasks.length > 0 && (
                          <div>
                            <p className="text-[9px] font-bold text-[#888] uppercase tracking-widest mb-1.5">Pendientes</p>
                            <div className="space-y-0.5">
                              {m.pendingTasks.map((t) => (
                                <div key={t.id} className="flex items-center gap-2 text-xs text-[#434655] dark:text-[#c4c8e8]">
                                  <span className="material-symbols-outlined text-[#888] text-xs shrink-0">circle</span>
                                  {t.title}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
