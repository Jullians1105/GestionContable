import { useState, useEffect, useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api } from '../services/api'
import StatsCard from '../components/StatsCard'

const MESES_ES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]
const CUATRIMESTRE_MESES = { 1: [1, 2, 3, 4], 2: [5, 6, 7, 8], 3: [9, 10, 11, 12] }
const CUATRIMESTRE_LABEL = { 1: 'Ene-Abr', 2: 'May-Ago', 3: 'Sep-Dic' }
const cuatrimestreDeMes = (mes) => (mes <= 4 ? 1 : mes <= 8 ? 2 : 3)

const fmt = (n) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n ?? 0)

const TABS = [
  { id: 'mensual', label: 'Mensual' },
  { id: 'cuatrimestral', label: 'Cuatrimestral' },
  { id: 'anual', label: 'Anual' },
]

export default function ContabilidadConsolidadoPage() {
  const [searchParams, setSearchParams] = useSearchParams()

  // ── Empresa ──────────────────────────────────────────────────────────────
  const [empresas, setEmpresas] = useState([])
  const [empresaId, setEmpresaId] = useState(searchParams.get('empresaId') || '')

  useEffect(() => {
    api.getContabEmpresas().then(setEmpresas).catch(() => {})
  }, [])

  // ── Período ──────────────────────────────────────────────────────────────
  const hoy = new Date()
  const [tab, setTab] = useState(searchParams.get('tab') || 'mensual')
  const [anio, setAnio] = useState(parseInt(searchParams.get('anio'), 10) || hoy.getFullYear())
  const [mes, setMes] = useState(parseInt(searchParams.get('mes'), 10) || (hoy.getMonth() + 1))
  const [cuatrimestre, setCuatrimestre] = useState(
    parseInt(searchParams.get('cuatrimestre'), 10) || cuatrimestreDeMes(hoy.getMonth() + 1)
  )

  useEffect(() => {
    const params = { tab, anio: String(anio) }
    if (empresaId) params.empresaId = empresaId
    if (tab === 'mensual') params.mes = String(mes)
    if (tab === 'cuatrimestral') params.cuatrimestre = String(cuatrimestre)
    setSearchParams(params, { replace: true })
  }, [empresaId, tab, anio, mes, cuatrimestre, setSearchParams])

  const cambiarMes = useCallback((delta) => {
    let m = mes + delta, a = anio
    if (m < 1) { m = 12; a -= 1 }
    if (m > 12) { m = 1; a += 1 }
    setMes(m); setAnio(a)
  }, [mes, anio])

  const cambiarCuatrimestre = useCallback((delta) => {
    let c = cuatrimestre + delta, a = anio
    if (c < 1) { c = 3; a -= 1 }
    if (c > 3) { c = 1; a += 1 }
    setCuatrimestre(c); setAnio(a)
  }, [cuatrimestre, anio])

  // ── Períodos guardados (para saber qué meses existen) ───────────────────
  const [periodosGuardados, setPeriodosGuardados] = useState([])
  useEffect(() => {
    if (!empresaId) { setPeriodosGuardados([]); return }
    api.getContabPeriodos(empresaId).then(setPeriodosGuardados).catch(() => setPeriodosGuardados([]))
  }, [empresaId])

  const mesesConDatos = useMemo(
    () => new Set(periodosGuardados.filter((p) => p.anio === anio).map((p) => p.mes)),
    [periodosGuardados, anio]
  )

  // ── Consolidado ──────────────────────────────────────────────────────────
  const [data, setData] = useState(null)
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!empresaId) { setData(null); return }
    let cancelado = false
    setCargando(true)
    setError('')
    const periodo = tab === 'mensual' ? { anio, mes } : tab === 'cuatrimestral' ? { anio, cuatrimestre } : { anio }
    api.getContabConsolidado(empresaId, periodo)
      .then((res) => { if (!cancelado) setData(res) })
      .catch((err) => { if (!cancelado) { setError(err.message || 'No se pudo cargar el consolidado'); setData(null) } })
      .finally(() => { if (!cancelado) setCargando(false) })
    return () => { cancelado = true }
  }, [empresaId, tab, anio, mes, cuatrimestre])

  // ── Exportar ─────────────────────────────────────────────────────────────
  const [exportando, setExportando] = useState(false)
  const [exportError, setExportError] = useState('')

  const handleExportar = useCallback(async () => {
    if (!empresaId) return
    setExportando(true)
    setExportError('')
    try {
      const periodo = tab === 'mensual' ? { anio, mes } : tab === 'cuatrimestral' ? { anio, cuatrimestre } : { anio }
      const { blob, filename } = await api.exportarContabConsolidado(empresaId, periodo)
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = filename
      document.body.appendChild(a); a.click(); document.body.removeChild(a)
      window.URL.revokeObjectURL(url)
    } catch (err) {
      setExportError(err.message || 'No se pudo exportar')
    } finally {
      setExportando(false)
    }
  }, [empresaId, tab, anio, mes, cuatrimestre])

  const empresaNombre = empresas.find((e) => e.id === empresaId)?.name

  return (
    <div className="max-w-6xl mx-auto">
      {/* ── Encabezado ─────────────────────────────────────────────────── */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <span className="material-symbols-outlined text-3xl text-[#004ac6]">query_stats</span>
          <h1 className="text-2xl font-bold text-[#191c1e] dark:text-[#e4e6f0]">Consolidado</h1>
        </div>
        <p className="text-sm text-[#6b7280] dark:text-[#8890b5]">
          Lo ya guardado por empresa — mensual, cuatrimestral o anual.
        </p>
      </div>

      {/* ── Selector de empresa ────────────────────────────────────────── */}
      <div className="bg-white dark:bg-[#1e2030] rounded-2xl border border-[#e2e4ef] dark:border-[#2e3148] shadow-sm p-4 mb-5">
        <label className="block text-xs font-semibold text-[#434655] dark:text-[#c4c8e8] mb-1.5">Empresa</label>
        <select
          value={empresaId}
          onChange={(e) => setEmpresaId(e.target.value)}
          className="w-full sm:w-96 px-3 py-2.5 rounded-xl border border-[#d1d5db] dark:border-[#3a3e5c] bg-white dark:bg-[#181a2e] text-sm text-[#191c1e] dark:text-[#e4e6f0] focus:outline-none focus:ring-2 focus:ring-[#004ac6]/30"
        >
          <option value="">— Selecciona una empresa —</option>
          {empresas.map((e) => (
            <option key={e.id} value={e.id}>{e.name}</option>
          ))}
        </select>
      </div>

      {!empresaId ? (
        <div className="bg-white dark:bg-[#1e2030] rounded-2xl border border-[#e2e4ef] dark:border-[#2e3148] p-12 text-center shadow-sm">
          <span className="material-symbols-outlined text-5xl text-[#d1d5db] dark:text-[#3a3e5c]">business</span>
          <p className="mt-4 text-[#6b7280] dark:text-[#8890b5]">Elige una empresa para ver su información guardada.</p>
        </div>
      ) : (
        <>
          {/* ── Tabs + navegador de período ──────────────────────────── */}
          <div className="flex items-center justify-between flex-wrap gap-3 mb-5">
            <div className="inline-flex bg-[#f0f2f8] dark:bg-[#181a2e] rounded-xl p-1">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition ${
                    tab === t.id
                      ? 'bg-white dark:bg-[#252840] shadow-sm text-[#004ac6]'
                      : 'text-[#6b7280] dark:text-[#8890b5] hover:text-[#434655] dark:hover:text-[#c4c8e8]'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {tab === 'mensual' && (
              <div className="flex items-center gap-1 bg-white dark:bg-[#1e2030] border border-[#e2e4ef] dark:border-[#2e3148] rounded-xl px-3 py-2 shadow-sm">
                <button onClick={() => cambiarMes(-1)} className="p-0.5 rounded hover:bg-[#f3f4f6] dark:hover:bg-[#252840] text-[#8890b5]">
                  <span className="material-symbols-outlined">chevron_left</span>
                </button>
                <span className="text-sm font-medium min-w-[130px] text-center">{MESES_ES[mes - 1]} {anio}</span>
                <button onClick={() => cambiarMes(1)} className="p-0.5 rounded hover:bg-[#f3f4f6] dark:hover:bg-[#252840] text-[#8890b5]">
                  <span className="material-symbols-outlined">chevron_right</span>
                </button>
              </div>
            )}
            {tab === 'cuatrimestral' && (
              <div className="flex items-center gap-1 bg-white dark:bg-[#1e2030] border border-[#e2e4ef] dark:border-[#2e3148] rounded-xl px-3 py-2 shadow-sm">
                <button onClick={() => cambiarCuatrimestre(-1)} className="p-0.5 rounded hover:bg-[#f3f4f6] dark:hover:bg-[#252840] text-[#8890b5]">
                  <span className="material-symbols-outlined">chevron_left</span>
                </button>
                <span className="text-sm font-medium min-w-[150px] text-center">{CUATRIMESTRE_LABEL[cuatrimestre]} {anio}</span>
                <button onClick={() => cambiarCuatrimestre(1)} className="p-0.5 rounded hover:bg-[#f3f4f6] dark:hover:bg-[#252840] text-[#8890b5]">
                  <span className="material-symbols-outlined">chevron_right</span>
                </button>
              </div>
            )}
            {tab === 'anual' && (
              <div className="flex items-center gap-1 bg-white dark:bg-[#1e2030] border border-[#e2e4ef] dark:border-[#2e3148] rounded-xl px-3 py-2 shadow-sm">
                <button onClick={() => setAnio((a) => a - 1)} className="p-0.5 rounded hover:bg-[#f3f4f6] dark:hover:bg-[#252840] text-[#8890b5]">
                  <span className="material-symbols-outlined">chevron_left</span>
                </button>
                <span className="text-sm font-medium min-w-[80px] text-center">{anio}</span>
                <button onClick={() => setAnio((a) => a + 1)} className="p-0.5 rounded hover:bg-[#f3f4f6] dark:hover:bg-[#252840] text-[#8890b5]">
                  <span className="material-symbols-outlined">chevron_right</span>
                </button>
              </div>
            )}
          </div>

          {/* ── Indicador de meses del año con datos (referencia rápida) ── */}
          <div className="flex items-center gap-1.5 flex-wrap mb-5">
            {MESES_ES.map((nombre, i) => {
              const numMes = i + 1
              const activo = tab === 'mensual' ? numMes === mes
                : tab === 'cuatrimestral' ? CUATRIMESTRE_MESES[cuatrimestre].includes(numMes)
                : true
              const tieneDatos = mesesConDatos.has(numMes)
              return (
                <span
                  key={nombre}
                  title={`${nombre} ${anio}${tieneDatos ? ' — con datos guardados' : ' — sin datos'}`}
                  className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-semibold border ${
                    activo
                      ? tieneDatos ? 'bg-green-100 dark:bg-green-900/30 border-green-400 text-green-700 dark:text-green-400'
                                   : 'bg-red-50 dark:bg-red-900/20 border-red-300 text-red-500'
                      : tieneDatos ? 'bg-[#eef3ff] dark:bg-[#1a2540] border-[#c7d9ff] dark:border-[#2e4470] text-[#004ac6]'
                                   : 'bg-[#f3f4f6] dark:bg-[#181a2e] border-[#e2e4ef] dark:border-[#2e3148] text-[#9ca3af]'
                  }`}
                >
                  {nombre.slice(0, 1)}
                </span>
              )
            })}
          </div>

          {/* ── Estados de carga / error ─────────────────────────────── */}
          {cargando && (
            <div className="text-center py-12">
              <svg className="animate-spin h-8 w-8 text-[#004ac6] mx-auto" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            </div>
          )}
          {error && !cargando && (
            <div className="p-4 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-400 mb-5">
              {error}
            </div>
          )}

          {!cargando && !error && data && (
            <>
              {/* ── Aviso de meses faltantes ───────────────────────────── */}
              {data.mesesFaltantes.length > 0 && (
                <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 mb-5">
                  <span className="material-symbols-outlined text-amber-500 text-xl flex-shrink-0 mt-0.5">warning</span>
                  <p className="text-sm text-amber-800 dark:text-amber-300">
                    Faltan datos de {data.mesesFaltantes.map((m) => MESES_ES[m - 1]).join(', ')} — el consolidado de este
                    período está incompleto.
                  </p>
                </div>
              )}

              {/* ── Totales ────────────────────────────────────────────── */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4 mb-6">
                <StatsCard title="COMPRAS — # FACTURAS" value={data.totales.compras.cantidad} icon="receipt_long" />
                <StatsCard title="COMPRAS — BASE" value={data.totales.compras.base} icon="payments" decimals={0} />
                <StatsCard title="IVA DESCONTABLE" value={data.totales.compras.iva} icon="percent" borderColor="#16a34a" iconColor="#16a34a" />
                <StatsCard title="VENTAS — BASE" value={data.totales.ventas.base} icon="trending_up" borderColor="#d97706" iconColor="#d97706" />
                <StatsCard title="IVA GENERADO" value={data.totales.ventas.iva} icon="sell" borderColor="#d97706" iconColor="#d97706" />
                <StatsCard title="INC GENERADO" value={data.totales.ventas.inc} icon="local_mall" borderColor="#d97706" iconColor="#d97706" />
              </div>

              {/* ── Agrupados: Concepto / Clasificación IVA ─────────────── */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-6">
                {[
                  { titulo: 'Compras por Concepto', grupos: data.porConcepto },
                  { titulo: 'Compras por Clasificación de IVA', grupos: data.porClasificacionIva },
                ].map(({ titulo, grupos }) => (
                  <div key={titulo} className="bg-white dark:bg-[#1e2030] rounded-2xl border border-[#e2e4ef] dark:border-[#2e3148] shadow-sm p-5">
                    <h2 className="text-xs font-bold text-[#8890b5] uppercase tracking-wide mb-3">{titulo}</h2>
                    {grupos.length === 0 ? (
                      <p className="text-sm text-[#9ca3af] italic">Sin datos</p>
                    ) : (
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left text-xs text-[#8890b5] uppercase">
                            <th className="pb-2">Concepto</th>
                            <th className="pb-2 text-right"># Fact.</th>
                            <th className="pb-2 text-right">Base</th>
                            <th className="pb-2 text-right">IVA</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#f0f2f8] dark:divide-[#2a2e45]">
                          {grupos.map((g) => (
                            <tr key={g.nombre}>
                              <td className="py-1.5 text-[#191c1e] dark:text-[#e4e6f0]">{g.nombre}</td>
                              <td className="py-1.5 text-right tabular-nums">{g.cantidad}</td>
                              <td className="py-1.5 text-right tabular-nums">{fmt(g.base)}</td>
                              <td className="py-1.5 text-right tabular-nums">{fmt(g.iva)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                ))}
              </div>

              {/* ── Exportar ───────────────────────────────────────────── */}
              <div className="flex items-center gap-3 mb-6">
                <button
                  onClick={handleExportar}
                  disabled={exportando || data.documentos.length === 0}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white transition active:scale-[0.97] disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90"
                  style={{ background: '#16a34a' }}
                >
                  <span className="material-symbols-outlined text-lg">download</span>
                  {exportando ? 'Generando…' : `Exportar ${tab === 'mensual' ? 'mes' : tab === 'cuatrimestral' ? 'cuatrimestre' : 'año'}`}
                </button>
                {data.mesesFaltantes.length > 0 && (
                  <span className="text-xs text-amber-600 dark:text-amber-400">
                    Se puede exportar igual — el Excel avisa qué meses faltan.
                  </span>
                )}
                {exportError && <span className="text-xs text-red-500">{exportError}</span>}
              </div>

              {/* ── Detalle ────────────────────────────────────────────── */}
              <div className="bg-white dark:bg-[#1e2030] rounded-2xl border border-[#e2e4ef] dark:border-[#2e3148] shadow-sm overflow-hidden">
                <div className="px-5 py-3 border-b border-[#e2e4ef] dark:border-[#2e3148]">
                  <h2 className="text-xs font-bold text-[#8890b5] uppercase tracking-wide">
                    Detalle ({data.documentos.length} documentos)
                  </h2>
                </div>
                {data.documentos.length === 0 ? (
                  <p className="text-sm text-[#9ca3af] italic px-5 py-8 text-center">
                    Sin documentos guardados para este período.
                  </p>
                ) : (
                  <div className="overflow-auto scrollbar-styled" style={{ maxHeight: '480px' }}>
                    <table className="w-full text-sm border-collapse">
                      <thead className="sticky top-0 z-10 bg-[#f8f9ff] dark:bg-[#181a2e]">
                        <tr className="text-left text-xs text-[#8890b5] uppercase">
                          <th className="px-4 py-2">Fecha</th>
                          <th className="px-4 py-2">Grupo</th>
                          <th className="px-4 py-2">Tercero</th>
                          <th className="px-4 py-2">NIT</th>
                          <th className="px-4 py-2 text-right">Subtotal</th>
                          <th className="px-4 py-2 text-right">IVA</th>
                          <th className="px-4 py-2 text-right">INC</th>
                          <th className="px-4 py-2 text-right">Total</th>
                          <th className="px-4 py-2">Clasificación IVA</th>
                          <th className="px-4 py-2">Concepto</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.documentos.map((d, i) => (
                          <tr key={d.id} className={`border-t border-[#f0f2f8] dark:border-[#2e3148] ${i % 2 === 1 ? 'bg-[#fafbff] dark:bg-[#191b2e]' : ''}`}>
                            <td className="px-4 py-2 whitespace-nowrap text-[#6b7280] dark:text-[#8890b5]">
                              {d.fechaEmision ? new Date(d.fechaEmision).toLocaleDateString('es-CO') : '—'}
                            </td>
                            <td className="px-4 py-2">{d.grupo}</td>
                            <td className="px-4 py-2 max-w-[200px] truncate" title={d.nombreTercero ?? ''}>{d.nombreTercero ?? '—'}</td>
                            <td className="px-4 py-2 text-[#8890b5]">{d.nitTercero ?? '—'}</td>
                            <td className="px-4 py-2 text-right tabular-nums">{fmt(d.subtotal)}</td>
                            <td className="px-4 py-2 text-right tabular-nums">{fmt(d.iva)}</td>
                            <td className="px-4 py-2 text-right tabular-nums">{d.inc ? fmt(d.inc) : '—'}</td>
                            <td className="px-4 py-2 text-right tabular-nums font-semibold">{fmt(d.total)}</td>
                            <td className="px-4 py-2">{d.clasificacionIva ?? '—'}</td>
                            <td className="px-4 py-2">{d.concepto ?? '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}

          {!cargando && !error && data && data.documentos.length === 0 && data.mesesFaltantes.length === data.periodo.meses.length && (
            <p className="text-xs text-[#9ca3af] mt-2">
              {empresaNombre} no tiene ningún dato guardado para este período todavía.
            </p>
          )}
        </>
      )}
    </div>
  )
}
