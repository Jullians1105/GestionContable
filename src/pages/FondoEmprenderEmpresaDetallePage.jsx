import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import {
  loadMonthData,
  loadEmpresaDetail, saveEmpresaDetail, buildDefaultEmpresaDetail,
} from '../data/fondoEmprender'

const MONTHS = [
  'Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre',
]

const MACRO_STATUS = {
  pending:     { label: 'Pendiente',   icon: 'radio_button_unchecked', color: '#6b7280', bg: '#f3f4f6' },
  in_progress: { label: 'En progreso', icon: 'timelapse',              color: '#d97706', bg: '#fef9c3' },
  done:        { label: 'Completado',  icon: 'check_circle',           color: '#16a34a', bg: '#dcfce7' },
}

const CONTABILIDAD_ID = 'mp5'

export default function FondoEmprenderEmpresaDetallePage() {
  const { empresaId } = useParams()
  const today = new Date()
  const month = today.getMonth()
  const year  = today.getFullYear()

  // Company data from the monthly checklist (name + confirmed status)
  const [company, setCompany] = useState(null)

  // The 7 macro processes for this company
  const [macros, setMacros] = useState(
    () => loadEmpresaDetail(empresaId) ?? buildDefaultEmpresaDetail()
  )

  useEffect(() => {
    const d = loadMonthData(year, month)
    if (d?.companies) {
      setCompany(d.companies.find(c => c.id === empresaId) ?? null)
    }
  }, [empresaId, year, month])

  // Contabilidad status is derived — never edited here
  const contabilidadConfirmed = company?.confirmed ?? null

  function updateMacro(id, updates) {
    setMacros(prev => {
      const next = prev.map(p => p.id === id ? { ...p, ...updates } : p)
      saveEmpresaDetail(empresaId, next)
      return next
    })
  }

  const companyName = company?.name ?? '...'

  // Progress summary
  const contabDone  = !!contabilidadConfirmed
  const manualDone  = macros.filter(p => p.id !== CONTABILIDAD_ID && p.status === 'done').length
  const totalDone   = manualDone + (contabDone ? 1 : 0)

  return (
    <div className="flex flex-col gap-5 min-w-0">

      {/* ── Breadcrumb ───────────────────────────────────────────────────── */}
      <div>
        <Link
          to="/fondo-emprender/empresas"
          className="inline-flex items-center gap-1 text-sm text-[#6b7280] dark:text-[#8890b5] hover:text-[#004ac6] dark:hover:text-[#7ba8f0] transition"
        >
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>arrow_back</span>
          Empresas
        </Link>
      </div>

      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-[#191c1e] dark:text-[#e4e6f0] leading-tight">{companyName}</h1>
          <p className="text-sm text-[#6b7280] dark:text-[#8890b5] mt-0.5">
            Procesos macro · {MONTHS[month]} {year}
          </p>
        </div>
        {/* Progress pill */}
        <div
          className="flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold"
          style={{
            background: totalDone === 7 ? '#dcfce7' : totalDone > 0 ? '#fef9c3' : '#f3f4f6',
            color:      totalDone === 7 ? '#16a34a' : totalDone > 0 ? '#d97706' : '#6b7280',
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
            {totalDone === 7 ? 'check_circle' : 'timelapse'}
          </span>
          {totalDone} / 7 completos
        </div>
      </div>

      {/* ── Macro process cards ───────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {macros.map(proc => {
          const isContabilidad = proc.id === CONTABILIDAD_ID
          const cfgStatus = isContabilidad
            ? (contabilidadConfirmed ? MACRO_STATUS.done : MACRO_STATUS.pending)
            : (MACRO_STATUS[proc.status] ?? MACRO_STATUS.pending)

          return (
            <div
              key={proc.id}
              className="bg-white dark:bg-[#1e2030] border border-[#e2e4ef] dark:border-[#2e3148] rounded-xl p-4 shadow-sm flex flex-col gap-3"
            >
              {/* Process header */}
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span
                    className="material-symbols-outlined flex-shrink-0"
                    style={{ color: cfgStatus.color, fontSize: 18 }}
                  >
                    {cfgStatus.icon}
                  </span>
                  <h3 className="text-sm font-bold text-[#191c1e] dark:text-[#e4e6f0] leading-tight">
                    {proc.name}
                  </h3>
                </div>
                {isContabilidad && (
                  <span className="text-[9px] font-bold uppercase tracking-wide text-[#8890b5] bg-[#f3f4f6] dark:bg-[#252840] px-1.5 py-0.5 rounded flex-shrink-0">
                    Auto
                  </span>
                )}
              </div>

              {/* Status — manual selector or auto display */}
              {isContabilidad ? (
                <div className="rounded-lg p-2.5 text-xs leading-relaxed" style={{ background: cfgStatus.bg }}>
                  {contabilidadConfirmed ? (
                    <p className="font-semibold" style={{ color: '#16a34a' }}>
                      Confirmado el {contabilidadConfirmed.date}
                    </p>
                  ) : (
                    <p className="text-[#6b7280] dark:text-[#8890b5]">
                      Sin confirmar ·{' '}
                      <Link
                        to="/fondo-emprender"
                        className="underline underline-offset-2 font-medium"
                        style={{ color: '#004ac6' }}
                      >
                        ir al checklist
                      </Link>
                    </p>
                  )}
                  <p className="text-[#9ca3af] mt-1" style={{ fontSize: 10 }}>
                    Estado calculado desde el checklist mensual
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-1">
                  {Object.entries(MACRO_STATUS).map(([key, cfg]) => {
                    const active = proc.status === key
                    return (
                      <button
                        key={key}
                        onClick={() => updateMacro(proc.id, { status: key })}
                        className="py-1.5 rounded-lg text-[10px] font-semibold transition-all hover:opacity-90 active:scale-95"
                        style={{
                          background: active ? cfg.bg : 'transparent',
                          color:      active ? cfg.color : '#9ca3af',
                          border:     `1.5px solid ${active ? cfg.color : '#e2e4ef'}`,
                        }}
                      >
                        {cfg.label}
                      </button>
                    )
                  })}
                </div>
              )}

              {/* Responsable */}
              <div>
                <label className="block text-[10px] font-semibold text-[#8890b5] uppercase tracking-wide mb-1">
                  Responsable
                </label>
                <input
                  value={proc.responsable}
                  onChange={e => updateMacro(proc.id, { responsable: e.target.value })}
                  placeholder="Sin asignar"
                  className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-[#e2e4ef] dark:border-[#2e3148] bg-[#f8f9fc] dark:bg-[#252840] text-[#191c1e] dark:text-[#e4e6f0] outline-none focus:ring-2 focus:ring-[#004ac6]/30"
                />
              </div>

              {/* Nota */}
              <div>
                <label className="block text-[10px] font-semibold text-[#8890b5] uppercase tracking-wide mb-1">
                  Nota
                </label>
                <textarea
                  value={proc.nota}
                  onChange={e => updateMacro(proc.id, { nota: e.target.value })}
                  placeholder="Notas adicionales..."
                  rows={2}
                  className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-[#e2e4ef] dark:border-[#2e3148] bg-[#f8f9fc] dark:bg-[#252840] text-[#191c1e] dark:text-[#e4e6f0] outline-none focus:ring-2 focus:ring-[#004ac6]/30 resize-none"
                />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
