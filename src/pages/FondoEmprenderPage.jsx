import { useState, useEffect, useRef, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { migrateLegacyLocalStorage, getMigrationReport, dismissMigrationReport, getMesVencidoHabilitado, resolveMesInicial } from '../data/fondoEmprender'
import { api } from '../services/api'
import { useSocket } from '../context/SocketContext'

// ─── page-level constants ─────────────────────────────────────────────────────

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

const emptyCell = { status: 'pending', note: '' }

// ─── component ───────────────────────────────────────────────────────────────

export default function FondoEmprenderPage() {
  const { socket } = useSocket()
  const [searchParams, setSearchParams] = useSearchParams()

  // ── state ────────────────────────────────────────────────────────────────
  // month/year se inicializan desde la URL (si viene y está dentro del mes
  // habilitado) para que un reload conserve la posición; si no, caen al mes
  // habilitado (nunca a "hoy", que puede estar bloqueado por mes vencido).
  const [mesInicial]                = useState(() => resolveMesInicial(searchParams))
  const [month, setMonth]           = useState(mesInicial.month)
  const [year, setYear]             = useState(mesInicial.year)
  const [processes, setProcesses]   = useState([])
  const [companies, setCompanies]   = useState([])
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState(null)
  const [migrationReport, setMigrationReport] = useState(() => getMigrationReport())

  // cell popup
  const [openCell, setOpenCell]     = useState(null)  // { companyId, procId, left, top }
  const dropdownRef    = useRef(null)
  const noteTextareaRef = useRef(null)
  const openCellRef    = useRef(openCell)   // lets effects read the latest openCell without re-subscribing
  openCellRef.current  = openCell
  const noteDirtyRef   = useRef(false)      // true while the open textarea has unsaved keystrokes

  // tooltip for notes (Excel-style, resizable, per-cell size)
  const [tooltip, setTooltip]         = useState(null)
  const [tooltipSize, setTooltipSize] = useState({ width: 220, height: 80 })
  const hideTimerRef    = useRef(null)
  const tooltipSizeRef  = useRef(tooltipSize)
  const tooltipKeyRef   = useRef(null)        // key of the cell whose size is active
  tooltipSizeRef.current = tooltipSize        // kept in sync on every render

  // edit company name inline
  const [editingCompany, setEditingCompany] = useState(null)  // { id }
  const [editCompanyName, setEditCompanyName] = useState('')

  // add / edit process
  const [addingProcess, setAddingProcess]   = useState(false)
  const [newProcessName, setNewProcessName] = useState('')
  const [editingProcess, setEditingProcess] = useState(null) // { id, name }
  const [editProcessName, setEditProcessName] = useState('')

  // delete confirmation
  const [deleteConfirm, setDeleteConfirm] = useState(null) // { type, id, name }

  // filters: category tabs + search
  const [search, setSearch]       = useState('')
  const [activeTab, setActiveTab] = useState('todas')

  const refetchTimerRef = useRef(null)

  // ── load grid from backend ──────────────────────────────────────────────

  const fetchGrid = useCallback(async () => {
    try {
      setError(null)
      const [empresas, procesos, checklistsPorEmpresa] = await Promise.all([
        api.getFondoEmpresas(),
        api.getFondoProcesos(),
        api.getFondoChecklistMes(year, month + 1),
      ])

      // One-time, best-effort recovery of whatever is still stuck in
      // localStorage from before the grid was wired to the backend.
      await migrateLegacyLocalStorage(api, empresas, procesos)
      setMigrationReport(getMigrationReport())

      const checklistPorEmpresaId = new Map(
        checklistsPorEmpresa.map(c => [c.empresaId, c])
      )

      const built = empresas.map((e) => {
        const chk = checklistPorEmpresaId.get(e.id) ?? { items: [], confirmed: false, confirmedAt: null }
        const cells = {}
        chk.items.forEach(it => { cells[it.id] = { status: it.estado, note: it.nota ?? '' } })
        return {
          id: e.id,
          name: e.name,
          categoria: e.categoria,
          cells,
          confirmed: chk.confirmed
            ? { date: (chk.confirmedAt ?? new Date().toISOString()).slice(0, 10) }
            : null,
        }
      })

      setProcesses(procesos)
      setCompanies(built)
    } catch (err) {
      setError(err.message || 'Error al cargar el seguimiento mensual')
    } finally {
      setLoading(false)
    }
  }, [year, month])

  // Single place that persists a note to the backend. Used both by the
  // textarea's onBlur and by flushPendingNote() below.
  const saveNote = useCallback(async (companyId, procId, note) => {
    noteDirtyRef.current = false
    try {
      await api.updateFondoChecklistItem(companyId, procId, year, month + 1, { nota: note || null })
    } catch (err) {
      console.error('Error al guardar nota:', err.message)
      fetchGrid()
    }
  }, [year, month, fetchGrid])

  // A refetch (window focus, another user's edit) replaces `companies`
  // wholesale. If the note popup is open with unsaved keystrokes, that
  // refetch would silently revert them — save first so nothing is lost.
  const flushPendingNote = useCallback(() => {
    const oc = openCellRef.current
    if (!oc || !noteDirtyRef.current || !noteTextareaRef.current) return Promise.resolve()
    return saveNote(oc.companyId, oc.procId, noteTextareaRef.current.value)
  }, [saveNote])

  useEffect(() => { setLoading(true); fetchGrid() }, [fetchGrid])

  // Refresh on window focus (catches changes made in another tab)
  useEffect(() => {
    const onFocus = () => { flushPendingNote().then(fetchGrid) }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [fetchGrid, flushPendingNote])

  // Refresh (debounced) when another user edits the same month, or the
  // company list changes — debounced so a burst of edits from one user
  // doesn't trigger a full-grid refetch storm for everyone else.
  useEffect(() => {
    if (!socket) return
    const handler = (payload) => {
      if (payload?.tipo === 'checklist' && (payload.anio !== year || payload.mes !== month + 1)) return
      clearTimeout(refetchTimerRef.current)
      refetchTimerRef.current = setTimeout(() => { flushPendingNote().then(fetchGrid) }, 1200)
    }
    socket.on('empresa:updated', handler)
    return () => {
      socket.off('empresa:updated', handler)
      clearTimeout(refetchTimerRef.current)
    }
  }, [socket, year, month, fetchGrid, flushPendingNote])

  // Auto-resize textarea when popup opens; overflow only at max height
  useEffect(() => {
    const ta = noteTextareaRef.current
    if (!ta) return
    ta.style.height = 'auto'
    const h = Math.min(ta.scrollHeight, 200)
    ta.style.height = h + 'px'
    ta.style.overflowY = h >= 200 ? 'auto' : 'hidden'
  }, [openCell])

  // Close cell popup on outside click. Flush first: if the popup unmounts
  // before the textarea's native blur fires, the keystroke would be lost.
  useEffect(() => {
    if (!openCell) return
    const h = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        flushPendingNote()
        setOpenCell(null)
      }
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [openCell, flushPendingNote])

  // ── month nav ────────────────────────────────────────────────────────────
  // Seguimiento Mensual es de mes vencido: no se puede navegar más allá del
  // mes calendario anterior (el mes en curso todavía no ha "vencido").
  const mesHabilitado = getMesVencidoHabilitado()
  const habilitadoYM = mesHabilitado.anio * 100 + mesHabilitado.mes
  const atMesHabilitado = (year * 100 + (month + 1)) >= habilitadoYM

  function goToMonth(newMonth, newYear) {
    setMonth(newMonth)
    setYear(newYear)
    setSearchParams({ anio: String(newYear), mes: String(newMonth + 1) }, { replace: true })
  }
  function prevMonth() {
    if (month === 0) goToMonth(11, year - 1)
    else goToMonth(month - 1, year)
  }
  function nextMonth() {
    // Bloquea siempre que el DESTINO exceda el mes habilitado, sin importar
    // en qué mes se esté parado ahora (evita quedar "más allá" y poder
    // seguir avanzando libremente).
    const targetMonth = month === 11 ? 0 : month + 1
    const targetYear  = month === 11 ? year + 1 : year
    if ((targetYear * 100 + (targetMonth + 1)) > habilitadoYM) return
    goToMonth(targetMonth, targetYear)
  }

  // ── cell popup ───────────────────────────────────────────────────────────

  function handleCellClick(companyId, procId, e) {
    const rect = e.currentTarget.getBoundingClientRect()
    const PW = 260, PH = 252
    let left = rect.left
    let top  = rect.bottom + 4
    if (left + PW > window.innerWidth - 8)  left = window.innerWidth - PW - 8
    if (left < 8) left = 8
    if (top  + PH > window.innerHeight - 8) top  = rect.top - PH - 4
    if (top  < 8) top  = 8
    noteDirtyRef.current = false
    setOpenCell({ companyId, procId, left, top })
  }

  function updateCellLocal(companyId, procId, updates) {
    setCompanies(prev =>
      prev.map(c =>
        c.id === companyId
          ? { ...c, cells: { ...c.cells, [procId]: { ...(c.cells[procId] ?? emptyCell), ...updates } } }
          : c
      )
    )
  }

  async function handleStatusChange(companyId, procId, status) {
    updateCellLocal(companyId, procId, { status })
    try {
      await api.updateFondoChecklistItem(companyId, procId, year, month + 1, { estado: status })
    } catch (err) {
      console.error('Error al guardar estado:', err.message)
      fetchGrid()
    }
  }

  function handleNoteChange(companyId, procId, note) {
    noteDirtyRef.current = true
    updateCellLocal(companyId, procId, { note })
  }

  function handleNoteBlur(companyId, procId, note) {
    saveNote(companyId, procId, note)
  }

  function handleClearNote(companyId, procId) {
    updateCellLocal(companyId, procId, { note: '' })
    saveNote(companyId, procId, '')
  }

  const openCompany  = openCell ? companies.find(c => c.id === openCell.companyId) : null
  const openProcess  = openCell ? processes.find(p => p.id === openCell.procId) : null
  const openCellData = openCompany?.cells[openCell?.procId] ?? emptyCell

  // ── company actions ──────────────────────────────────────────────────────

  function startEditCompany(company) {
    setEditingCompany({ id: company.id })
    setEditCompanyName(company.name)
  }

  async function saveEditCompany() {
    const name = editCompanyName.trim().toUpperCase()
    const companyId = editingCompany.id
    setEditingCompany(null)
    if (!name) return
    const previous = companies.find(c => c.id === companyId)?.name
    setCompanies(prev => prev.map(c => c.id === companyId ? { ...c, name } : c))
    try {
      await api.updateFondoEmpresa(companyId, { name })
    } catch (err) {
      setCompanies(prev => prev.map(c => c.id === companyId ? { ...c, name: previous } : c))
      alert('Error al renombrar empresa: ' + err.message)
    }
  }

  async function toggleConfirmed(companyId) {
    const company = companies.find(c => c.id === companyId)
    const newConfirmed = !company?.confirmed
    const previous = company?.confirmed ?? null

    setCompanies(prev =>
      prev.map(c =>
        c.id === companyId
          ? { ...c, confirmed: newConfirmed ? { date: new Date().toISOString().slice(0, 10) } : null }
          : c
      )
    )

    try {
      const result = await api.updateFondoChecklistConfirmado(companyId, year, month + 1, { confirmed: newConfirmed })
      setCompanies(prev =>
        prev.map(c =>
          c.id === companyId
            ? { ...c, confirmed: result.confirmed ? { date: (result.updatedAt ?? new Date().toISOString()).slice(0, 10) } : null }
            : c
        )
      )
    } catch (err) {
      setCompanies(prev => prev.map(c => c.id === companyId ? { ...c, confirmed: previous } : c))
      console.error('Error al confirmar contabilidad:', err.message)
    }
  }

  // ── tooltip helpers ──────────────────────────────────────────────────────

  function loadCellTooltipSize(cellKey) {
    try {
      const s = localStorage.getItem(`noteTooltipSize_${cellKey}`)
      if (s) return JSON.parse(s)
    } catch {
      // ignore localStorage read/parse errors
    }
    return { width: 220, height: 80 }
  }

  function showTooltip(e, content, cellKey) {
    clearTimeout(hideTimerRef.current)
    tooltipKeyRef.current = cellKey
    const size = loadCellTooltipSize(cellKey)
    setTooltipSize(size)
    const r = e.currentTarget.getBoundingClientRect()
    const TW = size.width, TH = size.height
    let left = r.right + 10
    let top  = r.top
    if (left + TW > window.innerWidth  - 8) left = r.left - TW - 10
    if (left < 8)  left = 8
    if (top  + TH > window.innerHeight - 8) top  = Math.max(8, window.innerHeight - TH - 8)
    setTooltip({ left, top, content })
  }

  function scheduleHide() {
    hideTimerRef.current = setTimeout(() => setTooltip(null), 220)
  }

  function startResize(e) {
    e.preventDefault()
    e.stopPropagation()
    const startX = e.clientX
    const startY = e.clientY
    const startW = tooltipSizeRef.current.width
    const startH = tooltipSizeRef.current.height

    function onMove(ev) {
      setTooltipSize({
        width:  Math.max(160, startW + ev.clientX - startX),
        height: Math.max(60,  startH + ev.clientY - startY),
      })
    }
    function onUp() {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      const key = tooltipKeyRef.current
      if (key) {
        localStorage.setItem(`noteTooltipSize_${key}`, JSON.stringify(tooltipSizeRef.current))
      }
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  // ── process (column) actions ─────────────────────────────────────────────

  async function handleAddProcess() {
    const name = newProcessName.trim()
    if (!name) return
    setNewProcessName('')
    setAddingProcess(false)
    try {
      const created = await api.createFondoProceso({ name })
      setProcesses(prev => [...prev, created])
    } catch (err) {
      alert('Error al crear proceso: ' + err.message)
    }
  }

  function startEditProcess(proc) {
    setEditingProcess({ id: proc.id, oldName: proc.name })
    setEditProcessName(proc.name)
  }

  async function saveEditProcess() {
    const newName = editProcessName.trim()
    const editing = editingProcess
    setEditingProcess(null)
    if (!newName || !editing || newName === editing.oldName) return
    setProcesses(prev => prev.map(p => p.id === editing.id ? { ...p, name: newName } : p))
    try {
      await api.updateFondoProceso(editing.id, { name: newName })
    } catch (err) {
      setProcesses(prev => prev.map(p => p.id === editing.id ? { ...p, name: editing.oldName } : p))
      alert('Error al renombrar proceso: ' + err.message)
    }
  }

  async function confirmDelete() {
    if (!deleteConfirm) return
    const { type, id } = deleteConfirm
    setDeleteConfirm(null)
    if (type === 'process') {
      try {
        // Procesos con historial no se pueden borrar de verdad — se desactivan
        // para dejar de ofrecerlos en meses nuevos sin perder lo ya registrado.
        await api.updateFondoProceso(id, { activo: false })
        setProcesses(prev => prev.filter(p => p.id !== id))
      } catch (err) {
        alert('Error al eliminar proceso: ' + err.message)
      }
    } else {
      try {
        await api.deleteFondoEmpresa(id)
        setCompanies(prev => prev.filter(c => c.id !== id))
      } catch (err) {
        alert('Error al eliminar empresa: ' + err.message)
      }
    }
  }

  // ── filters: category tabs + search ──────────────────────────────────────

  const catCounts = {
    contable:   companies.filter(c => (c.categoria ?? 'contable') === 'contable').length,
    tributario: companies.filter(c => (c.categoria ?? 'contable') === 'tributario').length,
  }

  const tabs = [
    { key: 'todas',      label: 'Todas',      count: companies.length },
    { key: 'contable',   label: 'Contable',   count: catCounts.contable },
    { key: 'tributario', label: 'Tributario', count: catCounts.tributario },
  ]

  const q = search.toLowerCase()
  const filteredCompanies = companies.filter(c => {
    const matchSearch = !q || c.name.toLowerCase().includes(q)
    const matchCat    = activeTab === 'todas' || (c.categoria ?? 'contable') === activeTab
    return matchSearch && matchCat
  })

  // ── stats — scoped to the active category tab, same as Empresas ─────────

  const scopedCompanies = activeTab === 'todas'
    ? companies
    : companies.filter(c => (c.categoria ?? 'contable') === activeTab)

  const totalCells = scopedCompanies.length * processes.length
  // 'na' cuenta como completada — mismo criterio que el resto del sistema
  // (mp6/impuestos derivado en el backend): ya se revisó y no aplicaba.
  const doneCells  = scopedCompanies.reduce(
    (acc, c) => acc + processes.filter(p => ['done', 'na'].includes(c.cells[p.id]?.status ?? 'pending')).length,
    0
  )
  const pct = totalCells ? Math.round((doneCells / totalCells) * 100) : 0

  // ── loading / error states ────────────────────────────────────────────────
  if (loading) return (
    <div className="flex items-center justify-center py-20 text-[#8890b5] dark:text-[#5a5f7a]">
      <span className="material-symbols-outlined mr-2" style={{ fontSize: 20, animation: 'spin 1s linear infinite' }}>
        progress_activity
      </span>
      Cargando seguimiento mensual…
    </div>
  )

  if (error) return (
    <div className="flex flex-col items-center gap-3 py-20">
      <span className="material-symbols-outlined text-[#ef4444]" style={{ fontSize: 32 }}>error</span>
      <p className="text-sm text-[#ef4444]">{error}</p>
      <button
        onClick={fetchGrid}
        className="px-4 py-2 text-sm rounded-lg border border-[#e2e4ef] dark:border-[#2e3148] hover:bg-[#f3f4f6] dark:hover:bg-[#252840] transition"
      >
        Reintentar
      </button>
    </div>
  )

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
            <button
              onClick={nextMonth}
              disabled={atMesHabilitado}
              title={atMesHabilitado ? 'El mes en curso aún no está habilitado (mes vencido)' : undefined}
              className="p-0.5 rounded hover:bg-[#f3f4f6] dark:hover:bg-[#252840] transition text-[#6b7280] disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed"
            >
              <span className="material-symbols-outlined text-xl">chevron_right</span>
            </button>
          </div>
          <button
            onClick={() => setAddingProcess(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold text-white hover:opacity-90 transition active:scale-[0.97]"
            style={{ background: '#7c3aed' }}
          >
            <span className="material-symbols-outlined text-lg">add_column_right</span>
            Nuevo proceso
          </button>
        </div>
      </div>

      {/* ── Filters row: pills + search ──────────────────────────────────── */}
      <div className="flex items-center gap-3 flex-wrap">

        {/* Segment control / pills */}
        <div className="flex items-center bg-[#f0f2f8] dark:bg-[#252840] rounded-xl p-1 gap-0.5 flex-shrink-0">
          {tabs.map(({ key, label, count }) => {
            const active = activeTab === key
            return (
              <button
                key={key}
                onClick={() => setActiveTab(key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150 whitespace-nowrap ${
                  active
                    ? 'bg-white dark:bg-[#1e2030] text-[#004ac6] dark:text-[#7ba8f0] shadow-sm'
                    : 'text-[#6b7280] dark:text-[#8890b5] hover:text-[#191c1e] dark:hover:text-[#e4e6f0]'
                }`}
              >
                {label}
                <span
                  className="text-[10px] font-bold px-1.5 py-0.5 rounded-full transition-colors"
                  style={
                    active
                      ? { background: '#004ac6', color: '#fff' }
                      : { background: '#e2e4ef', color: '#6b7280' }
                  }
                >
                  {count}
                </span>
              </button>
            )
          })}
        </div>

        {/* Search */}
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <span
            className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[#8890b5]"
            style={{ fontSize: 17 }}
          >
            search
          </span>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar empresa..."
            className="w-full pl-9 pr-4 py-2 text-sm rounded-xl border border-[#e2e4ef] dark:border-[#2e3148] bg-white dark:bg-[#1e2030] text-[#191c1e] dark:text-[#e4e6f0] outline-none focus:ring-2 focus:ring-[#004ac6]/30"
          />
        </div>
      </div>

      {/* ── Legacy data recovery banner ─────────────────────────────────── */}
      {migrationReport && migrationReport.length > 0 && (
        <div className="bg-[#fef9c3] dark:bg-[#3a3312] border border-[#eab308] rounded-xl p-3 flex items-start gap-2.5">
          <span className="material-symbols-outlined text-[#d97706] flex-shrink-0" style={{ fontSize: 18 }}>warning</span>
          <div className="flex-1 text-xs text-[#7a5b00] dark:text-[#f0d878]">
            <p className="font-semibold mb-0.5">Datos locales no recuperados automáticamente</p>
            <p>
              Se encontró información guardada en este navegador para {migrationReport.length === 1 ? 'una empresa' : `${migrationReport.length} empresas`}{' '}
              que no coincide con ningún nombre actual: {migrationReport.join(', ')}. Si esa información es importante, avisa para revisarla manualmente.
            </p>
          </div>
          <button
            onClick={() => { dismissMigrationReport(); setMigrationReport(null) }}
            className="text-[#7a5b00] dark:text-[#f0d878] hover:opacity-70 transition flex-shrink-0"
          >
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>close</span>
          </button>
        </div>
      )}

      {/* ── Progress bar ─────────────────────────────────────────────────── */}
      <div className="bg-white dark:bg-[#1e2030] rounded-xl border border-[#e2e4ef] dark:border-[#2e3148] p-4 shadow-sm flex items-center gap-4">
        <div className="flex-1">
          <div className="flex justify-between mb-1.5">
            <span className="text-xs font-semibold text-[#191c1e] dark:text-[#e4e6f0]">Progreso general</span>
            <span className="text-xs font-bold text-[#16a34a]">{pct}%</span>
          </div>
          <div className="w-full h-2 rounded-full bg-[#f3f4f6] dark:bg-[#252840]">
            <div className="h-2 rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: '#16a34a' }} />
          </div>
        </div>
        <span className="text-xs text-[#6b7280] dark:text-[#8890b5] whitespace-nowrap">
          {doneCells} / {totalCells} tareas
        </span>
      </div>

      {/* ── Table ────────────────────────────────────────────────────────── */}
      <div
        className="overflow-auto rounded-xl border border-[#e2e4ef] dark:border-[#2e3148] shadow-sm"
        style={{ maxHeight: 'calc(100vh - 17rem)' }}
      >
        <table style={{ borderCollapse: 'collapse', minWidth: `${220 + processes.length * 46 + 90}px` }}>
          <thead>
            <tr>
              {/* Company column header */}
              <th
                className="sticky left-0 top-0 z-30 bg-[#f8f9fc] dark:bg-[#1a1d2e] text-left text-[10px] font-bold text-[#6b7280] dark:text-[#8890b5] uppercase tracking-wide"
                style={{ width: 220, minWidth: 220, border: BORDER, borderBottom: BORDER_STR, borderRight: BORDER_STR, verticalAlign: 'bottom', padding: '6px 12px 8px' }}
              >
                Empresa
              </th>

              {/* Process column headers */}
              {processes.map(proc => (
                <th
                  key={proc.id}
                  title={proc.name}
                  className="sticky top-0 z-10 bg-[#f8f9fc] dark:bg-[#1a1d2e] group/col"
                  style={{ width: 46, minWidth: 46, border: BORDER, borderBottom: BORDER_STR, padding: 0 }}
                >
                  {editingProcess?.id === proc.id ? (
                    <div style={{ height: 120, display: 'flex', alignItems: 'center', padding: '0 4px' }}>
                      <input
                        autoFocus
                        value={editProcessName}
                        onChange={e => setEditProcessName(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') saveEditProcess()
                          if (e.key === 'Escape') setEditingProcess(null)
                        }}
                        onBlur={saveEditProcess}
                        className="w-full px-1 py-0.5 text-[10px] rounded border border-[#004ac6] outline-none bg-white dark:bg-[#252840] text-[#191c1e] dark:text-[#e4e6f0]"
                      />
                    </div>
                  ) : (
                    <div className="relative" style={{ height: 120 }}>
                      {/* Vertical text */}
                      <div
                        className="text-[10px] font-semibold text-[#6b7280] dark:text-[#8890b5] h-full flex items-center"
                        style={{
                          writingMode: 'vertical-lr',
                          transform: 'rotate(180deg)',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          padding: '8px 12px',
                        }}
                      >
                        {proc.name}
                      </div>
                      {/* Hover overlay with actions */}
                      <div className="absolute inset-0 hidden group-hover/col:flex flex-col items-center justify-center gap-1.5 rounded" style={{ background: 'rgba(240,244,255,0.92)' }}>
                        <button
                          onClick={() => startEditProcess(proc)}
                          className="p-1 rounded bg-white dark:bg-[#252840] shadow-sm text-[#6b7280] hover:text-[#004ac6] transition"
                          title="Editar"
                        >
                          <span className="material-symbols-outlined" style={{ fontSize: 14 }}>edit</span>
                        </button>
                        <button
                          onClick={() => setDeleteConfirm({ type: 'process', id: proc.id, name: proc.name })}
                          className="p-1 rounded bg-white dark:bg-[#252840] shadow-sm text-[#6b7280] hover:text-red-500 transition"
                          title="Eliminar"
                        >
                          <span className="material-symbols-outlined" style={{ fontSize: 14 }}>delete</span>
                        </button>
                      </div>
                    </div>
                  )}
                </th>
              ))}

              {/* Add process column header */}
              {addingProcess ? (
                <th
                  className="sticky top-0 z-10 bg-[#f8f9fc] dark:bg-[#1a1d2e]"
                  style={{ width: 100, minWidth: 100, border: BORDER, borderBottom: BORDER_STR, verticalAlign: 'bottom', padding: 4 }}
                >
                  <input
                    autoFocus
                    value={newProcessName}
                    onChange={e => setNewProcessName(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') handleAddProcess()
                      if (e.key === 'Escape') { setAddingProcess(false); setNewProcessName('') }
                    }}
                    onBlur={() => { if (!newProcessName.trim()) setAddingProcess(false) }}
                    placeholder="Nombre..."
                    className="w-full px-2 py-1 text-[10px] rounded border border-[#7c3aed] outline-none bg-white dark:bg-[#252840] text-[#191c1e] dark:text-[#e4e6f0]"
                  />
                </th>
              ) : null}

              {/* Confirmar Contabilidad – sticky right */}
              <th
                className="sticky right-0 top-0 z-30 bg-[#f0fdf4] dark:bg-[#0d2e1a] text-[10px] font-bold text-[#16a34a] uppercase tracking-wide"
                style={{ width: 88, minWidth: 88, border: BORDER, borderBottom: BORDER_STR, borderLeft: BORDER_STR, verticalAlign: 'bottom', padding: '4px 6px 6px' }}
              >
                Confirmar Contabilidad
              </th>
            </tr>
          </thead>

          <tbody>
            {filteredCompanies.length === 0 && (
              <tr>
                <td
                  colSpan={1 + processes.length + (addingProcess ? 1 : 0) + 1}
                  className="text-center py-10 text-xs text-[#8890b5] dark:text-[#5a5f7a]"
                >
                  {search || activeTab !== 'todas'
                    ? 'No hay empresas que coincidan con el filtro'
                    : 'No se encontraron empresas'}
                </td>
              </tr>
            )}
            {filteredCompanies.map((company, idx) => {
              const rowBg = idx % 2 === 0 ? '#ffffff' : '#f9fbff'
              const isEditingName = editingCompany?.id === company.id
              return (
                <tr key={company.id} style={{ background: rowBg }}>

                  {/* Company name cell */}
                  <td
                    className="sticky left-0 z-10 group/company"
                    style={{ width: 220, minWidth: 220, maxWidth: 220, border: BORDER, borderRight: BORDER_STR, background: rowBg, height: 36, padding: 0 }}
                  >
                    {isEditingName ? (
                      <div className="flex items-center h-full px-2 gap-1">
                        <input
                          autoFocus
                          value={editCompanyName}
                          onChange={e => setEditCompanyName(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') saveEditCompany()
                            if (e.key === 'Escape') setEditingCompany(null)
                          }}
                          onBlur={saveEditCompany}
                          className="flex-1 px-2 py-0.5 text-xs rounded border border-[#004ac6] outline-none bg-white dark:bg-[#252840] text-[#191c1e] dark:text-[#e4e6f0]"
                        />
                      </div>
                    ) : (
                      <div className="flex items-center h-full px-3 gap-1">
                        <span className="text-xs font-semibold text-[#191c1e] dark:text-[#e4e6f0] truncate flex-1 min-w-0" title={company.name}>
                          {company.name}
                        </span>
                        <div className="opacity-0 group-hover/company:opacity-100 flex gap-0.5 flex-shrink-0 transition-opacity">
                          <button
                            onClick={() => startEditCompany(company)}
                            className="p-0.5 rounded hover:bg-[#e8eaff] text-[#8890b5] hover:text-[#004ac6] transition"
                            title="Editar empresa"
                          >
                            <span className="material-symbols-outlined" style={{ fontSize: 13 }}>edit</span>
                          </button>
                          <button
                            onClick={() => setDeleteConfirm({ type: 'company', id: company.id, name: company.name })}
                            className="p-0.5 rounded hover:bg-red-50 text-[#8890b5] hover:text-red-500 transition"
                            title="Eliminar empresa"
                          >
                            <span className="material-symbols-outlined" style={{ fontSize: 13 }}>delete</span>
                          </button>
                        </div>
                      </div>
                    )}
                  </td>

                  {/* Process cells */}
                  {processes.map(proc => {
                    const cell = company.cells[proc.id] ?? emptyCell
                    const cfg  = STATUS[cell.status] ?? STATUS.pending
                    // Whitespace-only notes must not count as "has a note" — otherwise
                    // the dot/tooltip shows for a cell that looks empty when opened.
                    const hasNote = !!cell.note?.trim()
                    return (
                      <td key={proc.id} style={{ width: 46, minWidth: 46, border: BORDER, padding: 2 }}>
                        <button
                          onClick={e => handleCellClick(company.id, proc.id, e)}
                          onMouseEnter={hasNote ? e => showTooltip(e, cell.note, `${company.id}_${proc.id}`) : undefined}
                          onMouseLeave={hasNote ? scheduleHide : undefined}
                          className="w-full flex items-center justify-center relative transition-all hover:opacity-75 hover:scale-90 active:scale-75 rounded"
                          style={{ height: 32, background: cfg.bg }}
                        >
                          <span className="material-symbols-outlined" style={{ color: cfg.color, fontSize: 17 }}>
                            {cfg.icon}
                          </span>
                          {hasNote && (
                            <span
                              className="absolute bg-amber-400 rounded-full border border-white"
                              style={{ width: 6, height: 6, top: 1, right: 1 }}
                            />
                          )}
                        </button>
                      </td>
                    )
                  })}

                  {/* Empty cell under "add process" input */}
                  {addingProcess ? (
                    <td style={{ width: 100, minWidth: 100, border: BORDER, background: rowBg }} />
                  ) : null}

                  {/* Confirmar Contabilidad cell */}
                  <td
                    className="sticky right-0 z-10"
                    style={{ width: 88, minWidth: 88, border: BORDER, borderLeft: BORDER_STR, background: company.confirmed ? '#f0fdf4' : rowBg, padding: 3 }}
                  >
                    {company.confirmed ? (
                      <button
                        onClick={() => toggleConfirmed(company.id)}
                        title={`Confirmado el ${company.confirmed.date}. Clic para revertir.`}
                        className="w-full h-8 rounded flex flex-col items-center justify-center gap-0.5 transition hover:opacity-80"
                        style={{ background: '#dcfce7' }}
                      >
                        <span className="material-symbols-outlined" style={{ color: '#16a34a', fontSize: 15 }}>verified</span>
                        <span className="text-[9px] font-semibold text-[#16a34a] leading-none">{company.confirmed.date}</span>
                      </button>
                    ) : (
                      <button
                        onClick={() => toggleConfirmed(company.id)}
                        className="w-full h-8 rounded flex items-center justify-center gap-1 text-[10px] font-semibold transition hover:opacity-80 border"
                        style={{ color: '#16a34a', borderColor: '#bbf7d0', background: '#f0fdf4' }}
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: 14 }}>check_circle_outline</span>
                        Confirmar
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}

          </tbody>
        </table>
      </div>

      {/* ── Legend ───────────────────────────────────────────────────────── */}
      <div className="flex gap-5 flex-wrap items-center">
        {Object.entries(STATUS).map(([key, cfg]) => (
          <div key={key} className="flex items-center gap-1.5">
            <span className="material-symbols-outlined" style={{ color: cfg.color, fontSize: 16 }}>{cfg.icon}</span>
            <span className="text-xs text-[#6b7280] dark:text-[#8890b5]">{cfg.label}</span>
          </div>
        ))}
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-amber-400 inline-block" />
          <span className="text-xs text-[#6b7280] dark:text-[#8890b5]">Tiene nota</span>
        </div>
      </div>

      {/* ── Cell popup ───────────────────────────────────────────────────── */}
      {openCell && openProcess && (
        <div
          ref={dropdownRef}
          className="fixed z-50 bg-white dark:bg-[#1e2030] border border-[#e2e4ef] dark:border-[#2e3148] rounded-xl shadow-2xl p-4 w-64"
          style={{ left: openCell.left, top: openCell.top }}
        >
          <p className="text-[11px] font-bold text-[#191c1e] dark:text-[#e4e6f0] mb-3 truncate" title={openProcess.name}>
            {openProcess.name}
          </p>
          <div className="grid grid-cols-2 gap-1.5 mb-3">
            {Object.entries(STATUS).map(([key, cfg]) => (
              <button
                key={key}
                onClick={() => handleStatusChange(openCell.companyId, openCell.procId, key)}
                className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-semibold transition-all hover:scale-95 active:scale-90"
                style={{
                  background: openCellData.status === key ? cfg.bg : 'transparent',
                  color: cfg.color,
                  border: `1.5px solid ${openCellData.status === key ? cfg.color : '#e2e4ef'}`,
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 14 }}>{cfg.icon}</span>
                {cfg.label}
              </button>
            ))}
          </div>
          <textarea
            ref={noteTextareaRef}
            value={openCellData.note}
            onChange={e => {
              handleNoteChange(openCell.companyId, openCell.procId, e.target.value)
              e.target.style.height = 'auto'
              const h = Math.min(e.target.scrollHeight, 200)
              e.target.style.height = h + 'px'
              e.target.style.overflowY = h >= 200 ? 'auto' : 'hidden'
            }}
            onBlur={e => handleNoteBlur(openCell.companyId, openCell.procId, e.target.value)}
            placeholder="Nota opcional..."
            className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-[#e2e4ef] dark:border-[#2e3148] bg-[#f8f9fc] dark:bg-[#252840] text-[#191c1e] dark:text-[#e4e6f0] outline-none focus:ring-2 focus:ring-[#004ac6]/30 resize-none"
            style={{ minHeight: 52, overflowY: 'hidden' }}
          />
          <div className="mt-2 flex items-center gap-2">
            <button
              onClick={() => handleClearNote(openCell.companyId, openCell.procId)}
              disabled={!openCellData.note?.trim()}
              className="flex-1 py-1 text-xs text-red-500 hover:text-red-600 transition text-center disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:text-red-500"
            >
              Borrar nota
            </button>
            <button
              onClick={() => { flushPendingNote(); setOpenCell(null) }}
              className="flex-1 py-1 text-xs text-[#6b7280] hover:text-[#191c1e] dark:hover:text-[#e4e6f0] transition text-center"
            >
              Cerrar
            </button>
          </div>
        </div>
      )}

      {/* ── Note tooltip — Excel-style, resizable ────────────────────────── */}
      {tooltip && (
        <div
          className="fixed z-[60] shadow-lg text-xs text-[#1f1f1f] select-text"
          style={{
            left: tooltip.left,
            top: tooltip.top,
            width: tooltipSize.width,
            height: tooltipSize.height,
            pointerEvents: 'auto',
            background: '#fffef7',
            border: '1px solid #c8b800',
            borderRadius: 3,
          }}
          onMouseEnter={() => clearTimeout(hideTimerRef.current)}
          onMouseLeave={scheduleHide}
        >
          {/* Content area — scrolls only when text exceeds box height */}
          <div className="w-full h-full overflow-y-auto whitespace-pre-wrap leading-relaxed p-2 pr-3">
            {tooltip.content}
          </div>
          {/* Resize handle — bottom-right corner triangle */}
          <div
            onMouseDown={startResize}
            style={{
              position: 'absolute',
              bottom: 0,
              right: 0,
              width: 0,
              height: 0,
              borderStyle: 'solid',
              borderWidth: '0 0 14px 14px',
              borderColor: 'transparent transparent #c8b800 transparent',
              cursor: 'se-resize',
              pointerEvents: 'auto',
            }}
          />
        </div>
      )}

      {/* ── Delete confirmation ───────────────────────────────────────────── */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={() => setDeleteConfirm(null)}>
          <div
            className="bg-white dark:bg-[#1e2030] rounded-2xl shadow-2xl p-6 max-w-xs mx-4 border border-[#e2e4ef] dark:border-[#2e3148]"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-3">
              <span className="material-symbols-outlined text-red-500 text-2xl">warning</span>
              <p className="text-sm font-semibold text-[#191c1e] dark:text-[#e4e6f0]">
                ¿Eliminar {deleteConfirm.type === 'process' ? 'proceso' : 'empresa'}?
              </p>
            </div>
            <p className="text-xs text-[#6b7280] dark:text-[#8890b5] mb-4 truncate">&ldquo;{deleteConfirm.name}&rdquo;</p>
            <div className="flex gap-2">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="flex-1 py-2 text-xs font-semibold rounded-lg border border-[#e2e4ef] dark:border-[#2e3148] text-[#6b7280] hover:bg-[#f3f4f6] dark:hover:bg-[#252840] transition"
              >
                Cancelar
              </button>
              <button
                onClick={confirmDelete}
                className="flex-1 py-2 text-xs font-semibold rounded-lg text-white bg-red-500 hover:bg-red-600 transition"
              >
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
