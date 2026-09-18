import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api } from '../services/api'
import EmpresaCombobox from '../components/EmpresaCombobox'
import { useTheme } from '../context/ThemeContext'
import { useToast } from '../context/ToastContext'

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

// Encabezado de grupo del panel de totales — "COMPRAS" / "VENTAS" en su color, para que se
// entienda de un vistazo a qué grupo pertenecen las 3 filas de abajo (antes no había ninguna
// separación visual entre los dos grupos, solo líneas iguales entre las 6 filas).
function TotalGroupHeader({ label, color }) {
  return (
    <div className="px-4 pt-3 pb-1.5 text-[10.5px] font-bold uppercase tracking-wide" style={{ color }}>
      {label}
    </div>
  )
}

// Una fila del panel de totales — mismo patrón que las StatsCard originales (etiqueta arriba,
// valor grande abajo), no etiqueta y valor lado a lado — eso se apretaba y no se entendía en
// una columna angosta.
function TotalRow({ icon, label, value, grande }) {
  return (
    <div className="px-4 py-2.5 min-w-0">
      <span className="flex items-center gap-1.5 text-[11px] text-[#6b7280] dark:text-[#8890b5] truncate mb-0.5">
        <span className="material-symbols-outlined text-[15px] flex-shrink-0 text-[#9ca3af] dark:text-[#5a5f7a]">{icon}</span>
        {label}
      </span>
      <p className={`font-bold text-[#191c1e] dark:text-[#e4e6f0] tabular-nums truncate ${grande ? 'text-lg' : 'text-sm'}`}>
        {value}
      </p>
    </div>
  )
}

// Gráfico de tendencia: Compras vs. Ventas (base, sin IVA) a lo largo del año, con el período
// elegido resaltado como franja sobre la curva — la opción de línea/área que se había mirado
// antes que las barras, sin la mezcla de dos colores dentro de una misma forma que chocaba ahí.
function TendenciaChart({ resumenAnual, tab, mes, cuatrimestre }) {
  // Proporción fija (5:3, ~1.7:1) vía CSS aspect-ratio, con preserveAspectRatio por defecto
  // ("meet") — el gráfico nunca se deforma sin importar qué tan angosta quede la columna que
  // lo contiene. Antes forzaba 150px de alto sobre un ancho de página completa (~10:1) con
  // preserveAspectRatio="none", que lo aplastaba/estiraba.
  // 500:220 (~2.3:1) — proporción "ancha" típica de gráfico de tendencia, no de torre. Con
  // 400:240 (~1.7:1) y el gráfico usando el ancho real de su tarjeta (~800px), quedaba
  // demasiado alto (~470px) para lo que muestra.
  // Punto sobre el que está el mouse — { serie: 'compras'|'ventas', i } | null.
  const [hover, setHover] = useState(null)

  const W = 500, H = 220, STEP = W / 12
  // 22% de aire arriba (antes 10%, muy poco — el pico quedaba pegado a la leyenda de arriba,
  // se seguía viendo "cortado"). El pico real nunca llega a y=0 con este margen.
  const TOPE = H * 0.22

  const maxVal = Math.max(1, ...resumenAnual.flatMap((m) => [m.compras.base, m.ventas.base]))
  const puntos = (campo) =>
    Array.from({ length: 12 }, (_, i) => {
      const m = resumenAnual[i]
      const v = m ? m[campo].base : 0
      return { x: STEP * i + STEP / 2, y: H - (v / maxVal) * (H - TOPE) }
    })

  const comprasPts = puntos('compras')
  const ventasPts = puntos('ventas')

  // Segmentos rectos, a propósito — probé una curva suavizada (Catmull-Rom) y con un pico tan
  // marcado como el de un mes de mucha venta sobre el resto, la curva se desbordaba por debajo
  // de la línea base (overshoot: sin "monotone interpolation" que lo evite, una spline puede
  // pasarse del valor real entre dos puntos). Una recta nunca se desborda — es matemáticamente
  // imposible que salga del rango entre los puntos que une — así que es la opción segura acá.
  const segment = (pts) => pts.map((p) => ` L ${p.x.toFixed(1)},${p.y.toFixed(1)}`).join('')
  const toCurve = (pts) => `M ${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}${segment(pts.slice(1))}`
  const toArea = (pts) =>
    `M ${pts[0].x.toFixed(1)},${H} L ${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}${segment(pts.slice(1))} L ${pts[pts.length - 1].x.toFixed(1)},${H} Z`

  const banda = tab === 'mensual'
    ? { x: STEP * (mes - 1), w: STEP }
    : tab === 'cuatrimestral'
      ? { x: STEP * (CUATRIMESTRE_MESES[cuatrimestre][0] - 1), w: STEP * 4 }
      : null

  // Colores calculados en JS según el tema real de la app (useTheme), aplicados por `style`
  // inline en cada elemento — no por clases CSS. Un <style> con selectores .dark dentro del
  // <svg> dependía de que ninguna otra regla le ganara en la cascada, y algo se lo estaba
  // ganando: la opacidad del área no se veía (quedaba sólida en vez de un tinte suave). Un
  // `style` inline tiene la especificidad más alta posible, no hay cascada que le gane.
  const { theme } = useTheme()
  const dark = theme === 'dark'
  // Compras se queda en el azul de la app (consistencia). Ventas pasa al dorado real de
  // GESTCON (docs/Entrega.pdf) — un toque de marca acotado a este gráfico puntual, no a toda
  // la página otra vez (eso ya se probó y se revirtió por no combinar con el resto en azul).
  const col = {
    base: dark ? '#2e3148' : '#e2e4ef',
    banda: dark ? '#7ba8f0' : '#004ac6',
    bandaOp: dark ? 0.14 : 0.06,
    compras: dark ? '#7ba8f0' : '#004ac6',
    ventas: dark ? '#f0c04a' : '#E5A70C',
    lbl: dark ? '#5a5f7a' : '#9ca3af',
    lblOn: dark ? '#7ba8f0' : '#004ac6',
    halo: dark ? '#1e2030' : '#ffffff',
  }
  const gradId = { compras: `tc-grad-compras-${dark ? 'd' : 'l'}`, ventas: `tc-grad-ventas-${dark ? 'd' : 'l'}` }

  return (
    <div className="bg-white dark:bg-[#1e2030] rounded-2xl border border-[#e2e4ef] dark:border-[#2e3148] shadow-sm p-5 flex-1 min-w-0">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-bold text-[#8890b5] uppercase tracking-wide">Tendencia — año</span>
        <div className="flex items-center gap-4 text-xs text-[#6b7280] dark:text-[#8890b5]">
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-[#004ac6]" />Compras</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: '#E5A70C' }} />Ventas</span>
        </div>
      </div>
      {/* Tono de fondo propio para el área de dibujo — distingue el "lienzo" del blanco de la
          tarjeta, mismo gris-azulado que ya usa el resto de la app para superficies
          secundarias (la píldora de tabs, el header de la tabla de Detalle). */}
      <div className="rounded-xl bg-[#f8f9ff] dark:bg-[#181a2e] p-3">
        <svg viewBox={`0 0 ${W} ${H + 34}`} className="w-full block overflow-visible" style={{ aspectRatio: `${W} / ${H + 34}` }}>
          <defs>
            {/* Relleno en degradado (más presente arriba, se disuelve hacia la base) en vez de
                un tono plano — así se lee como "profundidad", no como un bloque de color. */}
            <linearGradient id={gradId.compras} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={col.compras} stopOpacity={dark ? 0.32 : 0.22} />
              <stop offset="100%" stopColor={col.compras} stopOpacity="0" />
            </linearGradient>
            <linearGradient id={gradId.ventas} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={col.ventas} stopOpacity={dark ? 0.34 : 0.24} />
              <stop offset="100%" stopColor={col.ventas} stopOpacity="0" />
            </linearGradient>
            {/* Sombra suave bajo cada línea — le da un poco de relieve en vez de quedar
                perfectamente plana sobre el fondo. */}
            <filter id="tc-line-shadow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="1.5" stdDeviation="2" floodColor="#000000" floodOpacity={dark ? 0.35 : 0.14} />
            </filter>
          </defs>
          <line x1="0" y1={H} x2={W} y2={H} stroke={col.base} strokeWidth="1" />
          {banda && <rect x={banda.x} y="0" width={banda.w} height={H} rx="4" fill={col.banda} opacity={col.bandaOp} />}
          <path d={toArea(comprasPts)} fill={`url(#${gradId.compras})`} />
          <path d={toArea(ventasPts)} fill={`url(#${gradId.ventas})`} />
          <g filter="url(#tc-line-shadow)">
            <path d={toCurve(comprasPts)} fill="none" stroke={col.compras} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            <path d={toCurve(ventasPts)} fill="none" stroke={col.ventas} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          </g>
          {comprasPts.map((p, i) => {
            const activo = hover?.serie === 'compras' && hover.i === i
            return (
              <g key={`c${i}`}>
                <circle cx={p.x} cy={p.y} r={activo ? 5.5 : 4.5} fill={col.halo} style={{ transition: 'r 0.1s' }} />
                <circle cx={p.x} cy={p.y} r={activo ? 4 : 3} fill={col.compras} style={{ transition: 'r 0.1s' }} />
                {/* Círculo invisible más grande — el punto visible (r=3) es muy pequeño para
                    detectar el hover del mouse con precisión. */}
                <circle
                  cx={p.x} cy={p.y} r="10" fill="transparent"
                  onMouseEnter={() => setHover({ serie: 'compras', i })}
                  onMouseLeave={() => setHover(null)}
                  style={{ cursor: 'pointer' }}
                />
              </g>
            )
          })}
          {ventasPts.map((p, i) => {
            const activo = hover?.serie === 'ventas' && hover.i === i
            return (
              <g key={`v${i}`}>
                <circle cx={p.x} cy={p.y} r={activo ? 5.5 : 4.5} fill={col.halo} style={{ transition: 'r 0.1s' }} />
                <circle cx={p.x} cy={p.y} r={activo ? 4 : 3} fill={col.ventas} style={{ transition: 'r 0.1s' }} />
                <circle
                  cx={p.x} cy={p.y} r="10" fill="transparent"
                  onMouseEnter={() => setHover({ serie: 'ventas', i })}
                  onMouseLeave={() => setHover(null)}
                  style={{ cursor: 'pointer' }}
                />
              </g>
            )
          })}
          {MESES_ES.map((nombre, i) => (
            <text
              key={nombre}
              x={STEP * i + STEP / 2}
              y={H + 23}
              fontFamily="Inter, system-ui, sans-serif"
              fontSize="12.5"
              letterSpacing="0.01em"
              textAnchor="middle"
              fill={tab === 'mensual' && i + 1 === mes ? col.lblOn : col.lbl}
              fontWeight={tab === 'mensual' && i + 1 === mes ? '700' : '500'}
            >
              {nombre.slice(0, 3)}
            </text>
          ))}
          {hover && (() => {
            const p = (hover.serie === 'compras' ? comprasPts : ventasPts)[hover.i]
            const valor = resumenAnual[hover.i] ? resumenAnual[hover.i][hover.serie].base : 0
            const tw = 118, th = 46
            const tx = Math.min(Math.max(p.x - tw / 2, 2), W - tw - 2)
            const ty = Math.max(p.y - th - 12, 2)
            return (
              <foreignObject x={tx} y={ty} width={tw} height={th} style={{ pointerEvents: 'none', overflow: 'visible' }}>
                <div
                  style={{
                    fontFamily: 'Inter, system-ui, sans-serif',
                    background: dark ? '#2a2d47' : '#1f2430',
                    color: '#fff',
                    borderRadius: 8,
                    padding: '6px 10px',
                    fontSize: 11.5,
                    lineHeight: 1.35,
                    boxShadow: '0 4px 12px rgba(0,0,0,0.28)',
                    textAlign: 'center',
                  }}
                >
                  <div style={{ opacity: 0.72, fontWeight: 600, textTransform: 'uppercase', fontSize: 9.5, letterSpacing: '0.03em' }}>
                    {MESES_ES[hover.i]} · {hover.serie === 'compras' ? 'Compras' : 'Ventas'}
                  </div>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>{fmt(valor)}</div>
                </div>
              </foreignObject>
            )
          })()}
        </svg>
      </div>
    </div>
  )
}

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

  // ── Resumen anual (para el gráfico de tendencia Compras vs. Ventas) ─────
  const [resumenAnual, setResumenAnual] = useState([])
  useEffect(() => {
    if (!empresaId) { setResumenAnual([]); return }
    api.getContabResumenAnual(empresaId, anio).then(setResumenAnual).catch(() => setResumenAnual([]))
  }, [empresaId, anio])

  // ── Consolidado ──────────────────────────────────────────────────────────
  const [data, setData] = useState(null)
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState('')
  const { addToast } = useToast()

  // No se limpia `data` antes de que llegue la respuesta nueva (ni en éxito ni en error) —
  // antes cada cambio de período desmontaba tarjetas/tablas para mostrar un spinner y las
  // volvía a montar al llegar la respuesta, lo que se sentía como un salto/temblor de la
  // página. El contenido anterior se queda visible (atenuado, ver `cargando` en el render)
  // hasta que el nuevo período reemplaza el mismo bloque en su lugar.
  useEffect(() => {
    if (!empresaId) { setData(null); return }
    let cancelado = false
    setCargando(true)
    setError('')
    const periodo = tab === 'mensual' ? { anio, mes } : tab === 'cuatrimestral' ? { anio, cuatrimestre } : { anio }
    api.getContabConsolidado(empresaId, periodo)
      .then((res) => {
        if (cancelado) return
        setData(res)
        // Toast flotante en vez de un bloque fijo arriba del gráfico — ese bloque empujaba la
        // gráfica hacia abajo cada vez que el período tenía meses sin datos. El toast avisa sin
        // mover el layout y se cierra solo.
        if (res.mesesFaltantes.length > 0) {
          addToast(
            `Incompleto — faltan ${res.mesesFaltantes.map((m) => MESES_ES[m - 1]).join(', ')}.`,
            'info',
            5000
          )
        }
      })
      .catch((err) => { if (!cancelado) setError(err.message || 'No se pudo cargar el consolidado') })
      .finally(() => { if (!cancelado) setCargando(false) })
    return () => { cancelado = true }
  }, [empresaId, tab, anio, mes, cuatrimestre, addToast])

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

      {/* ── Panel de controles: empresa a la izquierda, período a la derecha ──
          Antes "Empresa" llevaba una etiqueta encima (label + combobox, ~62px de alto) mientras
          los tabs/navegador no (~40px) — al centrar verticalmente la fila, uno quedaba más
          arriba que el otro y se veía desalineado. El combobox ya trae su propio ícono
          ("business") como contexto, así que la etiqueta sobraba. Con justify-between además se
          usa el ancho completo del panel en vez de dejar todo apretado a la izquierda con un
          vacío grande a la derecha. */}
      <div className="bg-white dark:bg-[#1e2030] rounded-2xl border border-[#e2e4ef] dark:border-[#2e3148] shadow-sm p-4 mb-6 flex flex-col sm:flex-row sm:items-center gap-4 sm:justify-between">
        <div className="w-full sm:w-96" role="group" aria-label="Empresa">
          <EmpresaCombobox empresas={empresas} value={empresaId} onChange={setEmpresaId} />
        </div>

        {empresaId && (
          <div className="flex flex-wrap items-center gap-3">
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
              <div className="flex items-center gap-0.5 border border-[#e2e4ef] dark:border-[#2e3148] bg-[#fafbff] dark:bg-[#181a2e] rounded-2xl px-1.5 py-1.5">
                <button onClick={() => cambiarMes(-1)} className="w-7 h-7 flex items-center justify-center rounded-full text-[#8890b5] hover:bg-white dark:hover:bg-[#252840] hover:text-[#004ac6] dark:hover:text-[#7ba8f0] hover:shadow-sm transition active:scale-90">
                  <span className="material-symbols-outlined text-[20px]">chevron_left</span>
                </button>
                <span className="text-sm font-semibold min-w-[130px] text-center text-[#191c1e] dark:text-[#e4e6f0]">{MESES_ES[mes - 1]} {anio}</span>
                <button onClick={() => cambiarMes(1)} className="w-7 h-7 flex items-center justify-center rounded-full text-[#8890b5] hover:bg-white dark:hover:bg-[#252840] hover:text-[#004ac6] dark:hover:text-[#7ba8f0] hover:shadow-sm transition active:scale-90">
                  <span className="material-symbols-outlined text-[20px]">chevron_right</span>
                </button>
              </div>
            )}
            {tab === 'cuatrimestral' && (
              <div className="flex items-center gap-0.5 border border-[#e2e4ef] dark:border-[#2e3148] bg-[#fafbff] dark:bg-[#181a2e] rounded-2xl px-1.5 py-1.5">
                <button onClick={() => cambiarCuatrimestre(-1)} className="w-7 h-7 flex items-center justify-center rounded-full text-[#8890b5] hover:bg-white dark:hover:bg-[#252840] hover:text-[#004ac6] dark:hover:text-[#7ba8f0] hover:shadow-sm transition active:scale-90">
                  <span className="material-symbols-outlined text-[20px]">chevron_left</span>
                </button>
                <span className="text-sm font-semibold min-w-[150px] text-center text-[#191c1e] dark:text-[#e4e6f0]">{CUATRIMESTRE_LABEL[cuatrimestre]} {anio}</span>
                <button onClick={() => cambiarCuatrimestre(1)} className="w-7 h-7 flex items-center justify-center rounded-full text-[#8890b5] hover:bg-white dark:hover:bg-[#252840] hover:text-[#004ac6] dark:hover:text-[#7ba8f0] hover:shadow-sm transition active:scale-90">
                  <span className="material-symbols-outlined text-[20px]">chevron_right</span>
                </button>
              </div>
            )}
            {tab === 'anual' && (
              <div className="flex items-center gap-0.5 border border-[#e2e4ef] dark:border-[#2e3148] bg-[#fafbff] dark:bg-[#181a2e] rounded-2xl px-1.5 py-1.5">
                <button onClick={() => setAnio((a) => a - 1)} className="w-7 h-7 flex items-center justify-center rounded-full text-[#8890b5] hover:bg-white dark:hover:bg-[#252840] hover:text-[#004ac6] dark:hover:text-[#7ba8f0] hover:shadow-sm transition active:scale-90">
                  <span className="material-symbols-outlined text-[20px]">chevron_left</span>
                </button>
                <span className="text-sm font-semibold min-w-[80px] text-center text-[#191c1e] dark:text-[#e4e6f0]">{anio}</span>
                <button onClick={() => setAnio((a) => a + 1)} className="w-7 h-7 flex items-center justify-center rounded-full text-[#8890b5] hover:bg-white dark:hover:bg-[#252840] hover:text-[#004ac6] dark:hover:text-[#7ba8f0] hover:shadow-sm transition active:scale-90">
                  <span className="material-symbols-outlined text-[20px]">chevron_right</span>
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
          {/* ── Estados de carga / error ─────────────────────────────── */}
          {/* Spinner grande solo en la carga inicial (sin `data` todavía) — un cambio de
              período con datos ya en pantalla no vuelve a mostrar esto, solo atenúa el
              bloque de abajo (ver `cargando` en el className siguiente). */}
          {cargando && !data && (
            <div className="text-center py-12">
              <svg className="animate-spin h-8 w-8 text-[#004ac6] mx-auto" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            </div>
          )}
          {error && (
            <div className="p-4 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-400 mb-6">
              {error}
            </div>
          )}

          {data && (
            <div className={`transition-opacity duration-150 ${cargando ? 'opacity-50' : 'opacity-100'}`}>
              {/* ── Tendencia + Totales, en la misma fila ── el gráfico ya no ocupa todo el
                  ancho de la página: comparte fila con el panel de totales (angosto, lista
                  vertical) para no perder la proporción y no dejar espacio muerto. ── */}
              <div className="flex flex-col lg:flex-row gap-5 mb-6 items-stretch">
                <TendenciaChart resumenAnual={resumenAnual} tab={tab} mes={mes} cuatrimestre={cuatrimestre} />
                <div className="bg-white dark:bg-[#1e2030] rounded-2xl border border-[#e2e4ef] dark:border-[#2e3148] shadow-sm overflow-hidden lg:w-72 flex-shrink-0">
                  <TotalGroupHeader label="Compras" color="#004ac6" />
                  <div className="divide-y divide-[#e2e4ef] dark:divide-[#2e3148] border-b border-[#e2e4ef] dark:border-[#2e3148]">
                    <TotalRow icon="payments" label="Base (sin IVA)" value={fmt(data.totales.compras.base)} grande />
                    <TotalRow icon="receipt_long" label="# Facturas" value={data.totales.compras.cantidad} />
                    <TotalRow icon="percent" label="IVA descontable" value={fmt(data.totales.compras.iva)} />
                  </div>
                  <TotalGroupHeader label="Ventas" color="#d97706" />
                  <div className="divide-y divide-[#e2e4ef] dark:divide-[#2e3148]">
                    <TotalRow icon="trending_up" label="Base (sin IVA)" value={fmt(data.totales.ventas.base)} grande />
                    <TotalRow icon="sell" label="IVA generado" value={fmt(data.totales.ventas.iva)} />
                    <TotalRow icon="local_mall" label="INC generado" value={fmt(data.totales.ventas.inc)} />
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
                        <tfoot>
                          <tr className="border-t border-[#e2e4ef] dark:border-[#2e3148] font-bold text-[#191c1e] dark:text-[#e4e6f0]">
                            <td className="pt-2">Total</td>
                            <td className="pt-2 text-right tabular-nums">{grupos.reduce((s, g) => s + g.cantidad, 0)}</td>
                            <td className="pt-2 text-right tabular-nums">{fmt(grupos.reduce((s, g) => s + g.base, 0))}</td>
                            <td className="pt-2 text-right tabular-nums">{fmt(grupos.reduce((s, g) => s + g.iva, 0))}</td>
                          </tr>
                        </tfoot>
                      </table>
                    )}
                  </div>
                ))}
              </div>

              {/* ── Exportar ───────────────────────────────────────────── */}
              {/* Verde (es la acción de "generar Excel", tiene sentido acá) — plano, sin
                  degradado ni ícono-en-insignia. El hover ya no es un fundido a opacidad
                  genérico: con `brightness` el propio verde se aclara un punto, un
                  microinteracción más "diseñada" sin salirse de un botón plano y simple. */}
              <div className="flex items-center gap-3 mb-6">
                <button
                  onClick={handleExportar}
                  disabled={exportando || data.documentos.length === 0}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white transition active:scale-[0.97] disabled:opacity-40 disabled:cursor-not-allowed hover:brightness-110 shadow-sm shadow-green-900/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-[#1e2030] focus-visible:ring-green-600"
                  style={{ background: '#15803d' }}
                >
                  <span className={`material-symbols-outlined text-lg ${exportando ? 'animate-spin' : ''}`}>
                    {exportando ? 'progress_activity' : 'download'}
                  </span>
                  {exportando ? 'Generando…' : `Exportar ${tab === 'mensual' ? 'mes' : tab === 'cuatrimestral' ? 'cuatrimestre' : 'año'}`}
                </button>
                {data.mesesFaltantes.length > 0 && (
                  <span className="text-xs text-[#6b7280] dark:text-[#8890b5]">
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
