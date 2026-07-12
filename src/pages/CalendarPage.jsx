import { useMemo, useState, useEffect } from 'react'
import {
  format, startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  eachDayOfInterval, isSameMonth, isSameDay, isToday,
  addMonths, subMonths, getDaysInMonth,
} from 'date-fns'
import { es } from 'date-fns/locale'
import { useTasks } from '../hooks/useTasks'
import { useGroups } from '../context/GroupContext'
import { useAuth } from '../context/AuthContext'
import { api } from '../services/api'
import { isDueDateOverdue, isDueDateSoon, PRIORITY_LABELS } from '../utils/helpers'

const DOT_COLOR = (task) => {
  if (task._isTemplate) return '#f97316'
  if (isDueDateOverdue(task.dueDate, task.dueTime)) return '#EF4444'
  if (isDueDateSoon(task.dueDate, task.dueTime)) return '#FBBF24'
  return task.templateId ? '#7c3aed' : '#004ac6'
}

const DAY_LABELS = ['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sa', 'Do']

export default function CalendarPage() {
  const { tasks } = useTasks()
  const { currentGroupId } = useGroups()
  const { isAdmin, isLeader } = useAuth()
  const [currentDate, setCurrentDate] = useState(new Date())
  const [selectedDay, setSelectedDay] = useState(null)
  const [templates, setTemplates] = useState([])

  const canSeeTemplates = isAdmin() || isLeader()

  useEffect(() => {
    if (!canSeeTemplates) return
    api.getTemplates().then(data => setTemplates(Array.isArray(data) ? data : [])).catch(() => {})
  }, [canSeeTemplates])

  const filtered = useMemo(() =>
    currentGroupId ? tasks.filter((t) => t.groupId === currentGroupId) : tasks,
    [tasks, currentGroupId]
  )

  // Proyectar templates al mes visible
  const projectedTemplates = useMemo(() => {
    if (!canSeeTemplates) return []
    const year = currentDate.getFullYear()
    const month = currentDate.getMonth() + 1
    const daysInMonth = getDaysInMonth(currentDate)
    const currentYM = `${year}-${String(month).padStart(2, '0')}`
    return templates.map(t => {
      const approxDay = t.recurrence?.approx_day ?? 1
      // Respetar rango de vigencia
      if (t.recurrence?.start_date && currentYM < t.recurrence.start_date) return null
      if (t.recurrence?.end_date && currentYM > t.recurrence.end_date) return null
      const day = Math.min(approxDay, daysInMonth)
      const dueDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      // No mostrar si ya existe una instancia real ese día para este template
      const instanceExists = filtered.some(task => task.templateId === t.id && task.dueDate === dueDate)
      if (instanceExists) return null
      return { ...t, dueDate, _isTemplate: true }
    }).filter(Boolean)
  }, [templates, currentDate, filtered, canSeeTemplates])

  const tasksByDate = useMemo(() => {
    const map = {}
    filtered.forEach((t) => {
      if (!t.dueDate) return
      const key = t.dueDate
      if (!map[key]) map[key] = []
      map[key].push(t)
    })
    projectedTemplates.forEach((t) => {
      const key = t.dueDate
      if (!map[key]) map[key] = []
      map[key].push(t)
    })
    return map
  }, [filtered, projectedTemplates])

  // Días sombreados: dentro del rango [start_date, end_date] de cualquier template
  const shadedRanges = useMemo(() => {
    if (!canSeeTemplates || !templates.length) return []
    return templates
      .filter(t => t.recurrence?.start_date && t.recurrence?.end_date)
      .map(t => ({ start: t.recurrence.start_date, end: t.recurrence.end_date, title: t.title }))
  }, [templates, canSeeTemplates])

  const calendarDays = useMemo(() => {
    const start = startOfWeek(startOfMonth(currentDate), { weekStartsOn: 1 })
    const end = endOfWeek(endOfMonth(currentDate), { weekStartsOn: 1 })
    return eachDayOfInterval({ start, end })
  }, [currentDate])

  const selectedTasks = useMemo(() => {
    if (!selectedDay) return []
    const key = format(selectedDay, 'yyyy-MM-dd')
    const base = tasksByDate[key] || []
    if (!canSeeTemplates) return base

    // Días dentro del rango de vigencia de un template (barra naranja) que no tienen
    // ya una instancia/proyección propia ese día: igual mostrar el template en el
    // panel, como si fuera una tarea de ese día.
    const baseIds = new Set(base.map((t) => t.id))
    const inRangeTemplates = templates
      .filter((t) => {
        if (baseIds.has(t.id)) return false
        const { start_date, end_date } = t.recurrence || {}
        if (!start_date || !end_date) return false
        return key >= start_date && key <= end_date
      })
      .map((t) => ({ ...t, _isTemplate: true, dueDate: key }))

    return [...base, ...inRangeTemplates]
  }, [selectedDay, tasksByDate, templates, canSeeTemplates])

  const monthLabel = format(currentDate, 'MMMM yyyy', { locale: es })

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <h1 className="text-xl sm:text-2xl font-bold text-[#191c1e] dark:text-[#e4e6f0] capitalize">{monthLabel}</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setCurrentDate(new Date()); setSelectedDay(new Date()) }}
            className="h-9 px-3 rounded-lg text-sm font-semibold border border-[#c3c6d7] dark:border-[#2e3148] text-[#434655] dark:text-[#c4c8e8] hover:bg-[#edeef0] dark:hover:bg-[#252840] transition"
          >
            Hoy
          </button>
          <button onClick={() => setCurrentDate((d) => subMonths(d, 1))} className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-[#edeef0] dark:hover:bg-[#252840] transition">
            <span className="material-symbols-outlined text-[#434655] dark:text-[#c4c8e8]">chevron_left</span>
          </button>
          <button onClick={() => setCurrentDate((d) => addMonths(d, 1))} className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-[#edeef0] dark:hover:bg-[#252840] transition">
            <span className="material-symbols-outlined text-[#434655] dark:text-[#c4c8e8]">chevron_right</span>
          </button>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        <div className="flex-1 min-w-0">
          <div className="bg-white dark:bg-[#1e2030] rounded-2xl border border-[#c3c6d7] dark:border-[#2e3148] overflow-hidden">
            <div className="grid grid-cols-7">
              {DAY_LABELS.map((d) => (
                <div key={d} className="py-3 text-center text-xs font-bold text-[#434655] dark:text-[#c4c8e8] bg-[#f3f4f6] dark:bg-[#252840]">
                  {d}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7">
              {calendarDays.map((day) => {
                const key = format(day, 'yyyy-MM-dd')
                const dayTasks = tasksByDate[key] || []
                const isCurrentMonth = isSameMonth(day, currentDate)
                const isSelected = selectedDay && isSameDay(day, selectedDay)
                const isTodayDay = isToday(day)
                const activeRanges = shadedRanges.filter(r => key >= r.start && key <= r.end)

                return (
                  <button
                    key={key}
                    onClick={() => setSelectedDay(day)}
                    className={`relative min-h-[52px] sm:min-h-[80px] p-1 sm:p-2 border-b border-r border-[#edeef0] dark:border-[#252840] text-left transition overflow-hidden ${!isCurrentMonth ? 'opacity-30' : ''} ${isSelected ? 'bg-blue-50 dark:bg-[#1a2040]' : 'hover:bg-[#f8f9ff] dark:hover:bg-[#252840]'}`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className={`text-sm font-semibold rounded-full w-7 h-7 flex items-center justify-center ${isTodayDay ? 'text-white' : 'text-[#191c1e] dark:text-[#e4e6f0]'}`} style={isTodayDay ? { background: '#004ac6' } : {}}>
                        {format(day, 'd')}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-0.5 items-center">
                      {dayTasks.slice(0, 3).map((t) => (
                        <span
                          key={t.id}
                          className={`w-2 h-2 rounded-full flex-shrink-0 ${t._isTemplate ? 'opacity-50' : ''}`}
                          style={{ background: DOT_COLOR(t) }}
                        />
                      ))}
                      {dayTasks.length > 3 && <span className="text-[9px] text-[#888]">+{dayTasks.length - 3}</span>}
                    </div>
                    {/* Barras de rango de templates */}
                    {activeRanges.map((r, i) => {
                      const isStart = key === r.start
                      const isEnd   = key === r.end
                      return (
                        <span
                          key={r.title + i}
                          className="absolute left-0 right-0"
                          style={{
                            bottom: 2 + i * 5,
                            height: 4,
                            background: '#f97316',
                            opacity: 0.55,
                            marginLeft: isStart ? 4 : 0,
                            marginRight: isEnd ? 4 : 0,
                            borderRadius: isStart && isEnd ? 4 : isStart ? '4px 0 0 4px' : isEnd ? '0 4px 4px 0' : 0,
                          }}
                        />
                      )
                    })}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="flex flex-wrap gap-4 mt-3">
            {[['#EF4444', 'Vencida'], ['#FBBF24', 'Próxima a vencer'], ['#004ac6', 'Normal'], ['#7c3aed', 'Recurrente']].map(([c, l]) => (
              <div key={l} className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: c }} />
                <span className="text-xs text-[#434655] dark:text-[#c4c8e8]">{l}</span>
              </div>
            ))}
            {canSeeTemplates && (
              <>
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full border-2 border-dashed border-[#f97316]" />
                  <span className="text-xs text-[#434655] dark:text-[#c4c8e8]">Template proyectado</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-5 h-1 rounded-full" style={{ background: '#f97316', opacity: 0.55 }} />
                  <span className="text-xs text-[#434655] dark:text-[#c4c8e8]">Rango de template</span>
                </div>
              </>
            )}
          </div>
        </div>

        <div className="w-full lg:w-72 lg:flex-shrink-0">
          <div className="bg-white dark:bg-[#1e2030] rounded-2xl border border-[#c3c6d7] dark:border-[#2e3148] p-4">
            {selectedDay ? (
              <>
                <h3 className="text-sm font-bold text-[#191c1e] dark:text-[#e4e6f0] mb-3 capitalize">
                  {format(selectedDay, "EEEE d 'de' MMMM", { locale: es })}
                </h3>
                {selectedTasks.length === 0 ? (
                  <div className="text-center py-8">
                    <span className="material-symbols-outlined text-3xl text-[#c3c6d7]">event_available</span>
                    <p className="text-sm text-[#434655] dark:text-[#c4c8e8] mt-2">Sin tareas este día</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {selectedTasks.map((t) => (
                      <div
                        key={t.id}
                        className={`p-3 rounded-xl border-l-2 ${t._isTemplate ? 'bg-[#fff7ed] dark:bg-[#2a1f0f] border-dashed opacity-80' : 'bg-[#f3f4f6] dark:bg-[#252840]'}`}
                        style={{ borderColor: DOT_COLOR(t) }}
                      >
                        <div className="flex items-center gap-1.5 mb-0.5">
                          {(t._isTemplate || t.templateId) && (
                            <span className="material-symbols-outlined text-sm" style={{ color: t._isTemplate ? '#f97316' : '#7c3aed' }}>
                              {t._isTemplate ? 'repeat' : 'event_repeat'}
                            </span>
                          )}
                          <p className="text-sm font-semibold text-[#191c1e] dark:text-[#e4e6f0] flex-1">{t.title}</p>
                        </div>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <span className="text-xs text-[#888]">{PRIORITY_LABELS[t.priority]}</span>
                          {(t.startTime || t.dueTime) && !t._isTemplate && (
                            <span className="text-xs text-[#434655] dark:text-[#c4c8e8] flex items-center gap-0.5">
                              <span className="material-symbols-outlined" style={{ fontSize: 12 }}>schedule</span>
                              {t.startTime && t.dueTime ? `${t.startTime.slice(0,5)} → ${t.dueTime.slice(0,5)}` : t.startTime ? `desde ${t.startTime.slice(0,5)}` : `hasta ${t.dueTime.slice(0,5)}`}
                            </span>
                          )}
                          {t._isTemplate && (
                            <span className="text-[10px] font-semibold text-[#f97316]">
                              Template recurrente
                              {(t.recurrence?.start_date || t.recurrence?.end_date) && (
                                <span className="font-normal opacity-75 ml-1 block">
                                  {t.recurrence.start_date ?? '∞'} → {t.recurrence.end_date ?? '∞'}
                                </span>
                              )}
                            </span>
                          )}
                          {t.templateId && !t.dueDate && <span className="text-[10px] font-semibold text-[#c2410c]">Sin fecha</span>}
                          {!t._isTemplate && isDueDateOverdue(t.dueDate, t.dueTime) && <span className="text-xs text-[#EF4444] font-semibold">Vencida</span>}
                          {!t._isTemplate && isDueDateSoon(t.dueDate, t.dueTime) && !isDueDateOverdue(t.dueDate, t.dueTime) && <span className="text-xs text-[#FBBF24] font-semibold">Próxima</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <div className="text-center py-8">
                <span className="material-symbols-outlined text-3xl text-[#c3c6d7]">touch_app</span>
                <p className="text-sm text-[#434655] dark:text-[#c4c8e8] mt-2">Selecciona un día para ver sus tareas</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
