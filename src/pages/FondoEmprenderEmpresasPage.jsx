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
  const [search, setSearch]  = useState('')
  const [adding, setAdding]  = useState(false)
  const [newName, setNewName] = useState('')

  // ── add company ──────────────────────────────────────────────────────────
  function handleAddCompany() {
    const name = newName.trim().toUpperCase()
    if (!name) return
    const newCompany = {
      id: `c${Date.now()}`,
      name,
      cells: Object.fromEntries(procs.map(p => [p.name, { status: 'pending', note: '' }])),
      confirmed: null,
    }
    const updated = [...companies, newCompany]
    saveMonthData(year, month, { companies: updated })
    setData(prev => ({ ...prev, companies: updated }))
    setNewName('')
    setAdding(false)
  }

  // ── derived stats (all companies, not filtered) ──────────────────────────
  const summary = useMemo(() => {
    const allStats = companies.map(c => getMacroStats(c))
    const completadas = allStats.filter(s => s.semaphore === 'green').length
    const enProgreso  = allStats.filter(s => s.semaphore === 'yellow').length
    const pendientes  = allStats.filter(s => s.semaphore === 'red').length
    const pct = companies.length > 0 ? Math.round((completadas / companies.length) * 100) : 0
    return { total: companies.length, completadas, enProgreso, pendientes, pct }
  }, [companies])

  const filtered = useMemo(
    () => companies.filter(c => c.name.toLowerCase().includes(search.toLowerCase())),
    [companies, search]
  )

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
          onClick={() => setAdding(true)}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-white hover:opacity-90 transition active:scale-[0.97]"
          style={{ background: '#004ac6' }}
        >
          <span className="material-symbols-outlined text-lg">domain_add</span>
          Crear empresa
        </button>
      </div>

      {/* ── Add company form ──────────────────────────────────────────────── */}
      {adding && (
        <div className="bg-white dark:bg-[#1e2030] border border-[#e2e4ef] dark:border-[#2e3148] rounded-xl p-4 shadow-sm flex flex-wrap gap-2 items-center">
          <input
            autoFocus
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter')  handleAddCompany()
              if (e.key === 'Escape') { setAdding(false); setNewName('') }
            }}
            placeholder="Nombre de la empresa..."
            className="flex-1 min-w-[220px] px-3 py-2 text-sm rounded-lg border border-[#e2e4ef] dark:border-[#2e3148] bg-white dark:bg-[#252840] text-[#191c1e] dark:text-[#e4e6f0] outline-none focus:ring-2 focus:ring-[#004ac6]/30"
          />
          <button
            onClick={handleAddCompany}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-white"
            style={{ background: '#004ac6' }}
          >
            Agregar
          </button>
          <button
            onClick={() => { setAdding(false); setNewName('') }}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-[#6b7280] hover:bg-[#f3f4f6] dark:hover:bg-[#252840] transition"
          >
            Cancelar
          </button>
        </div>
      )}

      {/* ── Summary cards (same pattern as Dashboard) ────────────────────── */}
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

      {/* ── Search ───────────────────────────────────────────────────────── */}
      <div className="relative max-w-sm">
        <span
          className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[#8890b5]"
          style={{ fontSize: 18 }}
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

                {/* Progress bar + count */}
                <div className="flex items-center gap-2.5 flex-shrink-0">
                  <div className="w-28 h-1.5 rounded-full bg-[#e8eaf0] dark:bg-[#2e3148] overflow-hidden">
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
          No se encontraron empresas
        </div>
      )}
    </div>
  )
}
