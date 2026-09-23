import { useState, useEffect, useRef, useCallback, Fragment } from 'react'
import { useSearchParams } from 'react-router-dom'
import { STATUS, MONTHS, getMesVencidoHabilitado, resolveMesInicial, firstName } from '../data/empresasExternas'
import { api } from '../services/api'
import { useSocket } from '../context/SocketContext'
import { useAuth } from '../context/AuthContext'
import { useTeam } from '../context/TeamContext'

// ─── page-level constants ─────────────────────────────────────────────────────
// Mismos valores/patrones que FondoEmprenderPage.jsx (Seguimiento Mensual de
// Fondo Emprender) — ver los comentarios de ese archivo para el porqué de
// cada uno. Sí hay grupos de columnas (ver GROUP_PALETTE/GroupHeaderCell,
// igual patrón que Fondo Emprender), pero sin drag-and-drop entre grupos —
// acá se asignan desde un <select> en el modal de proceso, no hace falta
// meter dnd-kit; tampoco hay macroprocesos (eso es "Confirmar Nómina/
// Contabilidad", negocio propio de Fondo Emprender).

const BORDER     = '1px solid #e2e4ef'
const BORDER_COL = '1px solid #d5d9ea'

// Mismo criterio que FondoEmprenderPage.jsx: fondo del header gris neutro
// muy tenue (bg-[#f8f9fc], NO un tinte azul — eso se probó y se veía como
// que toda la fila tenía color) para las columnas fijas (Empresa/Responsable/
// Contador). Las columnas de dato (Proceso, o Tipo/Valor en la vista
// Utilidad/Pérdida) llevan además una sola línea de acento abajo — ahí sí,
// igual que el filo de color que conecta cada columna con su grupo en Fondo
// Emprender — nunca arriba Y abajo a la vez (eso se veía como un sándwich
// grueso de 3px+3px en vez de un simple subrayado).
const HEADER_ACCENT = '#004ac6'
const HEADER_ACCENT_BORDER = `3px solid ${HEADER_ACCENT}`
const HEADER_BG = 'bg-[#f8f9fc] dark:bg-[#1a1d2e]'

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

// Ancho de un grupo sin procesos todavía (una sola celda con el nombre, en
// vez de columnas que no existen) — se resta del pool repartible junto a
// las 3 fijas, igual que ellas, para que el resto de las columnas de
// Proceso sigan llenando el 100% sin scroll horizontal (ver procColWidth
// más abajo).
const EMPTY_GROUP_WIDTH = 150
// Alto de la franja de color de un grupo (fila 1 del header).
const GROUP_ROW_HEIGHT = 30

// Paleta por grupo, mismos 2 colores ya establecidos en el resto de la app
// (ver memoria de colores del sistema) — ciclada por índice como en Fondo
// Emprender, acá solo hacen falta 2 (Nómina/Contabilidad).
const GROUP_PALETTE = [
  { bg: 'bg-[#f0f4ff] dark:bg-[#182544]', text: 'text-[#004ac6] dark:text-[#7ba8f0]', accent: '#004ac6' },
  { bg: 'bg-[#f0fdf4] dark:bg-[#0d2e1a]', text: 'text-[#16a34a] dark:text-[#4ade80]', accent: '#16a34a' },
]

// Claves sintéticas para filtrar por Responsable/Contador dentro del mismo
// `columnFilters` que ya usan los procesos (por estado) — el shape (Set de
// valores permitidos) es idéntico, solo cambia qué campo del company se
// compara contra el set. Reusar el mismo state evita duplicar el badge de
// "N filtros de columna" y el botón de limpiar.
const RESPONSABLE_FILTER_KEY = '__responsable'
const CONTADOR_FILTER_KEY = '__contador'
const SIN_ASIGNAR = '(Sin asignar)'

// Utilidad/Pérdida arrancó a pedido del equipo en septiembre de 2026 — meses
// anteriores nunca lo tuvieron, así que el toggle ni se ofrece ahí (no tiene
// sentido cargar un dato que no se pedía todavía). Mismo formato anio*100+mes
// que ya usa el resto del archivo (ver atMesHabilitado) para comparar.
const RESULTADO_HABILITADO_DESDE_YM = 2026 * 100 + 9

// Vista "Utilidad/Pérdida" — reemplaza las columnas de Proceso por estas 2, misma tabla y
// mismas 3 columnas fijas (Empresa/Responsable/Contador) de siempre. Ambas con ancho fijo
// angosto — sin esto la columna Valor (era la última, sin <col width>) se estiraba a lo que
// sobrara de ancho de página, un campo de texto gigante sin sentido.
const RESULTADO_TIPO_WIDTH = 150
const RESULTADO_VALOR_WIDTH = 130
const RESULTADO_TIPOS = [
  { key: 'utilidad', label: 'Utilidad', color: '#16a34a', icon: 'trending_up' },
  { key: 'perdida', label: 'Pérdida', color: '#ef4444', icon: 'trending_down' },
]
// Filtro de columna por Tipo (mismo `columnFilters` que Responsable/Contador/procesos,
// ver RESPONSABLE_FILTER_KEY más arriba) — "sin_dato" cubre las empresas sin utilidad
// ni pérdida cargada todavía, para poder aislarlas igual que un valor real.
const RESULTADO_FILTER_KEY = '__resultado'
const RESULTADO_FILTER_OPTIONS = [
  ...RESULTADO_TIPOS,
  { key: 'sin_dato', label: 'Sin dato', color: '#8890b5', icon: 'remove' },
]

const formatCOP = (n) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n ?? 0)

// El ícono de filtro vive centrado cerca del borde superior del header
// (position:absolute, no adentro del flujo del texto) — más grande que la
// chapita original (20x14 en vez de 14x14, mismo tamaño que usa
// FondoEmprenderPage.jsx) para que se note que es clickeable. El texto de
// abajo sigue bottom-aligned como siempre y NO se mueve: HEADER_TOP_CLEARANCE
// es el padding-top que le reserva a el ícono su propio espacio arriba,
// para que nunca se pisen.
const FILTER_BTN_WIDTH = 20
const FILTER_BTN_HEIGHT = 14
// No pegado del todo al borde (top: 0 se veía demasiado ajustado) — un
// pequeño respiro propio.
const FILTER_BTN_TOP = 3
const HEADER_TOP_CLEARANCE = FILTER_BTN_HEIGHT + FILTER_BTN_TOP + 8

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

// Solo el botón — quien lo usa lo posiciona (position:absolute, centrado,
// ver FILTER_BTN_TOP más arriba), no queda posicionado por sí mismo.
function FilterButton({ onClick, hasFilter, title }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center justify-center rounded transition-colors ${
        hasFilter
          ? 'text-[#004ac6] dark:text-[#7ba8f0] bg-[#e8eefc] dark:bg-[#1a2444]'
          : 'text-[#b0b4c8] dark:text-[#4b5170] hover:text-[#6b7280] dark:hover:text-[#8890b5] hover:bg-[#edeef0] dark:hover:bg-[#252840]'
      }`}
      style={{ width: FILTER_BTN_WIDTH, height: FILTER_BTN_HEIGHT }}
      title={title}
    >
      <span className="material-symbols-outlined" style={{ fontSize: 12 }}>filter_alt</span>
    </button>
  )
}

// Sin uppercase: en mayúsculas cada palabra ocupa más ancho y fuerza cortes a
// mitad de palabra en nombres largos como "Autorretención".
// groupColor: opcional — si el proceso pertenece a un grupo, el filo de
// abajo se pinta del color de ESE grupo (conecta visualmente la columna con
// su franja de arriba, igual que en Fondo Emprender). Un proceso suelto
// (sin grupo) sigue con el azul plano de siempre.
function ProcessHeaderCell({ proc, editable, isFirst, isLast, onMoveLeft, onMoveRight, startEditProcess, setDeleteConfirm, onFilterClick, hasFilter, groupColor, rowSpan = 1 }) {
  return (
    <th
      title={proc.name}
      rowSpan={rowSpan}
      className={`${HEADER_BG} text-[#6b7280] dark:text-[#8890b5]`}
      style={{
        // Sin `width`: columna proporcional al largo de su nombre (ver
        // procColWidth), calculada en el <col> del colgroup. minWidth es el
        // único piso acá. El texto sigue bottom-aligned como siempre (nunca
        // se movió) — el filtro va aparte, position:absolute pegado al
        // borde superior (padding-top le reserva el hueco para que no se
        // pisen), no adentro del flujo del texto.
        minWidth: MIN_COL_WIDTH, verticalAlign: 'bottom', position: 'relative',
        padding: `${HEADER_TOP_CLEARANCE}px 4px 6px`,
        boxShadow: headerBoxShadow({
          top: BORDER,
          bottom: groupColor ? `3px solid ${groupColor.accent}` : HEADER_ACCENT_BORDER,
          right: BORDER_COL,
        }),
      }}
    >
      {!editable ? (
        <>
          <div className="absolute left-0 right-0 flex items-center justify-center" style={{ top: FILTER_BTN_TOP }}>
            <FilterButton
              onClick={(e) => onFilterClick('status', proc.id, proc.name, e)}
              hasFilter={hasFilter}
              title={hasFilter ? `Filtro activo — ${proc.name}` : `Filtrar "${proc.name}" por estado`}
            />
          </div>
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

// Cabecera de fila 1 para un grupo (ej. "Nómina") — colSpan sobre sus
// columnas hijas, o una sola celda angosta si todavía no tiene procesos.
// Mismo patrón que GroupHeaderCell de Fondo Emprender, pero sin
// useDroppable (no hay drag-and-drop acá, ver constantes de arriba), sin
// opción de colapsar (con solo 2 grupos no aportaba) y sin texto rotado —
// con nombres cortos entra horizontal sin problema.
function GroupHeaderCell({ grupo, procesos, editable, palette, editingGroup, setEditingGroup, editGroupName, setEditGroupName, saveEditGroup, startEditGroup, setDeleteConfirm }) {
  const isEditing = editingGroup?.id === grupo.id
  // La única razón que le queda a "una sola celda angosta" es un grupo
  // recién creado que todavía no tiene ningún proceso asignado.
  const showAsSingleCell = procesos.length === 0

  return (
    <th
      colSpan={showAsSingleCell ? 1 : procesos.length}
      rowSpan={showAsSingleCell ? 2 : 1}
      className={`overflow-hidden ${palette.bg}`}
      style={{
        width: showAsSingleCell ? EMPTY_GROUP_WIDTH : undefined,
        // El acento de color va solo arriba (igual que Fondo Emprender) —
        // el resto de los bordes son los grises normales de la tabla, para
        // que el grupo se lea como parte de la misma grilla, no como un
        // bloque plantado encima.
        boxShadow: headerBoxShadow({ top: `4px solid ${palette.accent}`, bottom: BORDER, right: BORDER_COL }),
        padding: 0, verticalAlign: 'bottom',
      }}
    >
      {isEditing ? (
        <div style={{ height: GROUP_ROW_HEIGHT, display: 'flex', alignItems: 'center', padding: '0 6px' }}>
          <input
            autoFocus
            value={editGroupName}
            onChange={e => setEditGroupName(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') saveEditGroup()
              if (e.key === 'Escape') setEditingGroup(null)
            }}
            onBlur={saveEditGroup}
            className="w-full px-1.5 py-0.5 text-[11px] rounded border border-[#004ac6] outline-none bg-white dark:bg-[#252840] text-[#191c1e] dark:text-[#e4e6f0]"
          />
        </div>
      ) : showAsSingleCell ? (
        <div
          className={`w-full flex items-center justify-center ${palette.text}`}
          style={{ height: GROUP_ROW_HEIGHT }}
          title={`${grupo.name} (sin procesos)`}
        >
          <span className="text-[11px] font-bold truncate">{grupo.name}</span>
        </div>
      ) : (
        <div className="flex items-center gap-1 px-2" style={{ height: GROUP_ROW_HEIGHT }}>
          <span className={`text-[12px] font-bold flex-1 min-w-0 truncate text-center ${palette.text}`} title={grupo.name}>{grupo.name}</span>
          {editable && (
            <div className="flex items-center gap-0.5 flex-shrink-0">
              <button
                onClick={() => startEditGroup(grupo)}
                className={`p-0.5 rounded hover:bg-white/60 dark:hover:bg-black/20 transition ${palette.text}`}
                title="Renombrar grupo"
              >
                <span className="material-symbols-outlined" style={{ fontSize: 13 }}>edit</span>
              </button>
              <button
                onClick={() => setDeleteConfirm({ type: 'grupo', id: grupo.id, name: grupo.name })}
                className="p-0.5 rounded hover:bg-white/60 dark:hover:bg-black/20 text-red-500 transition"
                title="Eliminar grupo (los procesos quedan sin grupo)"
              >
                <span className="material-symbols-outlined" style={{ fontSize: 13 }}>delete</span>
              </button>
            </div>
          )}
        </div>
      )}
    </th>
  )
}

// Celda de Valor en la vista Utilidad/Pérdida — en reposo muestra el número
// formateado en pesos (mismo formato que el resto de la app, ver formatCOP),
// clic para entrar en modo edición (input de texto) y blur/Enter para volver
// a mostrarlo formateado. Componente propio (no inline) porque necesita su
// propio estado de "¿estoy editando?" por celda — definido a nivel de módulo
// para que su identidad no cambie en cada render de la fila (eso reiniciaría
// el estado de edición en cada tecla si viviera dentro de renderResultadoCells).
function ResultadoValorCell({ tipo, valor, onInput, onCommit }) {
  const [editing, setEditing] = useState(false)
  const inputRef = useRef(null)

  useEffect(() => {
    if (editing) inputRef.current?.focus()
  }, [editing])

  if (!tipo) {
    return (
      <div className="flex items-center justify-center h-full text-xs text-[#c3c6d7] dark:text-[#4b5170]">—</div>
    )
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="text"
        inputMode="decimal"
        value={valor ?? ''}
        onChange={(e) => onInput(e.target.value)}
        onBlur={() => { onCommit(); setEditing(false) }}
        onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
        placeholder="0"
        className="w-full px-2 py-1.5 text-xs text-right font-semibold rounded-lg border border-[#004ac6]/50 bg-white dark:bg-[#1e2030] text-[#191c1e] dark:text-[#e4e6f0] outline-none focus:ring-2 focus:ring-[#004ac6]/30"
      />
    )
  }

  return (
    <button
      onClick={() => setEditing(true)}
      title="Clic para editar"
      className="w-full px-2 py-1.5 text-xs text-right rounded-lg transition hover:bg-black/[0.04] dark:hover:bg-white/[0.06] truncate"
    >
      {valor !== null && valor !== undefined && valor !== ''
        ? <span className="font-semibold text-[#191c1e] dark:text-[#e4e6f0]">{formatCOP(valor)}</span>
        : <span className="text-[#8890b5]">Agregar valor</span>}
    </button>
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
function NameFilterHeaderCell({ label, width, left, rowSpan = 1, onFilterClick, hasFilter, filterKey }) {
  return (
    <th
      rowSpan={rowSpan}
      className={`sticky top-0 z-30 ${HEADER_BG} text-[#6b7280] dark:text-[#8890b5]`}
      style={{
        left,
        width, minWidth: width, verticalAlign: 'bottom',
        padding: `${HEADER_TOP_CLEARANCE}px 8px 6px`,
        boxShadow: headerBoxShadow({ top: BORDER, bottom: BORDER, right: BORDER_COL }),
      }}
    >
      <div className="absolute left-0 right-0 flex items-center justify-center" style={{ top: FILTER_BTN_TOP }}>
        <FilterButton
          onClick={(e) => onFilterClick('name', filterKey, label, e)}
          hasFilter={hasFilter}
          title={hasFilter ? `Filtro activo — ${label}` : `Filtrar por ${label}`}
        />
      </div>
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
  const [grupos, setGrupos]         = useState([])
  const [editingGroup, setEditingGroup] = useState(null) // { id, oldName }
  const [editGroupName, setEditGroupName] = useState('')
  const [addingGroup, setAddingGroup] = useState(false)
  const [newGroupName, setNewGroupName] = useState('')
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
  // El textarea escribe acá, NO directo en `companies` — mismo fix que en
  // FondoEmprenderPage.jsx: cada tecla disparaba un setCompanies() que
  // volvía a renderizar toda la grilla, sintiéndose como texto trabado.
  // Recién se sincroniza (y se guarda en el servidor) una vez, al salir del
  // cuadro — ver saveNote más abajo.
  const [noteDraft, setNoteDraft] = useState('')

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
  const [deleteConfirm, setDeleteConfirm] = useState(null) // { type: 'proceso' | 'empresa' | 'grupo', id, name }

  const [search, setSearch]       = useState('')
  const [columnFilters, setColumnFilters] = useState({})
  // Toggle segmentado: checklist de siempre vs. Utilidad/Pérdida del mes. Vista aparte en vez
  // de una columna más — la grilla de procesos ya reparte el 100% del ancho disponible entre
  // sus columnas (ver procColWidth), agregar cualquier columna fija rompe el "sin scroll
  // horizontal" que hoy funciona.
  const [view, setView] = useState('checklist')
  const [openFilter, setOpenFilter] = useState(null)
  const filterDropdownRef = useRef(null)

  const refetchTimerRef = useRef(null)

  // ── load grid from backend ──────────────────────────────────────────────

  const fetchGrid = useCallback(async () => {
    try {
      setError(null)
      const [empresas, procesos, checklistsPorEmpresa, gruposData] = await Promise.all([
        api.getExtEmpresas(),
        api.getExtProcesos(),
        api.getExtChecklistMes(year, month + 1),
        api.getExtProcesoGrupos(),
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
          resultado: chk.resultado ?? { tipo: null, valor: null },
        }
      })

      setProcesses(procesos)
      setGrupos(gruposData)
      setCompanies(built)
    } catch (err) {
      setError(err.message || 'Error al cargar el seguimiento mensual')
    } finally {
      setLoading(false)
    }
  }, [year, month])

  const saveNote = useCallback(async (companyId, procId, note) => {
    noteDirtyRef.current = false
    updateCellLocal(companyId, procId, { note })
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
      if ((payload?.tipo === 'checklist' || payload?.tipo === 'resultado') && (payload.anio !== year || payload.mes !== month + 1)) return
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
    if (key === RESULTADO_FILTER_KEY) return RESULTADO_FILTER_OPTIONS.map(o => o.key)
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
  const resultadoHabilitado = (year * 100 + (month + 1)) >= RESULTADO_HABILITADO_DESDE_YM

  // Si el usuario estaba viendo Utilidad/Pérdida y navega a un mes anterior
  // a septiembre de 2026, vuelve solo a Checklist — ese toggle no debería
  // ni mostrarse ahí (ver el .filter() en el render), mucho menos quedar
  // "trabado" en la vista que ya no se ofrece.
  useEffect(() => {
    if (!resultadoHabilitado && view === 'resultado') setView('checklist')
  }, [resultadoHabilitado, view])

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
    setNoteDraft(companies.find(c => c.id === companyId)?.cells[procId]?.note ?? '')
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

  // ── Utilidad/Pérdida del mes ─────────────────────────────────────────────
  // Mismo patrón optimista que el resto de la página: se actualiza local
  // primero, la llamada a la API va en segundo plano, y si falla se refresca
  // toda la grilla (rollback simple, no hace falta guardar el valor previo).

  function updateResultadoLocal(companyId, updates) {
    setCompanies(prev =>
      prev.map(c =>
        c.id === companyId
          ? { ...c, resultado: { ...(c.resultado ?? { tipo: null, valor: null }), ...updates } }
          : c
      )
    )
  }

  async function saveResultado(companyId, tipo, valor) {
    try {
      await api.updateExtResultado(companyId, year, month + 1, { tipo, valor })
    } catch (err) {
      console.error('Error al guardar utilidad/pérdida:', err.message)
      fetchGrid()
    }
  }

  // Click en la opción ya activa la desmarca (vuelve a "sin dato") — una
  // empresa puede no tener ninguna cargada todavía, no está obligada a
  // elegir una. Cambiar de Utilidad a Pérdida (o viceversa) conserva el
  // valor tipeado; el usuario decide si también lo cambia.
  function handleResultadoTipoClick(companyId, tipo) {
    const current = companies.find(c => c.id === companyId)?.resultado ?? { tipo: null, valor: null }
    const nextTipo = current.tipo === tipo ? null : tipo
    const nextValor = nextTipo === null ? null : parseResultadoValor(current.valor)
    updateResultadoLocal(companyId, { tipo: nextTipo, valor: nextValor })
    saveResultado(companyId, nextTipo, nextValor)
  }

  function parseResultadoValor(v) {
    if (v === '' || v === null || v === undefined) return null
    const n = Number(v)
    return Number.isNaN(n) ? null : n
  }

  // El input guarda el string tal como se está tipeando (no un Number) — si se
  // convirtiera a Number en cada tecla, un input controlado con value={numero}
  // borra el "." final apenas se tipea (Number("1500.") === 1500), haciendo
  // imposible escribir decimales. Se limpia a dígitos + un solo punto acá, y
  // recién se normaliza a número al perder el foco (handleResultadoValorBlur).
  function handleResultadoValorInput(companyId, raw) {
    const digitsAndDots = raw.replace(/[^0-9.]/g, '')
    const firstDot = digitsAndDots.indexOf('.')
    const sanitized = firstDot === -1
      ? digitsAndDots
      : digitsAndDots.slice(0, firstDot + 1) + digitsAndDots.slice(firstDot + 1).replace(/\./g, '')
    updateResultadoLocal(companyId, { valor: sanitized })
  }

  function handleResultadoValorBlur(companyId) {
    const { tipo, valor } = companies.find(c => c.id === companyId)?.resultado ?? { tipo: null, valor: null }
    const normalized = parseResultadoValor(valor)
    updateResultadoLocal(companyId, { valor: normalized })
    saveResultado(companyId, tipo, normalized)
  }

  function handleNoteChange(note) {
    noteDirtyRef.current = true
    setNoteDraft(note)
  }

  function handleNoteBlur(companyId, procId, note) {
    saveNote(companyId, procId, note)
  }

  function handleClearNote(companyId, procId) {
    setNoteDraft('')
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
    setProcesoModal({ mode: 'create', id: null, name: '', grupoId: '' })
  }
  function openEditProcesoModal(proc) {
    setProcesoModal({ mode: 'edit', id: proc.id, name: proc.name, grupoId: proc.grupoId ?? '' })
  }
  function closeProcesoModal() {
    setProcesoModal(null)
  }

  async function submitProcesoModal() {
    const modal = procesoModal
    const name = modal?.name.trim()
    if (!modal || !name) return
    setProcesoModal(null)
    const grupoId = modal.grupoId || null

    if (modal.mode === 'create') {
      try {
        const created = await api.createExtProceso({ name, grupoId })
        setProcesses(prev => [...prev, created])
      } catch (err) {
        alert('Error al crear proceso: ' + err.message)
      }
      return
    }

    const previous = processes.find(p => p.id === modal.id)
    if (!previous) return
    setProcesses(prev => prev.map(p => p.id === modal.id ? { ...p, name, grupoId } : p))
    try {
      await api.updateExtProceso(modal.id, { name, grupoId })
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
    if (type === 'grupo') {
      try {
        // Un grupo no tiene historial propio — se borra de verdad. Sus
        // procesos quedan sin grupo (el backend hace el ON DELETE SET NULL).
        await api.deleteExtProcesoGrupo(id)
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
      await api.updateExtProceso(id, { activo: false })
      setProcesses(prev => prev.filter(p => p.id !== id))
    } catch (err) {
      alert('Error al eliminar proceso: ' + err.message)
    }
  }

  // ── grupos de proceso (color de columnas, ver GROUP_PALETTE) ────────────

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
      await api.updateExtProcesoGrupo(editing.id, { name: newName })
    } catch (err) {
      setGrupos(prev => prev.map(g => g.id === editing.id ? { ...g, name: editing.oldName } : g))
      alert('Error al renombrar grupo: ' + err.message)
    }
  }

  async function handleAddGroup() {
    const name = newGroupName.trim()
    setNewGroupName('')
    setAddingGroup(false)
    if (!name) return
    try {
      const created = await api.createExtProcesoGrupo({ name })
      setGrupos(prev => [...prev, created])
    } catch (err) {
      alert('Error al crear grupo: ' + err.message)
    }
  }

  // ── company actions (solo admin, desde "Editar estructura") ─────────────

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
  // involucrados (ORDER BY orden ASC hace el resto). El vecino se busca
  // dentro del mismo "balde" (mismo grupo, o sueltos) — nunca cruza a otro
  // grupo, eso se hace desde el selector "Grupo" del modal de proceso.
  async function moveProceso(procId, direction) {
    const proc = processes.find(p => p.id === procId)
    if (!proc) return
    const bucket = visibleProcesses.filter(p => (p.grupoId ?? null) === (proc.grupoId ?? null))
    const idx = bucket.findIndex(p => p.id === procId)
    const swapIdx = direction === 'left' ? idx - 1 : idx + 1
    if (idx === -1 || swapIdx < 0 || swapIdx >= bucket.length) return
    const a = bucket[idx]
    const b = bucket[swapIdx]
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

  // Grupos ordenados por su propio `orden`, y el "orden visible" de
  // procesos ya no es el `orden` global plano: primero los hijos de cada
  // grupo (ordenados por SU orden local), luego los sueltos. Es el mismo
  // array que ya usa todo el archivo (colgroup, headers, celdas, filtros),
  // así que cambiarlo acá una sola vez alcanza — ver comentario de
  // GROUP_PALETTE más arriba sobre por qué no hace falta dnd-kit para esto.
  const sortedGrupos = [...grupos].sort((a, b) => a.orden - b.orden)
  const sueltos = [...processes].filter(p => !p.grupoId).sort((a, b) => a.orden - b.orden)
  const visibleProcesses = [
    ...sortedGrupos.flatMap(g => processes.filter(p => p.grupoId === g.id).sort((a, b) => a.orden - b.orden)),
    ...sueltos,
  ]
  // Segunda fila del header (los procesos hijos, debajo de la franja de
  // color) solo hace falta si algún grupo tiene hijos — un grupo recién
  // creado sin procesos todavía no aporta nada que mostrar debajo.
  const hasExpandedGroupRow = sortedGrupos.some(g => visibleProcesses.some(p => p.grupoId === g.id))
  // Empresa/Responsable/Contador cubren las 2 filas del header cuando existe
  // una segunda fila que cubrir — en la vista `resultado` (sin grupos) sigue
  // siendo una sola fila de siempre.
  const headerRowSpan = view === 'checklist' && hasExpandedGroupRow ? 2 : 1

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
      if (key === RESULTADO_FILTER_KEY) return allowed.has(c.resultado?.tipo || 'sin_dato')
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
  //
  // Un grupo sin procesos todavía (recién creado) no reparte ese % entre
  // hijos que no tiene — pasa a ser una columna más, de ancho FIJO
  // (EMPTY_GROUP_WIDTH), igual que Empresa/Responsable/Contador. Por eso
  // sale del pool repartible (se suma a totalFixedWidth).
  const fixedColWidths = [EMPRESA_COL_WIDTH, RESPONSABLE_COL_WIDTH, CONTADOR_COL_WIDTH]
  const singleCellGroupIds = new Set(
    sortedGrupos
      .filter(g => !visibleProcesses.some(p => p.grupoId === g.id))
      .map(g => g.id)
  )
  const expandedProcesses = visibleProcesses.filter(p => !p.grupoId || !singleCellGroupIds.has(p.grupoId))
  const totalFixedWidth = fixedColWidths.reduce((a, b) => a + b, 0) + singleCellGroupIds.size * EMPTY_GROUP_WIDTH
  const procWeight = (p) => Math.max(p.name.length, PROC_MIN_WEIGHT)
  const totalProcWeight = expandedProcesses.reduce((sum, p) => sum + procWeight(p), 0) || 1
  const procColWidth = (weight) =>
    `calc((100% - ${totalFixedWidth}px) * ${(weight / totalProcWeight).toFixed(4)})`

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

  // Celdas de un grupo en el body de una fila — una celda por proceso
  // (renderProcessCell de siempre), o una celda vacía si el grupo todavía
  // no tiene ningún proceso asignado.
  function renderGroupCells(company, grupo, rowBg) {
    const children = visibleProcesses.filter(p => p.grupoId === grupo.id)
    if (children.length === 0) {
      return (
        <td
          key={grupo.id}
          style={{
            width: EMPTY_GROUP_WIDTH, padding: 2, background: rowBg,
            borderTop: BORDER, borderBottom: BORDER, borderLeft: BORDER_COL, borderRight: BORDER_COL,
          }}
        />
      )
    }
    return <Fragment key={grupo.id}>{children.map(proc => renderProcessCell(company, proc, rowBg))}</Fragment>
  }

  // Celdas de "Tipo" y "Valor" para la vista Utilidad/Pérdida — mismas <td> (mismo borde,
  // mismo alto, mismo fondo por fila) que renderProcessCell, para que la fila se vea igual sin
  // importar qué columnas traiga detrás. Tipo reusa el mismo patrón de toggle segmentado con
  // fondo (bg-[#f0f2f8] rounded p-1, activo bg-white+shadow) que ya usa esta app en otras
  // partes (ver feedback_ui_patterns) — un <select> nativo o píldoras sin fondo no se leían
  // como "esto se puede cambiar". Solo íconos (trending_up/down) por el ancho angosto de la
  // celda; el título trae el texto para accesibilidad/tooltip.
  function renderResultadoCells(company, rowBg) {
    const resultado = company.resultado ?? { tipo: null, valor: null }
    const tipoMeta = RESULTADO_TIPOS.find(o => o.key === resultado.tipo)
    // Con un tipo elegido, toda la celda se tiñe del color de ese tipo (mismo
    // criterio que el resto de la app: "la celda de estado se colorea entera",
    // no solo un ícono chiquito) — el tinte se aplica sobre el rowBg (alpha
    // bajo en vez de un color plano) para que las filas pares/impares se
    // sigan notando debajo.
    const cellBg = tipoMeta ? `${tipoMeta.color}1f` : rowBg
    return (
      <>
        <td
          key="tipo"
          style={{
            width: RESULTADO_TIPO_WIDTH, padding: '2px 8px', background: cellBg,
            borderTop: BORDER, borderBottom: BORDER, borderLeft: BORDER_COL, borderRight: BORDER_COL,
          }}
        >
          <div className="flex items-center gap-0.5 bg-[#f0f2f8] dark:bg-[#252840] border border-[#e2e4ef] dark:border-[#2e3148] rounded-lg p-1">
            {RESULTADO_TIPOS.map((opt) => {
              const active = resultado.tipo === opt.key
              return (
                <button
                  key={opt.key}
                  onClick={() => handleResultadoTipoClick(company.id, opt.key)}
                  title={active ? `Quitar ${opt.label.toLowerCase()}` : `Marcar como ${opt.label.toLowerCase()}`}
                  className={`flex-1 py-1 rounded-md text-[10px] font-bold whitespace-nowrap transition-all duration-150 ${
                    active ? 'text-white shadow-sm' : 'text-[#8890b5] hover:text-[#191c1e] dark:hover:text-[#e4e6f0] hover:bg-white/60 dark:hover:bg-white/5'
                  }`}
                  style={active ? { background: opt.color } : undefined}
                >
                  {opt.label}
                </button>
              )
            })}
          </div>
        </td>
        <td
          key="valor"
          style={{
            width: RESULTADO_VALOR_WIDTH, padding: '2px 8px', background: cellBg,
            borderTop: BORDER, borderBottom: BORDER, borderRight: BORDER_COL,
          }}
        >
          <ResultadoValorCell
            tipo={resultado.tipo}
            valor={resultado.valor}
            onInput={(raw) => handleResultadoValorInput(company.id, raw)}
            onCommit={() => handleResultadoValorBlur(company.id)}
          />
        </td>
      </>
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

        {/* Mismo patrón de píldoras segmentadas que ya usa esta app (ver
            FondoEmprenderEmpresasPage.jsx) para elegir entre 2 modos excluyentes. Con borde +
            sombra encima del fondo — solo el fondo gris muy claro se perdía contra la página. */}
        <div className="flex items-center bg-[#f0f2f8] dark:bg-[#252840] border border-[#e2e4ef] dark:border-[#2e3148] rounded-xl p-1 gap-0.5 shadow-sm flex-shrink-0">
          {[
            { key: 'checklist', label: 'Checklist' },
            // Solo desde septiembre de 2026 (ver RESULTADO_HABILITADO_DESDE_YM) — meses
            // anteriores no tenían este dato, ni tiene sentido ofrecer cargarlo ahí.
            ...(resultadoHabilitado ? [{ key: 'resultado', label: 'Utilidad/Pérdida' }] : []),
          ].map(({ key, label }) => {
            const active = view === key
            return (
              <button
                key={key}
                onClick={() => setView(key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150 whitespace-nowrap ${
                  active
                    ? 'bg-white dark:bg-[#1e2030] text-[#004ac6] dark:text-[#7ba8f0] shadow-sm'
                    : 'text-[#6b7280] dark:text-[#8890b5] hover:text-[#191c1e] dark:hover:text-[#e4e6f0]'
                }`}
              >
                {label}
              </button>
            )
          })}
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

      {/* ── Progress bar ── visible en las 2 vistas (no solo checklist). */}
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

      {/* ── Table ── SIEMPRE la misma tabla (mismo encabezado, mismas 3 columnas
          fijas/sticky, mismo alto de fila) — el toggle solo cambia qué va
          después de Contador: las columnas de Proceso, o Tipo/Valor. Así la
          vista de Utilidad/Pérdida no se ve "distinta", es la misma grilla. */}
      <div
        className="overflow-auto rounded-xl border border-[#e2e4ef] dark:border-[#2e3148] shadow-sm scrollbar-styled"
        style={{ maxHeight: 'calc(100vh - 6rem)', width: view === 'checklist' ? '100%' : 'fit-content', maxWidth: '100%' }}
      >
        {/* width:100% en checklist (procColWidth reparte el sobrante entre las columnas de
            Proceso). En Utilidad/Pérdida, width:auto — solo 2 columnas angostas de ancho fijo,
            que la tabla NO se estire a lo ancho de la página dejando la última columna gigante. */}
        <table style={{ borderCollapse: 'collapse', tableLayout: 'fixed', width: view === 'checklist' ? '100%' : 'auto' }}>
          <colgroup>
            {fixedColWidths.map((w, i) => <col key={i} style={{ width: w }} />)}
            {view === 'checklist'
              ? <>
                  {sortedGrupos.flatMap(g => {
                    const children = visibleProcesses.filter(p => p.grupoId === g.id)
                    return singleCellGroupIds.has(g.id)
                      ? [<col key={g.id} style={{ width: EMPTY_GROUP_WIDTH }} />]
                      : children.map(p => <col key={p.id} style={{ width: procColWidth(procWeight(p)) }} />)
                  })}
                  {sueltos.map(p => <col key={p.id} style={{ width: procColWidth(procWeight(p)) }} />)}
                </>
              : <>
                  <col key="tipo" style={{ width: RESULTADO_TIPO_WIDTH }} />
                  <col key="valor" style={{ width: RESULTADO_VALOR_WIDTH }} />
                </>}
          </colgroup>
          <thead className="sticky top-0 z-20">
            <tr>
              <th
                rowSpan={headerRowSpan}
                className={`sticky left-0 top-0 z-30 ${HEADER_BG} text-left text-[10px] font-bold text-[#6b7280] dark:text-[#8890b5] uppercase tracking-wide`}
                style={{
                  width: EMPRESA_COL_WIDTH, minWidth: EMPRESA_COL_WIDTH, verticalAlign: 'bottom', padding: '6px 8px 8px',
                  boxShadow: headerBoxShadow({ top: BORDER, bottom: BORDER, left: BORDER, right: BORDER_COL }),
                }}
              >
                Empresa
              </th>
              <NameFilterHeaderCell
                label="Responsable"
                width={RESPONSABLE_COL_WIDTH}
                left={EMPRESA_COL_WIDTH}
                rowSpan={headerRowSpan}
                onFilterClick={handleFilterIconClick}
                hasFilter={Boolean(columnFilters[RESPONSABLE_FILTER_KEY])}
                filterKey={RESPONSABLE_FILTER_KEY}
              />
              <NameFilterHeaderCell
                label="Contador"
                width={CONTADOR_COL_WIDTH}
                left={EMPRESA_COL_WIDTH + RESPONSABLE_COL_WIDTH}
                rowSpan={headerRowSpan}
                onFilterClick={handleFilterIconClick}
                hasFilter={Boolean(columnFilters[CONTADOR_FILTER_KEY])}
                filterKey={CONTADOR_FILTER_KEY}
              />
              {view === 'checklist'
                ? (
                    <>
                      {sortedGrupos.map((g, gi) => {
                        const children = visibleProcesses.filter(p => p.grupoId === g.id)
                        return (
                          <GroupHeaderCell
                            key={g.id}
                            grupo={g}
                            procesos={children}
                            editable={canEditStructure}
                            palette={GROUP_PALETTE[gi % GROUP_PALETTE.length]}
                            editingGroup={editingGroup}
                            setEditingGroup={setEditingGroup}
                            editGroupName={editGroupName}
                            setEditGroupName={setEditGroupName}
                            saveEditGroup={saveEditGroup}
                            startEditGroup={startEditGroup}
                            setDeleteConfirm={setDeleteConfirm}
                          />
                        )
                      })}
                      {sueltos.map((proc, idx) => (
                        <ProcessHeaderCell
                          key={proc.id}
                          proc={proc}
                          editable={canEditStructure}
                          rowSpan={headerRowSpan}
                          isFirst={idx === 0}
                          isLast={idx === sueltos.length - 1}
                          onMoveLeft={() => moveProceso(proc.id, 'left')}
                          onMoveRight={() => moveProceso(proc.id, 'right')}
                          startEditProcess={openEditProcesoModal}
                          setDeleteConfirm={setDeleteConfirm}
                          onFilterClick={handleFilterIconClick}
                          hasFilter={Boolean(columnFilters[proc.id])}
                        />
                      ))}
                    </>
                  )
                : (
                    <>
                      <th
                        key="tipo"
                        className={`${HEADER_BG} text-[#6b7280] dark:text-[#8890b5] text-center text-[10.5px] font-semibold`}
                        style={{
                          minWidth: RESULTADO_TIPO_WIDTH, verticalAlign: 'bottom', position: 'relative',
                          padding: `${HEADER_TOP_CLEARANCE}px 4px 6px`,
                          boxShadow: headerBoxShadow({ top: BORDER, bottom: HEADER_ACCENT_BORDER, right: BORDER_COL }),
                        }}
                      >
                        <div className="absolute left-0 right-0 flex items-center justify-center" style={{ top: FILTER_BTN_TOP }}>
                          <FilterButton
                            onClick={(e) => handleFilterIconClick('resultado', RESULTADO_FILTER_KEY, 'Utilidad/Pérdida', e)}
                            hasFilter={Boolean(columnFilters[RESULTADO_FILTER_KEY])}
                            title={columnFilters[RESULTADO_FILTER_KEY] ? 'Filtro activo — Utilidad/Pérdida' : 'Filtrar por Utilidad/Pérdida'}
                          />
                        </div>
                        Tipo
                      </th>
                      <th
                        key="valor"
                        className={`${HEADER_BG} text-[#6b7280] dark:text-[#8890b5] text-center text-[10.5px] font-semibold`}
                        style={{
                          minWidth: RESULTADO_VALOR_WIDTH, verticalAlign: 'bottom', padding: `${HEADER_TOP_CLEARANCE}px 4px 6px`,
                          boxShadow: headerBoxShadow({ top: BORDER, bottom: HEADER_ACCENT_BORDER, right: BORDER_COL }),
                        }}
                      >
                        Valor
                      </th>
                    </>
                  )}
            </tr>
            {/* Fila 2 del header: hijos de cada grupo, debajo de la franja de
                color de fila 1. Solo existe si hay al menos un grupo con
                procesos (hasExpandedGroupRow) — un grupo recién creado sin
                procesos todavía no tiene nada que mostrar debajo. */}
            {view === 'checklist' && hasExpandedGroupRow && (
              <tr>
                {sortedGrupos.flatMap((g, gi) => {
                  const children = visibleProcesses.filter(p => p.grupoId === g.id)
                  if (children.length === 0) return []
                  return children.map((proc, ci) => (
                    <ProcessHeaderCell
                      key={proc.id}
                      proc={proc}
                      editable={canEditStructure}
                      groupColor={GROUP_PALETTE[gi % GROUP_PALETTE.length]}
                      isFirst={ci === 0}
                      isLast={ci === children.length - 1}
                      onMoveLeft={() => moveProceso(proc.id, 'left')}
                      onMoveRight={() => moveProceso(proc.id, 'right')}
                      startEditProcess={openEditProcesoModal}
                      setDeleteConfirm={setDeleteConfirm}
                      onFilterClick={handleFilterIconClick}
                      hasFilter={Boolean(columnFilters[proc.id])}
                    />
                  ))
                })}
              </tr>
            )}
          </thead>

          <tbody>
            {filteredCompanies.length === 0 && (
              <tr>
                <td
                  colSpan={fixedColWidths.length + (view === 'checklist' ? singleCellGroupIds.size + expandedProcesses.length : 2)}
                  className="text-center py-10 text-xs text-[#8890b5] dark:text-[#5a5f7a]"
                >
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
                  {view === 'checklist'
                    ? (
                        <>
                          {sortedGrupos.map(g => renderGroupCells(company, g, rowBg))}
                          {sueltos.map(proc => renderProcessCell(company, proc, rowBg))}
                        </>
                      )
                    : renderResultadoCells(company, rowBg)}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* ── Legend ── solo checklist (íconos de estado que no aplican a Utilidad/Pérdida). */}
      {view === 'checklist' && (
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
      )}

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
            value={noteDraft}
            onChange={e => {
              handleNoteChange(e.target.value)
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
              disabled={!noteDraft?.trim()}
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
            {openFilter.kind === 'resultado' && RESULTADO_FILTER_OPTIONS.map(opt => {
              const checked = isOptionChecked(openFilter.key, opt.key)
              return (
                <button
                  key={opt.key}
                  onClick={() => toggleOptionFilter(openFilter.key, opt.key)}
                  className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs text-left transition hover:bg-[#f3f4f6] dark:hover:bg-[#252840]"
                >
                  <span
                    className={`flex items-center justify-center rounded flex-shrink-0 ${!checked ? 'border-[#c3c6d7] dark:border-[#3e4260]' : ''}`}
                    style={{
                      width: 15, height: 15,
                      borderWidth: 1.5, borderStyle: 'solid',
                      borderColor: checked ? opt.color : undefined,
                      background: checked ? opt.color : 'transparent',
                    }}
                  >
                    {checked && <span className="material-symbols-outlined text-white" style={{ fontSize: 11 }}>check</span>}
                  </span>
                  <span className="material-symbols-outlined flex-shrink-0" style={{ color: opt.color, fontSize: 14 }}>{opt.icon}</span>
                  <span className="font-medium text-[#191c1e] dark:text-[#e4e6f0]">{opt.label}</span>
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
              className="w-full px-3 py-2 mb-4 text-sm rounded-lg border border-[#e2e4ef] dark:border-[#2e3148] outline-none focus:border-[#004ac6] bg-white dark:bg-[#252840] text-[#191c1e] dark:text-[#e4e6f0]"
            />
            <label className="block text-xs font-semibold text-[#6b7280] dark:text-[#8890b5] mb-1">Grupo</label>
            <select
              value={procesoModal.grupoId}
              onChange={e => setProcesoModal(m => ({ ...m, grupoId: e.target.value }))}
              className="w-full px-3 py-2 mb-5 text-sm rounded-lg border border-[#e2e4ef] dark:border-[#2e3148] outline-none focus:border-[#004ac6] bg-white dark:bg-[#252840] text-[#191c1e] dark:text-[#e4e6f0]"
            >
              <option value="">Sin grupo</option>
              {grupos.map(g => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
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

      {/* ── Editar empresa (crear una nueva vive en el directorio maestro, /empresas) ── */}
      {empresaModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={closeEmpresaModal}>
          <div
            className="bg-white dark:bg-[#1e2030] rounded-2xl shadow-2xl p-6 w-full max-w-sm mx-4 border border-[#e2e4ef] dark:border-[#2e3148]"
            onClick={e => e.stopPropagation()}
          >
            <p className="text-sm font-semibold text-[#191c1e] dark:text-[#e4e6f0] mb-4">
              Editar empresa
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
                Guardar
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
                ¿Eliminar {deleteConfirm.type === 'empresa' ? 'empresa' : deleteConfirm.type === 'grupo' ? 'grupo' : 'proceso'}?
              </p>
            </div>
            <p className={`text-xs text-[#6b7280] dark:text-[#8890b5] truncate ${deleteConfirm.type === 'empresa' ? 'mb-1' : deleteConfirm.type === 'grupo' ? 'mb-1' : 'mb-4'}`}>
              &ldquo;{deleteConfirm.name}&rdquo;
            </p>
            {deleteConfirm.type === 'empresa' && (
              <p className="text-xs text-[#6b7280] dark:text-[#8890b5] mb-3">
                Esta acción borra también su historial de checklist.
              </p>
            )}
            {deleteConfirm.type === 'grupo' && (
              <p className="text-xs text-[#6b7280] dark:text-[#8890b5] mb-3">
                Sus procesos no se borran, quedan sin grupo.
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
