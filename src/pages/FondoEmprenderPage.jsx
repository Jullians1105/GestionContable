import { useState, useEffect, useCallback, useRef } from 'react'
import { api } from '../services/api'

// ─── constants ────────────────────────────────────────────────────────────────

const STATUS = {
  pending:     { label: 'Pendiente',  icon: 'radio_button_unchecked', color: '#6b7280', bg: '#f3f4f6' },
  in_progress: { label: 'En proceso', icon: 'timelapse',              color: '#d97706', bg: '#fef9c3' },
  done:        { label: 'Hecho',      icon: 'check_circle',           color: '#16a34a', bg: '#dcfce7' },
  na:          { label: 'N/A',        icon: 'do_not_disturb_on',      color: '#0ea5e9', bg: '#e0f2fe' },
}

const MONTHS = [
  'Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre',
]

const BORDER     = '1px solid #e2e4ef'
const BORDER_STR = '2px solid #c3c6d7'

// ─── component ───────────────────────────────────────────────────────────────

export default function FondoEmprenderPage() {
  const today = new Date()

  // Month/year (month is 0-indexed for display; mes is 1-indexed for API)
  const [month, setMonth] = useState(today.getMonth())
  const [year,  setYear]  = useState(today.getFullYear())
  const mes  = month + 1
  const anio = year

  // Empresa selector
  const [empresas,   setEmpresas]   = useState([])
  const [empresaId,  setEmpresaId]  = useState(null)
  const [loadingEmp, setLoadingEmp] = useState(true)

  // Checklist
  const [items,     setItems]     = useState([])
  const [confirmed, setConfirmed] = useState(false)
  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState(null)

  // Draft notas — debounced to avoid a PUT per keystroke
  const [notasDraft,    setNotasDraft]    = useState({})
  const debounceRefs    = useRef({})

  // ── load empresa list once ─────────────────────────────────────────────────
  useEffect(() => {
    api.getFondoEmpresas()
      .then(data => {
        setEmpresas(data)
        if (data.length > 0) setEmpresaId(data[0].id)
      })
      .catch(err => setError(err.message))
      .finally(() => setLoadingEmp(false))
  }, [])

  // ── load checklist when empresa or month/year changes ─────────────────────
  const fetchChecklist = useCallback(async () => {
    if (!empresaId) return
    try {
      setLoading(true)
      setError(null)
      const data = await api.getFondoChecklist(empresaId, anio, mes)
      setItems(data.items)
      setConfirmed(data.confirmed)
      const drafts = {}
      data.items.forEach(i => { drafts[i.id] = i.nota ?? '' })
      setNotasDraft(drafts)
    } catch (err) {
      setError(err.message || 'Error al cargar checklist')
    } finally {
      setLoading(false)
    }
  }, [empresaId, anio, mes])

  useEffect(() => { fetchChecklist() }, [fetchChecklist])

  // ── month navigation ───────────────────────────────────────────────────────
  function prevMonth() {
    if (month === 0) { setMonth(11); setYear(y => y - 1) }
    else setMonth(m => m - 1)
  }
  function nextMonth() {
    if (month === 11) { setMonth(0); setYear(y => y + 1) }
    else setMonth(m => m + 1)
  }

  // ── update item estado ─────────────────────────────────────────────────────
  const handleUpdateItem = useCallback(async (procesoId, updates) => {
    // Optimistic: update local state immediately
    if (updates.estado) {
      setItems(prev => prev.map(i => i.id === procesoId ? { ...i, estado: updates.estado } : i))
    }
    try {
      const actualizado = await api.updateFondoChecklistItem(empresaId, procesoId, anio, mes, updates)
      setItems(prev => prev.map(i => i.id === procesoId
        ? { ...i, estado: actualizado.estado, nota: actualizado.nota ?? i.nota }
        : i
      ))
      if ('nota' in updates) {
        setNotasDraft(prev => ({ ...prev, [procesoId]: actualizado.nota ?? '' }))
      }
    } catch (err) {
      if (err.status === 403) {
        alert('No tienes permiso para editar el checklist')
      } else {
        alert('Error: ' + err.message)
      }
      // Revert optimistic on error
      fetchChecklist()
    }
  }, [empresaId, anio, mes, fetchChecklist])

  // ── debounced nota save ────────────────────────────────────────────────────
  const debouncedSaveNota = useCallback((itemId, nota) => {
    clearTimeout(debounceRefs.current[itemId])
    debounceRefs.current[itemId] = setTimeout(() => {
      handleUpdateItem(itemId, { nota })
    }, 300)
  }, [handleUpdateItem])

  // ── toggle confirmed ───────────────────────────────────────────────────────
  const handleToggleConfirmado = useCallback(async () => {
    try {
      const resp = await api.updateFondoChecklistConfirmado(empresaId, anio, mes, { confirmed: !confirmed })
      setConfirmed(resp.confirmed)
    } catch (err) {
      alert('Error: ' + err.message)
    }
  }, [empresaId, anio, mes, confirmed])

  // ── derived stats ──────────────────────────────────────────────────────────
  const doneCells = items.filter(i => i.estado === 'done').length
  const pct       = items.length ? Math.round((doneCells / items.length) * 100) : 0
  const selectedEmpresa = empresas.find(e => e.id === empresaId)

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-4 min-w-0">

      {/* ── Page header ──────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-[#191c1e] dark:text-[#e4e6f0]">Fondo Emprender</h1>
          <p className="text-sm text-[#6b7280] dark:text-[#8890b5]">Seguimiento contable mensual</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Month navigator */}
          <div className="flex items-center gap-1 bg-white dark:bg-[#1e2030] border border-[#e2e4ef] dark:border-[#2e3148] rounded-xl px-3 py-2 shadow-sm">
            <button onClick={prevMonth} className="p-0.5 rounded hover:bg-[#f3f4f6] dark:hover:bg-[#252840] transition text-[#6b7280]">
              <span className="material-symbols-outlined text-xl">chevron_left</span>
            </button>
            <span className="text-sm font-semibold text-[#191c1e] dark:text-[#e4e6f0] px-2 min-w-[130px] text-center">
              {MONTHS[month]} {year}
            </span>
            <button onClick={nextMonth} className="p-0.5 rounded hover:bg-[#f3f4f6] dark:hover:bg-[#252840] transition text-[#6b7280]">
              <span className="material-symbols-outlined text-xl">chevron_right</span>
            </button>
          </div>
        </div>
      </div>

      {/* ── Empresa selector ─────────────────────────────────────────────── */}
      <div className="bg-white dark:bg-[#1e2030] border border-[#e2e4ef] dark:border-[#2e3148] rounded-xl px-4 py-3 shadow-sm flex items-center gap-3 flex-wrap">
        <span className="material-symbols-outlined text-[#004ac6]" style={{ fontSize: 20 }}>corporate_fare</span>
        <label className="text-xs font-semibold text-[#6b7280] dark:text-[#8890b5] uppercase tracking-wide flex-shrink-0">
          Empresa
        </label>
        {loadingEmp ? (
          <span className="text-xs text-[#8890b5]">Cargando...</span>
        ) : (
          <select
            value={empresaId ?? ''}
            onChange={e => setEmpresaId(e.target.value)}
            className="flex-1 min-w-[200px] px-3 py-1.5 text-sm rounded-lg border border-[#e2e4ef] dark:border-[#2e3148] bg-[#f8f9fc] dark:bg-[#252840] text-[#191c1e] dark:text-[#e4e6f0] outline-none focus:ring-2 focus:ring-[#004ac6]/30"
          >
            {empresas.map(e => (
              <option key={e.id} value={e.id}>{e.name}</option>
            ))}
          </select>
        )}
        {selectedEmpresa && (
          <span
            className="text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wide flex-shrink-0"
            style={
              selectedEmpresa.categoria === 'contable'
                ? { background: '#f0f4ff', color: '#004ac6' }
                : { background: '#f0fdf4', color: '#16a34a' }
            }
          >
            {selectedEmpresa.categoria}
          </span>
        )}
      </div>

      {/* ── Progress bar ─────────────────────────────────────────────────── */}
      <div className="bg-white dark:bg-[#1e2030] rounded-xl border border-[#e2e4ef] dark:border-[#2e3148] p-4 shadow-sm flex items-center gap-4">
        <div className="flex-1">
          <div className="flex justify-between mb-1.5">
            <span className="text-xs font-semibold text-[#191c1e] dark:text-[#e4e6f0]">Progreso del mes</span>
            <span className="text-xs font-bold text-[#16a34a]">{pct}%</span>
          </div>
          <div className="w-full h-2 rounded-full bg-[#f3f4f6] dark:bg-[#252840]">
            <div className="h-2 rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: '#16a34a' }} />
          </div>
        </div>
        <span className="text-xs text-[#6b7280] dark:text-[#8890b5] whitespace-nowrap">
          {doneCells} / {items.length} procesos
        </span>
      </div>

      {/* ── Loading / error ───────────────────────────────────────────────── */}
      {loading && (
        <div className="flex items-center justify-center py-12 text-[#8890b5] dark:text-[#5a5f7a]">
          <span className="material-symbols-outlined mr-2" style={{ fontSize: 20, animation: 'spin 1s linear infinite' }}>
            progress_activity
          </span>
          Cargando checklist…
        </div>
      )}

      {error && !loading && (
        <div className="flex flex-col items-center gap-3 py-10">
          <span className="material-symbols-outlined text-[#ef4444]" style={{ fontSize: 28 }}>error</span>
          <p className="text-sm text-[#ef4444]">{error}</p>
          <button onClick={fetchChecklist} className="px-4 py-2 text-xs rounded-lg border border-[#e2e4ef] hover:bg-[#f3f4f6] transition">
            Reintentar
          </button>
        </div>
      )}

      {/* ── Checklist table ───────────────────────────────────────────────── */}
      {!loading && !error && items.length > 0 && (
        <div
          className="overflow-auto rounded-xl border border-[#e2e4ef] dark:border-[#2e3148] shadow-sm bg-white dark:bg-[#1e2030]"
          style={{ maxHeight: 'calc(100vh - 22rem)' }}
        >
          <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 560 }}>
            <thead>
              <tr>
                <th
                  className="sticky top-0 z-10 bg-[#f8f9fc] dark:bg-[#1a1d2e] text-left text-[10px] font-bold text-[#6b7280] dark:text-[#8890b5] uppercase tracking-wide"
                  style={{ width: 32, border: BORDER, borderBottom: BORDER_STR, padding: '6px 8px' }}
                >
                  #
                </th>
                <th
                  className="sticky top-0 z-10 bg-[#f8f9fc] dark:bg-[#1a1d2e] text-left text-[10px] font-bold text-[#6b7280] dark:text-[#8890b5] uppercase tracking-wide"
                  style={{ border: BORDER, borderBottom: BORDER_STR, padding: '6px 12px' }}
                >
                  Proceso
                </th>
                <th
                  className="sticky top-0 z-10 bg-[#f8f9fc] dark:bg-[#1a1d2e] text-center text-[10px] font-bold text-[#6b7280] dark:text-[#8890b5] uppercase tracking-wide"
                  style={{ width: 200, border: BORDER, borderBottom: BORDER_STR, padding: '6px 8px' }}
                >
                  Estado
                </th>
                <th
                  className="sticky top-0 z-10 bg-[#f8f9fc] dark:bg-[#1a1d2e] text-left text-[10px] font-bold text-[#6b7280] dark:text-[#8890b5] uppercase tracking-wide"
                  style={{ width: 240, border: BORDER, borderBottom: BORDER_STR, padding: '6px 12px' }}
                >
                  Nota
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, idx) => {
                const cfg    = STATUS[item.estado] ?? STATUS.pending
                const rowBg  = idx % 2 === 0 ? '#ffffff' : '#f9fbff'
                return (
                  <tr key={item.id} style={{ background: rowBg }}>
                    {/* Row number */}
                    <td
                      className="text-center text-[10px] text-[#c3c6d7] dark:text-[#3e4260] tabular-nums"
                      style={{ border: BORDER, padding: '4px 8px' }}
                    >
                      {item.orden + 1}
                    </td>

                    {/* Process name */}
                    <td style={{ border: BORDER, padding: '4px 12px' }}>
                      <div className="flex items-center gap-2">
                        <span
                          className="material-symbols-outlined flex-shrink-0"
                          style={{ color: cfg.color, fontSize: 15 }}
                        >
                          {cfg.icon}
                        </span>
                        <span className="text-xs font-semibold text-[#191c1e] dark:text-[#e4e6f0]">
                          {item.name}
                        </span>
                      </div>
                    </td>

                    {/* Status buttons */}
                    <td style={{ border: BORDER, padding: '3px 6px' }}>
                      <div className="flex gap-1 justify-center">
                        {Object.entries(STATUS).map(([key, s]) => {
                          const active = item.estado === key
                          return (
                            <button
                              key={key}
                              title={s.label}
                              onClick={() => handleUpdateItem(item.id, { estado: key })}
                              className="flex items-center justify-center rounded-lg transition-all hover:scale-110 active:scale-90"
                              style={{
                                width: 32,
                                height: 28,
                                background: active ? s.bg : 'transparent',
                                border: `1.5px solid ${active ? s.color : '#e2e4ef'}`,
                              }}
                            >
                              <span className="material-symbols-outlined" style={{ color: active ? s.color : '#c3c6d7', fontSize: 14 }}>
                                {s.icon}
                              </span>
                            </button>
                          )
                        })}
                      </div>
                    </td>

                    {/* Nota — debounced save on change, immediate on blur */}
                    <td style={{ border: BORDER, padding: '3px 8px' }}>
                      <input
                        type="text"
                        value={notasDraft[item.id] ?? ''}
                        onChange={e => {
                          const val = e.target.value
                          setNotasDraft(prev => ({ ...prev, [item.id]: val }))
                          debouncedSaveNota(item.id, val)
                        }}
                        onBlur={e => {
                          clearTimeout(debounceRefs.current[item.id])
                          const val = e.target.value
                          if (val !== (item.nota ?? '')) {
                            handleUpdateItem(item.id, { nota: val })
                          }
                        }}
                        placeholder="Nota opcional..."
                        className="w-full px-2 py-1 text-xs rounded border border-[#e2e4ef] dark:border-[#2e3148] bg-[#f8f9fc] dark:bg-[#252840] text-[#191c1e] dark:text-[#e4e6f0] outline-none focus:ring-2 focus:ring-[#004ac6]/30"
                      />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Bottom bar: legend + confirmar ───────────────────────────────── */}
      {!loading && !error && items.length > 0 && (
        <div className="flex items-center justify-between flex-wrap gap-3">
          {/* Legend */}
          <div className="flex gap-4 flex-wrap items-center">
            {Object.entries(STATUS).map(([key, cfg]) => (
              <div key={key} className="flex items-center gap-1.5">
                <span className="material-symbols-outlined" style={{ color: cfg.color, fontSize: 15 }}>{cfg.icon}</span>
                <span className="text-xs text-[#6b7280] dark:text-[#8890b5]">{cfg.label}</span>
              </div>
            ))}
          </div>

          {/* Confirmar mes button */}
          <button
            onClick={handleToggleConfirmado}
            title={confirmed ? 'Clic para revertir confirmación' : 'Marcar mes como confirmado (Contabilidad)'}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition hover:opacity-90 active:scale-[0.97] shadow-sm"
            style={
              confirmed
                ? { background: '#dcfce7', color: '#16a34a', border: '1.5px solid #86efac' }
                : { background: '#f0fdf4', color: '#16a34a', border: '1.5px solid #bbf7d0' }
            }
          >
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
              {confirmed ? 'verified' : 'check_circle_outline'}
            </span>
            {confirmed ? `Confirmado — ${MONTHS[month]} ${year}` : 'Confirmar mes (Contabilidad)'}
          </button>
        </div>
      )}
    </div>
  )
}
