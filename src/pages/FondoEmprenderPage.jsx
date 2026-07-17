import { useState, useEffect, useRef, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
  useDroppable,
} from '@dnd-kit/core'
import { SortableContext, useSortable, horizontalListSortingStrategy, arrayMove } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { migrateLegacyLocalStorage, getMigrationReport, dismissMigrationReport, getMesVencidoHabilitado, resolveMesInicial } from '../data/fondoEmprender'
import { api } from '../services/api'
import { useSocket } from '../context/SocketContext'
import { useAuth } from '../context/AuthContext'

// ─── page-level constants ─────────────────────────────────────────────────────

// Sentinel para el contenedor de "sin grupo" en el drag & drop — no es un
// grupo real en la base de datos, solo el id que usa el DndContext para
// identificar la zona de procesos sueltos.
const SIN_GRUPO_ID = '__sin_grupo__'

const STATUS = {
  pending:     { label: 'Pendiente',  icon: 'radio_button_unchecked', color: '#6b7280', bg: '#f3f4f6' },
  in_progress: { label: 'En proceso', icon: 'timelapse',              color: '#d97706', bg: '#fef9c3' },
  done:        { label: 'Hecho',      icon: 'check_circle',           color: '#16a34a', bg: '#dcfce7' },
  na:          { label: 'N/A',        icon: 'do_not_disturb_on',      color: '#0ea5e9', bg: '#e0f2fe' },
}

const MONTHS = [
  'Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre',
]

const BORDER     = '1px solid #e2e4ef' // separador horizontal (entre filas), sutil a propósito
const BORDER_COL = '1px solid #d5d9ea' // separador vertical entre columnas — un poco más visible que el horizontal

const COL_WIDTH = 48

// Convierte un string de borde ("1px solid #hex") en un segmento de
// box-shadow inset para ese lado. Los headers viven dentro de un <thead>
// sticky con la tabla en border-collapse — esa combinación tiene un bug de
// Chrome donde los bordes de las celdas se "pierden" al hacer scroll (se
// pintan mal, no es que se muevan). box-shadow es una capa de pintado
// totalmente aparte del border-collapse de la tabla, así que no le pasa lo
// mismo — por eso los headers arman su borde así en vez de con `border`.
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

// Alto de la franja de grupo (fila 1 del header).
const GROUP_ROW_HEIGHT = 34
// Alto del header de cada columna (nombre en vertical). Medido a mano (con
// Chrome headless) contra el nombre más largo real, "Egreso Seguridad
// Social" — a 155px entra completo tanto en vista normal (11px) como en
// modo edición (10px, con el handle/franja de acciones recortados a la
// medida justa para que también entre ahí).
const HEADER_HEIGHT = 155

// Paleta por grupo — se cicla por índice (grupo 0, 1, 2…). Reusa exactamente
// los mismos tonos que ya usa el resto de la app para distinguir categorías
// (la insignia Contable/Tributario de FondoEmprenderEmpresasPage: fondo casi
// blanco + texto de color, nunca un relleno sólido) en vez de inventar
// colores nuevos — así se siente parte del mismo sistema, no algo pegado
// encima. `accent` es el color plano para bordes (no hay forma de expresar
// eso como clase de Tailwind).
// Clases completas (no interpoladas) para que Tailwind las detecte al escanear el archivo.
const GROUP_PALETTE = [
  { bg: 'bg-[#f0f4ff] dark:bg-[#182544]', text: 'text-[#004ac6] dark:text-[#7ba8f0]', accent: '#004ac6' },
  { bg: 'bg-[#f0fdf4] dark:bg-[#0d2e1a]', text: 'text-[#16a34a] dark:text-[#4ade80]', accent: '#16a34a' },
  { bg: 'bg-[#fffbeb] dark:bg-[#2e2410]', text: 'text-[#d97706] dark:text-[#fbbf24]', accent: '#d97706' },
]

const emptyCell = { status: 'pending', note: '' }

// año*12+mes da un entero comparable — evita comparar año y mes por separado
// para saber si (year, month) cae dentro del rango de vigencia de un proceso.
const monthKey = (anio, mes) => anio * 12 + mes

function isVigente(proc, year, month) {
  const key = monthKey(year, month)
  if (proc.vigenteDesde && key < monthKey(proc.vigenteDesde.anio, proc.vigenteDesde.mes)) return false
  if (proc.vigenteHasta && key > monthKey(proc.vigenteHasta.anio, proc.vigenteHasta.mes)) return false
  return true
}

// Suma `n` meses (n=0 → el mismo mes) a un (año, mes), con acarreo de año.
function addMonths(year, month, n) {
  const total = (year * 12 + (month - 1)) + n
  return { anio: Math.floor(total / 12), mes: (total % 12) + 1 }
}

// ─── header sub-components ─────────────────────────────────────────────────
// Extraídos porque cada uno necesita su propio hook de dnd-kit
// (useSortable/useDroppable no se pueden llamar dentro de un .map inline).

function SortableProcessHeader({ proc, rowSpan, editable, groupColor, hasTopBorder = true, startEditProcess, setDeleteConfirm }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: proc.id, disabled: !editable })
  // Mismo fondo y texto gris neutro de siempre, agrupada o no — el color del
  // grupo ya se ve arriba, en su franja. Acá solo se hereda un filo de color
  // abajo, como una línea que conecta visualmente con esa franja, sin que
  // cada columna individual sea un bloque de color aparte.
  //
  // Cada celda dibuja solo su propio borde derecho (nunca el izquierdo) — la
  // celda vecina de la izquierda ya lo puso. Declarar los dos lados de una
  // misma línea compartida (como hacía antes) hace que se dibuje dos veces
  // encimada y se vea borrosa/gruesa en vez de una línea limpia.
  const textClass = 'text-[#6b7280] dark:text-[#8890b5]'
  return (
    <th
      ref={setNodeRef}
      rowSpan={rowSpan}
      title={proc.name}
      className="bg-[#f8f9fc] dark:bg-[#1a1d2e]"
      style={{
        width: COL_WIDTH, minWidth: COL_WIDTH, padding: 0,
        boxShadow: headerBoxShadow({
          top: hasTopBorder ? BORDER : null,
          bottom: groupColor ? `3px solid ${groupColor.accent}` : BORDER,
          right: BORDER_COL,
        }),
        transform: CSS.Transform.toString(transform), transition,
        opacity: isDragging ? 0.4 : 1,
      }}
    >
      {!editable ? (
        // Vista normal — solo el nombre, sin ningún control. Nada de hover,
        // nada que arrastrar: eso queda reservado al modo "Editar estructura".
        <div
          className={`text-[11px] font-semibold flex items-center ${textClass}`}
          style={{
            height: HEADER_HEIGHT,
            writingMode: 'vertical-lr',
            transform: 'rotate(180deg)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            padding: '8px 12px',
          }}
        >
          {proc.name}
        </div>
      ) : (
        // Modo edición — franjas fijas arriba (arrastrar) y abajo (acciones),
        // siempre visibles, para no depender de hover (eso era lo que
        // trababa el drag: el overlay competía con el handle).
        <div className="flex flex-col" style={{ height: HEADER_HEIGHT }}>
          <div
            {...attributes}
            {...listeners}
            className="flex items-center justify-center cursor-grab active:cursor-grabbing hover:brightness-95 dark:hover:brightness-125 transition flex-shrink-0"
            style={{ height: 12 }}
            title="Arrastrar para reordenar"
          >
            <span className={`material-symbols-outlined ${textClass}`} style={{ fontSize: 12, transform: 'rotate(90deg)' }}>
              drag_indicator
            </span>
          </div>
          <div
            className={`text-[10px] font-semibold flex items-center justify-center flex-1 min-h-0 ${textClass}`}
            style={{
              writingMode: 'vertical-lr',
              transform: 'rotate(180deg)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              padding: '1px 12px',
            }}
          >
            {proc.name}
          </div>
          <div className="flex items-center justify-center gap-0.5 flex-shrink-0" style={{ height: 16 }}>
            <button
              onClick={() => startEditProcess(proc)}
              className="p-0.5 rounded hover:bg-[#e2e4ef] dark:hover:bg-[#252840] text-[#6b7280] hover:text-[#004ac6] transition"
              title="Editar nombre"
            >
              <span className="material-symbols-outlined" style={{ fontSize: 12 }}>edit</span>
            </button>
            <button
              onClick={() => setDeleteConfirm({ type: 'proceso', id: proc.id, name: proc.name })}
              className="p-0.5 rounded hover:bg-[#e2e4ef] dark:hover:bg-[#252840] text-[#6b7280] hover:text-red-500 transition"
              title="Eliminar"
            >
              <span className="material-symbols-outlined" style={{ fontSize: 12 }}>delete</span>
            </button>
          </div>
        </div>
      )}
    </th>
  )
}

// Cabecera de fila 1 para un grupo: colSpan sobre sus columnas hijas (o una
// sola celda angosta si está colapsado o todavía no tiene procesos). Es
// droppable para poder soltar un proceso directo sobre el grupo (agregarlo
// al final, o ser el primero si el grupo está vacío/colapsado).
function GroupHeaderCell({ grupo, procesos, collapsed, editable, paletteIndex, onToggleCollapse, editingGroup, setEditingGroup, editGroupName, setEditGroupName, saveEditGroup, startEditGroup, setDeleteConfirm }) {
  const { setNodeRef, isOver } = useDroppable({ id: grupo.id, disabled: !editable })
  const isEditing = editingGroup?.id === grupo.id
  const showAsSingleCell = collapsed || procesos.length === 0
  const palette = GROUP_PALETTE[paletteIndex % GROUP_PALETTE.length]

  return (
    <th
      ref={setNodeRef}
      colSpan={showAsSingleCell ? 1 : procesos.length}
      rowSpan={showAsSingleCell ? 2 : 1}
      className={`overflow-hidden ${palette.bg}`}
      style={{
        width: showAsSingleCell ? COL_WIDTH : procesos.length * COL_WIDTH,
        maxWidth: showAsSingleCell ? COL_WIDTH : procesos.length * COL_WIDTH,
        // El acento de color va solo arriba, como el borde de color de las
        // tarjetas de resumen (StatsCard) — el resto de los bordes son los
        // grises normales de la tabla, para que el grupo se lea como parte
        // de la misma grilla y no como un bloque plantado encima. Sin
        // izquierda: la celda anterior (Empresa u otro grupo) ya puso su
        // propio borde derecho ahí — declarar los dos duplica la línea.
        boxShadow: headerBoxShadow({ top: `4px solid ${palette.accent}`, bottom: BORDER, right: BORDER_COL }),
        padding: 0, overflow: 'hidden',
        outline: isOver ? `2px solid ${palette.accent}` : 'none', outlineOffset: -2,
      }}
    >
      {isEditing ? (
        <div style={{ height: showAsSingleCell ? 120 : GROUP_ROW_HEIGHT, display: 'flex', alignItems: 'center', padding: '0 4px' }}>
          <input
            autoFocus
            value={editGroupName}
            onChange={e => setEditGroupName(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') saveEditGroup()
              if (e.key === 'Escape') setEditingGroup(null)
            }}
            onBlur={saveEditGroup}
            className="w-full px-1 py-0.5 text-[11px] rounded border border-[#004ac6] outline-none bg-white dark:bg-[#252840] text-[#191c1e] dark:text-[#e4e6f0]"
          />
        </div>
      ) : showAsSingleCell ? (
        // Colapsado o vacío — mismo ancho angosto que una sub-columna,
        // nombre en vertical (como un proceso suelto) para no forzar ancho.
        <button
          onClick={onToggleCollapse}
          className="relative w-full flex items-center justify-center"
          style={{ height: 120, width: COL_WIDTH }}
          title={procesos.length === 0 ? `${grupo.name} (sin procesos)` : `${grupo.name} — clic para expandir`}
        >
          <span
            className={`text-[12px] font-bold ${palette.text}`}
            style={{ writingMode: 'vertical-lr', transform: 'rotate(180deg)', whiteSpace: 'nowrap', overflow: 'hidden' }}
          >
            {grupo.name}{procesos.length > 0 ? ` (${procesos.length})` : ''}
          </span>
        </button>
      ) : (
        <div className="flex items-center gap-1 px-2" style={{ height: GROUP_ROW_HEIGHT }}>
          <button onClick={onToggleCollapse} className={`flex-shrink-0 hover:opacity-70 transition ${palette.text}`} title="Colapsar grupo">
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>expand_less</span>
          </button>
          <span className={`text-[14px] font-bold flex-1 min-w-0 truncate text-center ${palette.text}`} title={grupo.name}>{grupo.name}</span>
          {/* En modo edición las acciones quedan siempre visibles (no en hover)
              para no repetir el problema del handle de arrastre tapado. */}
          {editable && (
            <div className="flex items-center gap-0.5 flex-shrink-0">
              <button
                onClick={() => startEditGroup(grupo)}
                className={`p-0.5 rounded hover:bg-white/60 dark:hover:bg-black/20 transition ${palette.text}`}
                title="Renombrar grupo"
              >
                <span className="material-symbols-outlined" style={{ fontSize: 14 }}>edit</span>
              </button>
              <button
                onClick={() => setDeleteConfirm({ type: 'grupo', id: grupo.id, name: grupo.name })}
                className="p-0.5 rounded hover:bg-white/60 dark:hover:bg-black/20 text-red-500 transition"
                title="Eliminar grupo (los procesos quedan sin grupo)"
              >
                <span className="material-symbols-outlined" style={{ fontSize: 14 }}>delete</span>
              </button>
            </div>
          )}
        </div>
      )}
    </th>
  )
}

// ─── component ───────────────────────────────────────────────────────────────

export default function FondoEmprenderPage() {
  const { socket } = useSocket()
  const { isAdmin } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()

  // Estructura (grupos/procesos: crear, renombrar, borrar, mover, arrastrar)
  // — solo el admin puede tocarla, y solo cuando activa este modo. Todos los
  // demás ven siempre la tabla de solo lectura, sin controles ni handles.
  const [editMode, setEditMode] = useState(false)
  const canEditStructure = isAdmin() && editMode

  // ── state ────────────────────────────────────────────────────────────────
  // month/year se inicializan desde la URL (si viene y está dentro del mes
  // habilitado) para que un reload conserve la posición; si no, caen al mes
  // habilitado (nunca a "hoy", que puede estar bloqueado por mes vencido).
  const [mesInicial]                = useState(() => resolveMesInicial(searchParams))
  const [month, setMonth]           = useState(mesInicial.month)
  const [year, setYear]             = useState(mesInicial.year)
  const [processes, setProcesses]   = useState([])
  const [companies, setCompanies]   = useState([])
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState(null)
  const [migrationReport, setMigrationReport] = useState(() => getMigrationReport())

  // grupos de columnas (agrupar procesos relacionados)
  const [grupos, setGrupos] = useState([])
  const [addingGroup, setAddingGroup] = useState(false)
  const [newGroupName, setNewGroupName] = useState('')
  const [editingGroup, setEditingGroup] = useState(null) // { id, oldName }
  const [editGroupName, setEditGroupName] = useState('')
  // Colapsar/expandir es solo una preferencia visual de este navegador, no
  // se sincroniza entre usuarios — no tiene sentido de "dato" que valga la
  // pena persistir en el backend.
  const [collapsedGroupIds, setCollapsedGroupIds] = useState(() => {
    try {
      return new Set(JSON.parse(localStorage.getItem('fondoSeguimientoGruposColapsados') ?? '[]'))
    } catch {
      return new Set()
    }
  })
  const [activeDragProc, setActiveDragProc] = useState(null)

  // cell popup
  const [openCell, setOpenCell]     = useState(null)  // { companyId, procId, left, top }
  const dropdownRef    = useRef(null)
  const noteTextareaRef = useRef(null)
  const openCellRef    = useRef(openCell)   // lets effects read the latest openCell without re-subscribing
  openCellRef.current  = openCell
  const noteDirtyRef   = useRef(false)      // true while the open textarea has unsaved keystrokes

  // tooltip for notes (Excel-style, resizable, per-cell size)
  const [tooltip, setTooltip]         = useState(null)
  const [tooltipSize, setTooltipSize] = useState({ width: 220, height: 80 })
  const hideTimerRef    = useRef(null)
  const tooltipSizeRef  = useRef(tooltipSize)
  const tooltipKeyRef   = useRef(null)        // key of the cell whose size is active
  tooltipSizeRef.current = tooltipSize        // kept in sync on every render

  // add / edit process — un solo modal para ambos casos (ver procesoModal
  // más abajo), en vez de inputs sueltos por header. mode: 'create' | 'edit',
  // hastaMode: 'siempre' | 'esteMes' | 'porMeses'.
  const [procesoModal, setProcesoModal] = useState(null)

  // delete confirmation (proceso o grupo — empresas se editan/eliminan desde Empresas)
  const [deleteConfirm, setDeleteConfirm] = useState(null) // { type: 'proceso' | 'grupo', id, name }

  // filters: category tabs + search
  const [search, setSearch]       = useState('')
  const [activeTab, setActiveTab] = useState('todas')

  const refetchTimerRef = useRef(null)

  // ── load grid from backend ──────────────────────────────────────────────

  const fetchGrid = useCallback(async () => {
    try {
      setError(null)
      const [empresas, procesos, checklistsPorEmpresa, gruposData] = await Promise.all([
        api.getFondoEmpresas(),
        api.getFondoProcesos(),
        api.getFondoChecklistMes(year, month + 1),
        api.getFondoProcesoGrupos(),
      ])
      setGrupos(gruposData)

      // One-time, best-effort recovery of whatever is still stuck in
      // localStorage from before the grid was wired to the backend.
      await migrateLegacyLocalStorage(api, empresas, procesos)
      setMigrationReport(getMigrationReport())

      const checklistPorEmpresaId = new Map(
        checklistsPorEmpresa.map(c => [c.empresaId, c])
      )

      const built = empresas.map((e) => {
        const chk = checklistPorEmpresaId.get(e.id) ?? { items: [], confirmed: false, confirmedAt: null, enviado: false, enviadoAt: null }
        const cells = {}
        chk.items.forEach(it => { cells[it.id] = { status: it.estado, note: it.nota ?? '' } })
        return {
          id: e.id,
          name: e.name,
          categoria: e.categoria,
          cells,
          confirmed: chk.confirmed
            ? { date: (chk.confirmedAt ?? new Date().toISOString()).slice(0, 10) }
            : null,
          enviado: chk.enviado
            ? { date: (chk.enviadoAt ?? new Date().toISOString()).slice(0, 10) }
            : null,
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

  // Single place that persists a note to the backend. Used both by the
  // textarea's onBlur and by flushPendingNote() below.
  const saveNote = useCallback(async (companyId, procId, note) => {
    noteDirtyRef.current = false
    try {
      await api.updateFondoChecklistItem(companyId, procId, year, month + 1, { nota: note || null })
    } catch (err) {
      console.error('Error al guardar nota:', err.message)
      fetchGrid()
    }
  }, [year, month, fetchGrid])

  // A refetch (window focus, another user's edit) replaces `companies`
  // wholesale. If the note popup is open with unsaved keystrokes, that
  // refetch would silently revert them — save first so nothing is lost.
  const flushPendingNote = useCallback(() => {
    const oc = openCellRef.current
    if (!oc || !noteDirtyRef.current || !noteTextareaRef.current) return Promise.resolve()
    return saveNote(oc.companyId, oc.procId, noteTextareaRef.current.value)
  }, [saveNote])

  useEffect(() => { setLoading(true); fetchGrid() }, [fetchGrid])

  useEffect(() => {
    localStorage.setItem('fondoSeguimientoGruposColapsados', JSON.stringify([...collapsedGroupIds]))
  }, [collapsedGroupIds])

  // Refresh on window focus (catches changes made in another tab)
  useEffect(() => {
    const onFocus = () => { flushPendingNote().then(fetchGrid) }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [fetchGrid, flushPendingNote])

  // Refresh (debounced) when another user edits the same month, or the
  // company list changes — debounced so a burst of edits from one user
  // doesn't trigger a full-grid refetch storm for everyone else.
  useEffect(() => {
    if (!socket) return
    const handler = (payload) => {
      if (payload?.tipo === 'checklist' && (payload.anio !== year || payload.mes !== month + 1)) return
      clearTimeout(refetchTimerRef.current)
      refetchTimerRef.current = setTimeout(() => { flushPendingNote().then(fetchGrid) }, 1200)
    }
    socket.on('empresa:updated', handler)
    return () => {
      socket.off('empresa:updated', handler)
      clearTimeout(refetchTimerRef.current)
    }
  }, [socket, year, month, fetchGrid, flushPendingNote])

  // Auto-resize textarea when popup opens; overflow only at max height
  useEffect(() => {
    const ta = noteTextareaRef.current
    if (!ta) return
    ta.style.height = 'auto'
    const h = Math.min(ta.scrollHeight, 200)
    ta.style.height = h + 'px'
    ta.style.overflowY = h >= 200 ? 'auto' : 'hidden'
  }, [openCell])

  // Close cell popup on outside click. Flush first: if the popup unmounts
  // before the textarea's native blur fires, the keystroke would be lost.
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

  // ── month nav ────────────────────────────────────────────────────────────
  // Seguimiento Mensual es de mes vencido: no se puede navegar más allá del
  // mes calendario anterior (el mes en curso todavía no ha "vencido").
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
    // Bloquea siempre que el DESTINO exceda el mes habilitado, sin importar
    // en qué mes se esté parado ahora (evita quedar "más allá" y poder
    // seguir avanzando libremente).
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
    try {
      await api.updateFondoChecklistItem(companyId, procId, year, month + 1, { estado: status })
    } catch (err) {
      console.error('Error al guardar estado:', err.message)
      fetchGrid()
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

  // ── company actions ──────────────────────────────────────────────────────

  async function toggleConfirmed(companyId) {
    const company = companies.find(c => c.id === companyId)
    const newConfirmed = !company?.confirmed
    const previousConfirmed = company?.confirmed ?? null
    const previousEnviado = company?.enviado ?? null

    // Revertir la confirmación también revierte el envío (el backend hace
    // la misma cascada) — no puede quedar "enviada" una contabilidad que ya
    // no está confirmada.
    setCompanies(prev =>
      prev.map(c =>
        c.id === companyId
          ? {
              ...c,
              confirmed: newConfirmed ? { date: new Date().toISOString().slice(0, 10) } : null,
              enviado: newConfirmed ? c.enviado : null,
            }
          : c
      )
    )

    try {
      const result = await api.updateFondoChecklistConfirmado(companyId, year, month + 1, { confirmed: newConfirmed })
      setCompanies(prev =>
        prev.map(c =>
          c.id === companyId
            ? {
                ...c,
                confirmed: result.confirmed ? { date: (result.confirmedAt ?? new Date().toISOString()).slice(0, 10) } : null,
                enviado: result.enviado ? { date: (result.enviadoAt ?? new Date().toISOString()).slice(0, 10) } : null,
              }
            : c
        )
      )
    } catch (err) {
      setCompanies(prev => prev.map(c => c.id === companyId ? { ...c, confirmed: previousConfirmed, enviado: previousEnviado } : c))
      console.error('Error al confirmar contabilidad:', err.message)
    }
  }

  async function toggleEnviado(companyId) {
    const company = companies.find(c => c.id === companyId)
    const newEnviado = !company?.enviado
    const previous = company?.enviado ?? null

    setCompanies(prev =>
      prev.map(c =>
        c.id === companyId
          ? { ...c, enviado: newEnviado ? { date: new Date().toISOString().slice(0, 10) } : null }
          : c
      )
    )

    try {
      const result = await api.updateFondoChecklistEnviado(companyId, year, month + 1, { enviado: newEnviado })
      setCompanies(prev =>
        prev.map(c =>
          c.id === companyId
            ? { ...c, enviado: result.enviado ? { date: (result.enviadoAt ?? new Date().toISOString()).slice(0, 10) } : null }
            : c
        )
      )
    } catch (err) {
      setCompanies(prev => prev.map(c => c.id === companyId ? { ...c, enviado: previous } : c))
      console.error('Error al marcar como enviada:', err.message)
    }
  }

  // ── tooltip helpers ──────────────────────────────────────────────────────

  function loadCellTooltipSize(cellKey) {
    try {
      const s = localStorage.getItem(`noteTooltipSize_${cellKey}`)
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
        localStorage.setItem(`noteTooltipSize_${key}`, JSON.stringify(tooltipSizeRef.current))
      }
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  // ── process (column) actions ─────────────────────────────────────────────
  // Un solo modal para crear y editar procesos — ambos casos necesitan
  // elegir "¿hasta cuándo aplica?", así que comparten la misma UI.

  function openCreateProcesoModal() {
    setProcesoModal({ mode: 'create', id: null, name: '', hastaMode: 'siempre', porMeses: 3 })
  }

  function openEditProcesoModal(proc) {
    setProcesoModal({ mode: 'edit', id: proc.id, name: proc.name, hastaMode: 'siempre', porMeses: 3 })
  }

  function closeProcesoModal() {
    setProcesoModal(null)
  }

  // `month` (state) es 0-indexed (Enero=0), como el resto de la página — pero
  // vigente_desde/hasta.mes en la base es 1-12, igual que en todo fondo_*.
  function computeVigenteHasta(hastaMode, porMeses) {
    if (hastaMode === 'esteMes') return { anio: year, mes: month + 1 }
    if (hastaMode === 'porMeses') return addMonths(year, month + 1, Math.max(1, porMeses || 1) - 1)
    return null // 'siempre'
  }

  async function submitProcesoModal() {
    const modal = procesoModal
    const name = modal?.name.trim()
    if (!modal || !name) return
    setProcesoModal(null)

    const vigenteHasta = computeVigenteHasta(modal.hastaMode, modal.porMeses)

    if (modal.mode === 'create') {
      try {
        const created = await api.createFondoProceso({
          name,
          vigenteDesde: { anio: year, mes: month + 1 },
          vigenteHasta,
        })
        setProcesses(prev => [...prev, created])
      } catch (err) {
        alert('Error al crear proceso: ' + err.message)
      }
      return
    }

    // mode === 'edit'
    const previous = processes.find(p => p.id === modal.id)
    if (!previous) return
    setProcesses(prev => prev.map(p => p.id === modal.id ? { ...p, name, vigenteHasta } : p))
    try {
      await api.updateFondoProceso(modal.id, { name, vigenteHasta })
    } catch (err) {
      setProcesses(prev => prev.map(p => p.id === modal.id ? previous : p))
      alert('Error al editar proceso: ' + err.message)
    }
  }

  async function confirmDelete() {
    if (!deleteConfirm) return
    const { type, id } = deleteConfirm
    setDeleteConfirm(null)
    if (type === 'grupo') {
      try {
        // Un grupo no tiene historial propio — se borra de verdad. Sus
        // procesos quedan sin grupo (el backend hace el ON DELETE SET NULL).
        await api.deleteFondoProcesoGrupo(id)
        setGrupos(prev => prev.filter(g => g.id !== id))
        setProcesses(prev => prev.map(p => p.grupoId === id ? { ...p, grupoId: null } : p))
      } catch (err) {
        alert('Error al eliminar grupo: ' + err.message)
      }
      return
    }
    try {
      // Procesos con historial no se pueden borrar de verdad — se desactivan
      // para dejar de ofrecerlos en meses nuevos sin perder lo ya registrado.
      await api.updateFondoProceso(id, { activo: false })
      setProcesses(prev => prev.filter(p => p.id !== id))
    } catch (err) {
      alert('Error al eliminar proceso: ' + err.message)
    }
  }

  // ── grupos de columnas ────────────────────────────────────────────────────

  async function handleAddGroup() {
    const name = newGroupName.trim()
    if (!name) return
    setNewGroupName('')
    setAddingGroup(false)
    try {
      const created = await api.createFondoProcesoGrupo({ name })
      setGrupos(prev => [...prev, created])
    } catch (err) {
      alert('Error al crear grupo: ' + err.message)
    }
  }

  function startEditGroup(grupo) {
    setEditingGroup({ id: grupo.id, oldName: grupo.name })
    setEditGroupName(grupo.name)
  }

  async function saveEditGroup() {
    const newName = editGroupName.trim()
    const editing = editingGroup
    setEditingGroup(null)
    if (!newName || !editing || newName === editing.oldName) return
    setGrupos(prev => prev.map(g => g.id === editing.id ? { ...g, name: newName } : g))
    try {
      await api.updateFondoProcesoGrupo(editing.id, { name: newName })
    } catch (err) {
      setGrupos(prev => prev.map(g => g.id === editing.id ? { ...g, name: editing.oldName } : g))
      alert('Error al renombrar grupo: ' + err.message)
    }
  }

  function toggleCollapsed(grupoId) {
    setCollapsedGroupIds(prev => {
      const next = new Set(prev)
      if (next.has(grupoId)) next.delete(grupoId)
      else next.add(grupoId)
      return next
    })
  }

  // Solo lo vigente para el mes que se está viendo — una columna con rango
  // de vigencia (ver migración 025) no debería aparecer, ni ser arrastrable,
  // fuera de su rango. Para editar algo fuera de su rango actual, el admin
  // navega al mes correspondiente primero.
  const visibleProcesses = processes.filter(p => isVigente(p, year, month + 1))

  // ── drag & drop de columnas entre grupos ─────────────────────────────────
  // Mismo patrón multi-contenedor que KanbanPage (tareas entre columnas de
  // estado): acá los "contenedores" son los grupos (+ el sentinel de "sin
  // grupo") y las "cards" son las columnas de proceso.

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  )

  function containerIdOf(procId) {
    const proc = visibleProcesses.find(p => p.id === procId)
    return proc?.grupoId ?? SIN_GRUPO_ID
  }

  function containerItems(containerId) {
    return containerId === SIN_GRUPO_ID
      ? visibleProcesses.filter(p => !p.grupoId)
      : visibleProcesses.filter(p => p.grupoId === containerId)
  }

  function findContainer(overId) {
    if (overId === SIN_GRUPO_ID || grupos.some(g => g.id === overId)) return overId
    const proc = visibleProcesses.find(p => p.id === overId)
    return proc ? containerIdOf(proc.id) : null
  }

  function handleDragStart({ active }) {
    setActiveDragProc(visibleProcesses.find(p => p.id === active.id) ?? null)
  }

  async function handleDragEnd({ active, over }) {
    setActiveDragProc(null)
    if (!over) return
    const activeId = active.id
    const fromContainer = containerIdOf(activeId)
    const toContainer = findContainer(over.id)
    if (!toContainer) return

    if (fromContainer === toContainer) {
      // Reordenar dentro del mismo grupo (o de "sin grupo")
      const items = containerItems(toContainer)
      const oldIndex = items.findIndex(p => p.id === activeId)
      const newIndex = over.id === toContainer ? items.length - 1 : items.findIndex(p => p.id === over.id)
      if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return
      const reordered = arrayMove(items, oldIndex, newIndex)
      setProcesses(prev => {
        const withNewOrden = new Map(reordered.map((p, idx) => [p.id, idx]))
        return prev.map(p => withNewOrden.has(p.id) ? { ...p, orden: withNewOrden.get(p.id) } : p)
      })
      try {
        await Promise.all(
          reordered.map((p, idx) => api.updateFondoProceso(p.id, { orden: idx }))
        )
      } catch (err) {
        alert('Error al reordenar: ' + err.message)
        fetchGrid()
      }
      return
    }

    // Mover a otro grupo (o sacar a "sin grupo") — se agrega al final
    const grupoIdDestino = toContainer === SIN_GRUPO_ID ? null : toContainer
    const newOrden = nextOrdenFor(toContainer)
    const previous = processes.find(p => p.id === activeId)
    setProcesses(prev => prev.map(p => p.id === activeId ? { ...p, grupoId: grupoIdDestino, orden: newOrden } : p))
    try {
      await api.updateFondoProceso(activeId, { grupoId: grupoIdDestino, orden: newOrden })
    } catch (err) {
      setProcesses(prev => prev.map(p => p.id === activeId ? previous : p))
      alert('Error al mover el proceso: ' + err.message)
    }
  }

  // Próximo `orden` para agregar un proceso al final de un contenedor — usa el
  // máximo real de sus hijos en vez de la cantidad, porque si ese contenedor
  // tuviera huecos en la numeración (herencia de su `orden` global previo a
  // agruparse) agregar por cantidad podría insertarlo en el medio en vez del final.
  function nextOrdenFor(containerId) {
    const items = containerItems(containerId)
    return items.length === 0 ? 0 : Math.max(...items.map(p => p.orden)) + 1
  }

  // ── grupos de columnas: estructura para el header de dos filas ──────────
  // Los grupos se renderizan primero (en su `orden`), y los procesos sin
  // grupo quedan al final en su orden actual — evita mezclar el orden de
  // dos tablas distintas (grupos y procesos) en un mismo espacio numérico.
  const sortedGrupos = [...grupos].sort((a, b) => a.orden - b.orden)
  const sueltos = visibleProcesses.filter(p => !p.grupoId)

  // ── grupo vinculado a mp5/Contabilidad (por id, no por nombre — ver
  // migración 028) — controla cuándo el botón "Listo para enviar" se
  // habilita: solo cuando cada proceso de ese grupo ya tiene un estado
  // resuelto (hecho o no aplica) para esa empresa/mes. Si no hay grupo
  // vinculado (renombrado sin volver a linkear, o borrado), no se bloquea el
  // botón — mejor dejarlo disponible que trabar el flujo por completo.
  const contabilidadGrupo = grupos.find(g => g.macroprocesoId === 'mp5')
  const contabilidadProcesos = contabilidadGrupo
    ? visibleProcesses.filter(p => p.grupoId === contabilidadGrupo.id)
    : []
  function contabilidadPendientes(company) {
    return contabilidadProcesos.filter(p => !['done', 'na'].includes(company.cells[p.id]?.status ?? 'pending')).length
  }

  // ── filters: category tabs + search ──────────────────────────────────────

  const catCounts = {
    contable:   companies.filter(c => (c.categoria ?? 'contable') === 'contable').length,
    tributario: companies.filter(c => (c.categoria ?? 'contable') === 'tributario').length,
  }

  const tabs = [
    { key: 'todas',      label: 'Todas',      count: companies.length },
    { key: 'contable',   label: 'Contable',   count: catCounts.contable },
    { key: 'tributario', label: 'Tributario', count: catCounts.tributario },
  ]

  const q = search.toLowerCase()
  const filteredCompanies = companies.filter(c => {
    const matchSearch = !q || c.name.toLowerCase().includes(q)
    const matchCat    = activeTab === 'todas' || (c.categoria ?? 'contable') === activeTab
    return matchSearch && matchCat
  })

  // ── stats — scoped to the active category tab, same as Empresas ─────────

  const scopedCompanies = activeTab === 'todas'
    ? companies
    : companies.filter(c => (c.categoria ?? 'contable') === activeTab)

  const totalCells = scopedCompanies.length * visibleProcesses.length
  // 'na' cuenta como completada — mismo criterio que el resto del sistema
  // (mp6/impuestos derivado en el backend): ya se revisó y no aplicaba.
  const doneCells  = scopedCompanies.reduce(
    (acc, c) => acc + visibleProcesses.filter(p => ['done', 'na'].includes(c.cells[p.id]?.status ?? 'pending')).length,
    0
  )
  const pct = totalCells ? Math.round((doneCells / totalCells) * 100) : 0

  // ── layout de la tabla: un <col> por columna hoja, con su ancho exacto ──
  // Se usa <colgroup> en vez de confiar en que el navegador reparta el
  // colSpan de los grupos entre sus sub-columnas — con <col> explícito el
  // ancho de cada columna queda inequívoco bajo table-layout: fixed.
  const hasExpandedGroupRow = sortedGrupos.some(g =>
    !collapsedGroupIds.has(g.id) && visibleProcesses.some(p => p.grupoId === g.id)
  )
  const columnWidths = [
    220, // Empresa
    ...sortedGrupos.flatMap(g => {
      const children = visibleProcesses.filter(p => p.grupoId === g.id)
      const collapsedOrEmpty = collapsedGroupIds.has(g.id) || children.length === 0
      return collapsedOrEmpty ? [COL_WIDTH] : children.map(() => COL_WIDTH)
    }),
    ...sueltos.map(() => COL_WIDTH),
    88, // Confirmar Contabilidad
  ]
  const totalLeafColumns = columnWidths.length
  const gridWidth = columnWidths.reduce((a, b) => a + b, 0)

  // Línea divisoria entre el bloque de columnas agrupadas y lo que sigue
  // (reemplaza a la vieja columna angosta "Sin grupo") — solo tiene sentido
  // si hay al menos un grupo, y se dibuja en el primer elemento después de
  // los grupos, sea un proceso suelto, el input de "nuevo proceso" o la
  // columna de Confirmar Contabilidad si no hay nada de lo anterior.
  function renderProcessCell(company, proc, rowBg) {
    const cell = company.cells[proc.id] ?? emptyCell
    const cfg  = STATUS[cell.status] ?? STATUS.pending
    // Whitespace-only notes must not count as "has a note" — otherwise
    // the dot/tooltip shows for a cell that looks empty when opened.
    const hasNote = !!cell.note?.trim()
    return (
      <td
        key={proc.id}
        style={{
          width: COL_WIDTH, minWidth: COL_WIDTH, padding: 2, background: rowBg,
          borderTop: BORDER, borderBottom: BORDER,
          borderLeft: BORDER_COL, borderRight: BORDER_COL,
        }}
      >
        <button
          onClick={e => handleCellClick(company.id, proc.id, e)}
          onMouseEnter={hasNote ? e => showTooltip(e, cell.note, `${company.id}_${proc.id}`) : undefined}
          onMouseLeave={hasNote ? scheduleHide : undefined}
          className="w-full flex items-center justify-center relative transition-all hover:opacity-75 hover:scale-90 active:scale-75 rounded"
          style={{ height: 32, background: cfg.bg }}
        >
          <span className="material-symbols-outlined" style={{ color: cfg.color, fontSize: 17 }}>
            {cfg.icon}
          </span>
          {hasNote && (
            <span
              className="absolute bg-amber-400 rounded-full border border-white"
              style={{ width: 6, height: 6, top: 1, right: 1 }}
            />
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
          <h1 className="text-xl font-bold text-[#191c1e] dark:text-[#e4e6f0]">Fondo Emprender</h1>
          <p className="text-sm text-[#6b7280] dark:text-[#8890b5]">Seguimiento contable mensual</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Month navigator */}
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
          {/* Modo edición de estructura — solo el admin lo ve. El resto de la
              oficina le pide cambios al admin en vez de tocar la tabla. */}
          {isAdmin() && (
            <button
              onClick={() => setEditMode(v => {
                // Al salir del modo edición, se cierra cualquier input o
                // renombre que hubiera quedado abierto a mitad de camino.
                if (v) {
                  setAddingGroup(false)
                  setEditingGroup(null)
                  setProcesoModal(null)
                }
                return !v
              })}
              className={
                'flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold transition active:scale-[0.97] ' +
                (editMode
                  ? 'text-white'
                  : 'text-[#6b7280] dark:text-[#8890b5] border border-[#e2e4ef] dark:border-[#2e3148] hover:bg-[#f3f4f6] dark:hover:bg-[#252840]')
              }
              style={editMode ? { background: '#004ac6' } : undefined}
              title="Crear, renombrar, borrar o reordenar grupos y procesos"
            >
              <span className="material-symbols-outlined text-lg">{editMode ? 'lock_open' : 'edit'}</span>
              {editMode ? 'Editando estructura' : 'Editar estructura'}
            </button>
          )}
          {canEditStructure && (
            <>
              {addingGroup ? (
                <input
                  autoFocus
                  value={newGroupName}
                  onChange={e => setNewGroupName(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') handleAddGroup()
                    if (e.key === 'Escape') { setAddingGroup(false); setNewGroupName('') }
                  }}
                  onBlur={() => { if (!newGroupName.trim()) setAddingGroup(false); else handleAddGroup() }}
                  placeholder="Nombre del grupo..."
                  className="px-3 py-2 text-sm rounded-xl border border-[#004ac6] outline-none bg-white dark:bg-[#1e2030] text-[#191c1e] dark:text-[#e4e6f0]"
                />
              ) : (
                <button
                  onClick={() => setAddingGroup(true)}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold text-[#004ac6] dark:text-[#7ba8f0] border border-[#004ac6] dark:border-[#7ba8f0] hover:bg-[#004ac6]/5 transition active:scale-[0.97]"
                  title="Agrupar procesos relacionados en una sola columna con sub-columnas"
                >
                  <span className="material-symbols-outlined text-lg">create_new_folder</span>
                  Nuevo grupo
                </button>
              )}
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

      {/* ── Legacy data recovery banner ─────────────────────────────────── */}
      {migrationReport && migrationReport.length > 0 && (
        <div className="bg-[#fef9c3] dark:bg-[#3a3312] border border-[#eab308] rounded-xl p-3 flex items-start gap-2.5">
          <span className="material-symbols-outlined text-[#d97706] flex-shrink-0" style={{ fontSize: 18 }}>warning</span>
          <div className="flex-1 text-xs text-[#7a5b00] dark:text-[#f0d878]">
            <p className="font-semibold mb-0.5">Datos locales no recuperados automáticamente</p>
            <p>
              Se encontró información guardada en este navegador para {migrationReport.length === 1 ? 'una empresa' : `${migrationReport.length} empresas`}{' '}
              que no coincide con ningún nombre actual: {migrationReport.join(', ')}. Si esa información es importante, avisa para revisarla manualmente.
            </p>
          </div>
          <button
            onClick={() => { dismissMigrationReport(); setMigrationReport(null) }}
            className="text-[#7a5b00] dark:text-[#f0d878] hover:opacity-70 transition flex-shrink-0"
          >
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>close</span>
          </button>
        </div>
      )}

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
        className="overflow-auto rounded-xl border border-[#e2e4ef] dark:border-[#2e3148] shadow-sm"
        style={{ maxHeight: 'calc(100vh - 13rem)' }}
      >
        <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
          {/* table-layout: fixed + <colgroup> explícito: sin esto, el colSpan de
              los grupos hace que el navegador reparta el ancho "como pueda" y
              termina estirando todas las columnas. Con <col> explícito el ancho
              de cada columna es inequívoco, sin importar cuántas columnas
              abarque el header de un grupo. */}
          <table style={{ borderCollapse: 'collapse', tableLayout: 'fixed', width: `${gridWidth}px`, minWidth: `${gridWidth}px` }}>
            <colgroup>
              {columnWidths.map((w, i) => <col key={i} style={{ width: w }} />)}
            </colgroup>
            {/* sticky en el <thead> completo (no celda por celda): así las dos
                filas del header se mueven pegadas como una sola unidad al
                hacer scroll, sin tener que calcularle a mano la altura exacta
                de la fila 1 para offsetear la fila 2 — eso es lo que fallaba
                antes y hacía que los bordes de color se vieran raros. Sin
                will-change: eso promovía el thead a una capa compuesta por
                GPU y ahí los box-shadow se rasterizaban borrosos; el fix real
                del bug de scroll es que los bordes ya no son `border` (que es
                lo que rompía con `border-collapse` + sticky), así que
                will-change ya no hacía falta. */}
            <thead className="sticky top-0 z-20">

              <tr>
                {/* Company column header */}
                <th
                  rowSpan={2}
                  className="sticky left-0 top-0 z-30 bg-[#f8f9fc] dark:bg-[#1a1d2e] text-left text-[10px] font-bold text-[#6b7280] dark:text-[#8890b5] uppercase tracking-wide"
                  style={{
                    width: 220, minWidth: 220, verticalAlign: 'bottom', padding: '6px 12px 8px',
                    boxShadow: headerBoxShadow({ top: BORDER, bottom: BORDER, left: BORDER, right: BORDER_COL }),
                  }}
                >
                  Empresa
                </th>

                {/* Group headers (row 1) */}
                {sortedGrupos.map((grupo, grupoIndex) => (
                  <GroupHeaderCell
                    key={grupo.id}
                    grupo={grupo}
                    procesos={visibleProcesses.filter(p => p.grupoId === grupo.id)}
                    collapsed={collapsedGroupIds.has(grupo.id)}
                    editable={canEditStructure}
                    paletteIndex={grupoIndex}
                    onToggleCollapse={() => toggleCollapsed(grupo.id)}
                    editingGroup={editingGroup}
                    setEditingGroup={setEditingGroup}
                    editGroupName={editGroupName}
                    setEditGroupName={setEditGroupName}
                    saveEditGroup={saveEditGroup}
                    startEditGroup={startEditGroup}
                    setDeleteConfirm={setDeleteConfirm}
                  />
                ))}

                {/* Sueltos (sin grupo) — ocupan las dos filas, igual que antes */}
                <SortableContext items={sueltos.map(p => p.id)} strategy={horizontalListSortingStrategy}>
                  {sueltos.map(proc => (
                    <SortableProcessHeader
                      key={proc.id}
                      proc={proc}
                      rowSpan={2}
                      editable={canEditStructure}
                      startEditProcess={openEditProcesoModal}
                      setDeleteConfirm={setDeleteConfirm}
                    />
                  ))}
                </SortableContext>

                {/* Confirmar Contabilidad – sticky right */}
                <th
                  rowSpan={2}
                  className="sticky right-0 top-0 z-30 bg-[#f0fdf4] dark:bg-[#0d2e1a] text-[10px] font-bold text-[#16a34a] uppercase tracking-wide"
                  style={{
                    width: 88, minWidth: 88, verticalAlign: 'bottom', padding: '4px 6px 6px',
                    boxShadow: headerBoxShadow({ top: BORDER, bottom: BORDER }),
                  }}
                >
                  Confirmar Contabilidad
                </th>
              </tr>

              {/* Sub-columnas de cada grupo (row 2) — solo si hay algún grupo expandido con procesos */}
              {hasExpandedGroupRow && (
              <tr>
                {sortedGrupos.map((grupo, grupoIndex) => {
                  const children = visibleProcesses.filter(p => p.grupoId === grupo.id)
                  if (collapsedGroupIds.has(grupo.id) || children.length === 0) return null
                  return (
                    <SortableContext key={grupo.id} items={children.map(p => p.id)} strategy={horizontalListSortingStrategy}>
                      {children.map(proc => (
                        <SortableProcessHeader
                          key={proc.id}
                          proc={proc}
                          editable={canEditStructure}
                          groupColor={GROUP_PALETTE[grupoIndex % GROUP_PALETTE.length]}
                          hasTopBorder={false}
                          startEditProcess={openEditProcesoModal}
                          setDeleteConfirm={setDeleteConfirm}
                        />
                      ))}
                    </SortableContext>
                  )
                })}
              </tr>
              )}
            </thead>

            <tbody>
              {filteredCompanies.length === 0 && (
                <tr>
                  <td
                    colSpan={totalLeafColumns}
                    className="text-center py-10 text-xs text-[#8890b5] dark:text-[#5a5f7a]"
                  >
                    {search || activeTab !== 'todas'
                      ? 'No hay empresas que coincidan con el filtro'
                      : 'No se encontraron empresas'}
                  </td>
                </tr>
              )}
              {filteredCompanies.map((company, idx) => {
                const rowBg = idx % 2 === 0 ? '#ffffff' : '#f9fbff'
                return (
                  <tr key={company.id} style={{ background: rowBg }}>

                    {/* Company name cell — editar/eliminar empresa se hace desde Empresas, no acá */}
                    <td
                      className="sticky left-0 z-10"
                      style={{ width: 220, minWidth: 220, maxWidth: 220, border: BORDER, background: rowBg, height: 36, padding: 0 }}
                    >
                      <div className="flex items-center h-full px-2">
                        <span className="text-xs font-semibold text-[#191c1e] dark:text-[#e4e6f0] truncate flex-1 min-w-0" title={company.name}>
                          {company.name}
                        </span>
                      </div>
                    </td>

                    {/* Group cells: colapsado → resumen; expandido → una celda por proceso */}
                    {sortedGrupos.map(grupo => {
                      const children = visibleProcesses.filter(p => p.grupoId === grupo.id)
                      if (children.length === 0) {
                        return <td key={grupo.id} style={{ width: COL_WIDTH, minWidth: COL_WIDTH, borderTop: BORDER, borderBottom: BORDER, borderLeft: BORDER_COL, borderRight: BORDER_COL, background: rowBg }} />
                      }
                      if (collapsedGroupIds.has(grupo.id)) {
                        const doneCount = children.filter(p => ['done', 'na'].includes(company.cells[p.id]?.status ?? 'pending')).length
                        const allDone = doneCount === children.length
                        const noneDone = doneCount === 0
                        return (
                          <td key={grupo.id} style={{ width: COL_WIDTH, minWidth: COL_WIDTH, padding: 2, background: rowBg, borderTop: BORDER, borderBottom: BORDER, borderLeft: BORDER_COL, borderRight: BORDER_COL }}>
                            <button
                              onClick={() => toggleCollapsed(grupo.id)}
                              title={`${grupo.name}: ${doneCount}/${children.length} — clic para expandir`}
                              className="w-full flex items-center justify-center rounded text-[9px] font-bold transition hover:opacity-75"
                              style={{
                                height: 32,
                                color: allDone ? '#16a34a' : noneDone ? '#8890b5' : '#d97706',
                                background: allDone ? '#dcfce7' : noneDone ? '#f3f4f6' : '#fef9c3',
                              }}
                            >
                              {doneCount}/{children.length}
                            </button>
                          </td>
                        )
                      }
                      return children.map(proc => renderProcessCell(company, proc, rowBg))
                    })}

                    {/* Sueltos (sin grupo) */}
                    {sueltos.map(proc => renderProcessCell(company, proc, rowBg))}

                    {/* Confirmar Contabilidad cell */}
                    <td
                      className="sticky right-0 z-10"
                      style={{
                        width: 88, minWidth: 88, border: BORDER, padding: 3,
                        background: company.enviado ? '#eff6ff' : company.confirmed ? '#f0fdf4' : rowBg,
                      }}
                    >
                      {!company.confirmed ? (() => {
                        const pendientes = contabilidadPendientes(company)
                        const listo = pendientes === 0
                        return (
                          <button
                            onClick={() => listo && toggleConfirmed(company.id)}
                            disabled={!listo}
                            title={listo ? undefined : `Faltan ${pendientes} proceso${pendientes === 1 ? '' : 's'} del grupo Contabilidad por marcar`}
                            className={`w-full h-8 rounded flex flex-col items-center justify-center gap-0.5 font-semibold leading-none border ${listo ? 'transition hover:opacity-80' : 'cursor-not-allowed'}`}
                            style={listo
                              ? { color: '#16a34a', borderColor: '#bbf7d0', background: '#f0fdf4' }
                              : { color: '#9ca3af', borderColor: '#e2e4ef', background: '#f8f9fc' }}
                          >
                            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
                              {listo ? 'check_circle_outline' : 'hourglass_empty'}
                            </span>
                            {listo ? (
                              <span className="text-center" style={{ fontSize: 8.5 }}>Listo para<br />enviar</span>
                            ) : (
                              <span style={{ fontSize: 9 }}>Faltan {pendientes}</span>
                            )}
                          </button>
                        )
                      })() : (
                        // Confirmada (y tal vez ya enviada) — por defecto se ve
                        // la insignia compacta; al pasar el mouse se parte en
                        // los controles reales, para que un solo click nunca
                        // tenga que decidir entre "revertir" y "avanzar".
                        <div className="group relative w-full h-8">
                          <div
                            className="absolute inset-0 rounded flex flex-col items-center justify-center gap-0.5 transition group-hover:opacity-0"
                            style={{ background: company.enviado ? '#dbeafe' : '#dcfce7' }}
                          >
                            <span className="material-symbols-outlined" style={{ color: company.enviado ? '#004ac6' : '#16a34a', fontSize: 15 }}>
                              {company.enviado ? 'send' : 'verified'}
                            </span>
                            <span className="text-[9px] font-semibold leading-none" style={{ color: company.enviado ? '#004ac6' : '#16a34a' }}>
                              {(company.enviado ?? company.confirmed).date}
                            </span>
                          </div>

                          <div className="absolute inset-0 flex items-center gap-0.5 opacity-0 pointer-events-none transition group-hover:opacity-100 group-hover:pointer-events-auto">
                            <button
                              onClick={() => company.enviado ? toggleEnviado(company.id) : toggleConfirmed(company.id)}
                              title={company.enviado ? 'Revertir envío' : 'Revertir confirmación'}
                              className="flex-1 h-8 rounded flex items-center justify-center transition hover:opacity-80"
                              style={{ background: '#f3f4f6', color: '#6b7280' }}
                            >
                              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>undo</span>
                            </button>
                            {!company.enviado && (
                              <button
                                onClick={() => toggleEnviado(company.id)}
                                title="Marcar como enviada"
                                className="flex-1 h-8 rounded flex items-center justify-center transition hover:opacity-80"
                                style={{ background: '#004ac6', color: '#fff' }}
                              >
                                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>send</span>
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })}

            </tbody>
          </table>

          <DragOverlay>
            {activeDragProc && (
              <div
                className="px-3 py-1.5 rounded-lg shadow-lg text-xs font-semibold bg-white dark:bg-[#1e2030] text-[#191c1e] dark:text-[#e4e6f0] border border-[#004ac6]"
              >
                {activeDragProc.name}
              </div>
            )}
          </DragOverlay>
        </DndContext>
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

      {/* ── Note tooltip — Excel-style, resizable ────────────────────────── */}
      {tooltip && (
        <div
          className="fixed z-[60] shadow-lg text-xs text-[#1f1f1f] select-text"
          style={{
            left: tooltip.left,
            top: tooltip.top,
            width: tooltipSize.width,
            height: tooltipSize.height,
            pointerEvents: 'auto',
            background: '#fffef7',
            border: '1px solid #c8b800',
            borderRadius: 3,
          }}
          onMouseEnter={() => clearTimeout(hideTimerRef.current)}
          onMouseLeave={scheduleHide}
        >
          {/* Content area — scrolls only when text exceeds box height */}
          <div className="w-full h-full overflow-y-auto whitespace-pre-wrap leading-relaxed p-2 pr-3">
            {tooltip.content}
          </div>
          {/* Resize handle — bottom-right corner triangle */}
          <div
            onMouseDown={startResize}
            style={{
              position: 'absolute',
              bottom: 0,
              right: 0,
              width: 0,
              height: 0,
              borderStyle: 'solid',
              borderWidth: '0 0 14px 14px',
              borderColor: 'transparent transparent #c8b800 transparent',
              cursor: 'se-resize',
              pointerEvents: 'auto',
            }}
          />
        </div>
      )}

      {/* ── Crear / editar proceso ───────────────────────────────────────────── */}
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
              className="w-full px-3 py-2 mb-4 text-sm rounded-lg border border-[#e2e4ef] dark:border-[#2e3148] outline-none focus:border-[#004ac6] bg-white dark:bg-[#252840] text-[#191c1e] dark:text-[#e4e6f0]"
            />

            {procesoModal.mode === 'create' && (
              <p className="text-xs text-[#8890b5] mb-3">
                Va a aparecer desde {MONTHS[month]} {year} en adelante, salvo que le pongas un límite abajo.
              </p>
            )}
            {procesoModal.mode === 'edit' && (() => {
              const current = processes.find(p => p.id === procesoModal.id)
              const vh = current?.vigenteHasta
              return (
                <p className="text-xs text-[#8890b5] mb-3">
                  Actualmente: {vh ? `hasta ${MONTHS[vh.mes - 1]} ${vh.anio}` : 'sin fecha de fin'}.
                </p>
              )
            })()}

            <label className="block text-xs font-semibold text-[#6b7280] dark:text-[#8890b5] mb-1">
              ¿Hasta cuándo aplica?
            </label>
            <div className="flex flex-col gap-1.5 mb-5">
              {[
                { value: 'siempre',  label: 'Sin fecha de fin (de aquí en adelante)' },
                { value: 'esteMes',  label: `Solo ${MONTHS[month]} ${year}` },
                { value: 'porMeses', label: 'Por una cantidad de meses' },
              ].map(opt => (
                <label key={opt.value} className="flex items-center gap-2 text-xs text-[#191c1e] dark:text-[#e4e6f0] cursor-pointer">
                  <input
                    type="radio"
                    checked={procesoModal.hastaMode === opt.value}
                    onChange={() => setProcesoModal(m => ({ ...m, hastaMode: opt.value }))}
                    className="accent-[#004ac6]"
                  />
                  {opt.label}
                </label>
              ))}
              {procesoModal.hastaMode === 'porMeses' && (
                <div className="flex items-center gap-2 pl-6 mt-1">
                  <input
                    type="number"
                    min={1}
                    value={procesoModal.porMeses}
                    onChange={e => setProcesoModal(m => ({ ...m, porMeses: Math.max(1, parseInt(e.target.value, 10) || 1) }))}
                    className="w-16 px-2 py-1 text-xs rounded border border-[#e2e4ef] dark:border-[#2e3148] outline-none focus:border-[#004ac6] bg-white dark:bg-[#252840] text-[#191c1e] dark:text-[#e4e6f0]"
                  />
                  <span className="text-xs text-[#8890b5]">
                    meses — hasta {(() => {
                      const h = addMonths(year, month + 1, Math.max(1, procesoModal.porMeses || 1) - 1)
                      return `${MONTHS[h.mes - 1]} ${h.anio}`
                    })()}
                  </span>
                </div>
              )}
            </div>

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
                ¿Eliminar {deleteConfirm.type === 'grupo' ? 'grupo' : 'proceso'}?
              </p>
            </div>
            <p className={`text-xs text-[#6b7280] dark:text-[#8890b5] truncate ${deleteConfirm.type === 'grupo' ? 'mb-1' : 'mb-4'}`}>
              &ldquo;{deleteConfirm.name}&rdquo;
            </p>
            {deleteConfirm.type === 'grupo' && (
              <p className="text-xs text-[#6b7280] dark:text-[#8890b5] mb-3">Sus procesos no se borran, quedan sin grupo.</p>
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
