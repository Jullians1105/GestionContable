import { useState, useEffect, useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api } from '../services/api'
import EmpresaCombobox from '../components/EmpresaCombobox'

// El teal/dorado de marca GESTCON (docs/Entrega.pdf) se probó en esta página y se revirtió:
// junto al resto de la app (sidebar, botones, todo en azul #004ac6) se veía roto, no distinto —
// un rebrand real necesita tocar las ~408 ocurrencias del azul en toda la app a la vez, no una
// página suelta (ver docs/ESTADO_CONTABILIDAD_EMPRESAS.md si se retoma esa decisión más adelante).
// Mismos colores que ya usa el resto de la app: azul para Compras, ámbar para Ventas.
const AZUL = '#004ac6'
const AZUL_OSCURO = '#00326b'
const AMBAR = '#d97706'

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

  // ── Resumen anual (para las barras del selector de mes) ─────────────────
  const [resumenAnual, setResumenAnual] = useState([])
  useEffect(() => {
    if (!empresaId) { setResumenAnual([]); return }
    api.getContabResumenAnual(empresaId, anio).then(setResumenAnual).catch(() => setResumenAnual([]))
  }, [empresaId, anio])

  // Base (subtotal sin IVA), no total — mismo criterio que las tarjetas de abajo, donde la
  // base es el número principal y el IVA va aparte. Si acá se sumara el total (con IVA), la
  // misma "Compras" mostraría una cifra distinta según si se mira la barra o la tarjeta.
  const maxMesBase = useMemo(
    () => resumenAnual.reduce((max, m) => Math.max(max, m.compras.base + m.ventas.base), 0),
    [resumenAnual]
  )

  // ── Consolidado ──────────────────────────────────────────────────────────
  const [data, setData] = useState(null)
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState('')

  // No se limpia `data` antes de que llegue la respuesta nueva (ni en éxito
  // ni en error) — antes cada cambio de mes desmontaba tarjetas/tablas para
  // mostrar un spinner y las volvía a montar al llegar la respuesta, lo que
  // se sentía como un salto/temblor de la página. Ahora el contenido
  // anterior se queda visible (atenuado, ver `cargando` en el render) hasta
  // que el nuevo período reemplaza el mismo bloque en su lugar.
  useEffect(() => {
    if (!empresaId) { setData(null); return }
    let cancelado = false
    setCargando(true)
    setError('')
    const periodo = tab === 'mensual' ? { anio, mes } : tab === 'cuatrimestral' ? { anio, cuatrimestre } : { anio }
    api.getContabConsolidado(empresaId, periodo)
      .then((res) => { if (!cancelado) setData(res) })
      .catch((err) => { if (!cancelado) setError(err.message || 'No se pudo cargar el consolidado') })
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
          <span className="material-symbols-outlined text-3xl text-[#004ac6] dark:text-[#7ba8f0]">query_stats</span>
          <h1 className="text-2xl font-bold text-[#191c1e] dark:text-[#e4e6f0]">Consolidado</h1>
        </div>
        <p className="text-sm text-[#6b7280] dark:text-[#8890b5]">
          Lo ya guardado por empresa — mensual, cuatrimestral o anual.
        </p>
      </div>

      {/* ── Panel de controles: empresa + tabs + navegador, un solo panel ── */}
      <div className="bg-white dark:bg-[#1e2030] rounded-2xl border border-[#e2e4ef] dark:border-[#2e3148] shadow-sm p-4 mb-5 flex flex-wrap items-center gap-4">
        <div className="w-full sm:w-auto sm:flex-1 sm:min-w-[240px] sm:max-w-md">
          <label className="block text-xs font-semibold text-[#434655] dark:text-[#c4c8e8] mb-1.5">Empresa</label>
          <EmpresaCombobox empresas={empresas} value={empresaId} onChange={setEmpresaId} />
        </div>

        {empresaId && (
          <div className="flex flex-wrap items-center gap-4 sm:ml-auto">
            <div className="hidden sm:block w-px self-stretch bg-[#e2e4ef] dark:bg-[#2e3148]" />

            <div className="inline-flex bg-[#f0f2f8] dark:bg-[#181a2e] rounded-xl p-1">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition ${
                    tab === t.id
                      ? 'bg-white dark:bg-[#252840] shadow-sm text-[#004ac6] dark:text-[#7ba8f0]'
                      : 'text-[#6b7280] dark:text-[#8890b5] hover:text-[#434655] dark:hover:text-[#c4c8e8]'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {tab === 'mensual' && (
              <div className="flex items-center gap-1 border border-[#e2e4ef] dark:border-[#2e3148] rounded-xl px-3 py-2">
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
              <div className="flex items-center gap-1 border border-[#e2e4ef] dark:border-[#2e3148] rounded-xl px-3 py-2">
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
              <div className="flex items-center gap-1 border border-[#e2e4ef] dark:border-[#2e3148] rounded-xl px-3 py-2">
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
        )}
      </div>

      {!empresaId ? (
        <div className="bg-white dark:bg-[#1e2030] rounded-2xl border border-[#e2e4ef] dark:border-[#2e3148] p-12 text-center shadow-sm">
          <span className="material-symbols-outlined text-5xl text-[#d1d5db] dark:text-[#3a3e5c]">business</span>
          <p className="mt-4 text-[#6b7280] dark:text-[#8890b5]">Elige una empresa para ver su información guardada.</p>
        </div>
      ) : (
        <>
          {/* ── Barras del año: selector de mes y gráfico de compras/ventas en uno ── */}
          <div className="bg-white dark:bg-[#1e2030] border border-[#e2e4ef] dark:border-[#2e3148] rounded-2xl p-4 mb-5">
            <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
              <span className="text-[11px] font-bold text-[#6b7280] dark:text-[#8890b5] uppercase tracking-wide">
                {anio} — clic en un mes para verlo
              </span>
              <div className="flex items-center gap-3 text-[11px] text-[#6b7280] dark:text-[#8890b5]">
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm" style={{ background: AZUL }} />Compras
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm" style={{ background: AMBAR }} />Ventas
                </span>
              </div>
            </div>
            <div className="flex items-end justify-center gap-4 h-24">
              {MESES_ES.map((nombre, i) => {
                const numMes = i + 1
                const activo = tab === 'mensual' ? numMes === mes
                  : tab === 'cuatrimestral' ? CUATRIMESTRE_MESES[cuatrimestre].includes(numMes)
                  : false
                const tieneDatos = mesesConDatos.has(numMes)
                const resumenMes = resumenAnual[i]
                const comprasBase = resumenMes?.compras.base ?? 0
                const ventasBase = resumenMes?.ventas.base ?? 0
                const baseMes = comprasBase + ventasBase
                const alturaPct = maxMesBase > 0 ? Math.max((baseMes / maxMesBase) * 100, 8) : 8
                const comprasPct = baseMes > 0 ? (comprasBase / baseMes) * 100 : 0
                const ventasPct = baseMes > 0 ? (ventasBase / baseMes) * 100 : 0
                const soloCompras = comprasPct > 0 && ventasPct === 0
                const soloVentas = ventasPct > 0 && comprasPct === 0

                return (
                  <button
                    key={nombre}
                    onClick={() => { setTab('mensual'); setMes(numMes) }}
                    className={`relative flex flex-col items-center justify-end gap-1.5 h-full rounded-lg px-1.5 pt-2 transition ${
                      activo ? 'bg-[#eef3ff] dark:bg-[#1a2540] border border-[#c7d9ff] dark:border-[#2e4470]' : 'hover:bg-[#f3f4f6] dark:hover:bg-[#252840]'
                    }`}
                  >
                    {tieneDatos ? (
                      <div className="flex flex-col-reverse" style={{ width: 26, height: `${alturaPct}%` }}>
                        {comprasPct > 0 && (
                          <div
                            className={`group relative ${soloCompras ? 'rounded-t-[3px] rounded-b-[2px]' : 'rounded-b-[2px]'}`}
                            style={{ height: `${comprasPct}%`, background: AZUL }}
                          >
                            <span
                              className="pointer-events-none absolute left-1/2 -translate-x-1/2 bottom-[calc(100%+6px)] whitespace-nowrap rounded-lg px-2.5 py-1.5 text-[10.5px] font-semibold text-white opacity-0 shadow-md transition-opacity group-hover:opacity-100 z-10"
                              style={{ background: AZUL_OSCURO }}
                            >
                              Compras · Base <span className="tabular-nums">{fmt(comprasBase)}</span>
                            </span>
                          </div>
                        )}
                        {ventasPct > 0 && (
                          <div
                            className={`group relative ${soloVentas ? 'rounded-t-[3px] rounded-b-[2px]' : 'rounded-t-[3px]'}`}
                            style={{ height: `${ventasPct}%`, background: AMBAR }}
                          >
                            <span
                              className="pointer-events-none absolute left-1/2 -translate-x-1/2 bottom-[calc(100%+6px)] whitespace-nowrap rounded-lg px-2.5 py-1.5 text-[10.5px] font-semibold text-white opacity-0 shadow-md transition-opacity group-hover:opacity-100 z-10"
                              style={{ background: AZUL_OSCURO }}
                            >
                              Ventas · Base <span className="tabular-nums">{fmt(ventasBase)}</span>
                            </span>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="group relative" style={{ width: 26 }}>
                        <div className="h-[3px] rounded-full bg-[#e2e4ef] dark:bg-[#2e3148]" />
                        <span
                          className="pointer-events-none absolute left-1/2 -translate-x-1/2 bottom-[calc(100%+6px)] whitespace-nowrap rounded-lg px-2.5 py-1.5 text-[10.5px] font-medium text-white/80 opacity-0 shadow-md transition-opacity group-hover:opacity-100 z-10"
                          style={{ background: AZUL_OSCURO }}
                        >
                          Sin datos guardados
                        </span>
                      </div>
                    )}
                    <span className={`text-[10px] font-bold ${activo ? 'text-[#004ac6] dark:text-[#7ba8f0]' : 'text-[#9ca3af] dark:text-[#5a5f7a]'}`}>
                      {nombre.slice(0, 1)}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* ── Estados de carga / error ─────────────────────────────── */}
          {/* Spinner grande solo en la carga inicial (sin `data` todavía) —
              un cambio de mes con datos ya en pantalla no vuelve a mostrar
              esto, solo atenúa el bloque de abajo (ver `cargando` más abajo). */}
          {cargando && !data && (
            <div className="text-center py-12">
              <svg className="animate-spin h-8 w-8 text-[#004ac6] dark:text-[#7ba8f0] mx-auto" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            </div>
          )}
          {error && (
            <div className="p-4 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-400 mb-5">
              {error}
            </div>
          )}

          {data && (
            <div className={`transition-opacity duration-150 ${cargando ? 'opacity-50' : 'opacity-100'}`}>
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

              {/* ── Totales: agrupados por Compras / Ventas, no 6 tarjetas sueltas ── */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
                <div className="bg-white dark:bg-[#1e2030] rounded-2xl border border-[#e2e4ef] dark:border-[#2e3148] shadow-sm p-5">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide mb-1" style={{ color: AZUL }}>
                    <span className="material-symbols-outlined text-base">payments</span>Compras
                  </div>
                  <p className="text-[9px] font-bold text-[#9ca3af] uppercase tracking-wide">Base (sin IVA)</p>
                  <p className="text-2xl font-extrabold text-[#191c1e] dark:text-[#e4e6f0] tabular-nums">
                    {fmt(data.totales.compras.base)}
                  </p>
                  <div className="flex gap-6 mt-3 pt-3 border-t border-dashed border-[#e2e4ef] dark:border-[#2e3148]">
                    <div>
                      <p className="text-[9px] font-bold text-[#9ca3af] uppercase tracking-wide"># Facturas</p>
                      <p className="text-sm font-bold text-[#191c1e] dark:text-[#e4e6f0] tabular-nums">{data.totales.compras.cantidad}</p>
                    </div>
                    <div>
                      <p className="text-[9px] font-bold text-[#9ca3af] uppercase tracking-wide">IVA descontable</p>
                      <p className="text-sm font-bold text-[#191c1e] dark:text-[#e4e6f0] tabular-nums">{fmt(data.totales.compras.iva)}</p>
                    </div>
                  </div>
                </div>
                <div className="bg-white dark:bg-[#1e2030] rounded-2xl border border-[#e2e4ef] dark:border-[#2e3148] shadow-sm p-5">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide mb-1" style={{ color: AMBAR }}>
                    <span className="material-symbols-outlined text-base">trending_up</span>Ventas
                  </div>
                  <p className="text-[9px] font-bold text-[#9ca3af] uppercase tracking-wide">Base (sin IVA)</p>
                  <p className="text-2xl font-extrabold text-[#191c1e] dark:text-[#e4e6f0] tabular-nums">
                    {fmt(data.totales.ventas.base)}
                  </p>
                  <div className="flex gap-6 mt-3 pt-3 border-t border-dashed border-[#e2e4ef] dark:border-[#2e3148]">
                    <div>
                      <p className="text-[9px] font-bold text-[#9ca3af] uppercase tracking-wide">IVA generado</p>
                      <p className="text-sm font-bold text-[#191c1e] dark:text-[#e4e6f0] tabular-nums">{fmt(data.totales.ventas.iva)}</p>
                    </div>
                    <div>
                      <p className="text-[9px] font-bold text-[#9ca3af] uppercase tracking-wide">INC generado</p>
                      <p className="text-sm font-bold text-[#191c1e] dark:text-[#e4e6f0] tabular-nums">{fmt(data.totales.ventas.inc)}</p>
                    </div>
                  </div>
                </div>
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
            </div>
          )}

          {!cargando && data && data.documentos.length === 0 && data.mesesFaltantes.length === data.periodo.meses.length && (
            <p className="text-xs text-[#9ca3af] mt-2">
              {empresaNombre} no tiene ningún dato guardado para este período todavía.
            </p>
          )}
        </>
      )}
    </div>
  )
}
