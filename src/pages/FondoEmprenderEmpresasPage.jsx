import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import StatsCard from '../components/StatsCard'
import {
  loadProcesses, buildDefaultProcesses,
  loadMonthData, saveMonthData,
  buildDefaultCompanies, ensureCells,
  getMacroStats,
} from '../data/fondoEmprender'

const SEM_COLOR = {
  green:  '#16a34a',
  yellow: '#d97706',
  red:    '#ef4444',
}

const CATEGORIAS = [
  { key: 'contable',   label: 'Contable' },
  { key: 'tributario', label: 'Tributario' },
]

function loadCurrentCompanies() {
  const today = new Date()
  const procs = loadProcesses() ?? buildDefaultProcesses()
  const d     = loadMonthData(today.getFullYear(), today.getMonth())
  return {
    companies: d ? ensureCells(d.companies, procs) : buildDefaultCompanies(procs),
    year:  today.getFullYear(),
    month: today.getMonth(),
    procs,
  }
}

export default function FondoEmprenderEmpresasPage() {
  const [{ companies, year, month, procs }, setData] = useState(loadCurrentCompanies)

  // ── filter state ─────────────────────────────────────────────────────────
  const [search, setSearch]     = useState('')
  const [activeTab, setActiveTab] = useState('todas')

  // ── add-company form state ────────────────────────────────────────────────
  const [adding, setAdding]         = useState(false)
  const [newName, setNewName]       = useState('')
  const [newCategoria, setNewCat]   = useState('contable')

  function openForm()  { setAdding(true) }
  function closeForm() { setAdding(false); setNewName(''); setNewCat('contable') }

  // ── add company ──────────────────────────────────────────────────────────
  function handleAddCompany() {
    const name = newName.trim().toUpperCase()
    if (!name) return
    const newCompany = {
      id: `c${Date.now()}`,
      name,
      categoria: newCategoria,
      cells: Object.fromEntries(procs.map(p => [p.name, { status: 'pending', note: '' }])),
      confirmed: null,
    }
    const updated = [...companies, newCompany]
    saveMonthData(year, month, { companies: updated })
    setData(prev => ({ ...prev, companies: updated }))
    closeForm()
  }

  // ── derived stats — scoped to the active category tab ───────────────────
  const summary = useMemo(() => {
    const scope = activeTab === 'todas'
      ? companies
      : companies.filter(c => (c.categoria ?? 'contable') === activeTab)
    const allStats  = scope.map(c => getMacroStats(c))
    const completadas = allStats.filter(s => s.semaphore === 'green').length
    const enProgreso  = allStats.filter(s => s.semaphore === 'yellow').length
    const pendientes  = allStats.filter(s => s.semaphore === 'red').length
    const pct = scope.length > 0 ? Math.round((completadas / scope.length) * 100) : 0
    return { total: scope.length, completadas, enProgreso, pendientes, pct }
  }, [companies, activeTab])

  const catCounts = useMemo(() => ({
    contable:   companies.filter(c => (c.categoria ?? 'contable') === 'contable').length,
    tributario: companies.filter(c => (c.categoria ?? 'contable') === 'tributario').length,
  }), [companies])

  const tabs = [
    { key: 'todas',      label: 'Todas',      count: companies.length },
    { key: 'contable',   label: 'Contable',   count: catCounts.contable },
    { key: 'tributario', label: 'Tributario', count: catCounts.tributario },
  ]

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return companies.filter(c => {
      const matchSearch = !q || c.name.toLowerCase().includes(q)
      const matchCat    = activeTab === 'todas' || (c.categoria ?? 'contable') === activeTab
      return matchSearch && matchCat
    })
  }, [companies, search, activeTab])

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-5 min-w-0">

      {/* ── Page header ──────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-[#191c1e] dark:text-[#e4e6f0]">Empresas</h1>
          <p className="text-sm text-[#6b7280] dark:text-[#8890b5]">
            Fondo Emprender · {companies.length} empresas
          </p>
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
                      borderColor:      active ? '#004ac6' : '#e2e4ef',
                      background:       active ? '#f0f4ff' : 'transparent',
                      color:            active ? '#004ac6' : '#6b7280',
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
            return (
              <Link
                key={company.id}
                to={`/fondo-emprender/empresas/${company.id}`}
                className={`flex items-center gap-4 px-4 py-3 hover:bg-[#f0f4ff] dark:hover:bg-[#252840] transition-colors group${
                  idx > 0 ? ' border-t border-[#f0f2f8] dark:border-[#2e3148]' : ''
                }`}
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
                <div className="flex items-center gap-2.5 flex-shrink-0">
                  <div className="w-24 h-1.5 rounded-full bg-[#e8eaf0] dark:bg-[#2e3148] overflow-hidden">
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

                {/* Arrow */}
                <span
                  className="material-symbols-outlined text-[#c3c6d7] dark:text-[#3e4260] group-hover:text-[#004ac6] dark:group-hover:text-[#7ba8f0] transition flex-shrink-0"
                  style={{ fontSize: 18 }}
                >
                  chevron_right
                </span>
              </Link>
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
