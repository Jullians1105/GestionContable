import { useState, useEffect, useRef, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { STATUS, MONTHS, getMesVencidoHabilitado, resolveMesInicial, firstName } from '../data/empresasExternas'
import { api } from '../services/api'
import { useSocket } from '../context/SocketContext'
import { useAuth } from '../context/AuthContext'
import { useTeam } from '../context/TeamContext'

// ─── page-level constants ─────────────────────────────────────────────────────
// Mismos valores/patrones que FondoEmprenderPage.jsx (Seguimiento Mensual de
// Fondo Emprender) — ver los comentarios de ese archivo para el porqué de
// cada uno. Acá no hay grupos de columnas ni macroprocesos, así que el header
// es de una sola fila y no hace falta dnd-kit.

const BORDER     = '1px solid #e2e4ef'
const BORDER_COL = '1px solid #d5d9ea'

// Franjas de color arriba y abajo de todo el header (mismo azul de acento
// que el resto de la app), con el propio fondo del header teñido del mismo
// tono muy tenue (bg-[#f0f4ff], el mismo hex que usa el grupo 0 de
// FondoEmprenderPage.jsx) en vez de gris neutro — así las franjas se leen
// como el borde de un bloque de ese color, no como dos líneas sueltas
// flotando sobre un fondo que no tiene nada que ver con ellas. No hay grupos
// acá, así que es una sola franja continua para toda la fila de headers
// (no una por macroproceso como en Fondo Emprender).
const HEADER_ACCENT = '#004ac6'
const HEADER_ACCENT_BORDER = `3px solid ${HEADER_ACCENT}`

// A diferencia de Fondo Emprender (23+ procesos, columnas angostas de 48px
// con texto rotado para que todos quepan), acá son solo 11 — hay espacio de
// sobra para texto horizontal normal, más legible y sin la franja vertical
// vacía que dejaba el texto rotado dentro de un header pensado para nombres
// mucho más largos.
//
// Empresa/Responsable/Contador quedan en ancho fijo (son columnas sticky —
// necesitan un `left` fijo en px para congelarse durante el scroll). Empresa
// se llevó el espacio que se les recortó a las columnas de Proceso más
// cortas (ver PROC_MIN_WEIGHT) para que los nombres de empresa se alcancen a
// leer más completos. Responsable/Contador están medidos para que su propio
// título en mayúsculas ("RESPONSABLE" es el más largo) entre en una sola
// línea sin cortarse — el dato (nombres cortos como "Natalia") nunca es el
// que manda el ancho acá, el título sí.
//
// Las 11 de Proceso NO tienen un ancho parejo entre sí: cada una pesa según
// el largo de su propio nombre (ver procWeight más abajo) — "Caja" o
// "Ventas" no necesitan el mismo espacio que "Pago seguridad social", forzar
// el mismo ancho para todas desperdicia sitio en las cortas y aprieta a las
// largas. calc() reparte el ancho sobrante de la tabla (100% del
// contenedor, ya descontadas las 3 columnas fijas) proporcional a ese peso,
// así la grilla llena la pantalla sin franja vacía ni scroll horizontal en
// el caso normal — MIN_COL_WIDTH es el piso (min-width) para cuando la
// ventana es angosta de verdad y ni así entra.
const MIN_COL_WIDTH = 72
const PROC_MIN_WEIGHT = 6 // = largo de "Ventas"/"Nómina" — piso para que "Caja" (4) no quede ridículamente angosta, sin inflar a las demás cortas
const EMPRESA_COL_WIDTH = 210
const RESPONSABLE_COL_WIDTH = 100
const CONTADOR_COL_WIDTH = 80

// Claves sintéticas para filtrar por Responsable/Contador dentro del mismo
// `columnFilters` que ya usan los procesos (por estado) — el shape (Set de
// valores permitidos) es idéntico, solo cambia qué campo del company se
// compara contra el set. Reusar el mismo state evita duplicar el badge de
// "N filtros de columna" y el botón de limpiar.
const RESPONSABLE_FILTER_KEY = '__responsable'
const CONTADOR_FILTER_KEY = '__contador'
const SIN_ASIGNAR = '(Sin asignar)'

// El ícono de filtro vive SIEMPRE en la esquina superior-derecha de su
// header (position:absolute), como una chapita fija — no en una franja
// propia de ancho completo (eso dejaba, en columnas angostas, un renglón
// vacío con el ícono flotando solo). HEADER_TOP_CLEARANCE es el padding-top
// que le reserva ese rincón al ícono ANTES de que empiece el texto: al ser
// espacio vertical (no horizontal), el título sigue centrado/alineado en
// todo el ancho de la columna — nunca compite de lado a lado con el ícono
// como pasaba antes, que es lo que lo cortaba o lo corría del centro.
const FILTER_BTN_SIZE = 14
// Separado de la franja azul superior (HEADER_ACCENT_BORDER, 3px) por un
// margen propio — a top:2 quedaba pisando ese borde, y el hover del botón se
// veía cortado/superpuesto con la franja.
const FILTER_BTN_OFFSET = 6
const HEADER_TOP_CLEARANCE = 22

const emptyCell = { status: 'pending', note: '', readonly: false, fuente: null }

// Convierte un string de borde ("1px solid #hex") en un segmento de
// box-shadow inset para ese lado — ver el comentario largo en
// FondoEmprenderPage.jsx: con thead sticky + border-collapse, Chrome pinta
// mal los `border` normales al hacer scroll; box-shadow no tiene ese bug.
function sideShadow(side, borderStr) {
  if (!borderStr) return null
  const [width, , color] = borderStr.split(' ')
  const w = parseFloat(width)
  const offset = {
    top:    `0 ${w}px`,
    bottom: `0 -${w}px`,
    left:   `${w}px 0`,
    right:  `-${w}px 0`,
  }[side]
  return `inset ${offset} 0 0 ${color}`
}

function headerBoxShadow({ top, bottom, left, right }) {
  return [sideShadow('top', top), sideShadow('bottom', bottom), sideShadow('left', left), sideShadow('right', right)]
    .filter(Boolean)
    .join(', ')
}

// ─── header sub-components ─────────────────────────────────────────────────

// Ícono de filtro anclado en la esquina superior-derecha del header (que
// debe reservarle el espacio con padding-top: HEADER_TOP_CLEARANCE) — una
// chapita fija en el rincón, no una franja de ancho completo. El título
// nunca comparte línea horizontal con él (por eso no le hace falta padding
// lateral ni se descentra), solo le cede un poco de alto arriba.
function FilterButton({ onClick, hasFilter, title }) {
  return (
    <button
      onClick={onClick}
      className={`absolute flex items-center justify-center rounded transition-colors ${
        hasFilter
          ? 'text-[#004ac6] dark:text-[#7ba8f0] bg-[#e8eefc] dark:bg-[#1a2444]'
          : 'text-[#b0b4c8] dark:text-[#4b5170] hover:text-[#6b7280] dark:hover:text-[#8890b5] hover:bg-[#edeef0] dark:hover:bg-[#252840]'
      }`}
      style={{ width: FILTER_BTN_SIZE, height: FILTER_BTN_SIZE, top: FILTER_BTN_OFFSET, right: 4 }}
      title={title}
    >
      <span className="material-symbols-outlined" style={{ fontSize: 10 }}>filter_alt</span>
    </button>
  )
}

// Sin uppercase: en mayúsculas cada palabra ocupa más ancho y fuerza cortes a
// mitad de palabra en nombres largos como "Autorretención".
function ProcessHeaderCell({ proc, editable, isFirst, isLast, onMoveLeft, onMoveRight, startEditProcess, setDeleteConfirm, onFilterClick, hasFilter }) {
  return (
    <th
      title={proc.name}
      className="bg-[#f0f4ff] dark:bg-[#182544] text-[#6b7280] dark:text-[#8890b5]"
      style={{
        // Sin `width`: columna proporcional al largo de su nombre (ver
        // procColWidth), calculada en el <col> del colgroup. minWidth es el
        // único piso acá. position:relative acá es seguro (este th NO es
        // sticky) — es lo que ancla el FilterButton absolute a la esquina.
        minWidth: MIN_COL_WIDTH, verticalAlign: 'bottom', position: 'relative',
        padding: !editable ? `${HEADER_TOP_CLEARANCE}px 4px 6px` : '2px 4px 6px',
        boxShadow: headerBoxShadow({ top: HEADER_ACCENT_BORDER, bottom: HEADER_ACCENT_BORDER, right: BORDER_COL }),
      }}
    >
      {!editable ? (
        <>
          <FilterButton
            onClick={(e) => onFilterClick('status', proc.id, proc.name, e)}
            hasFilter={hasFilter}
            title={hasFilter ? `Filtro activo — ${proc.name}` : `Filtrar "${proc.name}" por estado`}
          />
          <div className="text-[10.5px] font-semibold leading-snug text-center" style={{ overflowWrap: 'break-word' }}>
            {proc.name}
          </div>
        </>
      ) : (
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between" style={{ height: 14 }}>
            <button
              onClick={onMoveLeft}
              disabled={isFirst}
              title="Mover a la izquierda"
              className="p-0.5 rounded hover:bg-[#e2e4ef] dark:hover:bg-[#252840] disabled:opacity-30 disabled:hover:bg-transparent transition"
            >
              <span className="material-symbols-outlined" style={{ fontSize: 13 }}>chevron_left</span>
            </button>
            <button
              onClick={onMoveRight}
              disabled={isLast}
              title="Mover a la derecha"
              className="p-0.5 rounded hover:bg-[#e2e4ef] dark:hover:bg-[#252840] disabled:opacity-30 disabled:hover:bg-transparent transition"
            >
              <span className="material-symbols-outlined" style={{ fontSize: 13 }}>chevron_right</span>
            </button>
          </div>
          <div className="text-[10px] font-semibold leading-snug text-center" style={{ overflowWrap: 'break-word' }}>
            {proc.name}
          </div>
          <div className="flex items-center justify-center gap-1">
            <button
              onClick={() => startEditProcess(proc)}
              className="p-0.5 rounded hover:bg-[#e2e4ef] dark:hover:bg-[#252840] hover:text-[#004ac6] transition"
              title="Editar nombre"
            >
              <span className="material-symbols-outlined" style={{ fontSize: 13 }}>edit</span>
            </button>
            <button
              onClick={() => setDeleteConfirm({ type: 'proceso', id: proc.id, name: proc.name })}
              className="p-0.5 rounded hover:bg-[#e2e4ef] dark:hover:bg-[#252840] hover:text-red-500 transition"
              title="Eliminar"
            >
              <span className="material-symbols-outlined" style={{ fontSize: 13 }}>delete</span>
            </button>
          </div>
        </div>
      )}
    </th>
  )
}

// Header de Responsable/Contador — mismo th sticky que ya tenían, con el
// mismo FilterButton en la esquina que ProcessHeaderCell para que las tres
// columnas filtrables se vean consistentes. NO lleva position:'relative' —
// el th ya es position:sticky (clase "sticky"), y sticky también actúa como
// contenedor de posicionamiento para hijos absolute (igual que relative).
// Agregarlo pisaba el `position:sticky` por especificidad de inline style y
// convertía el `left` (pensado como umbral de sticky) en un offset relativo
// real, corriendo todo el header fuera de su columna — ver el ancho fijo en
// EMPRESA/RESPONSABLE/CONTADOR_COL_WIDTH.
function NameFilterHeaderCell({ label, width, left, onFilterClick, hasFilter, filterKey }) {
  return (
    <th
      className="sticky top-0 z-30 bg-[#f0f4ff] dark:bg-[#182544] text-[#6b7280] dark:text-[#8890b5]"
      style={{
        left,
        width, minWidth: width, verticalAlign: 'bottom',
        padding: `${HEADER_TOP_CLEARANCE}px 8px 6px`,
        boxShadow: headerBoxShadow({ top: HEADER_ACCENT_BORDER, bottom: HEADER_ACCENT_BORDER, right: BORDER_COL }),
      }}
    >
      <FilterButton
        onClick={(e) => onFilterClick('name', filterKey, label, e)}
        hasFilter={hasFilter}
        title={hasFilter ? `Filtro activo — ${label}` : `Filtrar por ${label}`}
      />
      <div className="text-[10px] font-bold uppercase tracking-wide text-left leading-snug whitespace-nowrap" style={{ overflowWrap: 'break-word' }}>
        {label}
      </div>
    </th>
  )
}

// ─── component ───────────────────────────────────────────────────────────────

export default function EmpresasExternasPage() {
  const { socket } = useSocket()
  const { isAdmin } = useAuth()
  const { members } = useTeam()
  const [searchParams, setSearchParams] = useSearchParams()

  const [editMode, setEditMode] = useState(false)
  const canEditStructure = isAdmin() && editMode

  const [mesInicial]                = useState(() => resolveMesInicial(searchParams))
  const [month, setMonth]           = useState(mesInicial.month)
  const [year, setYear]             = useState(mesInicial.year)
  const [processes, setProcesses]   = useState([])
  const [companies, setCompanies]   = useState([])
  const companiesRef = useRef(companies)
  companiesRef.current = companies
  const pendingCellWritesRef = useRef(new Set())
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState(null)

  const [openCell, setOpenCell]     = useState(null)
  const dropdownRef     = useRef(null)
  const noteTextareaRef = useRef(null)
  const openCellRef     = useRef(openCell)
  openCellRef.current   = openCell
  const noteDirtyRef    = useRef(false)

  const [tooltip, setTooltip]         = useState(null)
  const [tooltipSize, setTooltipSize] = useState({ width: 220, height: 80 })
  const hideTimerRef    = useRef(null)
  const tooltipSizeRef  = useRef(tooltipSize)
  const tooltipKeyRef   = useRef(null)
  tooltipSizeRef.current = tooltipSize

  const [procesoModal, setProcesoModal] = useState(null) // { mode: 'create'|'edit', id, name }
  // Crear/editar empresa (nombre + responsable + activa) — solo admin, desde
  // "Editar estructura" (no hay página aparte de Empresas).
  const [empresaModal, setEmpresaModal] = useState(null) // { mode: 'create'|'edit', id, name, responsableId, activa }
  const [deleteConfirm, setDeleteConfirm] = useState(null) // { type: 'proceso' | 'empresa', id, name }

  const [search, setSearch]       = useState('')
  const [columnFilters, setColumnFilters] = useState({})
  const [openFilter, setOpenFilter] = useState(null)
  const filterDropdownRef = useRef(null)

  const refetchTimerRef = useRef(null)

  // ── load grid from backend ──────────────────────────────────────────────

  const fetchGrid = useCallback(async () => {
    try {
      setError(null)
      const [empresas, procesos, checklistsPorEmpresa] = await Promise.all([
        api.getExtEmpresas(),
        api.getExtProcesos(),
        api.getExtChecklistMes(year, month + 1),
      ])

      const checklistPorEmpresaId = new Map(
        checklistsPorEmpresa.map(c => [c.empresaId, c])
      )

      // No se filtran inactivas acá: sin una página de Empresas aparte, "Editar
      // estructura" es el único lugar donde el admin puede volver a activarlas
      // — el filtro de si se muestran o no en la vista normal va en el render.
      const built = empresas.map((e) => {
        const chk = checklistPorEmpresaId.get(e.id) ?? { items: [] }
        const cells = {}
        const prevCells = companiesRef.current.find(c => c.id === e.id)?.cells
        chk.items.forEach(it => {
          const key = `${e.id}:${it.id}`
          cells[it.id] = pendingCellWritesRef.current.has(key) && prevCells?.[it.id]
            ? prevCells[it.id]
            : { status: it.estado, note: it.nota ?? '', readonly: it.readonly ?? false, fuente: it.fuente ?? null }
        })
        return {
          id: e.id,
          name: e.name,
          responsableId: e.responsableId,
          responsableNombre: e.responsableNombre,
          contador: e.contador,
          activa: e.activa,
          cells,
        }
      })

      setProcesses(procesos)
      setCompanies(built)
    } catch (err) {
      setError(err.message || 'Error al cargar el seguimiento mensual')
    } finally {
      setLoading(false)
    }
  }, [year, month])

  const saveNote = useCallback(async (companyId, procId, note) => {
    noteDirtyRef.current = false
    try {
      await api.updateExtChecklistItem(companyId, procId, year, month + 1, { nota: note || null })
    } catch (err) {
      console.error('Error al guardar nota:', err.message)
      fetchGrid()
    }
  }, [year, month, fetchGrid])

  const flushPendingNote = useCallback(() => {
    const oc = openCellRef.current
    if (!oc || !noteDirtyRef.current || !noteTextareaRef.current) return Promise.resolve()
    return saveNote(oc.companyId, oc.procId, noteTextareaRef.current.value)
  }, [saveNote])

  useEffect(() => { setLoading(true); fetchGrid() }, [fetchGrid])

  // Refresh on window focus (catches changes made in another tab)
  useEffect(() => {
    const onFocus = () => { flushPendingNote().then(fetchGrid) }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [fetchGrid, flushPendingNote])

  // Refresh (debounced) on another user's edit for this same month — evento
  // propio 'externas:updated' (no 'empresa:updated' de Fondo Emprender), así
  // una edición acá no dispara un refetch en el otro módulo ni viceversa.
  useEffect(() => {
    if (!socket) return
    const handler = (payload) => {
      if (payload?.tipo === 'checklist' && (payload.anio !== year || payload.mes !== month + 1)) return
      clearTimeout(refetchTimerRef.current)
      refetchTimerRef.current = setTimeout(() => { flushPendingNote().then(fetchGrid) }, 1200)
    }
    socket.on('externas:updated', handler)
    return () => {
      socket.off('externas:updated', handler)
      clearTimeout(refetchTimerRef.current)
    }
  }, [socket, year, month, fetchGrid, flushPendingNote])

  useEffect(() => {
    const ta = noteTextareaRef.current
    if (!ta) return
    ta.style.height = 'auto'
    const h = Math.min(ta.scrollHeight, 200)
    ta.style.height = h + 'px'
    ta.style.overflowY = h >= 200 ? 'auto' : 'hidden'
  }, [openCell])

  useEffect(() => {
    if (!openCell) return
    const h = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        flushPendingNote()
        setOpenCell(null)
      }
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [openCell, flushPendingNote])

  // ── column filter — filtro de estado por proceso Y filtro por valor de
  // Responsable/Contador, estilo Excel, ambos guardados en el mismo
  // `columnFilters` (key → Set de valores permitidos): para un proceso la
  // key es su id y los valores son claves de STATUS; para Responsable/
  // Contador la key es RESPONSABLE_FILTER_KEY/CONTADOR_FILTER_KEY y los
  // valores son los nombres que realmente aparecen en esa columna. ─────────

  // Nombres únicos presentes en cada columna (incluye "(Sin asignar)" si hay
  // empresas sin ese dato) — son las opciones que ofrece el dropdown de
  // filtro, calculadas sobre TODAS las empresas visibles (no solo las que
  // sobreviven a otros filtros ya aplicados), igual que Excel.
  const responsableOptions = [...new Set(
    companies.filter(c => canEditStructure || c.activa !== false)
      .map(c => firstName(c.responsableNombre) || SIN_ASIGNAR)
  )].sort((a, b) => a.localeCompare(b, 'es'))

  const contadorOptions = [...new Set(
    companies.filter(c => canEditStructure || c.activa !== false)
      .map(c => c.contador?.trim() || SIN_ASIGNAR)
  )].sort((a, b) => a.localeCompare(b, 'es'))

  function optionsForFilterKey(key) {
    if (key === RESPONSABLE_FILTER_KEY) return responsableOptions
    if (key === CONTADOR_FILTER_KEY) return contadorOptions
    return Object.keys(STATUS)
  }

  function handleFilterIconClick(kind, key, label, e) {
    e.stopPropagation()
    const rect = e.currentTarget.getBoundingClientRect()
    const PW = 208
    let left = rect.left
    let top  = rect.bottom + 4
    if (left + PW > window.innerWidth - 8) left = window.innerWidth - PW - 8
    if (left < 8) left = 8
    if (top + 220 > window.innerHeight - 8) top = Math.max(8, rect.top - 220 - 4)
    setOpenFilter(prev => (prev?.key === key ? null : { kind, key, label, left, top }))
  }

  function isOptionChecked(key, optionKey) {
    const filter = columnFilters[key]
    return !filter || filter.has(optionKey)
  }

  function toggleOptionFilter(key, optionKey) {
    const allOptions = optionsForFilterKey(key)
    setColumnFilters(prev => {
      const baseline = prev[key] ?? new Set(allOptions)
      const next = new Set(baseline)
      if (next.has(optionKey)) next.delete(optionKey)
      else next.add(optionKey)
      if (next.size === allOptions.length) {
        const { [key]: _omit, ...rest } = prev
        return rest
      }
      return { ...prev, [key]: next }
    })
  }

  function clearColumnFilter(key) {
    setColumnFilters(prev => {
      const { [key]: _omit, ...rest } = prev
      return rest
    })
  }

  function toggleSelectAllFilter(key) {
    const allOptions = optionsForFilterKey(key)
    setColumnFilters(prev => {
      const total = allOptions.length
      const current = prev[key] ?? new Set(allOptions)
      if (current.size === total) return { ...prev, [key]: new Set() }
      const { [key]: _omit, ...rest } = prev
      return rest
    })
  }

  const activeColumnFilterCount = Object.keys(columnFilters).length

  useEffect(() => {
    if (!openFilter) return
    const h = (e) => {
      if (filterDropdownRef.current && !filterDropdownRef.current.contains(e.target)) {
        setOpenFilter(null)
      }
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [openFilter])

  // ── month nav — misma regla de mes vencido que Fondo Emprender ──────────
  const mesHabilitado = getMesVencidoHabilitado()
  const habilitadoYM = mesHabilitado.anio * 100 + mesHabilitado.mes
  const atMesHabilitado = (year * 100 + (month + 1)) >= habilitadoYM

  function goToMonth(newMonth, newYear) {
    setMonth(newMonth)
    setYear(newYear)
    setSearchParams({ anio: String(newYear), mes: String(newMonth + 1) }, { replace: true })
  }
  function prevMonth() {
    if (month === 0) goToMonth(11, year - 1)
    else goToMonth(month - 1, year)
  }
  function nextMonth() {
    const targetMonth = month === 11 ? 0 : month + 1
    const targetYear  = month === 11 ? year + 1 : year
    if ((targetYear * 100 + (targetMonth + 1)) > habilitadoYM) return
    goToMonth(targetMonth, targetYear)
  }

  // ── cell popup ───────────────────────────────────────────────────────────

  function handleCellClick(companyId, procId, e) {
    const rect = e.currentTarget.getBoundingClientRect()
    const PW = 260, PH = 252
    let left = rect.left
    let top  = rect.bottom + 4
    if (left + PW > window.innerWidth - 8)  left = window.innerWidth - PW - 8
    if (left < 8) left = 8
    if (top  + PH > window.innerHeight - 8) top  = rect.top - PH - 4
    if (top  < 8) top  = 8
    noteDirtyRef.current = false
    setOpenCell({ companyId, procId, left, top })
  }

  function updateCellLocal(companyId, procId, updates) {
    setCompanies(prev =>
      prev.map(c =>
        c.id === companyId
          ? { ...c, cells: { ...c.cells, [procId]: { ...(c.cells[procId] ?? emptyCell), ...updates } } }
          : c
      )
    )
  }

  async function handleStatusChange(companyId, procId, status) {
    updateCellLocal(companyId, procId, { status })
    const key = `${companyId}:${procId}`
    pendingCellWritesRef.current.add(key)
    try {
      await api.updateExtChecklistItem(companyId, procId, year, month + 1, { estado: status })
    } catch (err) {
      console.error('Error al guardar estado:', err.message)
      fetchGrid()
    } finally {
      pendingCellWritesRef.current.delete(key)
    }
  }

  function handleNoteChange(companyId, procId, note) {
    noteDirtyRef.current = true
    updateCellLocal(companyId, procId, { note })
  }

  function handleNoteBlur(companyId, procId, note) {
    saveNote(companyId, procId, note)
  }

  function handleClearNote(companyId, procId) {
    updateCellLocal(companyId, procId, { note: '' })
    saveNote(companyId, procId, '')
  }

  const openCompany  = openCell ? companies.find(c => c.id === openCell.companyId) : null
  const openProcess  = openCell ? processes.find(p => p.id === openCell.procId) : null
  const openCellData = openCompany?.cells[openCell?.procId] ?? emptyCell

  // ── tooltip helpers ──────────────────────────────────────────────────────

  function loadCellTooltipSize(cellKey) {
    try {
      const s = localStorage.getItem(`extNoteTooltipSize_${cellKey}`)
      if (s) return JSON.parse(s)
    } catch {
      // ignore localStorage read/parse errors
    }
    return { width: 220, height: 80 }
  }

  function showTooltip(e, content, cellKey) {
    clearTimeout(hideTimerRef.current)
    tooltipKeyRef.current = cellKey
    const size = loadCellTooltipSize(cellKey)
    setTooltipSize(size)
    const r = e.currentTarget.getBoundingClientRect()
    const TW = size.width, TH = size.height
    let left = r.right + 10
    let top  = r.top
    if (left + TW > window.innerWidth  - 8) left = r.left - TW - 10
    if (left < 8)  left = 8
    if (top  + TH > window.innerHeight - 8) top  = Math.max(8, window.innerHeight - TH - 8)
    setTooltip({ left, top, content })
  }

  function scheduleHide() {
    hideTimerRef.current = setTimeout(() => setTooltip(null), 220)
  }

  function startResize(e) {
    e.preventDefault()
    e.stopPropagation()
    const startX = e.clientX
    const startY = e.clientY
    const startW = tooltipSizeRef.current.width
    const startH = tooltipSizeRef.current.height

    function onMove(ev) {
      setTooltipSize({
        width:  Math.max(160, startW + ev.clientX - startX),
        height: Math.max(60,  startH + ev.clientY - startY),
      })
    }
    function onUp() {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      const key = tooltipKeyRef.current
      if (key) {
        localStorage.setItem(`extNoteTooltipSize_${key}`, JSON.stringify(tooltipSizeRef.current))
      }
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  // ── process (column) actions ─────────────────────────────────────────────

  function openCreateProcesoModal() {
    setProcesoModal({ mode: 'create', id: null, name: '' })
  }
  function openEditProcesoModal(proc) {
    setProcesoModal({ mode: 'edit', id: proc.id, name: proc.name })
  }
  function closeProcesoModal() {
    setProcesoModal(null)
  }

  async function submitProcesoModal() {
    const modal = procesoModal
    const name = modal?.name.trim()
    if (!modal || !name) return
    setProcesoModal(null)

    if (modal.mode === 'create') {
      try {
        const created = await api.createExtProceso({ name })
        setProcesses(prev => [...prev, created])
      } catch (err) {
        alert('Error al crear proceso: ' + err.message)
      }
      return
    }

    const previous = processes.find(p => p.id === modal.id)
    if (!previous) return
    setProcesses(prev => prev.map(p => p.id === modal.id ? { ...p, name } : p))
    try {
      await api.updateExtProceso(modal.id, { name })
    } catch (err) {
      setProcesses(prev => prev.map(p => p.id === modal.id ? previous : p))
      alert('Error al editar proceso: ' + err.message)
    }
  }

  async function confirmDelete() {
    if (!deleteConfirm) return
    const { type, id } = deleteConfirm
    setDeleteConfirm(null)
    if (type === 'empresa') {
      try {
        await api.deleteExtEmpresa(id)
        setCompanies(prev => prev.filter(c => c.id !== id))
      } catch (err) {
        alert('Error al eliminar empresa: ' + err.message)
      }
      return
    }
    try {
      // Procesos con historial no se pueden borrar de verdad — se desactivan
      // para dejar de ofrecerlos en meses nuevos sin perder lo ya registrado.
      await api.updateExtProceso(id, { activo: false })
      setProcesses(prev => prev.filter(p => p.id !== id))
    } catch (err) {
      alert('Error al eliminar proceso: ' + err.message)
    }
  }

  // ── company actions (solo admin, desde "Editar estructura") ─────────────

  function openCreateEmpresaModal() {
    setEmpresaModal({ mode: 'create', id: null, name: '', responsableId: '', contador: '', activa: true })
  }
  function openEditEmpresaModal(company) {
    setEmpresaModal({
      mode: 'edit', id: company.id, name: company.name,
      responsableId: company.responsableId ?? '', contador: company.contador ?? '', activa: company.activa,
    })
  }
  function closeEmpresaModal() {
    setEmpresaModal(null)
  }

  async function submitEmpresaModal() {
    const modal = empresaModal
    const name = modal?.name.trim()
    if (!modal || !name) return
    setEmpresaModal(null)

    if (modal.mode === 'create') {
      try {
        await api.createExtEmpresa({ name, responsableId: modal.responsableId || null, contador: modal.contador?.trim() || null })
        fetchGrid()
      } catch (err) {
        alert('Error al crear empresa: ' + err.message)
      }
      return
    }

    try {
      // '' del <select>/input significa "sin asignar" — se manda null
      // explícito, no se omite (omitirlo dejaría el valor anterior sin tocar).
      await api.updateExtEmpresa(modal.id, {
        name, activa: modal.activa,
        responsableId: modal.responsableId || null,
        contador: modal.contador?.trim() || null,
      })
      fetchGrid()
    } catch (err) {
      alert('Error al editar empresa: ' + err.message)
    }
  }

  // Reordenar por intercambio de `orden` con el vecino — no hace falta
  // recalcular toda la secuencia, solo swapear el valor de los dos
  // involucrados (ORDER BY orden ASC hace el resto).
  async function moveProceso(procId, direction) {
    const idx = visibleProcesses.findIndex(p => p.id === procId)
    const swapIdx = direction === 'left' ? idx - 1 : idx + 1
    if (idx === -1 || swapIdx < 0 || swapIdx >= visibleProcesses.length) return
    const a = visibleProcesses[idx]
    const b = visibleProcesses[swapIdx]
    setProcesses(prev => prev.map(p => {
      if (p.id === a.id) return { ...p, orden: b.orden }
      if (p.id === b.id) return { ...p, orden: a.orden }
      return p
    }))
    try {
      await Promise.all([
        api.updateExtProceso(a.id, { orden: b.orden }),
        api.updateExtProceso(b.id, { orden: a.orden }),
      ])
    } catch (err) {
      alert('Error al reordenar: ' + err.message)
      fetchGrid()
    }
  }

  // Ordenado por `orden` en el cliente — el reorden persiste el campo pero no
  // reacomoda el array, así que sin este sort la posición visual queda
  // "pegada" al orden de inserción hasta el próximo fetch.
  const visibleProcesses = [...processes].sort((a, b) => a.orden - b.orden)

  // ── filters: search + column filter ───────────────────────────────────────

  const q = search.toLowerCase()
  const filteredCompanies = companies.filter(c => {
    // Las inactivas solo se muestran en modo edición (para poder reactivarlas
    // o borrarlas de verdad) — en la vista normal quedan fuera, igual que un
    // proceso desactivado no aparece en meses nuevos.
    if (!canEditStructure && c.activa === false) return false
    // Solo empresa: Responsable/Contador ya tienen su propio filtro por
    // columna, no hace falta que el buscador también los cubra.
    const matchSearch = !q || c.name.toLowerCase().includes(q)
    const matchColumnFilters = Object.entries(columnFilters).every(([key, allowed]) => {
      if (key === RESPONSABLE_FILTER_KEY) return allowed.has(firstName(c.responsableNombre) || SIN_ASIGNAR)
      if (key === CONTADOR_FILTER_KEY) return allowed.has(c.contador?.trim() || SIN_ASIGNAR)
      const status = c.cells[key]?.status ?? 'pending'
      return allowed.has(status)
    })
    return matchSearch && matchColumnFilters
  })

  // ── stats ──────────────────────────────────────────────────────────────

  const totalCells = companies.length * visibleProcesses.length
  const doneCells  = companies.reduce(
    (acc, c) => acc + visibleProcesses.filter(p => ['done', 'na'].includes(c.cells[p.id]?.status ?? 'pending')).length,
    0
  )
  const pct = totalCells ? Math.round((doneCells / totalCells) * 100) : 0

  // Las 3 fijas (sticky) + las N de Proceso, repartidas proporcional al
  // largo de cada nombre (ver comentario de PROC_MIN_WEIGHT) en vez de en
  // partes iguales — así "Caja" no ocupa lo mismo que "Pago seguridad
  // social". calc() resuelve el % real recién en el navegador contra el
  // ancho verdadero del contenedor, así sigue siendo responsive.
  const fixedColWidths = [EMPRESA_COL_WIDTH, RESPONSABLE_COL_WIDTH, CONTADOR_COL_WIDTH]
  const totalFixedWidth = fixedColWidths.reduce((a, b) => a + b, 0)
  const procWeights = visibleProcesses.map(p => Math.max(p.name.length, PROC_MIN_WEIGHT))
  const totalProcWeight = procWeights.reduce((a, b) => a + b, 0) || 1
  const procColWidth = (weight) =>
    `calc((100% - ${totalFixedWidth}px) * ${(weight / totalProcWeight).toFixed(4)})`
  const totalLeafColumns = fixedColWidths.length + visibleProcesses.length

  function renderProcessCell(company, proc, rowBg) {
    const cell = company.cells[proc.id] ?? emptyCell
    const cfg  = STATUS[cell.status] ?? STATUS.pending
    const hasNote = !!cell.note?.trim()
    // "Nómina electrónica": cuando la empresa está enlazada desde el módulo
    // de Nómina Electrónica, esa celda deja de editarse acá (ver
    // nominaElectronicaSync.js) — clic deshabilitado, ícono de enlace
    // chiquito y apagado en la esquina (no un candado: no es un permiso que
    // falte, es que se marca en otro lado).
    const isReadonly = !!cell.readonly
    return (
      <td
        key={proc.id}
        style={{
          minWidth: MIN_COL_WIDTH, padding: 2, background: rowBg,
          borderTop: BORDER, borderBottom: BORDER, borderLeft: BORDER_COL, borderRight: BORDER_COL,
        }}
      >
        <button
          onClick={isReadonly ? undefined : e => handleCellClick(company.id, proc.id, e)}
          onMouseEnter={hasNote ? e => showTooltip(e, cell.note, `${company.id}_${proc.id}`) : undefined}
          onMouseLeave={hasNote ? scheduleHide : undefined}
          title={isReadonly ? 'Se marca desde Nómina Electrónica' : undefined}
          className={`w-full flex items-center justify-center relative transition-all rounded ${
            isReadonly ? 'cursor-default' : 'hover:opacity-75 hover:scale-90 active:scale-75'
          }`}
          style={{ height: 32, background: cfg.bg }}
        >
          <span className="material-symbols-outlined" style={{ color: cfg.color, fontSize: 17 }}>
            {cfg.icon}
          </span>
          {hasNote && (
            <span className="absolute bg-amber-400 rounded-full border border-white" style={{ width: 6, height: 6, top: 1, right: 1 }} />
          )}
          {isReadonly && (
            <span
              className="material-symbols-outlined absolute"
              style={{ fontSize: 9, bottom: 1, right: 1, color: cfg.color, opacity: 0.45 }}
            >
              link
            </span>
          )}
        </button>
      </td>
    )
  }

  // ── loading / error states ────────────────────────────────────────────────
  if (loading) return (
    <div className="flex items-center justify-center py-20 text-[#8890b5] dark:text-[#5a5f7a]">
      <span className="material-symbols-outlined mr-2" style={{ fontSize: 20, animation: 'spin 1s linear infinite' }}>
        progress_activity
      </span>
      Cargando seguimiento mensual…
    </div>
  )

  if (error) return (
    <div className="flex flex-col items-center gap-3 py-20">
      <span className="material-symbols-outlined text-[#ef4444]" style={{ fontSize: 32 }}>error</span>
      <p className="text-sm text-[#ef4444]">{error}</p>
      <button
        onClick={fetchGrid}
        className="px-4 py-2 text-sm rounded-lg border border-[#e2e4ef] dark:border-[#2e3148] hover:bg-[#f3f4f6] dark:hover:bg-[#252840] transition"
      >
        Reintentar
      </button>
    </div>
  )

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-4 min-w-0">

      {/* ── Page header ──────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <span className="material-symbols-outlined text-2xl text-[#004ac6]">table_chart</span>
            <h1 className="text-xl font-bold text-[#191c1e] dark:text-[#e4e6f0]">Empresas Externas</h1>
          </div>
          <p className="text-sm text-[#6b7280] dark:text-[#8890b5]">Seguimiento contable mensual</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1 bg-white dark:bg-[#1e2030] border border-[#e2e4ef] dark:border-[#2e3148] rounded-xl px-3 py-2 shadow-sm">
            <button onClick={prevMonth} className="p-0.5 rounded hover:bg-[#f3f4f6] dark:hover:bg-[#252840] transition text-[#6b7280]">
              <span className="material-symbols-outlined text-xl">chevron_left</span>
            </button>
            <span className="text-sm font-semibold text-[#191c1e] dark:text-[#e4e6f0] px-2 min-w-[130px] text-center">
              {MONTHS[month]} {year}
            </span>
            <button
              onClick={nextMonth}
              disabled={atMesHabilitado}
              title={atMesHabilitado ? 'El mes en curso aún no está habilitado (mes vencido)' : undefined}
              className="p-0.5 rounded hover:bg-[#f3f4f6] dark:hover:bg-[#252840] transition text-[#6b7280] disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed"
            >
              <span className="material-symbols-outlined text-xl">chevron_right</span>
            </button>
          </div>
          {isAdmin() && (
            <button
              onClick={() => setEditMode(v => {
                if (v) { setProcesoModal(null); setEmpresaModal(null) }
                return !v
              })}
              className={
                'flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold transition active:scale-[0.97] ' +
                (editMode
                  ? 'text-white'
                  : 'text-[#6b7280] dark:text-[#8890b5] border border-[#e2e4ef] dark:border-[#2e3148] hover:bg-[#f3f4f6] dark:hover:bg-[#252840]')
              }
              style={editMode ? { background: '#004ac6' } : undefined}
              title="Renombrar, borrar o reordenar procesos"
            >
              <span className="material-symbols-outlined text-lg">{editMode ? 'lock_open' : 'edit'}</span>
              {editMode ? 'Editando estructura' : 'Editar estructura'}
            </button>
          )}
          {canEditStructure && (
            <>
              <button
                onClick={openCreateEmpresaModal}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold text-[#004ac6] dark:text-[#7ba8f0] border border-[#004ac6] dark:border-[#7ba8f0] hover:bg-[#004ac6]/5 transition active:scale-[0.97]"
              >
                <span className="material-symbols-outlined text-lg">domain_add</span>
                Nueva empresa
              </button>
              <button
                onClick={openCreateProcesoModal}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold text-white hover:opacity-90 transition active:scale-[0.97]"
                style={{ background: '#004ac6' }}
              >
                <span className="material-symbols-outlined text-lg">add_column_right</span>
                Nuevo proceso
              </button>
            </>
          )}
        </div>
      </div>

      {/* ── Filters row: search ──────────────────────────────────────────── */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[#8890b5]" style={{ fontSize: 17 }}>
            search
          </span>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar empresa..."
            className="w-full pl-9 pr-4 py-2 text-sm rounded-xl border border-[#e2e4ef] dark:border-[#2e3148] bg-white dark:bg-[#1e2030] text-[#191c1e] dark:text-[#e4e6f0] outline-none focus:ring-2 focus:ring-[#004ac6]/30"
          />
        </div>

        {activeColumnFilterCount > 0 && (
          <button
            onClick={() => setColumnFilters({})}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold flex-shrink-0 transition hover:opacity-80 bg-[#e8eefc] dark:bg-[#1a2444] text-[#004ac6] dark:text-[#7ba8f0]"
            title="Quitar todos los filtros de columna"
          >
            <span className="material-symbols-outlined" style={{ fontSize: 15 }}>filter_alt</span>
            {activeColumnFilterCount} {activeColumnFilterCount === 1 ? 'filtro de columna' : 'filtros de columna'}
            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>close</span>
          </button>
        )}
      </div>

      {/* ── Progress bar ─────────────────────────────────────────────────── */}
      <div className="bg-white dark:bg-[#1e2030] rounded-xl border border-[#e2e4ef] dark:border-[#2e3148] p-4 shadow-sm flex items-center gap-4">
        <div className="flex-1">
          <div className="flex justify-between mb-1.5">
            <span className="text-xs font-semibold text-[#191c1e] dark:text-[#e4e6f0]">Progreso general</span>
            <span className="text-xs font-bold text-[#16a34a]">{pct}%</span>
          </div>
          <div className="w-full h-2 rounded-full bg-[#f3f4f6] dark:bg-[#252840]">
            <div className="h-2 rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: '#16a34a' }} />
          </div>
        </div>
        <span className="text-xs text-[#6b7280] dark:text-[#8890b5] whitespace-nowrap">
          {doneCells} / {totalCells} tareas
        </span>
      </div>

      {/* ── Table ────────────────────────────────────────────────────────── */}
      <div
        className="overflow-auto rounded-xl border border-[#e2e4ef] dark:border-[#2e3148] shadow-sm scrollbar-styled"
        style={{ maxHeight: 'calc(100vh - 6rem)' }}
      >
        {/* width:100% (no un ancho fijo en px) es lo que hace la grilla
            responsive: ocupa siempre el ancho real del contenedor. Cada
            columna de Proceso pesa proporcional al largo de su nombre (ver
            procColWidth) — si la ventana se achica más allá de lo que dan
            los MIN_COL_WIDTH de cada una, recién ahí aparece el scroll
            horizontal del contenedor de arriba, como último recurso. */}
        <table style={{ borderCollapse: 'collapse', tableLayout: 'fixed', width: '100%' }}>
          <colgroup>
            {fixedColWidths.map((w, i) => <col key={i} style={{ width: w }} />)}
            {visibleProcesses.map((p, i) => <col key={p.id} style={{ width: procColWidth(procWeights[i]) }} />)}
          </colgroup>
          <thead className="sticky top-0 z-20">
            <tr>
              <th
                className="sticky left-0 top-0 z-30 bg-[#f0f4ff] dark:bg-[#182544] text-left text-[10px] font-bold text-[#6b7280] dark:text-[#8890b5] uppercase tracking-wide"
                style={{
                  width: EMPRESA_COL_WIDTH, minWidth: EMPRESA_COL_WIDTH, verticalAlign: 'bottom', padding: '6px 8px 8px',
                  boxShadow: headerBoxShadow({ top: HEADER_ACCENT_BORDER, bottom: HEADER_ACCENT_BORDER, left: BORDER, right: BORDER_COL }),
                }}
              >
                Empresa
              </th>
              <NameFilterHeaderCell
                label="Responsable"
                width={RESPONSABLE_COL_WIDTH}
                left={EMPRESA_COL_WIDTH}
                onFilterClick={handleFilterIconClick}
                hasFilter={Boolean(columnFilters[RESPONSABLE_FILTER_KEY])}
                filterKey={RESPONSABLE_FILTER_KEY}
              />
              <NameFilterHeaderCell
                label="Contador"
                width={CONTADOR_COL_WIDTH}
                left={EMPRESA_COL_WIDTH + RESPONSABLE_COL_WIDTH}
                onFilterClick={handleFilterIconClick}
                hasFilter={Boolean(columnFilters[CONTADOR_FILTER_KEY])}
                filterKey={CONTADOR_FILTER_KEY}
              />
              {visibleProcesses.map((proc, idx) => (
                <ProcessHeaderCell
                  key={proc.id}
                  proc={proc}
                  editable={canEditStructure}
                  isFirst={idx === 0}
                  isLast={idx === visibleProcesses.length - 1}
                  onMoveLeft={() => moveProceso(proc.id, 'left')}
                  onMoveRight={() => moveProceso(proc.id, 'right')}
                  startEditProcess={openEditProcesoModal}
                  setDeleteConfirm={setDeleteConfirm}
                  onFilterClick={handleFilterIconClick}
                  hasFilter={Boolean(columnFilters[proc.id])}
                />
              ))}
            </tr>
          </thead>

          <tbody>
            {filteredCompanies.length === 0 && (
              <tr>
                <td colSpan={totalLeafColumns} className="text-center py-10 text-xs text-[#8890b5] dark:text-[#5a5f7a]">
                  {search || activeColumnFilterCount > 0
                    ? 'No hay empresas que coincidan con el filtro'
                    : 'No se encontraron empresas'}
                </td>
              </tr>
            )}
            {filteredCompanies.map((company, idx) => {
              const rowBg = idx % 2 === 0 ? '#ffffff' : '#f9fbff'
              return (
                <tr key={company.id} style={{ background: rowBg }}>
                  <td
                    className="sticky left-0 z-10"
                    style={{
                      width: EMPRESA_COL_WIDTH, minWidth: EMPRESA_COL_WIDTH, maxWidth: EMPRESA_COL_WIDTH,
                      background: rowBg, height: 36, padding: 0,
                      boxShadow: headerBoxShadow({ top: BORDER, bottom: BORDER, left: BORDER, right: BORDER_COL }),
                    }}
                  >
                    <div className="flex items-center h-full px-2 gap-1">
                      <span className="text-xs font-semibold text-[#191c1e] dark:text-[#e4e6f0] truncate flex-1 min-w-0" title={company.name}>
                        {company.name}
                      </span>
                      {company.activa === false && (
                        <span
                          className="text-[9px] font-bold px-1 py-0.5 rounded flex-shrink-0 uppercase tracking-wide"
                          style={{ background: '#fef2f2', color: '#ef4444' }}
                        >
                          Inactiva
                        </span>
                      )}
                      {canEditStructure && (
                        <div className="flex items-center gap-0.5 flex-shrink-0">
                          <button
                            onClick={() => openEditEmpresaModal(company)}
                            title="Editar empresa"
                            className="p-0.5 rounded hover:bg-[#e2e4ef] dark:hover:bg-[#252840] text-[#6b7280] hover:text-[#004ac6] transition"
                          >
                            <span className="material-symbols-outlined" style={{ fontSize: 13 }}>edit</span>
                          </button>
                          <button
                            onClick={() => setDeleteConfirm({ type: 'empresa', id: company.id, name: company.name })}
                            title="Eliminar empresa"
                            className="p-0.5 rounded hover:bg-[#e2e4ef] dark:hover:bg-[#252840] text-[#6b7280] hover:text-red-500 transition"
                          >
                            <span className="material-symbols-outlined" style={{ fontSize: 13 }}>delete</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </td>
                  <td
                    className="sticky z-10"
                    style={{
                      left: EMPRESA_COL_WIDTH,
                      width: RESPONSABLE_COL_WIDTH, minWidth: RESPONSABLE_COL_WIDTH, maxWidth: RESPONSABLE_COL_WIDTH,
                      background: rowBg, height: 36, padding: 0,
                      boxShadow: headerBoxShadow({ top: BORDER, bottom: BORDER, right: BORDER_COL }),
                    }}
                  >
                    <div className="flex items-center h-full px-2">
                      <span className="text-xs text-[#434655] dark:text-[#c4c8e8] truncate flex-1 min-w-0" title={company.responsableNombre ?? undefined}>
                        {firstName(company.responsableNombre) || <span className="text-[#c3c8dd] dark:text-[#5a5f7a]">—</span>}
                      </span>
                    </div>
                  </td>
                  <td
                    className="sticky z-10"
                    style={{
                      left: EMPRESA_COL_WIDTH + RESPONSABLE_COL_WIDTH,
                      width: CONTADOR_COL_WIDTH, minWidth: CONTADOR_COL_WIDTH, maxWidth: CONTADOR_COL_WIDTH,
                      background: rowBg, height: 36, padding: 0,
                      boxShadow: headerBoxShadow({ top: BORDER, bottom: BORDER, right: BORDER_COL }),
                    }}
                  >
                    <div className="flex items-center h-full px-2">
                      <span className="text-xs text-[#434655] dark:text-[#c4c8e8] truncate flex-1 min-w-0" title={company.contador ?? undefined}>
                        {company.contador || <span className="text-[#c3c8dd] dark:text-[#5a5f7a]">—</span>}
                      </span>
                    </div>
                  </td>
                  {visibleProcesses.map(proc => renderProcessCell(company, proc, rowBg))}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* ── Legend ───────────────────────────────────────────────────────── */}
      <div className="flex gap-5 flex-wrap items-center">
        {Object.entries(STATUS).map(([key, cfg]) => (
          <div key={key} className="flex items-center gap-1.5">
            <span className="material-symbols-outlined" style={{ color: cfg.color, fontSize: 16 }}>{cfg.icon}</span>
            <span className="text-xs text-[#6b7280] dark:text-[#8890b5]">{cfg.label}</span>
          </div>
        ))}
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-amber-400 inline-block" />
          <span className="text-xs text-[#6b7280] dark:text-[#8890b5]">Tiene nota</span>
        </div>
      </div>

      {/* ── Cell popup ───────────────────────────────────────────────────── */}
      {openCell && openProcess && (
        <div
          ref={dropdownRef}
          className="fixed z-50 bg-white dark:bg-[#1e2030] border border-[#e2e4ef] dark:border-[#2e3148] rounded-xl shadow-2xl p-4 w-64"
          style={{ left: openCell.left, top: openCell.top }}
        >
          <p className="text-[11px] font-bold text-[#191c1e] dark:text-[#e4e6f0] mb-3 truncate" title={openProcess.name}>
            {openProcess.name}
          </p>
          <div className="grid grid-cols-2 gap-1.5 mb-3">
            {Object.entries(STATUS).map(([key, cfg]) => (
              <button
                key={key}
                onClick={() => handleStatusChange(openCell.companyId, openCell.procId, key)}
                className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-semibold transition-all hover:scale-95 active:scale-90"
                style={{
                  background: openCellData.status === key ? cfg.bg : 'transparent',
                  color: cfg.color,
                  border: `1.5px solid ${openCellData.status === key ? cfg.color : '#e2e4ef'}`,
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 14 }}>{cfg.icon}</span>
                {cfg.label}
              </button>
            ))}
          </div>
          <textarea
            ref={noteTextareaRef}
            value={openCellData.note}
            onChange={e => {
              handleNoteChange(openCell.companyId, openCell.procId, e.target.value)
              e.target.style.height = 'auto'
              const h = Math.min(e.target.scrollHeight, 200)
              e.target.style.height = h + 'px'
              e.target.style.overflowY = h >= 200 ? 'auto' : 'hidden'
            }}
            onBlur={e => handleNoteBlur(openCell.companyId, openCell.procId, e.target.value)}
            placeholder="Nota opcional..."
            className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-[#e2e4ef] dark:border-[#2e3148] bg-[#f8f9fc] dark:bg-[#252840] text-[#191c1e] dark:text-[#e4e6f0] outline-none focus:ring-2 focus:ring-[#004ac6]/30 resize-none"
            style={{ minHeight: 52, overflowY: 'hidden' }}
          />
          <div className="mt-2 flex items-center gap-2">
            <button
              onClick={() => handleClearNote(openCell.companyId, openCell.procId)}
              disabled={!openCellData.note?.trim()}
              className="flex-1 py-1 text-xs text-red-500 hover:text-red-600 transition text-center disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:text-red-500"
            >
              Borrar nota
            </button>
            <button
              onClick={() => { flushPendingNote(); setOpenCell(null) }}
              className="flex-1 py-1 text-xs text-[#6b7280] hover:text-[#191c1e] dark:hover:text-[#e4e6f0] transition text-center"
            >
              Cerrar
            </button>
          </div>
        </div>
      )}

      {/* ── Filtro de columna (por estado, o por Responsable/Contador) ───── */}
      {openFilter && (
        <div
          ref={filterDropdownRef}
          className="fixed z-50 bg-white dark:bg-[#1e2030] border border-[#e2e4ef] dark:border-[#2e3148] rounded-xl shadow-2xl p-3 w-52"
          style={{ left: openFilter.left, top: openFilter.top }}
        >
          <div className="flex items-center justify-between gap-2 mb-2">
            <p className="text-[11px] font-bold text-[#191c1e] dark:text-[#e4e6f0] truncate flex-1 min-w-0" title={openFilter.label}>
              {openFilter.label}
            </p>
            {columnFilters[openFilter.key] && (
              <button
                onClick={() => clearColumnFilter(openFilter.key)}
                className="text-[10px] font-semibold text-[#004ac6] dark:text-[#7ba8f0] hover:underline flex-shrink-0"
              >
                Limpiar
              </button>
            )}
          </div>
          {(() => {
            const options = optionsForFilterKey(openFilter.key)
            const checkedCount = options.filter(k => isOptionChecked(openFilter.key, k)).length
            const allChecked = checkedCount === options.length
            const noneChecked = checkedCount === 0
            return (
              <button
                onClick={() => toggleSelectAllFilter(openFilter.key)}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs text-left transition hover:bg-[#f3f4f6] dark:hover:bg-[#252840] mb-1"
              >
                <span
                  className={`flex items-center justify-center rounded flex-shrink-0 ${noneChecked ? 'border-[#c3c6d7] dark:border-[#3e4260]' : ''}`}
                  style={{
                    width: 15, height: 15,
                    borderWidth: 1.5, borderStyle: 'solid',
                    borderColor: noneChecked ? undefined : '#004ac6',
                    background: noneChecked ? 'transparent' : '#004ac6',
                  }}
                >
                  {!noneChecked && (
                    <span className="material-symbols-outlined text-white" style={{ fontSize: 11 }}>
                      {allChecked ? 'check' : 'remove'}
                    </span>
                  )}
                </span>
                <span className="font-bold text-[#191c1e] dark:text-[#e4e6f0]">Seleccionar todo</span>
              </button>
            )
          })()}
          <div className="h-px bg-[#e2e4ef] dark:bg-[#2e3148] mb-1" />
          <div className="flex flex-col gap-0.5">
            {openFilter.kind === 'status' && Object.entries(STATUS).map(([key, cfg]) => {
              const checked = isOptionChecked(openFilter.key, key)
              return (
                <button
                  key={key}
                  onClick={() => toggleOptionFilter(openFilter.key, key)}
                  className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs text-left transition hover:bg-[#f3f4f6] dark:hover:bg-[#252840]"
                >
                  <span
                    className={`flex items-center justify-center rounded flex-shrink-0 ${!checked ? 'border-[#c3c6d7] dark:border-[#3e4260]' : ''}`}
                    style={{
                      width: 15, height: 15,
                      borderWidth: 1.5, borderStyle: 'solid',
                      borderColor: checked ? cfg.color : undefined,
                      background: checked ? cfg.color : 'transparent',
                    }}
                  >
                    {checked && <span className="material-symbols-outlined text-white" style={{ fontSize: 11 }}>check</span>}
                  </span>
                  <span className="material-symbols-outlined flex-shrink-0" style={{ color: cfg.color, fontSize: 14 }}>{cfg.icon}</span>
                  <span className="font-medium text-[#191c1e] dark:text-[#e4e6f0]">{cfg.label}</span>
                </button>
              )
            })}
            {openFilter.kind === 'name' && optionsForFilterKey(openFilter.key).map(value => {
              const checked = isOptionChecked(openFilter.key, value)
              return (
                <button
                  key={value}
                  onClick={() => toggleOptionFilter(openFilter.key, value)}
                  className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs text-left transition hover:bg-[#f3f4f6] dark:hover:bg-[#252840]"
                >
                  <span
                    className={`flex items-center justify-center rounded flex-shrink-0 ${!checked ? 'border-[#c3c6d7] dark:border-[#3e4260]' : ''}`}
                    style={{
                      width: 15, height: 15,
                      borderWidth: 1.5, borderStyle: 'solid',
                      borderColor: checked ? '#004ac6' : undefined,
                      background: checked ? '#004ac6' : 'transparent',
                    }}
                  >
                    {checked && <span className="material-symbols-outlined text-white" style={{ fontSize: 11 }}>check</span>}
                  </span>
                  <span className="font-medium text-[#191c1e] dark:text-[#e4e6f0] truncate">{value}</span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Note tooltip — Excel-style, resizable ────────────────────────── */}
      {tooltip && (
        <div
          className="fixed z-[60] shadow-lg text-xs text-[#1f1f1f] select-text"
          style={{
            left: tooltip.left, top: tooltip.top, width: tooltipSize.width, height: tooltipSize.height,
            pointerEvents: 'auto', background: '#fffef7', border: '1px solid #c8b800', borderRadius: 3,
          }}
          onMouseEnter={() => clearTimeout(hideTimerRef.current)}
          onMouseLeave={scheduleHide}
        >
          <div className="w-full h-full overflow-y-auto whitespace-pre-wrap leading-relaxed p-2 pr-3">
            {tooltip.content}
          </div>
          <div
            onMouseDown={startResize}
            style={{
              position: 'absolute', bottom: 0, right: 0, width: 0, height: 0,
              borderStyle: 'solid', borderWidth: '0 0 14px 14px',
              borderColor: 'transparent transparent #c8b800 transparent',
              cursor: 'se-resize', pointerEvents: 'auto',
            }}
          />
        </div>
      )}

      {/* ── Crear / editar proceso ───────────────────────────────────────── */}
      {procesoModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={closeProcesoModal}>
          <div
            className="bg-white dark:bg-[#1e2030] rounded-2xl shadow-2xl p-6 w-full max-w-sm mx-4 border border-[#e2e4ef] dark:border-[#2e3148]"
            onClick={e => e.stopPropagation()}
          >
            <p className="text-sm font-semibold text-[#191c1e] dark:text-[#e4e6f0] mb-4">
              {procesoModal.mode === 'create' ? 'Nuevo proceso' : 'Editar proceso'}
            </p>
            <label className="block text-xs font-semibold text-[#6b7280] dark:text-[#8890b5] mb-1">Nombre</label>
            <input
              autoFocus
              value={procesoModal.name}
              onChange={e => setProcesoModal(m => ({ ...m, name: e.target.value }))}
              onKeyDown={e => { if (e.key === 'Enter') submitProcesoModal() }}
              className="w-full px-3 py-2 mb-5 text-sm rounded-lg border border-[#e2e4ef] dark:border-[#2e3148] outline-none focus:border-[#004ac6] bg-white dark:bg-[#252840] text-[#191c1e] dark:text-[#e4e6f0]"
            />
            <div className="flex gap-2">
              <button
                onClick={closeProcesoModal}
                className="flex-1 py-2 text-xs font-semibold rounded-lg border border-[#e2e4ef] dark:border-[#2e3148] text-[#6b7280] hover:bg-[#f3f4f6] dark:hover:bg-[#252840] transition"
              >
                Cancelar
              </button>
              <button
                onClick={submitProcesoModal}
                disabled={!procesoModal.name.trim()}
                className="flex-1 py-2 text-xs font-semibold rounded-lg text-white transition disabled:opacity-40"
                style={{ background: '#004ac6' }}
              >
                {procesoModal.mode === 'create' ? 'Crear' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Crear / editar empresa ──────────────────────────────────────── */}
      {empresaModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={closeEmpresaModal}>
          <div
            className="bg-white dark:bg-[#1e2030] rounded-2xl shadow-2xl p-6 w-full max-w-sm mx-4 border border-[#e2e4ef] dark:border-[#2e3148]"
            onClick={e => e.stopPropagation()}
          >
            <p className="text-sm font-semibold text-[#191c1e] dark:text-[#e4e6f0] mb-4">
              {empresaModal.mode === 'create' ? 'Nueva empresa' : 'Editar empresa'}
            </p>

            <label className="block text-xs font-semibold text-[#6b7280] dark:text-[#8890b5] mb-1">Nombre</label>
            <input
              autoFocus
              value={empresaModal.name}
              onChange={e => setEmpresaModal(m => ({ ...m, name: e.target.value }))}
              onKeyDown={e => { if (e.key === 'Enter') submitEmpresaModal() }}
              placeholder="Ej. AGROESANA"
              className="w-full px-3 py-2 mb-4 text-sm rounded-lg border border-[#e2e4ef] dark:border-[#2e3148] outline-none focus:border-[#004ac6] bg-white dark:bg-[#252840] text-[#191c1e] dark:text-[#e4e6f0]"
            />

            <label className="block text-xs font-semibold text-[#6b7280] dark:text-[#8890b5] mb-1">Responsable</label>
            <select
              value={empresaModal.responsableId}
              onChange={e => setEmpresaModal(m => ({ ...m, responsableId: e.target.value }))}
              className="w-full px-3 py-2 mb-4 text-sm rounded-lg border border-[#e2e4ef] dark:border-[#2e3148] outline-none focus:border-[#004ac6] bg-white dark:bg-[#252840] text-[#191c1e] dark:text-[#e4e6f0]"
            >
              <option value="">Sin asignar</option>
              {members.map(m => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>

            <label className="block text-xs font-semibold text-[#6b7280] dark:text-[#8890b5] mb-1">Contador</label>
            <input
              value={empresaModal.contador}
              onChange={e => setEmpresaModal(m => ({ ...m, contador: e.target.value }))}
              onKeyDown={e => { if (e.key === 'Enter') submitEmpresaModal() }}
              placeholder="Ej. Fernando"
              list="ext-contador-options"
              className="w-full px-3 py-2 mb-4 text-sm rounded-lg border border-[#e2e4ef] dark:border-[#2e3148] outline-none focus:border-[#004ac6] bg-white dark:bg-[#252840] text-[#191c1e] dark:text-[#e4e6f0]"
            />
            <datalist id="ext-contador-options">
              {contadorOptions.filter(v => v !== SIN_ASIGNAR).map(v => <option key={v} value={v} />)}
            </datalist>

            {empresaModal.mode === 'edit' && (
              <>
                <label className="block text-xs font-semibold text-[#6b7280] dark:text-[#8890b5] mb-1">Estado</label>
                <button
                  type="button"
                  onClick={() => setEmpresaModal(m => ({ ...m, activa: !m.activa }))}
                  className="flex items-center gap-1.5 px-3 py-1.5 mb-5 rounded-lg text-xs font-semibold border-2 transition-all"
                  style={{
                    borderColor: empresaModal.activa ? '#16a34a' : '#e2e4ef',
                    background:  empresaModal.activa ? '#f0fdf4' : 'transparent',
                    color:       empresaModal.activa ? '#16a34a' : '#6b7280',
                  }}
                >
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: empresaModal.activa ? '#16a34a' : '#d1d5db' }} />
                  {empresaModal.activa ? 'Activa' : 'Inactiva'}
                </button>
              </>
            )}

            <div className="flex gap-2">
              <button
                onClick={closeEmpresaModal}
                className="flex-1 py-2 text-xs font-semibold rounded-lg border border-[#e2e4ef] dark:border-[#2e3148] text-[#6b7280] hover:bg-[#f3f4f6] dark:hover:bg-[#252840] transition"
              >
                Cancelar
              </button>
              <button
                onClick={submitEmpresaModal}
                disabled={!empresaModal.name.trim()}
                className="flex-1 py-2 text-xs font-semibold rounded-lg text-white transition disabled:opacity-40"
                style={{ background: '#004ac6' }}
              >
                {empresaModal.mode === 'create' ? 'Crear' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete confirmation ───────────────────────────────────────────── */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={() => setDeleteConfirm(null)}>
          <div
            className="bg-white dark:bg-[#1e2030] rounded-2xl shadow-2xl p-6 max-w-xs mx-4 border border-[#e2e4ef] dark:border-[#2e3148]"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-3">
              <span className="material-symbols-outlined text-red-500 text-2xl">warning</span>
              <p className="text-sm font-semibold text-[#191c1e] dark:text-[#e4e6f0]">
                ¿Eliminar {deleteConfirm.type === 'empresa' ? 'empresa' : 'proceso'}?
              </p>
            </div>
            <p className={`text-xs text-[#6b7280] dark:text-[#8890b5] truncate ${deleteConfirm.type === 'empresa' ? 'mb-1' : 'mb-4'}`}>
              &ldquo;{deleteConfirm.name}&rdquo;
            </p>
            {deleteConfirm.type === 'empresa' && (
              <p className="text-xs text-[#6b7280] dark:text-[#8890b5] mb-3">
                Esta acción borra también su historial de checklist.
              </p>
            )}
            <div className="flex gap-2">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="flex-1 py-2 text-xs font-semibold rounded-lg border border-[#e2e4ef] dark:border-[#2e3148] text-[#6b7280] hover:bg-[#f3f4f6] dark:hover:bg-[#252840] transition"
              >
                Cancelar
              </button>
              <button
                onClick={confirmDelete}
                className="flex-1 py-2 text-xs font-semibold rounded-lg text-white bg-red-500 hover:bg-red-600 transition"
              >
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
