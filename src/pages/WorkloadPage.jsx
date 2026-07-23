import { useEffect, useMemo, useState } from 'react'
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { api } from '../services/api'
import { useToast } from '../context/ToastContext'
import { getInitials, getAvatarColor } from '../utils/helpers'

const OVERLOAD_FACTOR = 1.3
const UNDERLOAD_FACTOR = 0.7
const BALANCE_CV_THRESHOLD = 0.4

export default function WorkloadPage() {
  const { addToast } = useToast()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.getWorkload()
      .then(setData)
      .catch(() => addToast('No se pudo cargar la carga de trabajo', 'error'))
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const rows = useMemo(() => {
    if (!data?.current) return []
    return data.current
      .map((r) => ({ id: r.id, name: r.name, abiertas: Number(r.abiertas), vencidas: Number(r.vencidas) }))
      .sort((a, b) => b.abiertas - a.abiertas)
  }, [data])

  const stats = useMemo(() => {
    if (!rows.length) return null
    const total = rows.reduce((acc, r) => acc + r.abiertas, 0)
    const avg = total / rows.length
    const variance = rows.reduce((acc, r) => acc + (r.abiertas - avg) ** 2, 0) / rows.length
    const stdDev = Math.sqrt(variance)
    const cv = avg > 0 ? stdDev / avg : 0
    return {
      total,
      avg,
      cv,
      max: rows[0],
      min: rows[rows.length - 1],
      balanced: total === 0 || cv <= BALANCE_CV_THRESHOLD,
    }
  }, [rows])

  // Recomendaciones de rebalanceo calculadas POR GRUPO — una persona de Desarrollo no puede
  // absorber tareas de Fondo Emprender o Tributario, así que solo se comparan cargas entre
  // personas que comparten grupo (usando data.byGroup, no el total global de `rows`).
  const recommendationsByGroup = useMemo(() => {
    if (!data?.byGroup) return []
    return data.byGroup
      .map((g) => {
        const members = g.members.map((m) => ({
          id: m.id, name: m.name, abiertas: Number(m.abiertas), vencidas: Number(m.vencidas),
        }))
        if (members.length < 2) return { groupName: g.groupName, recs: [] }

        const total = members.reduce((acc, m) => acc + m.abiertas, 0)
        const avg = total / members.length
        if (avg === 0) return { groupName: g.groupName, recs: [] }

        const overloaded = members
          .filter((m) => m.abiertas > avg * OVERLOAD_FACTOR)
          .sort((a, b) => b.abiertas - a.abiertas)
        const underloaded = [...members]
          .filter((m) => m.abiertas < avg * UNDERLOAD_FACTOR)
          .sort((a, b) => a.abiertas - b.abiertas)

        const recs = []
        const n = Math.min(3, overloaded.length, underloaded.length)
        for (let i = 0; i < n; i += 1) {
          const from = overloaded[i]
          const to = underloaded[i]
          recs.push({ from, to, move: Math.max(1, Math.round((from.abiertas - avg) / 2)) })
        }
        return { groupName: g.groupName, recs }
      })
      .filter((g) => g.recs.length > 0)
  }, [data])

  const monthlyChart = useMemo(() => {
    if (!data?.monthly) return []
    const byMonth = new Map()
    for (const r of data.monthly) {
      byMonth.set(r.mes, (byMonth.get(r.mes) || 0) + Number(r.creadas))
    }
    return [...byMonth.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([mes, total]) => ({
        mes: format(parseISO(`${mes}-01`), 'MMM yyyy', { locale: es }),
        total,
      }))
  }, [data])

  const barColor = (abiertas) => {
    if (!stats || stats.avg === 0) return '#004ac6'
    if (abiertas > stats.avg * OVERLOAD_FACTOR) return '#EF4444'
    if (abiertas < stats.avg * UNDERLOAD_FACTOR) return '#10B981'
    return '#FBBF24'
  }

  if (loading) {
    return <p className="text-sm text-[#434655] dark:text-[#c4c8e8]">Cargando carga de trabajo...</p>
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[#191c1e] dark:text-[#e4e6f0]">Carga de Trabajo</h1>
        <p className="text-sm text-[#434655] dark:text-[#c4c8e8] mt-0.5">Visión general de la distribución de tareas del equipo</p>
      </div>

      {!rows.length ? (
        <div className="bg-white dark:bg-[#1e2030] rounded-2xl border border-[#c3c6d7] dark:border-[#2e3148] p-8 text-center text-sm text-[#434655] dark:text-[#c4c8e8]">
          No hay tareas abiertas registradas todavía.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
            <div className="bg-white dark:bg-[#1e2030] rounded-2xl border border-[#c3c6d7] dark:border-[#2e3148] p-5">
              <p className="text-xs font-semibold text-[#434655] dark:text-[#c4c8e8] mb-1">Total tareas abiertas</p>
              <p className="text-2xl font-bold text-[#191c1e] dark:text-[#e4e6f0]">{stats.total}</p>
              <p className="text-xs text-[#888] mt-1">Promedio: {stats.avg.toFixed(1)} por persona</p>
            </div>
            <div className="bg-white dark:bg-[#1e2030] rounded-2xl border border-[#c3c6d7] dark:border-[#2e3148] p-5">
              <p className="text-xs font-semibold text-[#434655] dark:text-[#c4c8e8] mb-1">Balance del equipo</p>
              <p className={`text-2xl font-bold ${stats.balanced ? 'text-[#10B981]' : 'text-[#EF4444]'}`}>
                {stats.balanced ? 'Balanceado' : 'Desbalanceado'}
              </p>
              <p className="text-xs text-[#888] mt-1">
                {stats.max.name}: {stats.max.abiertas} · {stats.min.name}: {stats.min.abiertas}
              </p>
            </div>
            <div className="bg-white dark:bg-[#1e2030] rounded-2xl border border-[#c3c6d7] dark:border-[#2e3148] p-5">
              <p className="text-xs font-semibold text-[#434655] dark:text-[#c4c8e8] mb-1">Tareas vencidas</p>
              <p className="text-2xl font-bold text-[#EF4444]">{rows.reduce((a, r) => a + r.vencidas, 0)}</p>
              <p className="text-xs text-[#888] mt-1">entre tareas abiertas del equipo</p>
            </div>
          </div>

          {recommendationsByGroup.length > 0 && (
            <div className="bg-white dark:bg-[#1e2030] rounded-2xl border border-[#c3c6d7] dark:border-[#2e3148] p-5 mb-5">
              <h2 className="text-sm font-bold text-[#191c1e] dark:text-[#e4e6f0] mb-1 flex items-center gap-2">
                <span className="material-symbols-outlined text-base text-[#004ac6]">lightbulb</span>
                Recomendaciones de rebalanceo
              </h2>
              <p className="text-xs text-[#888] mb-3">
                Solo se comparan personas dentro del mismo grupo — una tarea de un grupo no se sugiere para alguien de otro.
              </p>
              <div className="space-y-4">
                {recommendationsByGroup.map((g) => (
                  <div key={g.groupName}>
                    <p className="text-[10px] font-bold text-[#888] uppercase tracking-widest mb-1.5">{g.groupName}</p>
                    <ul className="space-y-2">
                      {g.recs.map((rec, i) => (
                        <li key={i} className="text-sm text-[#434655] dark:text-[#c4c8e8] flex items-start gap-2">
                          <span className="material-symbols-outlined text-sm text-[#FBBF24] mt-0.5">arrow_forward</span>
                          <span>
                            Transferir <strong className="text-[#191c1e] dark:text-[#e4e6f0]">{rec.move} tarea{rec.move !== 1 ? 's' : ''}</strong> de{' '}
                            <strong className="text-[#191c1e] dark:text-[#e4e6f0]">{rec.from.name}</strong> ({rec.from.abiertas} abiertas) a{' '}
                            <strong className="text-[#191c1e] dark:text-[#e4e6f0]">{rec.to.name}</strong> (carga baja, {rec.to.abiertas} abiertas)
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="bg-white dark:bg-[#1e2030] rounded-2xl border border-[#c3c6d7] dark:border-[#2e3148] p-5 mb-5">
            <h2 className="text-sm font-bold text-[#191c1e] dark:text-[#e4e6f0] mb-4">Tareas abiertas por persona</h2>
            <ResponsiveContainer width="100%" height={Math.max(280, rows.length * 32)}>
              <BarChart data={rows} layout="vertical" margin={{ top: 5, right: 24, bottom: 5, left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#edeef0" />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12, fill: '#434655' }} />
                <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 12, fill: '#434655' }} />
                <Tooltip />
                <Bar dataKey="abiertas" radius={[0, 4, 4, 0]}>
                  {rows.map((r) => <Cell key={r.id} fill={barColor(r.abiertas)} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-white dark:bg-[#1e2030] rounded-2xl border border-[#c3c6d7] dark:border-[#2e3148] p-5 mb-5">
            <h2 className="text-sm font-bold text-[#191c1e] dark:text-[#e4e6f0] mb-4">Detalle por persona</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#edeef0] dark:border-[#252840]">
                    {['Persona', 'Abiertas', 'Vencidas'].map((h) => (
                      <th key={h} className="text-left text-xs font-semibold text-[#434655] dark:text-[#c4c8e8] py-2 px-3">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-b border-[#edeef0] dark:border-[#252840] hover:bg-[#f8f9ff] dark:hover:bg-[#252840]">
                      <td className="py-2 px-3">
                        <div className="flex items-center gap-2">
                          <div className={`w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0 ${getAvatarColor(r.name)}`}>
                            {getInitials(r.name)}
                          </div>
                          <span className="font-semibold text-[#191c1e] dark:text-[#e4e6f0]">{r.name}</span>
                        </div>
                      </td>
                      <td className="py-2 px-3 font-semibold" style={{ color: barColor(r.abiertas) }}>{r.abiertas}</td>
                      <td className="py-2 px-3">
                        {r.vencidas > 0
                          ? <span className="text-[#EF4444] font-semibold">{r.vencidas}</span>
                          : <span className="text-[#888]">0</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {monthlyChart.length > 0 && (
            <div className="bg-white dark:bg-[#1e2030] rounded-2xl border border-[#c3c6d7] dark:border-[#2e3148] p-5">
              <h2 className="text-sm font-bold text-[#191c1e] dark:text-[#e4e6f0] mb-1">Histórico de carga (tareas nuevas por mes)</h2>
              <p className="text-xs text-[#888] mb-4">Tendencia de tareas creadas para el equipo en los últimos meses</p>
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={monthlyChart} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#edeef0" />
                  <XAxis dataKey="mes" tick={{ fontSize: 12, fill: '#434655' }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: '#434655' }} />
                  <Tooltip />
                  <Line type="monotone" dataKey="total" stroke="#004ac6" strokeWidth={2} dot={{ r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </>
      )}
    </div>
  )
}
