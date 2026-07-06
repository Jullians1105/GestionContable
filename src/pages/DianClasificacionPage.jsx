import { useState, useRef, useCallback, useMemo, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useLocation, useNavigate } from 'react-router-dom'
import { api } from '../services/api'

// ── opciones de clasificación (incluyendo N/A) ─────────────────────────────────
const OPCIONES = [
  { label: 'N/A (No aplica)',      clasificacion: 'N/A',           tasa: null  },
  { label: 'Compras 0,10%',       clasificacion: 'Compras',        tasa: 0.10 },
  { label: 'Compras 1,50%',       clasificacion: 'Compras',        tasa: 1.50 },
  { label: 'Compras 2,50%',       clasificacion: 'Compras',        tasa: 2.50 },
  { label: 'Compras 3,50%',       clasificacion: 'Compras',        tasa: 3.50 },
  { label: 'Servicios 1%',        clasificacion: 'Servicios',      tasa: 1.00 },
  { label: 'Servicios 2%',        clasificacion: 'Servicios',      tasa: 2.00 },
  { label: 'Servicios 3,50%',     clasificacion: 'Servicios',      tasa: 3.50 },
  { label: 'Servicios 4%',        clasificacion: 'Servicios',      tasa: 4.00 },
  { label: 'Arrendamiento 3,50%', clasificacion: 'Arrendamiento',  tasa: 3.50 },
  { label: 'Arrendamiento 4%',    clasificacion: 'Arrendamiento',  tasa: 4.00 },
  { label: 'Honorarios 11%',      clasificacion: 'Honorarios',     tasa: 11.00 },
]

// ── helpers ────────────────────────────────────────────────────────────────────
const formatFecha = (iso) => {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

const formatCOP = (n) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n ?? 0)

const truncate = (s, n) =>
  s && s.length > n ? s.slice(0, n) + '…' : (s || '—')

// ── indicador de autoguardado ──────────────────────────────────────────────────
function SaveIndicator({ estado }) {
  if (!estado) return null
  if (estado === 'saving') return (
    <span className="text-[11px] text-amber-500 font-medium ml-1.5 animate-pulse">guardando…</span>
  )
  if (estado === 'saved') return (
    <span className="text-[11px] text-green-600 font-semibold ml-1.5">✓</span>
  )
  return null
}

// ── menú de filtro por columna (checklist estilo Excel) ─────────────────────────
// Se renderiza en un portal a document.body y se posiciona con `fixed` según el
// rect del botón que lo abrió, para no quedar recortado por el overflow-hidden
// de la tarjeta de la tabla.
function ColumnFilterMenu({ rect, valores, seleccion, onAplicar, onCerrar, align = 'left' }) {
  const [busqueda, setBusqueda] = useState('')
  const [borrador, setBorrador] = useState(() => new Set(seleccion ?? valores.map((v) => v.value)))
  const ref = useRef(null)

  useEffect(() => {
    const onClickFuera = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onCerrar()
    }
    document.addEventListener('mousedown', onClickFuera)
    return () => document.removeEventListener('mousedown', onClickFuera)
  }, [onCerrar])

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    return q ? valores.filter((v) => v.label.toLowerCase().includes(q)) : valores
  }, [valores, busqueda])

  const todasVisiblesMarcadas = visibles.length > 0 && visibles.every((v) => borrador.has(v.value))

  const toggleTodasVisibles = () => {
    setBorrador((prev) => {
      const next = new Set(prev)
      const marcarTodas = !visibles.every((v) => next.has(v.value))
      for (const v of visibles) {
        if (marcarTodas) next.add(v.value)
        else next.delete(v.value)
      }
      return next
    })
  }

  const toggleValor = (value) => {
    setBorrador((prev) => {
      const next = new Set(prev)
      if (next.has(value)) next.delete(value)
      else next.add(value)
      return next
    })
  }

  const style = {
    position: 'fixed',
    top: rect.bottom + 4,
    ...(align === 'right' ? { right: window.innerWidth - rect.right } : { left: rect.left }),
  }

  return createPortal(
    <div
      ref={ref}
      style={style}
      className="w-64 normal-case font-normal tracking-normal bg-white dark:bg-[#1e2030] border border-[#d1d5db] dark:border-[#3a3e5c] rounded-xl shadow-lg p-3 z-50"
    >
      <div className="relative mb-2">
        <span className="material-symbols-outlined text-base text-[#8890b5] absolute left-2 top-1/2 -translate-y-1/2">search</span>
        <input
          type="text"
          autoFocus
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar…"
          className="w-full text-sm border border-[#d1d5db] dark:border-[#3a3e5c] rounded-lg pl-8 pr-2 py-1.5 bg-white dark:bg-[#181a2e] text-[#191c1e] dark:text-[#e4e6f0] focus:outline-none focus:ring-2 focus:ring-[#004ac6] focus:border-transparent"
        />
      </div>

      <label className="flex items-center gap-2 px-1 py-1.5 border-b border-[#f0f2f8] dark:border-[#2e3148] mb-1 cursor-pointer">
        <input
          type="checkbox"
          checked={todasVisiblesMarcadas}
          onChange={toggleTodasVisibles}
          className="w-4 h-4 rounded border-[#d1d5db] dark:border-[#3a3e5c] text-[#004ac6] focus:ring-[#004ac6] cursor-pointer"
        />
        <span className="text-sm font-medium text-[#191c1e] dark:text-[#e4e6f0]">(Seleccionar todo)</span>
      </label>

      <div className="max-h-48 overflow-y-auto flex flex-col gap-0.5">
        {visibles.length === 0 ? (
          <p className="text-xs text-[#8890b5] px-1 py-2">Sin resultados</p>
        ) : visibles.map((v) => (
          <label
            key={v.value}
            className="flex items-center gap-2 px-1 py-1 rounded hover:bg-[#f8f9ff] dark:hover:bg-[#252840] cursor-pointer"
          >
            <input
              type="checkbox"
              checked={borrador.has(v.value)}
              onChange={() => toggleValor(v.value)}
              className="w-4 h-4 rounded border-[#d1d5db] dark:border-[#3a3e5c] text-[#004ac6] focus:ring-[#004ac6] cursor-pointer flex-shrink-0"
            />
            <span className="text-sm text-[#191c1e] dark:text-[#e4e6f0] truncate" title={v.label}>{v.label}</span>
          </label>
        ))}
      </div>

      <div className="flex items-center justify-end gap-2 mt-3 pt-2 border-t border-[#f0f2f8] dark:border-[#2e3148]">
        <button
          onClick={onCerrar}
          className="px-3 py-1.5 rounded-lg text-xs font-semibold text-[#6b7280] dark:text-[#8890b5] hover:bg-[#f0f2f8] dark:hover:bg-[#252840]"
        >
          Cancelar
        </button>
        <button
          onClick={() => onAplicar(borrador.size === valores.length ? null : new Set(borrador))}
          className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white"
          style={{ background: '#004ac6' }}
        >
          Aceptar
        </button>
      </div>
    </div>,
    document.body
  )
}

// ── fila de la tabla ───────────────────────────────────────────────────────────
function FilaClasificacion({ fila, borradorId, valorActual, onClasificado, isEven, seleccionada, onToggleSeleccion }) {
  const [guardadoEstado, setGuardadoEstado] = useState(
    fila.clasificacionRetencion ? 'saved' : null
  )
  const [error, setError] = useState(null)
  const timerRef = useRef(null)

  const handleChange = useCallback((e) => {
    const opcionLabel = e.target.value
    const opcion = OPCIONES.find((o) => o.label === opcionLabel) ?? null

    onClasificado(fila.indice, opcion)
    setError(null)

    if (!opcion) {
      setGuardadoEstado(null)
      if (timerRef.current) clearTimeout(timerRef.current)
      return
    }

    setGuardadoEstado('saving')
    if (timerRef.current) clearTimeout(timerRef.current)

    timerRef.current = setTimeout(async () => {
      try {
        await api.patchDianBorrador(borradorId, {
          indice:                 fila.indice,
          clasificacionRetencion: opcion.clasificacion,
          tasaRetencion:          opcion.tasa,
        })
        setGuardadoEstado('saved')
        setTimeout(() => setGuardadoEstado(null), 2000)
      } catch (err) {
        setGuardadoEstado(null)
        setError(err.message || 'Error al guardar. Intenta de nuevo.')
      }
    }, 1500)
  }, [fila.indice, borradorId, onClasificado])

  const handleRetry = () => {
    if (!valorActual) return
    setError(null)
    handleChange({ target: { value: valorActual.label } })
  }

  const labelActual = valorActual?.label ?? ''
  const rowBg = isEven ? 'bg-[#fafbff] dark:bg-[#191b2e]' : ''

  return (
    <tr className={`border-t border-[#f0f2f8] dark:border-[#2e3148] hover:bg-[#f8f9ff] dark:hover:bg-[#1e2135] transition-colors ${rowBg}`}>
      <td className="px-4 py-3 w-10">
        <input
          type="checkbox"
          checked={seleccionada}
          onChange={() => onToggleSeleccion(fila.indice)}
          className="w-4 h-4 rounded border-[#d1d5db] dark:border-[#3a3e5c] text-[#004ac6] focus:ring-[#004ac6] cursor-pointer"
        />
      </td>
      <td className="px-4 py-3 text-sm text-[#6b7280] dark:text-[#8890b5] whitespace-nowrap">
        {formatFecha(fila.fechaEmision)}
      </td>
      <td className="px-4 py-3">
        <span className="text-sm text-[#191c1e] dark:text-[#e4e6f0]" title={fila.nombreEmisor ?? ''}>
          {truncate(fila.nombreEmisor, 40)}
        </span>
        <div className="text-[11px] text-[#8890b5] mt-0.5">{fila.nitEmisor}</div>
      </td>
      <td className="px-4 py-3 text-sm font-semibold text-[#191c1e] dark:text-[#e4e6f0] text-right tabular-nums whitespace-nowrap">
        {formatCOP(fila.total)}
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-0">
          <select
            value={labelActual}
            onChange={handleChange}
            className="text-sm border border-[#d1d5db] dark:border-[#3a3e5c] rounded-lg px-2.5 py-1.5 bg-white dark:bg-[#1e2030] text-[#191c1e] dark:text-[#e4e6f0] focus:outline-none focus:ring-2 focus:ring-[#004ac6] focus:border-transparent cursor-pointer min-w-[200px]"
          >
            <option value="">— Seleccionar —</option>
            {OPCIONES.map((o) => (
              <option key={o.label} value={o.label}>{o.label}</option>
            ))}
          </select>
          <SaveIndicator estado={guardadoEstado} />
        </div>
        {error && (
          <div className="mt-1 flex items-center gap-2">
            <span className="text-[11px] text-red-500">{error}</span>
            <button
              onClick={handleRetry}
              className="text-[11px] text-[#004ac6] underline hover:no-underline"
            >
              Reintentar
            </button>
          </div>
        )}
      </td>
    </tr>
  )
}

// ── página principal ───────────────────────────────────────────────────────────
export default function DianClasificacionPage() {
  const location  = useLocation()
  const navigate  = useNavigate()
  const state     = location.state ?? {}
  const { borradorId, filasParaClasificar = [] } = state

  // Solo filas Recibido no-nómina
  const filasRecibido = useMemo(() =>
    filasParaClasificar.filter(
      (f) => f.grupo === 'Recibido' && f.tipoDocumento !== 'Nomina Individual'
    ),
    [filasParaClasificar]
  )

  // ── filtros estilo Excel (checklist de valores por columna) ─────────────────
  // null = sin filtro (se muestran todas); Set = solo se muestran los valores marcados
  const [filtroFecha,  setFiltroFecha]  = useState(null)
  const [filtroEmisor, setFiltroEmisor] = useState(null)
  const [filtroTotal,  setFiltroTotal]  = useState(null)

  // { columna: 'fecha' | 'emisor' | 'total', rect: DOMRect } | null
  const [filtroPopover, setFiltroPopover] = useState(null)
  const btnFechaRef  = useRef(null)
  const btnEmisorRef = useRef(null)
  const btnTotalRef  = useRef(null)

  const abrirFiltro = useCallback((columna, btnRef) => {
    setFiltroPopover((prev) => {
      if (prev?.columna === columna) return null
      return { columna, rect: btnRef.current.getBoundingClientRect() }
    })
  }, [])

  const cerrarFiltro = useCallback(() => setFiltroPopover(null), [])

  // Reposicionar el menú (en vez de cerrarlo) si el usuario hace scroll o
  // redimensiona la ventana mientras está abierto, para que siga el ícono.
  useEffect(() => {
    const columna = filtroPopover?.columna
    if (!columna) return
    const refsPorColumna = { fecha: btnFechaRef, emisor: btnEmisorRef, total: btnTotalRef }
    const actualizarPosicion = () => {
      const btnRef = refsPorColumna[columna]
      if (!btnRef?.current) return
      setFiltroPopover((prev) => (prev ? { ...prev, rect: btnRef.current.getBoundingClientRect() } : prev))
    }
    window.addEventListener('scroll', actualizarPosicion, true)
    window.addEventListener('resize', actualizarPosicion)
    return () => {
      window.removeEventListener('scroll', actualizarPosicion, true)
      window.removeEventListener('resize', actualizarPosicion)
    }
  }, [filtroPopover?.columna])

  const hayFiltrosActivos = filtroFecha !== null || filtroEmisor !== null || filtroTotal !== null

  const claseIconoFiltro = (activo) =>
    `material-symbols-outlined text-[15px] rounded-full p-1 leading-none transition-colors ${
      activo
        ? 'bg-[#004ac6] text-white shadow-sm'
        : 'bg-[#e2e4ef] dark:bg-[#2e3148] text-[#5b6178] dark:text-[#9aa0c3] hover:bg-[#c7d4f7] dark:hover:bg-[#333a5c] hover:text-[#004ac6] dark:hover:text-[#7ba8f0]'
    }`

  const limpiarFiltros = useCallback(() => {
    setFiltroFecha(null)
    setFiltroEmisor(null)
    setFiltroTotal(null)
  }, [])

  const valoresFecha = useMemo(() => {
    const unicos = Array.from(new Set(filasRecibido.map((f) => f.fechaEmision).filter(Boolean))).sort()
    return unicos.map((iso) => ({ value: iso, label: formatFecha(iso) }))
  }, [filasRecibido])

  const valoresEmisor = useMemo(() => {
    const unicos = Array.from(new Set(filasRecibido.map((f) => f.nombreEmisor).filter(Boolean)))
      .sort((a, b) => a.localeCompare(b, 'es'))
    return unicos.map((n) => ({ value: n, label: n }))
  }, [filasRecibido])

  const valoresTotal = useMemo(() => {
    const unicos = Array.from(new Set(filasRecibido.map((f) => f.total).filter((t) => t != null))).sort((a, b) => a - b)
    return unicos.map((t) => ({ value: t, label: formatCOP(t) }))
  }, [filasRecibido])

  const filasFiltradas = useMemo(() =>
    filasRecibido.filter((f) => {
      if (filtroFecha  !== null && !filtroFecha.has(f.fechaEmision)) return false
      if (filtroEmisor !== null && !filtroEmisor.has(f.nombreEmisor)) return false
      if (filtroTotal  !== null && !filtroTotal.has(f.total)) return false
      return true
    }),
    [filasRecibido, filtroFecha, filtroEmisor, filtroTotal]
  )

  // Estado local: indice → opcion | null
  const [clasificaciones, setClasificaciones] = useState(() =>
    Object.fromEntries(
      filasRecibido.map((f) => {
        if (f.clasificacionRetencion) {
          const opcion = OPCIONES.find(
            (o) => o.clasificacion === f.clasificacionRetencion && o.tasa === (f.tasaRetencion ?? null)
          ) ?? null
          return [f.indice, opcion]
        }
        return [f.indice, null]
      })
    )
  )

  // ── clasificación rápida ───────────────────────────────────────────────────
  const [clasificacionRapida, setClasificacionRapida] = useState('')
  const [cargandoRapida,      setCargandoRapida]      = useState(false)
  const [toastRapido,         setToastRapido]         = useState(null) // { tipo:'exito'|'error', msg }
  const toastTimerRef = useRef(null)

  const mostrarToast = useCallback((tipo, msg) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    setToastRapido({ tipo, msg })
    toastTimerRef.current = setTimeout(() => setToastRapido(null), tipo === 'exito' ? 3000 : 5000)
  }, [])

  const handleAplicarRapida = useCallback(async () => {
    const opcion = OPCIONES.find((o) => o.label === clasificacionRapida)
    if (!opcion) return
    setCargandoRapida(true)
    setToastRapido(null)
    try {
      const { filasActualizadas } = await api.patchDianClasificacionRapida(borradorId, {
        clasificacionRetencion: opcion.clasificacion,
        tasaRetencion:          opcion.tasa,
      })
      // Actualizar estado local: todas las filas null pasan al nuevo valor
      setClasificaciones((prev) => {
        const next = { ...prev }
        for (const [indice, val] of Object.entries(next)) {
          if (val == null) next[indice] = opcion
        }
        return next
      })
      if (filasActualizadas > 0) {
        mostrarToast('exito', `${filasActualizadas} ${filasActualizadas === 1 ? 'fila clasificada' : 'filas clasificadas'}`)
      } else {
        mostrarToast('exito', 'No había filas sin clasificar')
      }
    } catch (err) {
      mostrarToast('error', err.message || 'Error al aplicar clasificación')
    } finally {
      setCargandoRapida(false)
    }
  }, [clasificacionRapida, borradorId, mostrarToast])

  const handleClasificado = useCallback((indice, opcion) => {
    setClasificaciones((prev) => ({ ...prev, [indice]: opcion }))
  }, [])

  // Contadores
  const sinClasificarCount = filasRecibido.filter((f) => clasificaciones[f.indice] == null).length
  const clasificadasCount  = filasRecibido.length - sinClasificarCount
  const todasClasificadas  = filasRecibido.length > 0 && sinClasificarCount === 0

  // ── selección múltiple ───────────────────────────────────────────────────
  const [seleccionadas, setSeleccionadas] = useState(() => new Set())
  const [clasificacionSeleccion, setClasificacionSeleccion] = useState('')
  const [aplicandoSeleccion, setAplicandoSeleccion] = useState(false)

  const toggleSeleccion = useCallback((indice) => {
    setSeleccionadas((prev) => {
      const next = new Set(prev)
      if (next.has(indice)) next.delete(indice)
      else next.add(indice)
      return next
    })
  }, [])

  const todasVisiblesSeleccionadas =
    filasFiltradas.length > 0 && filasFiltradas.every((f) => seleccionadas.has(f.indice))

  const toggleSeleccionarTodasVisibles = useCallback(() => {
    setSeleccionadas((prev) => {
      const next = new Set(prev)
      const marcarTodas = !(filasFiltradas.length > 0 && filasFiltradas.every((f) => next.has(f.indice)))
      for (const f of filasFiltradas) {
        if (marcarTodas) next.add(f.indice)
        else next.delete(f.indice)
      }
      return next
    })
  }, [filasFiltradas])

  const handleAplicarSeleccion = useCallback(async () => {
    const opcion = OPCIONES.find((o) => o.label === clasificacionSeleccion)
    if (!opcion || seleccionadas.size === 0) return
    const indices = Array.from(seleccionadas)
    setAplicandoSeleccion(true)
    setToastRapido(null)
    try {
      await Promise.all(
        indices.map((indice) =>
          api.patchDianBorrador(borradorId, {
            indice,
            clasificacionRetencion: opcion.clasificacion,
            tasaRetencion:          opcion.tasa,
          })
        )
      )
      setClasificaciones((prev) => {
        const next = { ...prev }
        for (const indice of indices) next[indice] = opcion
        return next
      })
      setSeleccionadas(new Set())
      setClasificacionSeleccion('')
      mostrarToast('exito', `${indices.length} ${indices.length === 1 ? 'fila clasificada' : 'filas clasificadas'}`)
    } catch (err) {
      mostrarToast('error', err.message || 'Error al aplicar clasificación a la selección')
    } finally {
      setAplicandoSeleccion(false)
    }
  }, [clasificacionSeleccion, seleccionadas, borradorId, mostrarToast])

  // ── botón flotante: ir hacia abajo ───────────────────────────────────────
  const pieRef = useRef(null)
  const [mostrarBajar, setMostrarBajar] = useState(false)

  useEffect(() => {
    const onScroll = () => {
      const distanciaAlFinal =
        document.documentElement.scrollHeight - window.scrollY - window.innerHeight
      setMostrarBajar(distanciaAlFinal > 200)
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [])

  const irAlFinal = useCallback(() => {
    pieRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [])

  if (!borradorId) {
    return (
      <div className="max-w-lg mx-auto mt-20 text-center">
        <span className="material-symbols-outlined text-5xl text-[#d1d5db] dark:text-[#3a3e5c]">error_outline</span>
        <p className="mt-4 text-[#6b7280]">No hay datos de borrador. Sube primero un reporte DIAN.</p>
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto">
      {/* ── encabezado ─────────────────────────────────────────────────────── */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[#191c1e] dark:text-[#e4e6f0]">
          Clasificación de retención
        </h1>
        <p className="mt-1 text-sm text-[#6b7280] dark:text-[#8890b5]">
          Selecciona el tipo de retención para cada compra recibida.
        </p>
      </div>

      {filasRecibido.length === 0 ? (
        /* ── estado vacío ──────────────────────────────────────────────────── */
        <div className="bg-white dark:bg-[#1e2030] rounded-2xl border border-[#e2e4ef] dark:border-[#2e3148] p-12 text-center shadow-sm">
          <span className="material-symbols-outlined text-5xl text-[#d1d5db] dark:text-[#3a3e5c]">check_circle</span>
          <p className="mt-4 text-[#6b7280] dark:text-[#8890b5]">
            No hay compras que clasificar en este reporte.
          </p>
          <button
            onClick={() => navigate('/dian/nomina', { state })}
            className="mt-6 px-5 py-2.5 rounded-xl text-sm font-semibold text-white hover:opacity-90 transition active:scale-[0.97]"
            style={{ background: '#004ac6' }}
          >
            Ir a nómina
          </button>
        </div>
      ) : (
        <>
          {/* ── clasificación rápida ─────────────────────────────────────── */}
          <div className="bg-white dark:bg-[#1e2030] rounded-2xl border border-[#e2e4ef] dark:border-[#2e3148] shadow-sm p-5 mb-5">
            <h2 className="text-xs font-bold text-[#8890b5] dark:text-[#6b7280] uppercase tracking-wide mb-3">
              Clasificación rápida
            </h2>

            <div className="flex items-center gap-3 flex-wrap">
              {/* Dropdown */}
              <select
                value={clasificacionRapida}
                onChange={(e) => setClasificacionRapida(e.target.value)}
                disabled={cargandoRapida || todasClasificadas}
                className="text-sm border border-[#d1d5db] dark:border-[#3a3e5c] rounded-lg px-3 py-2 bg-white dark:bg-[#181a2e] text-[#191c1e] dark:text-[#e4e6f0] focus:outline-none focus:ring-2 focus:ring-[#004ac6] focus:border-transparent cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed min-w-[220px]"
              >
                <option value="">— Seleccionar —</option>
                {OPCIONES.map((o) => (
                  <option key={o.label} value={o.label}>{o.label}</option>
                ))}
              </select>

              {/* Botón Aplicar */}
              <button
                onClick={handleAplicarRapida}
                disabled={!clasificacionRapida || cargandoRapida || todasClasificadas}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white transition active:scale-[0.97] disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ background: '#004ac6' }}
              >
                {cargandoRapida ? (
                  <>
                    <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    <span>Aplicando…</span>
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined text-base">bolt</span>
                    <span>Aplicar</span>
                  </>
                )}
              </button>

              {/* Contador */}
              <span className={`text-sm font-medium ml-1 ${sinClasificarCount === 0 ? 'text-green-600 dark:text-green-400' : 'text-[#6b7280] dark:text-[#8890b5]'}`}>
                {sinClasificarCount === 0
                  ? '✓ Todas las filas están clasificadas'
                  : `${sinClasificarCount} ${sinClasificarCount === 1 ? 'fila sin asignar' : 'filas sin asignar'}`
                }
              </span>
            </div>

            {/* Toast */}
            {toastRapido && (
              <div className={`mt-3 flex items-center gap-2.5 px-4 py-2.5 rounded-xl text-sm font-medium
                ${toastRapido.tipo === 'exito'
                  ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-700'
                  : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-700'
                }`}
              >
                <span className="material-symbols-outlined text-base flex-shrink-0">
                  {toastRapido.tipo === 'exito' ? 'check_circle' : 'error'}
                </span>
                {toastRapido.tipo === 'exito' ? '✓ ' : ''}{toastRapido.msg}
              </div>
            )}
          </div>

          {/* ── resumen de filtros activos ───────────────────────────────── */}
          {hayFiltrosActivos && (
            <div className="flex items-center justify-between mb-4 px-1">
              <p className="text-xs text-[#8890b5]">
                Mostrando <span className="font-semibold text-[#191c1e] dark:text-[#e4e6f0]">{filasFiltradas.length}</span> de {filasRecibido.length} compras (filtros activos)
              </p>
              <button
                onClick={limpiarFiltros}
                className="text-xs font-medium text-[#004ac6] dark:text-[#7ba8f0] hover:underline"
              >
                Limpiar filtros
              </button>
            </div>
          )}

          {/* ── barra de selección múltiple ──────────────────────────────── */}
          {seleccionadas.size > 0 && (
            <div className="bg-[#eef3ff] dark:bg-[#1a2540] border border-[#c7d9ff] dark:border-[#2e4470] rounded-2xl shadow-sm p-4 mb-5 flex items-center gap-3 flex-wrap">
              <span className="text-sm font-semibold text-[#004ac6] dark:text-[#7ba8f0]">
                {seleccionadas.size} {seleccionadas.size === 1 ? 'fila seleccionada' : 'filas seleccionadas'}
              </span>

              <select
                value={clasificacionSeleccion}
                onChange={(e) => setClasificacionSeleccion(e.target.value)}
                disabled={aplicandoSeleccion}
                className="text-sm border border-[#d1d5db] dark:border-[#3a3e5c] rounded-lg px-3 py-2 bg-white dark:bg-[#181a2e] text-[#191c1e] dark:text-[#e4e6f0] focus:outline-none focus:ring-2 focus:ring-[#004ac6] focus:border-transparent cursor-pointer disabled:opacity-50 min-w-[220px]"
              >
                <option value="">— Seleccionar clasificación —</option>
                {OPCIONES.map((o) => (
                  <option key={o.label} value={o.label}>{o.label}</option>
                ))}
              </select>

              <button
                onClick={handleAplicarSeleccion}
                disabled={!clasificacionSeleccion || aplicandoSeleccion}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white transition active:scale-[0.97] disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ background: '#004ac6' }}
              >
                {aplicandoSeleccion ? 'Aplicando…' : 'Aplicar a la selección'}
              </button>

              <button
                onClick={() => setSeleccionadas(new Set())}
                disabled={aplicandoSeleccion}
                className="text-sm font-medium text-[#6b7280] dark:text-[#8890b5] hover:text-[#191c1e] dark:hover:text-[#e4e6f0] disabled:opacity-40"
              >
                Deseleccionar todo
              </button>
            </div>
          )}

          {/* ── progreso ─────────────────────────────────────────────────── */}
          <div className="mb-4 flex items-center justify-between">
            <span className="text-sm text-[#6b7280] dark:text-[#8890b5]">
              <span className="font-semibold text-[#191c1e] dark:text-[#e4e6f0]">{clasificadasCount}</span>
              {' '}de{' '}
              <span className="font-semibold text-[#191c1e] dark:text-[#e4e6f0]">{filasRecibido.length}</span>
              {' '}compras clasificadas
            </span>
            <div className="w-48 h-1.5 rounded-full bg-[#e5e7eb] dark:bg-[#2e3148] overflow-hidden">
              <div
                className="h-full rounded-full bg-[#004ac6] transition-all duration-300"
                style={{ width: `${filasRecibido.length ? (clasificadasCount / filasRecibido.length) * 100 : 0}%` }}
              />
            </div>
          </div>

          {/* ── tabla ────────────────────────────────────────────────────── */}
          <div className="bg-white dark:bg-[#1e2030] rounded-2xl border border-[#e2e4ef] dark:border-[#2e3148] shadow-sm overflow-hidden">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-[#f8f9ff] dark:bg-[#181a2e] border-b border-[#e2e4ef] dark:border-[#2e3148]">
                  <th className="px-4 py-3 w-10">
                    <input
                      type="checkbox"
                      checked={todasVisiblesSeleccionadas}
                      onChange={toggleSeleccionarTodasVisibles}
                      className="w-4 h-4 rounded border-[#d1d5db] dark:border-[#3a3e5c] text-[#004ac6] focus:ring-[#004ac6] cursor-pointer"
                    />
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-[#8890b5] uppercase tracking-wide">
                    <div className="flex items-center gap-1">
                      <span>Fecha</span>
                      <button
                        ref={btnFechaRef}
                        onClick={() => abrirFiltro('fecha', btnFechaRef)}
                        className={claseIconoFiltro(filtroFecha !== null)}
                        title="Filtrar por fecha"
                      >
                        filter_alt
                      </button>
                    </div>
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-[#8890b5] uppercase tracking-wide">
                    <div className="flex items-center gap-1">
                      <span>Emisor</span>
                      <button
                        ref={btnEmisorRef}
                        onClick={() => abrirFiltro('emisor', btnEmisorRef)}
                        className={claseIconoFiltro(filtroEmisor !== null)}
                        title="Filtrar por emisor"
                      >
                        filter_alt
                      </button>
                    </div>
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-[#8890b5] uppercase tracking-wide">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        ref={btnTotalRef}
                        onClick={() => abrirFiltro('total', btnTotalRef)}
                        className={claseIconoFiltro(filtroTotal !== null)}
                        title="Filtrar por total"
                      >
                        filter_alt
                      </button>
                      <span>Total</span>
                    </div>
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-[#8890b5] uppercase tracking-wide">Clasificación</th>
                </tr>
              </thead>
              <tbody>
                {filasFiltradas.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-sm text-[#8890b5]">
                      Ningún resultado coincide con los filtros.
                    </td>
                  </tr>
                ) : filasFiltradas.map((fila, i) => (
                  <FilaClasificacion
                    key={fila.indice}
                    fila={fila}
                    borradorId={borradorId}
                    valorActual={clasificaciones[fila.indice]}
                    onClasificado={handleClasificado}
                    isEven={i % 2 === 1}
                    seleccionada={seleccionadas.has(fila.indice)}
                    onToggleSeleccion={toggleSeleccion}
                  />
                ))}
              </tbody>
            </table>
          </div>

          {/* ── menús de filtro (portal, posicionados sobre el ícono que los abrió) ── */}
          {filtroPopover?.columna === 'fecha' && (
            <ColumnFilterMenu
              rect={filtroPopover.rect}
              valores={valoresFecha}
              seleccion={filtroFecha}
              onAplicar={(s) => { setFiltroFecha(s); cerrarFiltro() }}
              onCerrar={cerrarFiltro}
            />
          )}
          {filtroPopover?.columna === 'emisor' && (
            <ColumnFilterMenu
              rect={filtroPopover.rect}
              valores={valoresEmisor}
              seleccion={filtroEmisor}
              onAplicar={(s) => { setFiltroEmisor(s); cerrarFiltro() }}
              onCerrar={cerrarFiltro}
            />
          )}
          {filtroPopover?.columna === 'total' && (
            <ColumnFilterMenu
              rect={filtroPopover.rect}
              valores={valoresTotal}
              seleccion={filtroTotal}
              onAplicar={(s) => { setFiltroTotal(s); cerrarFiltro() }}
              onCerrar={cerrarFiltro}
              align="right"
            />
          )}

          {/* ── pie ──────────────────────────────────────────────────────── */}
          <div ref={pieRef} className="mt-6 flex justify-end">
            <button
              disabled={!todasClasificadas}
              onClick={() => navigate('/dian/nomina', { state: { ...state, clasificaciones } })}
              className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold text-white transition active:scale-[0.97] disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ background: '#004ac6' }}
              title={!todasClasificadas ? 'Clasifica todas las compras antes de continuar' : ''}
            >
              Continuar a nómina
              <span className="material-symbols-outlined text-base">arrow_forward</span>
            </button>
          </div>

          {/* ── botón flotante: ir hacia abajo ───────────────────────────── */}
          <button
            onClick={irAlFinal}
            aria-label="Ir al final"
            title="Ir al final"
            className={`fixed bottom-6 right-6 z-20 w-12 h-12 rounded-full shadow-lg flex items-center justify-center text-white transition-opacity duration-200 active:scale-[0.95] ${
              mostrarBajar ? 'opacity-100' : 'opacity-0 pointer-events-none'
            }`}
            style={{ background: '#004ac6' }}
          >
            <span className="material-symbols-outlined">arrow_downward</span>
          </button>
        </>
      )}
    </div>
  )
}
