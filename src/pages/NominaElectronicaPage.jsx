import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { ESTADOS_VISUAL, resolveEstadoVisual, ORIGEN_LABELS, ORIGEN_ACCENTS, MONTHS, getMesVencidoHabilitado } from '../data/nominaElectronica'
import { api } from '../services/api'
import { useSocket } from '../context/SocketContext'
import { useAuth } from '../context/AuthContext'

// ─── page-level constants ─────────────────────────────────────────────────────
// Misma celda + dropdown flotante que usa Seguimiento Mensual (Empresas
// Externas / Fondo Emprender) — ver renderProcessCell/handleCellClick/el
// popup de STATUS en EmpresasExternasPage.jsx, calcado acá con la paleta de
// ESTADOS_VISUAL propia (sin marcar/rojo/verde/gris, ver
// data/nominaElectronica.js) y con "tiene novedad" metido en el mismo popup
// en vez de un ícono aparte. Los 3 bloques (Maritza | Diana | Externas, ver
// ne_empresas.origen / migración 047) van cada uno con su alto natural
// (items-start, no scroll interno) — no tiene sentido forzarlos a la misma
// altura cuando tienen 48/36/25 empresas.
//
// El Excel original SÍ pintaba la fila completa (no un ícono chiquito) y
// llevaba el motivo/novedad como comentario de celda (hover = ver el texto,
// sin necesidad de abrir nada) — confirmado revisando el archivo real
// (fills de las hojas N.E JUL/JUN/MAY 26 con XLSX.readFile cellStyles:true,
// y los `.c` de comentario en las celdas de estado). Acá: fila completa
// teñida según resolveEstadoVisual(row), triángulo en la esquina cuando hay
// nota/novedad, y tooltip estilo Excel (fondo #fffef7, borde mostaza) igual
// al que ya usa EmpresasExternasPage para sus notas de celda.

const START_YM = 2026 * 100 + 8 // Agosto 2026 — mes de arranque de este módulo, no hay nada antes

function toYM(anio, mes) { return anio * 100 + mes }
function fromYM(ym) { return { anio: Math.floor(ym / 100), mes: ym % 100 } }
function nextYM(ym) { return ym % 100 === 12 ? (Math.floor(ym / 100) + 1) * 100 + 1 : ym + 1 }
function prevYM(ym) { return ym % 100 === 1 ? (Math.floor(ym / 100) - 1) * 100 + 12 : ym - 1 }

const ORIGEN_ORDER = ['maritza', 'diana', 'externas']

export default function NominaElectronicaPage() {
  const { isAdmin, user } = useAuth()
  const puedeGestionarCatalogo = isAdmin() || user?.permissions?.modulos?.nominaElectronica?.canGestionar === true
  const { socket } = useSocket()
  const [searchParams, setSearchParams] = useSearchParams()

  const habilitado = getMesVencidoHabilitado()
  const habilitadoYM = toYM(habilitado.anio, habilitado.mes)

  const [ym, setYm] = useState(() => {
    const anio = parseInt(searchParams.get('anio') ?? '', 10)
    const mes  = parseInt(searchParams.get('mes') ?? '', 10)
    if (mes >= 1 && mes <= 12 && anio >= 2000) {
      const v = toYM(anio, mes)
      if (v >= START_YM && v <= habilitadoYM) return v
    }
    return habilitadoYM
  })
  const { anio, mes } = fromYM(ym)
  const atFloor   = ym <= START_YM
  const atCeiling = ym >= habilitadoYM

  const [rows,    setRows]    = useState([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)
  const [search,  setSearch]  = useState('')

  const fetchMes = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const data = await api.getNEMes(anio, mes)
      setRows(data)
    } catch (err) {
      setError(err.status === 403
        ? 'No tienes acceso al módulo de Nómina Electrónica'
        : (err.message || 'Error al cargar el seguimiento'))
    } finally {
      setLoading(false)
    }
  }, [anio, mes])

  useEffect(() => { fetchMes() }, [fetchMes])

  useEffect(() => {
    setSearchParams({ anio: String(anio), mes: String(mes) }, { replace: true })
  }, [anio, mes, setSearchParams])

  // ── popup de celda (una sola instancia para toda la página, igual que
  // Seguimiento Mensual) ────────────────────────────────────────────────────
  const [openCell, setOpenCell] = useState(null) // { empresaId, left, top }
  const dropdownRef = useRef(null)
  const motivoTextareaRef  = useRef(null)
  const novedadTextareaRef = useRef(null)
  // openCellRef/dirtyRef existen para que flushPending() siempre lea el
  // valor MÁS RECIENTE aunque lo llame un closure viejo (el del socket, o el
  // del listener de mousedown registrado en un render anterior) — mismo
  // patrón que noteDirtyRef/openCellRef en EmpresasExternasPage.jsx.
  const openCellRef = useRef(null)
  openCellRef.current = openCell
  const dirtyRef = useRef({ nota: false, novedadNota: false })

  // ── acciones (optimistas, con rollback silencioso en error) ──────────────────
  const patch = useCallback((empresaId, changes) => {
    setRows(prev => prev.map(r => r.empresaId === empresaId ? { ...r, ...changes } : r))
  }, [])

  // Refresco silencioso (no toca `loading`/`error`) — reemplazar `rows` en
  // sitio no desmonta la grilla ni mueve el scroll, a diferencia de
  // fetchMes(). Declarado antes que `save` para que su rollback de error lo
  // pueda usar directo, sin un ref-mirror para romper el orden.
  const silentRefetch = useCallback(async () => {
    try {
      const data = await api.getNEMes(anio, mes)
      setRows(data)
    } catch { /* silencioso */ }
  }, [anio, mes])

  const save = useCallback(async (empresaId, body) => {
    try {
      await api.updateNEMes(empresaId, anio, mes, body)
    } catch (err) {
      silentRefetch()
      alert(err.status === 403 ? (err.message || 'Sin permiso (403)') : 'Error: ' + err.message)
    }
  }, [anio, mes, silentRefetch])

  // Guarda cualquier nota/novedad tecleada pero aún no confirmada por blur —
  // se llama SIEMPRE antes de cerrar el popup o de pisar `rows` con un
  // refetch, en vez de confiar en que el evento blur alcance a dispararse a
  // tiempo. Ese fue justo el bug en Seguimiento Mensual: cerrar el popup
  // (clic afuera) desmonta el textarea, y si el blur nativo no llega a
  // correr antes del desmontaje, la nota nunca se manda al backend — se ve
  // bien en pantalla (el estado local `rows` ya tiene el texto) hasta que
  // un refetch (el del socket, u otro) trae de vuelta la versión vieja del
  // servidor y "borra" lo que se había escrito. Lee el valor directo del
  // DOM (`.value`), no de `rows`/closures, para no depender de con qué
  // render quedó atado este callback.
  const flushPending = useCallback(() => {
    const oc = openCellRef.current
    if (!oc) return Promise.resolve()
    const promises = []
    if (dirtyRef.current.nota && motivoTextareaRef.current) {
      dirtyRef.current.nota = false
      promises.push(save(oc.empresaId, { nota: motivoTextareaRef.current.value }))
    }
    if (dirtyRef.current.novedadNota && novedadTextareaRef.current) {
      dirtyRef.current.novedadNota = false
      promises.push(save(oc.empresaId, { novedadNota: novedadTextareaRef.current.value }))
    }
    return Promise.all(promises)
  }, [save])

  // El propio flushPending()/save() de acá arriba también puede disparar un
  // refetch por error — SIEMPRE se flushea lo pendiente antes del refetch
  // "en vivo" de más abajo (flushPending().then(silentRefetch)): si no, ese
  // refetch puede pisar con datos viejos del servidor una nota que el
  // usuario está escribiendo en ese mismo instante.
  const refetchTimerRef = useRef(null)
  useEffect(() => {
    if (!socket) return
    const handler = (payload) => {
      if (payload?.tipo === 'mes' && (payload.anio !== anio || payload.mes !== mes)) return
      clearTimeout(refetchTimerRef.current)
      refetchTimerRef.current = setTimeout(() => { flushPending().then(silentRefetch) }, 1000)
    }
    socket.on('nominaElectronica:updated', handler)
    return () => {
      socket.off('nominaElectronica:updated', handler)
      clearTimeout(refetchTimerRef.current)
    }
  }, [socket, anio, mes, silentRefetch, flushPending])

  // Al volver a la pestaña (otro usuario pudo editar mientras tanto) — mismo
  // flush-antes-de-refrescar, mismo criterio que el useEffect de arriba.
  useEffect(() => {
    const onFocus = () => { flushPending().then(silentRefetch) }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [flushPending, silentRefetch])

  useEffect(() => {
    if (!openCell) return
    const onDown = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        flushPending()
        setOpenCell(null)
      }
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [openCell, flushPending])

  function prevMonth() { if (!atFloor) setYm(prevYM(ym)) }
  function nextMonth() { if (!atCeiling) setYm(nextYM(ym)) }

  function handleCellClick(empresaId, e) {
    // Defensivo: si por lo que sea quedó algo sin flushear de la celda
    // anterior (no debería, el mousedown de afuera ya lo hizo), no se
    // arrastra al abrir una celda nueva.
    dirtyRef.current = { nota: false, novedadNota: false }
    const rect = e.currentTarget.getBoundingClientRect()
    const PW = 240, PH = 320
    let left = rect.left
    let top  = rect.bottom + 4
    if (left + PW > window.innerWidth - 8)  left = window.innerWidth - PW - 8
    if (left < 8) left = 8
    if (top  + PH > window.innerHeight - 8) top  = rect.top - PH - 4
    if (top  < 8) top  = 8
    setOpenCell({ empresaId, left, top })
  }

  // ── tooltip de nota/novedad al pasar el mouse — igual al de las celdas de
  // Seguimiento Mensual (fondo #fffef7, borde mostaza; ver
  // EmpresasExternasPage.showTooltip/scheduleHide): una sola instancia para
  // toda la página, con un margen de 220ms al salir para que mover el mouse
  // hacia el propio tooltip no lo cierre de una.
  const [tooltip, setTooltip] = useState(null) // { left, top, content }
  const hideTimerRef = useRef(null)

  function showTooltip(e, content) {
    clearTimeout(hideTimerRef.current)
    const r = e.currentTarget.getBoundingClientRect()
    const TW = 240
    let left = r.right + 8
    let top  = r.top
    if (left + TW > window.innerWidth - 8) left = r.left - TW - 8
    if (left < 8) left = 8
    setTooltip({ left, top, content })
  }
  function scheduleHideTooltip() {
    hideTimerRef.current = setTimeout(() => setTooltip(null), 220)
  }

  // El dropdown ofrece 4 opciones visuales, pero solo hay 2 campos reales en
  // la base (estado + autorizada, ver resolveEstadoVisual en
  // data/nominaElectronica.js) — este mapeo traduce el clic al par correcto.
  const VISUAL_TO_FIELDS = {
    sin_marcar: { estado: 'pendiente',  autorizada: false },
    autorizada: { estado: 'pendiente',  autorizada: true },
    presentada: { estado: 'presentada', autorizada: false },
    no_aplica:  { estado: 'no_aplica',  autorizada: false },
  }

  function handleEstadoVisual(empresaId, visualKey) {
    const changes = VISUAL_TO_FIELDS[visualKey]
    patch(empresaId, changes)
    save(empresaId, changes)
  }
  // dirtyRef en false acá cubre el camino "normal" (blur disparó esto antes
  // de que hiciera falta el flush de emergencia) — si flushPending() llega a
  // correr después de esto, no vuelve a mandar el mismo valor dos veces.
  function handleNota(empresaId, nota) {
    dirtyRef.current.nota = false
    patch(empresaId, { nota })
    save(empresaId, { nota })
  }
  function handleNovedadToggle(empresaId, tieneNovedad) {
    const changes = tieneNovedad ? { tieneNovedad } : { tieneNovedad, novedadNota: null }
    if (!tieneNovedad) dirtyRef.current.novedadNota = false
    patch(empresaId, changes)
    save(empresaId, changes)
  }
  function handleNovedadNota(empresaId, novedadNota) {
    dirtyRef.current.novedadNota = false
    patch(empresaId, { novedadNota })
    save(empresaId, { novedadNota })
  }

  // ── agrupación por origen (los 3 bloques del Excel) + búsqueda ───────────────
  const grouped = useMemo(() => {
    const g = { maritza: [], diana: [], externas: [], otras: [] }
    const q = search.trim().toLowerCase()
    for (const r of rows) {
      if (q && !r.name.toLowerCase().includes(q)) continue
      ;(g[r.origen] ?? g.otras).push(r)
    }
    return g
  }, [rows, search])

  const stats = useMemo(() => ({
    autorizadas: rows.filter(r => resolveEstadoVisual(r) === 'autorizada').length,
    presentadas: rows.filter(r => r.estado === 'presentada').length,
    noAplica:    rows.filter(r => r.estado === 'no_aplica').length,
    conNovedad:  rows.filter(r => r.tieneNovedad).length,
  }), [rows])

  const openRow = openCell ? rows.find(r => r.empresaId === openCell.empresaId) : null

  return (
    <div className="flex flex-col gap-4 min-w-0">
      {/* ── Page header ──────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-3 mb-0.5">
            <span className="material-symbols-outlined text-3xl text-[#004ac6]">badge</span>
            <h1 className="text-2xl font-bold text-[#191c1e] dark:text-[#e4e6f0]">Nómina Electrónica</h1>
          </div>
          <p className="text-sm text-[#6b7280] dark:text-[#8890b5]">Seguimiento mensual de presentación por empresa</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1 bg-white dark:bg-[#1e2030] border border-[#e2e4ef] dark:border-[#2e3148] rounded-xl px-3 py-2 shadow-sm">
            <button
              onClick={prevMonth}
              disabled={atFloor}
              title={atFloor ? 'No hay seguimiento antes de agosto 2026' : undefined}
              className="p-0.5 rounded hover:bg-[#f3f4f6] dark:hover:bg-[#252840] transition text-[#6b7280] disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed"
            >
              <span className="material-symbols-outlined text-xl">chevron_left</span>
            </button>
            <span className="text-sm font-semibold text-[#191c1e] dark:text-[#e4e6f0] px-2 min-w-[130px] text-center">
              {MONTHS[mes - 1]} {anio}
            </span>
            <button
              onClick={nextMonth}
              disabled={atCeiling}
              title={atCeiling ? 'El mes en curso aún no está habilitado (mes vencido)' : undefined}
              className="p-0.5 rounded hover:bg-[#f3f4f6] dark:hover:bg-[#252840] transition text-[#6b7280] disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed"
            >
              <span className="material-symbols-outlined text-xl">chevron_right</span>
            </button>
          </div>
          {puedeGestionarCatalogo && (
            <Link
              to="/dian/nomina-electronica/empresas"
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold text-[#6b7280] dark:text-[#8890b5] border border-[#e2e4ef] dark:border-[#2e3148] hover:bg-[#f3f4f6] dark:hover:bg-[#252840] transition"
            >
              <span className="material-symbols-outlined text-lg">edit</span>
              Editar empresas
            </Link>
          )}
        </div>
      </div>

      {/* ── Search + summary ─────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[#8890b5]" style={{ fontSize: 17 }}>
            search
          </span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar empresa..."
            className="w-full pl-9 pr-4 py-2 text-sm rounded-xl border border-[#e2e4ef] dark:border-[#2e3148] bg-white dark:bg-[#1e2030] text-[#191c1e] dark:text-[#e4e6f0] outline-none focus:ring-2 focus:ring-[#004ac6]/30"
          />
        </div>
        <span className="text-xs text-[#6b7280] dark:text-[#8890b5]">
          <b style={{ color: '#ef4444' }}>{stats.autorizadas}</b> ya se pueden presentar
          {' · '}<b style={{ color: '#16a34a' }}>{stats.presentadas}</b> presentadas
          {' · '}<b style={{ color: '#6b7280' }}>{stats.noAplica}</b> no aplica
          {' · '}<b style={{ color: '#d97706' }}>{stats.conNovedad}</b> con novedad
        </span>
      </div>

      {error && (
        <div className="text-sm px-4 py-2.5 rounded-xl bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20 text-[#8890b5] dark:text-[#5a5f7a]">
          <span className="material-symbols-outlined mr-2" style={{ fontSize: 20, animation: 'spin 1s linear infinite' }}>
            progress_activity
          </span>
          Cargando seguimiento…
        </div>
      ) : !error && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
          {ORIGEN_ORDER.map(key => (
            <CompanyColumn
              key={key}
              title={ORIGEN_LABELS[key]}
              accent={ORIGEN_ACCENTS[key]}
              rows={grouped[key]}
              onCellClick={handleCellClick}
              openEmpresaId={openCell?.empresaId}
              onShowTooltip={showTooltip}
              onHideTooltip={scheduleHideTooltip}
            />
          ))}
          {grouped.otras.length > 0 && (
            <CompanyColumn
              title="Otras"
              accent={ORIGEN_ACCENTS.otras}
              rows={grouped.otras}
              onCellClick={handleCellClick}
              openEmpresaId={openCell?.empresaId}
              onShowTooltip={showTooltip}
              onHideTooltip={scheduleHideTooltip}
            />
          )}
        </div>
      )}

      {/* ── Tooltip de nota/novedad — estilo comentario de Excel ─────────── */}
      {tooltip && (
        <div
          className="fixed z-[60] shadow-lg text-xs text-[#1f1f1f] select-text rounded-[3px]"
          style={{
            left: tooltip.left, top: tooltip.top, width: 240,
            background: '#fffef7', border: '1px solid #c8b800',
          }}
          onMouseEnter={() => clearTimeout(hideTimerRef.current)}
          onMouseLeave={scheduleHideTooltip}
        >
          <div className="whitespace-pre-wrap leading-relaxed p-2.5">
            {tooltip.content}
          </div>
        </div>
      )}

      {/* ── Popup de la celda abierta ────────────────────────────────────── */}
      {openCell && openRow && (
        <div
          ref={dropdownRef}
          className="fixed z-50 bg-white dark:bg-[#1e2030] border border-[#e2e4ef] dark:border-[#2e3148] rounded-xl shadow-2xl p-4 w-60"
          style={{ left: openCell.left, top: openCell.top }}
        >
          <p className="text-[11px] font-bold text-[#191c1e] dark:text-[#e4e6f0] mb-3 truncate" title={openRow.name}>
            {openRow.name}
          </p>

          <div className="flex flex-col gap-1.5 mb-3">
            {Object.entries(ESTADOS_VISUAL).map(([key, cfg]) => {
              const active = resolveEstadoVisual(openRow) === key
              return (
                <button
                  key={key}
                  onClick={() => handleEstadoVisual(openRow.empresaId, key)}
                  className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-semibold transition-all hover:scale-[0.98] active:scale-95"
                  style={{
                    background: active ? cfg.bg : 'transparent',
                    color: cfg.color,
                    border: `1.5px solid ${active ? cfg.color : '#e2e4ef'}`,
                  }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 15 }}>{cfg.icon}</span>
                  {cfg.label}
                </button>
              )
            })}
          </div>

          {openRow.estado === 'no_aplica' && (
            <div className="mb-3">
              <p className="text-[10px] font-bold uppercase text-[#8890b5] mb-1">Motivo</p>
              <textarea
                ref={motivoTextareaRef}
                value={openRow.nota ?? ''}
                onChange={(e) => { dirtyRef.current.nota = true; patch(openRow.empresaId, { nota: e.target.value }) }}
                onBlur={(e) => handleNota(openRow.empresaId, e.target.value)}
                placeholder="¿Por qué no aplica?"
                rows={2}
                className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-[#e2e4ef] dark:border-[#2e3148] bg-[#f8f9fc] dark:bg-[#252840] text-[#191c1e] dark:text-[#e4e6f0] outline-none focus:ring-2 focus:ring-[#004ac6]/30 resize-none"
              />
            </div>
          )}

          <div className="border-t border-[#e2e4ef] dark:border-[#2e3148] pt-2.5">
            <label className="flex items-center gap-2 text-xs font-medium text-[#434655] dark:text-[#c4c8e8] cursor-pointer select-none">
              <input
                type="checkbox"
                checked={!!openRow.tieneNovedad}
                onChange={(e) => handleNovedadToggle(openRow.empresaId, e.target.checked)}
              />
              Tuvo novedad este mes
            </label>
            {openRow.tieneNovedad && (
              <textarea
                ref={novedadTextareaRef}
                value={openRow.novedadNota ?? ''}
                onChange={(e) => { dirtyRef.current.novedadNota = true; patch(openRow.empresaId, { novedadNota: e.target.value }) }}
                onBlur={(e) => handleNovedadNota(openRow.empresaId, e.target.value)}
                placeholder="¿Cuál novedad?"
                rows={2}
                className="w-full mt-2 px-2.5 py-1.5 text-xs rounded-lg border border-[#e2e4ef] dark:border-[#2e3148] bg-[#f8f9fc] dark:bg-[#252840] text-[#191c1e] dark:text-[#e4e6f0] outline-none focus:ring-2 focus:ring-[#004ac6]/30 resize-none"
              />
            )}
          </div>

          <button
            onClick={() => { flushPending(); setOpenCell(null) }}
            className="w-full mt-3 py-1 text-xs text-[#6b7280] hover:text-[#191c1e] dark:hover:text-[#e4e6f0] transition text-center"
          >
            Cerrar
          </button>
        </div>
      )}
    </div>
  )
}

// Triángulo de comentario tipo Excel, esquina superior derecha de la fila —
// color neutro fijo (no el del estado) para que se vea igual de bien sobre
// las tres tintas de fondo.
const NOTE_TRIANGLE = {
  position: 'absolute', top: 0, right: 0, width: 0, height: 0,
  borderStyle: 'solid', borderWidth: '0 10px 10px 0',
  borderColor: 'transparent rgba(55,65,81,0.55) transparent transparent',
}

// ─── una columna (Maritza / Diana / Externas) — alto natural, sin scroll interno ──
function CompanyColumn({ title, accent, rows, onCellClick, openEmpresaId, onShowTooltip, onHideTooltip }) {
  return (
    <div className="bg-white dark:bg-[#1e2030] rounded-xl border border-[#e2e4ef] dark:border-[#2e3148] shadow-sm overflow-hidden">
      <div
        className="px-4 py-2.5 bg-[#f8f9fc] dark:bg-[#252840] flex items-center justify-between"
        style={{ borderBottom: `2px solid ${accent}` }}
      >
        <span className="text-xs font-bold uppercase tracking-wide" style={{ color: accent }}>{title}</span>
        <span className="text-xs text-[#8890b5]">{rows.length}</span>
      </div>
      {rows.length === 0 ? (
        <div className="px-4 py-6 text-center text-xs text-[#8890b5]">Sin resultados</div>
      ) : (
        rows.map(row => {
          const visualKey = resolveEstadoVisual(row)
          const cfg = ESTADOS_VISUAL[visualKey]
          const isOpen = row.empresaId === openEmpresaId
          const motivo = row.estado === 'no_aplica' ? row.nota?.trim() : ''
          const novedad = row.tieneNovedad ? row.novedadNota?.trim() : ''
          const hasNote = !!motivo || !!novedad
          const tooltipContent = [
            motivo && `Motivo: ${motivo}`,
            novedad && `Novedad: ${novedad}`,
          ].filter(Boolean).join('\n\n')

          return (
            <div
              key={row.empresaId}
              className={`relative flex items-center gap-1.5 pl-4 pr-2.5 py-1.5 border-b border-black/5 dark:border-white/10 last:border-0 transition-colors ${isOpen ? 'ring-2 ring-inset ring-[#004ac6]' : ''}`}
              style={{ background: cfg.bg }}
              onMouseEnter={hasNote ? (e) => onShowTooltip(e, tooltipContent) : undefined}
              onMouseLeave={hasNote ? onHideTooltip : undefined}
            >
              {hasNote && <span style={NOTE_TRIANGLE} title="Tiene motivo/novedad — pasa el mouse" />}
              <span className="flex-1 truncate text-[13px] font-medium text-[#191c1e]" title={row.name}>
                {row.name}
              </span>
              <button
                title={row.responsableNombre ? `Responsable: ${row.responsableNombre}` : 'Sin responsable asignado'}
                className="flex items-center justify-center rounded-full shrink-0 hover:bg-black/5"
                style={{ width: 22, height: 22 }}
              >
                <span
                  className="material-symbols-outlined"
                  style={{ color: row.responsableNombre ? '#004ac6' : '#c3c6d7', fontSize: 15 }}
                >
                  person
                </span>
              </button>
              <button
                onClick={(e) => onCellClick(row.empresaId, e)}
                className="flex items-center justify-center relative transition-all hover:scale-110 active:scale-95 rounded-full bg-white/80 border border-black/10 shadow-sm shrink-0"
                style={{ width: 26, height: 26 }}
                title={cfg.label}
              >
                <span className="material-symbols-outlined" style={{ color: cfg.color, fontSize: 16 }}>
                  {cfg.icon}
                </span>
              </button>
            </div>
          )
        })
      )}
    </div>
  )
}
