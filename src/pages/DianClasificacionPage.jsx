import { useState, useRef, useCallback, useMemo } from 'react'
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

// ── fila de la tabla ───────────────────────────────────────────────────────────
function FilaClasificacion({ fila, borradorId, valorActual, onClasificado, isEven }) {
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
                  <th className="px-4 py-3 text-left text-xs font-semibold text-[#8890b5] uppercase tracking-wide">Fecha</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-[#8890b5] uppercase tracking-wide">Emisor</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-[#8890b5] uppercase tracking-wide">Total</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-[#8890b5] uppercase tracking-wide">Clasificación</th>
                </tr>
              </thead>
              <tbody>
                {filasRecibido.map((fila, i) => (
                  <FilaClasificacion
                    key={fila.indice}
                    fila={fila}
                    borradorId={borradorId}
                    valorActual={clasificaciones[fila.indice]}
                    onClasificado={handleClasificado}
                    isEven={i % 2 === 1}
                  />
                ))}
              </tbody>
            </table>
          </div>

          {/* ── pie ──────────────────────────────────────────────────────── */}
          <div className="mt-6 flex justify-end">
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
        </>
      )}
    </div>
  )
}
