import { useState, useMemo, useEffect, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import StatsCard from '../components/StatsCard'
import { getMacroStats } from '../data/fondoEmprender'
import { api } from '../services/api'
import { useSocket } from '../context/SocketContext'

const SEM_COLOR = {
  green:  '#16a34a',
  yellow: '#d97706',
  red:    '#ef4444',
}

const MONTHS = [
  'Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre',
]

const CATEGORIAS = [
  { key: 'contable',   label: 'Contable' },
  { key: 'tributario', label: 'Tributario' },
]

export default function FondoEmprenderEmpresasPage() {
  const navigate = useNavigate()
  const { socket } = useSocket()

  const [searchParams] = useSearchParams()
  const today = new Date()
  const [month, setMonth] = useState(() => {
    const m = parseInt(searchParams.get('mes') ?? '', 10)
    return m >= 1 && m <= 12 ? m - 1 : today.getMonth()
  })
  const [year, setYear] = useState(() => {
    const y = parseInt(searchParams.get('anio') ?? '', 10)
    return y >= 2000 ? y : today.getFullYear()
  })

  function prevMonth() {
    if (month === 0) { setMonth(11); setYear(y => y - 1) }
    else setMonth(m => m - 1)
  }
  function nextMonth() {
    if (month === 11) { setMonth(0); setYear(y => y + 1) }
    else setMonth(m => m + 1)
  }

  // ── server state ──────────────────────────────────────────────────────────
  const [empresas, setEmpresas] = useState([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState(null)

  // ── filter state ─────────────────────────────────────────────────────────
  const [search, setSearch]       = useState('')
  const [activeTab, setActiveTab] = useState('todas')

  // ── add-company form state ────────────────────────────────────────────────
  const [adding, setAdding]        = useState(false)
  const [newName, setNewName]      = useState('')
  const [newCategoria, setNewCat]  = useState('contable')
  const [newMonthlyFee, setNewFee] = useState('')

  function openForm()  { setAdding(true) }
  function closeForm() { setAdding(false); setNewName(''); setNewCat('contable'); setNewFee('') }

  // ── inline edit state ─────────────────────────────────────────────────────
  const [editingId, setEditingId] = useState(null)
  const [editForm, setEditForm]   = useState({ name: '', categoria: 'contable', monthlyFee: '' })

  function openEdit(empresa) {
    setEditingId(empresa.id)
    setEditForm({
      name:       empresa.name,
      categoria:  empresa.categoria ?? 'contable',
      monthlyFee: empresa.monthlyFee != null ? String(empresa.monthlyFee) : '',
    })
  }
  function closeEdit() { setEditingId(null) }

  // ── fetch empresas ────────────────────────────────────────────────────────
  const fetchEmpresas = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const data = await api.getFondoEmpresas(undefined, year, month + 1)
      setEmpresas(data)
    } catch (err) {
      if (err.status === 403) {
        setError('No tienes permiso para ver Fondo Emprender')
      } else {
        setError(err.message || 'Error al cargar empresas')
      }
    } finally {
      setLoading(false)
    }
  }, [month, year])

  useEffect(() => { fetchEmpresas() }, [fetchEmpresas])

  useEffect(() => {
    window.addEventListener('focus', fetchEmpresas)
    if (socket) socket.on('empresa:updated', fetchEmpresas)
    return () => {
      window.removeEventListener('focus', fetchEmpresas)
      if (socket) socket.off('empresa:updated', fetchEmpresas)
    }
  }, [fetchEmpresas, socket])

  // ── create ────────────────────────────────────────────────────────────────
  async function handleAddCompany() {
    const name = newName.trim().toUpperCase()
    if (!name) return
    try {
      const nuevaEmpresa = await api.createFondoEmpresa({
        name,
        categoria: newCategoria,
        monthlyFee: newMonthlyFee !== '' ? parseFloat(newMonthlyFee) : null,
      })
      setEmpresas(prev => [...prev, nuevaEmpresa].sort((a, b) => a.name.localeCompare(b.name)))
      closeForm()
    } catch (err) {
      if (err.status === 403) {
        alert('No tienes permiso para crear empresas')
      } else {
        alert('Error: ' + err.message)
      }
    }
  }

  // ── update ────────────────────────────────────────────────────────────────
  async function handleEditar(empresaId) {
    try {
      const actualizada = await api.updateFondoEmpresa(empresaId, {
        name:       editForm.name,
        categoria:  editForm.categoria,
        monthlyFee: editForm.monthlyFee !== '' ? parseFloat(editForm.monthlyFee) : null,
      })
      setEmpresas(prev => prev.map(e => e.id === empresaId ? actualizada : e))
      closeEdit()
    } catch (err) {
      if (err.status === 403) {
        alert('No tienes permiso para editar')
      } else {
        alert('Error: ' + err.message)
      }
    }
  }

  // ── delete ────────────────────────────────────────────────────────────────
  async function handleEliminar(empresaId) {
    if (!confirm('¿Eliminar esta empresa? Esta acción borrará también su historial de pagos y checklist.')) return
    try {
      await api.deleteFondoEmpresa(empresaId)
      setEmpresas(prev => prev.filter(e => e.id !== empresaId))
      if (editingId === empresaId) setEditingId(null)
    } catch (err) {
      if (err.status === 403) {
        alert('No tienes permiso para eliminar')
      } else {
        alert('Error: ' + err.message)
      }
    }
  }

  // ── derived stats — scoped to the active category tab ───────────────────
  const summary = useMemo(() => {
    const scope = activeTab === 'todas'
      ? empresas
      : empresas.filter(c => (c.categoria ?? 'contable') === activeTab)
    const allStats    = scope.map(c => getMacroStats(c))
    const completadas = allStats.filter(s => s.semaphore === 'green').length
    const enProgreso  = allStats.filter(s => s.semaphore === 'yellow').length
    const pendientes  = allStats.filter(s => s.semaphore === 'red').length
    const pct = scope.length > 0 ? Math.round((completadas / scope.length) * 100) : 0
    return { total: scope.length, completadas, enProgreso, pendientes, pct }
  }, [empresas, activeTab])

  const catCounts = useMemo(() => ({
    contable:   empresas.filter(c => (c.categoria ?? 'contable') === 'contable').length,
    tributario: empresas.filter(c => (c.categoria ?? 'contable') === 'tributario').length,
  }), [empresas])

  const tabs = [
    { key: 'todas',      label: 'Todas',      count: empresas.length },
    { key: 'contable',   label: 'Contable',   count: catCounts.contable },
    { key: 'tributario', label: 'Tributario', count: catCounts.tributario },
  ]

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return empresas.filter(c => {
      const matchSearch = !q || c.name.toLowerCase().includes(q)
      const matchCat    = activeTab === 'todas' || (c.categoria ?? 'contable') === activeTab
      return matchSearch && matchCat
    })
  }, [empresas, search, activeTab])

  // ── loading / error states ────────────────────────────────────────────────
  if (loading) return (
    <div className="flex items-center justify-center py-20 text-[#8890b5] dark:text-[#5a5f7a]">
      <span className="material-symbols-outlined mr-2" style={{ fontSize: 20, animation: 'spin 1s linear infinite' }}>
        progress_activity
      </span>
      Cargando empresas…
    </div>
  )

  if (error) return (
    <div className="flex flex-col items-center gap-3 py-20">
      <span className="material-symbols-outlined text-[#ef4444]" style={{ fontSize: 32 }}>error</span>
      <p className="text-sm text-[#ef4444]">{error}</p>
      <button
        onClick={fetchEmpresas}
        className="px-4 py-2 text-sm rounded-lg border border-[#e2e4ef] dark:border-[#2e3148] hover:bg-[#f3f4f6] dark:hover:bg-[#252840] transition"
      >
        Reintentar
      </button>
    </div>
  )

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-5 min-w-0">

      {/* ── Page header ──────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-[#191c1e] dark:text-[#e4e6f0]">Empresas</h1>
          <p className="text-sm text-[#6b7280] dark:text-[#8890b5]">
            Fondo Emprender · {empresas.length} empresas
          </p>
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
          <button
            onClick={openForm}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-white hover:opacity-90 transition active:scale-[0.97]"
            style={{ background: '#004ac6' }}
          >
            <span className="material-symbols-outlined text-lg">domain_add</span>
            Crear empresa
          </button>
        </div>
      </div>

      {/* ── Add company form ──────────────────────────────────────────────── */}
      {adding && (
        <div className="bg-white dark:bg-[#1e2030] border border-[#e2e4ef] dark:border-[#2e3148] rounded-xl p-5 shadow-sm flex flex-col gap-4">

          {/* Name */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-[#434655] dark:text-[#c4c8e8] uppercase tracking-wide">
              Nombre de la empresa
            </label>
            <input
              autoFocus
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter')  handleAddCompany()
                if (e.key === 'Escape') closeForm()
              }}
              placeholder="Ej. CAPROVIVA S.A.S"
              className="px-3 py-2 text-sm rounded-lg border border-[#e2e4ef] dark:border-[#2e3148] bg-white dark:bg-[#252840] text-[#191c1e] dark:text-[#e4e6f0] outline-none focus:ring-2 focus:ring-[#004ac6]/30"
            />
          </div>

          {/* Category selector */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-[#434655] dark:text-[#c4c8e8] uppercase tracking-wide">
              Categoría <span className="text-[#ef4444]">*</span>
            </label>
            <div className="flex gap-2">
              {CATEGORIAS.map(({ key, label }) => {
                const active = newCategoria === key
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setNewCat(key)}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold border-2 transition-all duration-150"
                    style={{
                      borderColor: active ? '#004ac6' : '#e2e4ef',
                      background:  active ? '#f0f4ff' : 'transparent',
                      color:       active ? '#004ac6' : '#6b7280',
                    }}
                  >
                    <span
                      className="w-2 h-2 rounded-full flex-shrink-0 transition-colors"
                      style={{ background: active ? '#004ac6' : '#d1d5db' }}
                    />
                    {label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Monthly fee */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-[#434655] dark:text-[#c4c8e8] uppercase tracking-wide">
              Mensualidad (opcional)
            </label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={newMonthlyFee}
              onChange={e => setNewFee(e.target.value)}
              placeholder="Ej. 450000"
              className="px-3 py-2 text-sm rounded-lg border border-[#e2e4ef] dark:border-[#2e3148] bg-white dark:bg-[#252840] text-[#191c1e] dark:text-[#e4e6f0] outline-none focus:ring-2 focus:ring-[#004ac6]/30"
            />
          </div>

          {/* Actions */}
          <div className="flex gap-2 justify-end pt-1">
            <button
              onClick={closeForm}
              className="px-4 py-2 rounded-lg text-sm font-semibold text-[#6b7280] dark:text-[#8890b5] hover:bg-[#f3f4f6] dark:hover:bg-[#252840] transition"
            >
              Cancelar
            </button>
            <button
              onClick={handleAddCompany}
              disabled={!newName.trim()}
              className="px-5 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50 transition active:scale-[0.97]"
              style={{ background: '#004ac6' }}
            >
              Agregar empresa
            </button>
          </div>
        </div>
      )}

      {/* ── Summary cards ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatsCard
          title="Total empresas"
          value={summary.total}
          icon="corporate_fare"
          borderColor="#004ac6"
          iconColor="#004ac6"
          sub={`${summary.pct}% completadas`}
          subColor="#434655"
        />
        <StatsCard
          title="Completadas"
          value={summary.completadas}
          icon="check_circle"
          borderColor="#16a34a"
          iconColor="#16a34a"
          sub={summary.completadas > 0 ? `${summary.pct}% del total` : 'Sin completar'}
          subColor={summary.completadas > 0 ? '#16a34a' : '#434655'}
        />
        <StatsCard
          title="En progreso"
          value={summary.enProgreso}
          icon="timelapse"
          borderColor="#d97706"
          iconColor="#d97706"
          sub="Avance parcial"
          subColor="#434655"
        />
        <StatsCard
          title="Pendientes"
          value={summary.pendientes}
          icon="pending_actions"
          borderColor="#ef4444"
          iconColor="#ef4444"
          sub={summary.pendientes > 0 ? 'Sin iniciar' : 'Todo al día'}
          subColor={summary.pendientes > 0 ? '#ef4444' : '#16a34a'}
        />
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

      {/* ── Compact table ────────────────────────────────────────────────── */}
      {filtered.length > 0 ? (
        <div className="bg-white dark:bg-[#1e2030] rounded-xl border border-[#e2e4ef] dark:border-[#2e3148] shadow-sm overflow-hidden">
          {filtered.map((company, idx) => {
            const stats = getMacroStats(company)
            const color = SEM_COLOR[stats.semaphore]
            const pct   = Math.round((stats.done / stats.total) * 100)
            const isEditing = editingId === company.id

            return (
              <div key={company.id}>
                {/* ── Company row ─────────────────────────────────────── */}
                <div
                  className={`flex items-center gap-2 sm:gap-4 px-3 sm:px-4 py-3 hover:bg-[#f0f4ff] dark:hover:bg-[#252840] transition-colors group cursor-pointer${
                    idx > 0 ? ' border-t border-[#f0f2f8] dark:border-[#2e3148]' : ''
                  }`}
                  onClick={() => navigate(`/fondo-emprender/empresas/${company.id}?anio=${year}&mes=${month + 1}`)}
                >
                  {/* Status dot */}
                  <span
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ background: color }}
                  />

                  {/* Company name */}
                  <span className="flex-1 min-w-0 text-sm font-semibold text-[#191c1e] dark:text-[#e4e6f0] truncate">
                    {company.name}
                  </span>

                  {/* Category badge */}
                  <span
                    className="hidden sm:inline-flex text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0 uppercase tracking-wide"
                    style={
                      (company.categoria ?? 'contable') === 'contable'
                        ? { background: '#f0f4ff', color: '#004ac6' }
                        : { background: '#f0fdf4', color: '#16a34a' }
                    }
                  >
                    {company.categoria ?? 'contable'}
                  </span>

                  {/* Progress bar + count */}
                  <div className="flex items-center gap-1.5 sm:gap-2.5 flex-shrink-0">
                    <div className="hidden sm:block w-24 h-1.5 rounded-full bg-[#e8eaf0] dark:bg-[#2e3148] overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-300"
                        style={{ width: `${pct}%`, background: color }}
                      />
                    </div>
                    <span
                      className="text-xs font-bold w-7 text-right tabular-nums"
                      style={{ color }}
                    >
                      {stats.done}/7
                    </span>
                  </div>

                  {/* Action buttons — stop propagation so they don't navigate */}
                  <div
                    className="flex items-center gap-0.5 flex-shrink-0"
                    onClick={e => e.stopPropagation()}
                  >
                    <button
                      onClick={() => isEditing ? closeEdit() : openEdit(company)}
                      title={isEditing ? 'Cerrar edición' : 'Editar empresa'}
                      className={`p-1.5 rounded-lg transition ${
                        isEditing
                          ? 'text-[#004ac6] bg-[#f0f4ff] dark:bg-[#252840]'
                          : 'text-[#c3c6d7] dark:text-[#3e4260] hover:text-[#004ac6] dark:hover:text-[#7ba8f0]'
                      }`}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                        {isEditing ? 'close' : 'edit'}
                      </span>
                    </button>
                    <button
                      onClick={() => handleEliminar(company.id)}
                      title="Eliminar empresa"
                      className="p-1.5 rounded-lg text-[#c3c6d7] dark:text-[#3e4260] hover:text-[#ef4444] dark:hover:text-[#ef4444] transition"
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: 16 }}>delete</span>
                    </button>
                  </div>

                  {/* Arrow */}
                  <span
                    className="material-symbols-outlined text-[#c3c6d7] dark:text-[#3e4260] group-hover:text-[#004ac6] dark:group-hover:text-[#7ba8f0] transition flex-shrink-0"
                    style={{ fontSize: 18 }}
                  >
                    chevron_right
                  </span>
                </div>

                {/* ── Inline edit panel ────────────────────────────────── */}
                {isEditing && (
                  <div
                    className="px-5 py-4 bg-[#f8f9fe] dark:bg-[#252840] border-t border-[#e2e4ef] dark:border-[#2e3148] flex flex-col gap-3"
                    onClick={e => e.stopPropagation()}
                  >
                    <div className="flex flex-wrap gap-3">
                      {/* Name */}
                      <div className="flex flex-col gap-1 flex-1 min-w-[160px]">
                        <label className="text-[10px] font-semibold text-[#434655] dark:text-[#c4c8e8] uppercase tracking-wide">
                          Nombre
                        </label>
                        <input
                          autoFocus
                          value={editForm.name}
                          onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                          className="px-3 py-1.5 text-sm rounded-lg border border-[#e2e4ef] dark:border-[#2e3148] bg-white dark:bg-[#1e2030] text-[#191c1e] dark:text-[#e4e6f0] outline-none focus:ring-2 focus:ring-[#004ac6]/30"
                        />
                      </div>

                      {/* Categoría */}
                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] font-semibold text-[#434655] dark:text-[#c4c8e8] uppercase tracking-wide">
                          Categoría
                        </label>
                        <div className="flex gap-1.5">
                          {CATEGORIAS.map(({ key, label }) => {
                            const active = editForm.categoria === key
                            return (
                              <button
                                key={key}
                                type="button"
                                onClick={() => setEditForm(f => ({ ...f, categoria: key }))}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border-2 transition-all"
                                style={{
                                  borderColor: active ? '#004ac6' : '#e2e4ef',
                                  background:  active ? '#f0f4ff' : 'transparent',
                                  color:       active ? '#004ac6' : '#6b7280',
                                }}
                              >
                                <span
                                  className="w-1.5 h-1.5 rounded-full"
                                  style={{ background: active ? '#004ac6' : '#d1d5db' }}
                                />
                                {label}
                              </button>
                            )
                          })}
                        </div>
                      </div>

                      {/* Monthly fee */}
                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] font-semibold text-[#434655] dark:text-[#c4c8e8] uppercase tracking-wide">
                          Mensualidad
                        </label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={editForm.monthlyFee}
                          onChange={e => setEditForm(f => ({ ...f, monthlyFee: e.target.value }))}
                          placeholder="—"
                          className="px-3 py-1.5 text-sm rounded-lg border border-[#e2e4ef] dark:border-[#2e3148] bg-white dark:bg-[#1e2030] text-[#191c1e] dark:text-[#e4e6f0] outline-none focus:ring-2 focus:ring-[#004ac6]/30 w-36"
                        />
                      </div>
                    </div>

                    <div className="flex gap-2 justify-end">
                      <button
                        onClick={closeEdit}
                        className="px-4 py-1.5 rounded-lg text-xs font-semibold text-[#6b7280] dark:text-[#8890b5] hover:bg-[#f3f4f6] dark:hover:bg-[#1e2030] transition"
                      >
                        Cancelar
                      </button>
                      <button
                        onClick={() => handleEditar(company.id)}
                        disabled={!editForm.name.trim()}
                        className="px-4 py-1.5 rounded-lg text-xs font-semibold text-white disabled:opacity-50 transition active:scale-[0.97]"
                        style={{ background: '#004ac6' }}
                      >
                        Guardar
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      ) : (
        <div className="text-center py-16 text-[#8890b5] dark:text-[#5a5f7a] text-sm">
          {search || activeTab !== 'todas'
            ? 'No hay empresas que coincidan con el filtro'
            : 'No se encontraron empresas'}
        </div>
      )}
    </div>
  )
}
