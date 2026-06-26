import { useMemo, useState } from 'react'
import {
  format, startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  eachDayOfInterval, isSameMonth, isSameDay, isToday,
  addMonths, subMonths,
} from 'date-fns'
import { es } from 'date-fns/locale'
import { useTasks } from '../hooks/useTasks'
import { useGroups } from '../context/GroupContext'
import { isDueDateOverdue, isDueDateSoon, PRIORITY_LABELS } from '../utils/helpers'

const DOT_COLOR = (task) => {
  if (isDueDateOverdue(task.dueDate, task.dueTime)) return '#EF4444'
  if (isDueDateSoon(task.dueDate, task.dueTime)) return '#FBBF24'
  return '#004ac6'
}

const DAY_LABELS = ['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sa', 'Do']

export default function CalendarPage() {
  const { tasks } = useTasks()
  const { currentGroupId } = useGroups()
  const [currentDate, setCurrentDate] = useState(new Date())
  const [selectedDay, setSelectedDay] = useState(null)

  const filtered = useMemo(() =>
    currentGroupId ? tasks.filter((t) => t.groupId === currentGroupId) : tasks,
    [tasks, currentGroupId]
  )

  const tasksByDate = useMemo(() => {
    const map = {}
    filtered.forEach((t) => {
      if (!t.dueDate) return
      const key = t.dueDate
      if (!map[key]) map[key] = []
      map[key].push(t)
    })
    return map
  }, [filtered])

  const calendarDays = useMemo(() => {
    const start = startOfWeek(startOfMonth(currentDate), { weekStartsOn: 1 })
    const end = endOfWeek(endOfMonth(currentDate), { weekStartsOn: 1 })
    return eachDayOfInterval({ start, end })
  }, [currentDate])

  const selectedTasks = useMemo(() => {
    if (!selectedDay) return []
    return tasksByDate[format(selectedDay, 'yyyy-MM-dd')] || []
  }, [selectedDay, tasksByDate])

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

                return (
                  <button
                    key={key}
                    onClick={() => setSelectedDay(day)}
                    className={`min-h-[52px] sm:min-h-[80px] p-1 sm:p-2 border-b border-r border-[#edeef0] dark:border-[#252840] text-left transition hover:bg-[#f8f9ff] dark:hover:bg-[#252840] ${!isCurrentMonth ? 'opacity-30' : ''} ${isSelected ? 'bg-blue-50 dark:bg-[#1a2040]' : ''}`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className={`text-sm font-semibold rounded-full w-7 h-7 flex items-center justify-center ${isTodayDay ? 'text-white' : 'text-[#191c1e] dark:text-[#e4e6f0]'}`} style={isTodayDay ? { background: '#004ac6' } : {}}>
                        {format(day, 'd')}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-0.5">
                      {dayTasks.slice(0, 3).map((t) => (
                        <span key={t.id} className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: DOT_COLOR(t) }} />
                      ))}
                      {dayTasks.length > 3 && <span className="text-[9px] text-[#888]">+{dayTasks.length - 3}</span>}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          <div className="flex gap-4 mt-3">
            {[['#EF4444', 'Vencida'], ['#FBBF24', 'Próxima a vencer'], ['#004ac6', 'Normal']].map(([c, l]) => (
              <div key={l} className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: c }} />
                <span className="text-xs text-[#434655] dark:text-[#c4c8e8]">{l}</span>
              </div>
            ))}
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
                      <div key={t.id} className="p-3 rounded-xl bg-[#f3f4f6] dark:bg-[#252840] border-l-2" style={{ borderColor: DOT_COLOR(t) }}>
                        <p className="text-sm font-semibold text-[#191c1e] dark:text-[#e4e6f0]">{t.title}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs text-[#888]">{PRIORITY_LABELS[t.priority]}</span>
                          {isDueDateOverdue(t.dueDate, t.dueTime) && <span className="text-xs text-[#EF4444] font-semibold">Vencida</span>}
                          {isDueDateSoon(t.dueDate, t.dueTime) && !isDueDateOverdue(t.dueDate, t.dueTime) && <span className="text-xs text-[#FBBF24] font-semibold">Próxima</span>}
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
