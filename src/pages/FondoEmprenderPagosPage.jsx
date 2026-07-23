import { useState, useMemo, useEffect, useCallback, Fragment } from 'react'
import StatsCard from '../components/StatsCard'
import { api } from '../services/api'
import { useAuth } from '../context/AuthContext'

// ─── month utilities ──────────────────────────────────────────────────────────

const MONTHS_SHORT = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']

function toYM(anio, mes) { return anio * 100 + mes }
function fromYM(ym) { return { anio: Math.floor(ym / 100), mes: ym % 100, ym } }
function nextYM(ym) {
  return ym % 100 === 12 ? (Math.floor(ym / 100) + 1) * 100 + 1 : ym + 1
}
function prevYM(ym) {
  return ym % 100 === 1 ? (Math.floor(ym / 100) - 1) * 100 + 12 : ym - 1
}
// Índice lineal de mes (para poder sumar/restar/dividir sin líos de año) — mes es 1-12
function ymToIndex(ym) { const { anio, mes } = fromYM(ym); return anio * 12 + mes }
function indexToYM(idx) { const anio = Math.floor((idx - 1) / 12); const mes = idx - anio * 12; return anio * 100 + mes }

const START_YM       = 2026 * 100 + 2   // Febrero 2026 — inicio del programa (mesesDebidos y grilla)
const START_IDX      = ymToIndex(START_YM)
const VENTANA_MESES  = 5                // Cuántos meses se ven por bloque

// ─── calcular meses debidos (frontend) ───────────────────────────────────────
// Genera meses desde START_YM hasta el mes habilitado (no el mes calendario
// actual — los pagos son sobre mes vencido, y el límite lo controlan las
// jefas manualmente). Excluye los aprobados.
// Meses sin registro en BD → { pagoId: null, estado: 'pendiente' } virtual.

function calcularMesesDebidos(pagos, mesHabilitadoYM) {
  const out = []
  for (let ym = START_YM; ym <= mesHabilitadoYM; ym = nextYM(ym)) {
    const { anio, mes } = fromYM(ym)
    const pago = pagos.find(p => p.anio === anio && p.mes === mes) ?? null
    if (pago?.estado === 'aprobado') continue
    out.push(pago
      ? { anio, mes, estado: pago.estado, pagoId: pago.id, nota: pago.nota ?? null, autorizado: pago.autorizado ?? false }
      : { anio, mes, estado: 'pendiente', pagoId: null, nota: null, autorizado: false }
    )
  }
  return out
}

// ─── shared cell styles ───────────────────────────────────────────────────────

// Estilo estructural del <td> — visual va en className para que hover: Tailwind funcione
const TD_STYLE = {
  fontSize: 11,
  padding: '8px 6px',
  verticalAlign: 'middle',
  textAlign: 'center',
  height: 64,
}

// className por estado (fondo de color identifica el estado)
const TD_EMPTY_CLS = 'border border-[#E5E7EB] bg-[#F9FAFB]'
const TD_PEND_CLS  = 'border border-[#E5E7EB] bg-[#F9FAFB]'
const TD_BLOQ_CLS  = 'border border-[#D1D5DB] bg-[#E5E7EB]'
const TD_ENV_CLS   = 'border border-[#93C5FD]'
const TD_PAG_CLS   = 'border border-[#86EFAC] bg-[#DCFCE7]'

// Wrappers flex para usar DENTRO de cada td
const ROW = { display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 6 }

// ─── PagoCell ─────────────────────────────────────────────────────────────────

// Base mínimo compartido por labels y botones
const BTN = {
  base: { display: 'inline-block', lineHeight: 1.3, transition: 'all 150ms ease-out' },
  // Mixin para botones de acción (pill con relleno)
  pill: { border: 'none', borderRadius: 9999, padding: '6px 14px', fontWeight: 600, fontSize: 13, cursor: 'pointer' },

  // Labels informativos (ya resuelto, no clickeable) — solo texto, sin caja
  pendiente:  { color: '#9CA3AF', fontWeight: 400, fontSize: 12, opacity: 0.6, cursor: 'default' },
  enviadoFix: { color: '#1E40AF', fontWeight: 600, fontSize: 13 },
  pagadoFix:  { color: '#166534', fontWeight: 600, fontSize: 13 },

  // Colores de relleno para botones pill clickeables
  enviado:   { background: '#DBEAFE', color: '#1E40AF' },
  pagado:    { background: '#DCFCE7', color: '#166534' },
  rechazado: { background: '#FEE2E2', color: '#991B1B' },
}

function PagoCell({ empresa, anio, mes, mesesDebidos, historialCompleto, onAction, canAutorizar }) {
  const [hovRechazado, setHovRechazado] = useState(false)
  const [hovEditar,    setHovEditar]    = useState(false)
  const [hovNota,      setHovNota]      = useState(false)
  const [hovBloqueado, setHovBloqueado] = useState(false)
  // Separado de hovBloqueado a propósito: aunque el chip "Bloqueado" y el
  // ícono de esquina "Bloquear" nunca se muestran a la vez (dependen de
  // autorizado), compartir el mismo booleano hacía que al hacer clic en
  // "Autorizar" el ícono de esquina apareciera ya "en hover" — el mouse
  // nunca dispara mouseleave porque el elemento bajo el cursor desaparece
  // al re-renderizar, así que el estado quedaba pegado en true.
  const [hovBloquear,  setHovBloquear]  = useState(false)
  const [hovEnviado,      setHovEnviado]      = useState(false)
  const [hovEnvPagado,    setHovEnvPagado]    = useState(false)
  const [hovEnvRechazado, setHovEnvRechazado] = useState(false)
  // Editor de nota genérico — disponible en cualquier estado. Un solo campo
  // nota vigente por fila, sin historial — mismo patrón que Seguimiento Mensual.
  const [notaEditor,   setNotaEditor]   = useState({ open: false, draft: '' })

  const debito    = mesesDebidos.find(md => md.anio === anio && md.mes === mes) ?? null
  const histEntry = historialCompleto.find(h => h.anio === anio && h.mes === mes) ?? null

  function act(action, extra = {}) {
    onAction(action, { empresaId: empresa.id, anio, mes, pagoId: debito?.pagoId ?? histEntry?.id ?? null, ...extra })
  }

  // Botón + editor de nota flotante — siempre visible (ícono relleno si ya
  // hay nota, outline si está vacía), clic abre el editor pre-llenado.
  const NOTA_THEMES = {
    red:   { icon: '#991B1B', label: '#991B1B', soft: 'rgba(239,68,68,0.12)',   hover: 'rgba(239,68,68,0.20)',   border: '#FEE2E2', heading: '#EF4444' },
    gray:  { icon: '#4B5563', label: '#4B5563', soft: 'rgba(107,114,128,0.12)', hover: 'rgba(107,114,128,0.20)', border: '#E5E7EB', heading: '#6B7280' },
    blue:  { icon: '#1E40AF', label: '#1E40AF', soft: 'rgba(59,130,246,0.12)',  hover: 'rgba(59,130,246,0.20)',  border: '#DBEAFE', heading: '#3B82F6' },
    green: { icon: '#166534', label: '#166534', soft: 'rgba(22,163,74,0.12)',   hover: 'rgba(22,163,74,0.20)',   border: '#BBF7D0', heading: '#16a34a' },
  }
  function renderNotaButton(theme, notaValue) {
    const c = NOTA_THEMES[theme]
    const hasNota = !!notaValue?.trim()
    const editing = notaEditor.open

    return (
      <>
        <button
          onClick={(e) => { e.stopPropagation(); setNotaEditor({ open: true, draft: notaValue ?? '' }) }}
          onMouseEnter={(e) => { e.stopPropagation(); setHovNota(true) }}
          onMouseLeave={() => setHovNota(false)}
          title={hasNota ? 'Ver / editar nota' : 'Agregar nota'}
          style={{
            position: 'absolute', bottom: 6, right: 6, height: 22,
            width: hovNota && !editing ? 70 : 22,
            background: hasNota ? (hovNota ? c.hover : c.soft) : 'rgba(107,114,128,0.08)',
            border: 'none', borderRadius: 11, overflow: 'hidden',
            transition: 'width 220ms ease-out, background 150ms ease-out',
            display: 'flex', alignItems: 'center', paddingLeft: 4, gap: 2,
            cursor: 'pointer', whiteSpace: 'nowrap', zIndex: 2,
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 13, color: hasNota ? c.icon : '#9CA3AF', lineHeight: 1, flexShrink: 0 }}>
            {hasNota ? 'sticky_note_2' : 'note_add'}
          </span>
          <span style={{ fontSize: 11, fontWeight: 600, color: hasNota ? c.label : '#6B7280', opacity: hovNota && !editing ? 1 : 0, transition: 'opacity 140ms ease-out 60ms' }}>
            {hasNota ? 'Nota' : 'Agregar'}
          </span>
        </button>

        {/* Preview al pasar el mouse — solo si hay nota y no se está editando */}
        {hasNota && !editing && (
          <div style={{
            position: 'absolute', bottom: 34, right: 6, width: 190,
            background: 'white', borderRadius: 8,
            boxShadow: '0 6px 16px rgba(0,0,0,0.12)',
            border: `1px solid ${c.border}`, padding: '10px 12px', zIndex: 200,
            opacity: hovNota ? 1 : 0, pointerEvents: 'none',
            transform: hovNota ? 'translateY(0)' : 'translateY(6px)',
            transition: 'opacity 160ms ease-out, transform 160ms ease-out',
          }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: c.heading, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 5 }}>Nota</div>
            <div style={{ fontSize: 12, color: '#374151', lineHeight: 1.5, wordBreak: 'break-word' }}>{notaValue}</div>
          </div>
        )}

        {/* Editor flotante — mismo patrón visual que el input de motivo de rechazo */}
        {editing && (
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'absolute', bottom: 34, right: 6, width: 190,
              background: 'white', borderRadius: 8,
              boxShadow: '0 6px 16px rgba(0,0,0,0.12)',
              border: `1px solid ${c.border}`, padding: 8, zIndex: 300,
              display: 'flex', flexDirection: 'column', gap: 4,
            }}
          >
            <input
              autoFocus
              value={notaEditor.draft}
              onChange={e => setNotaEditor(s => ({ ...s, draft: e.target.value }))}
              onKeyDown={e => {
                if (e.key === 'Enter') { act('nota', { nota: notaEditor.draft }); setNotaEditor({ open: false, draft: '' }) }
                if (e.key === 'Escape') setNotaEditor({ open: false, draft: '' })
              }}
              placeholder="Escribir nota..."
              style={{
                width: '100%', padding: '4px 8px', fontSize: 11, borderRadius: 6,
                border: `1px solid ${c.border}`, outline: 'none', boxSizing: 'border-box',
              }}
            />
            <div style={{ display: 'flex', gap: 4 }}>
              <button
                onClick={() => { act('nota', { nota: notaEditor.draft }); setNotaEditor({ open: false, draft: '' }) }}
                style={{ flex: 1, padding: '4px 0', borderRadius: 6, border: 'none', background: c.heading, color: '#fff', fontWeight: 600, fontSize: 11, cursor: 'pointer' }}
              >Guardar</button>
              <button
                onClick={() => setNotaEditor({ open: false, draft: '' })}
                style={{ padding: '4px 8px', borderRadius: 6, border: 'none', background: '#F3F4F6', color: '#444', fontWeight: 400, fontSize: 11, cursor: 'pointer' }}
              >×</button>
            </div>
          </div>
        )}
      </>
    )
  }

  // ── Fuera de mesesDebidos ────────────────────────────────────────────────────
  if (!debito) {
    if (histEntry?.estado === 'aprobado') {
      return (
        <td colSpan={2} className={TD_PAG_CLS} style={{ ...TD_STYLE, position: 'relative' }}>
          <span style={{ ...BTN.base, ...BTN.pagadoFix }}>Pagado</span>
          {/* Botón editar — para revertir un pago marcado por error */}
          <div
            style={{
              position: 'absolute',
              top: 6,
              right: 6,
              height: 22,
              width: hovEditar ? 68 : 22,
              background: hovEditar ? 'rgba(22,163,74,0.18)' : 'rgba(22,163,74,0.10)',
              borderRadius: 11,
              overflow: 'hidden',
              transition: 'width 220ms ease-out, background 150ms ease-out',
              display: 'flex',
              alignItems: 'center',
              paddingLeft: 4,
              gap: 2,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
            onMouseEnter={() => setHovEditar(true)}
            onMouseLeave={() => setHovEditar(false)}
            onClick={() => act('revertirAprobado')}
            title="Revertir pago"
          >
            <span className="material-symbols-outlined" style={{ fontSize: 14, color: '#166534', lineHeight: 1, flexShrink: 0 }}>edit</span>
            <span style={{
              fontSize: 11,
              fontWeight: 600,
              color: '#166534',
              opacity: hovEditar ? 1 : 0,
              transition: 'opacity 140ms ease-out 60ms',
            }}>Editar</span>
          </div>
          {renderNotaButton('green', histEntry?.nota)}
        </td>
      )
    }
    return <td colSpan={2} className={TD_EMPTY_CLS} style={{ ...TD_STYLE, color: '#c8c5bc' }}>—</td>
  }

  const { estado, nota, autorizado } = debito

  // ── Pendiente ────────────────────────────────────────────────────────────────
  if (estado === 'pendiente') {
    return (
      <td colSpan={2} className={autorizado ? TD_PEND_CLS : TD_BLOQ_CLS} style={{ ...TD_STYLE, position: 'relative' }}>
        {/* padding horizontal reserva la franja de las esquinas (nota abajo,
            bloquear arriba) para que el contenido centrado nunca quede debajo
            de esos íconos, aunque el texto/pill crezca */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 46, padding: '0 28px' }}>
          {autorizado ? (
            <div style={ROW}>
              <span style={{ ...BTN.base, ...BTN.pendiente }}>Pendiente</span>
              <button
                className="hover:opacity-80"
                onClick={() => act('enviado')}
                style={{ ...BTN.base, ...BTN.pill, ...BTN.enviado }}
              >
                Enviado →
              </button>
            </div>
          ) : canAutorizar ? (
            // Chip único clickeable: pill con fondo propio (contrasta contra
            // TD_BLOQ_CLS que ya es gris) para que el ícono tenga espacio real
            // y no se vea recortado, y para comunicar affordance de clic —
            // mismo mecanismo de fondo+label que cambia en hover que usan
            // Rechazado ("Pendiente reenvío") y Enviado (split).
            <button
              onClick={() => { act('autorizar', { autorizado: true }); setHovBloqueado(false) }}
              onMouseEnter={() => setHovBloqueado(true)}
              onMouseLeave={() => setHovBloqueado(false)}
              title="Clic para autorizar envío"
              style={{
                ...BTN.base,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                borderRadius: 9999, padding: '5px 12px', cursor: 'pointer',
                border: `1px solid ${hovBloqueado ? '#86EFAC' : '#D1D5DB'}`,
                background: hovBloqueado ? '#DCFCE7' : '#FFFFFF',
                color: hovBloqueado ? '#166534' : '#4B5563', fontWeight: 600, fontSize: 12,
                transition: 'background-color 150ms ease-out, border-color 150ms ease-out, color 150ms ease-out',
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 14, lineHeight: 1, flexShrink: 0 }}>
                {hovBloqueado ? 'lock_open' : 'lock'}
              </span>
              {hovBloqueado ? 'Autorizar' : 'Bloqueado'}
            </button>
          ) : (
            <span style={{
              ...BTN.base,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
              borderRadius: 9999, padding: '5px 12px',
              border: '1px solid #D1D5DB', background: '#FFFFFF',
              color: '#4B5563', fontWeight: 600, fontSize: 12,
            }}>
              <span className="material-symbols-outlined" style={{ fontSize: 14, lineHeight: 1, flexShrink: 0 }}>lock</span>
              Bloqueado
            </span>
          )}
        </div>

        {/* Toggle de bloqueo — esquina superior derecha, fuera del flujo,
            mismo patrón de "editar" en Pagado: ícono fijo que expande con
            label al hacer hover, nunca empuja la altura de la celda.
            Estado propio (hovBloquear) — ver comentario junto a su
            declaración sobre por qué no comparte hovBloqueado. */}
        {canAutorizar && autorizado && (
          <div
            onClick={() => { act('autorizar', { autorizado: false }); setHovBloquear(false) }}
            onMouseEnter={() => setHovBloquear(true)}
            onMouseLeave={() => setHovBloquear(false)}
            title="Bloquear envío hasta nueva orden"
            style={{
              position: 'absolute', top: 6, right: 6, height: 22,
              width: hovBloquear ? 76 : 22,
              background: hovBloquear ? '#FED7AA' : 'rgba(107,114,128,0.08)',
              border: 'none', borderRadius: 11, overflow: 'hidden',
              transition: 'width 220ms ease-out, background 150ms ease-out',
              display: 'flex', alignItems: 'center', paddingLeft: 4, gap: 2,
              cursor: 'pointer', whiteSpace: 'nowrap', zIndex: 2,
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 13, color: hovBloquear ? '#B45309' : '#9CA3AF', lineHeight: 1, flexShrink: 0 }}>
              {hovBloquear ? 'lock' : 'lock_open'}
            </span>
            <span style={{ fontSize: 11, fontWeight: 600, color: '#B45309', opacity: hovBloquear ? 1 : 0, transition: 'opacity 140ms ease-out 60ms' }}>
              Bloquear
            </span>
          </div>
        )}
        {renderNotaButton('gray', nota)}
      </td>
    )
  }

  // ── Enviado ──────────────────────────────────────────────────────────────────
  if (estado === 'enviado') {
    return (
      <td
        colSpan={2}
        className={TD_ENV_CLS}
        style={{
          ...TD_STYLE,
          position: 'relative',
          background: hovEnviado ? '#BFDBFE' : '#DBEAFE',
          transition: 'background-color 200ms ease-out',
        }}
        onMouseEnter={() => setHovEnviado(true)}
        onMouseLeave={() => { setHovEnviado(false); setHovEnvPagado(false); setHovEnvRechazado(false) }}
      >
        {hovEnviado ? (
          // Ocupa la casilla completa de borde a borde (inset:0 respecto al
          // td relative — el "padding box" incluye el padding del td, así
          // que cubre el mismo espacio visual que ya cubre el fondo de
          // Rechazado standalone, sin dejar ver el azul del fondo detrás).
          <div style={{ position: 'absolute', inset: 0, display: 'flex' }}>
            <div
              onClick={() => act('aprobado')}
              onMouseEnter={() => setHovEnvPagado(true)}
              onMouseLeave={() => setHovEnvPagado(false)}
              style={{
                flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
                // paddingBottom reserva la franja del ícono de nota (bottom-
                // right) — el fondo sigue llegando hasta el borde (cubre
                // todo el padding-box), solo el texto se corre hacia arriba.
                paddingBottom: 22,
                cursor: 'pointer', fontWeight: 600, fontSize: 13,
                color: '#166534',
                // Reposo: gris neutro (misma idea "aún por elegir" que otros
                // grises del archivo, ej. el botón cancelar del editor de nota).
                // Hover: el mismo bg que ya usa la celda Pagado standalone
                // (TD_PAG_CLS) — previsualiza literalmente el resultado.
                background: hovEnvPagado ? '#DCFCE7' : '#F3F4F6',
                transition: 'background-color 200ms ease-out',
              }}
            >
              Pagado
            </div>
            <div
              onClick={() => act('rechazado')}
              onMouseEnter={() => setHovEnvRechazado(true)}
              onMouseLeave={() => setHovEnvRechazado(false)}
              style={{
                flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
                paddingBottom: 22,
                cursor: 'pointer', fontWeight: 600, fontSize: 13,
                color: '#B91C1C',
                // Mismo criterio: reposo neutro, hover = bg real de la celda
                // Rechazado standalone (en reposo, sin su propio hover).
                background: hovEnvRechazado ? '#FEE2E2' : '#F3F4F6',
                transition: 'background-color 200ms ease-out',
              }}
            >
              Rechazado
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 46 }}>
            <span style={{ ...BTN.base, ...BTN.enviadoFix }}>Enviado</span>
          </div>
        )}
        {renderNotaButton('blue', nota)}
      </td>
    )
  }

  // ── Rechazado ────────────────────────────────────────────────────────────────
  if (estado === 'rechazado') {
    return (
      <td
        colSpan={2}
        className="border border-[#FECACA] cursor-pointer"
        style={{
          ...TD_STYLE,
          position: 'relative',
          background: hovRechazado ? '#FED7AA' : '#FEE2E2',
          transition: 'background-color 200ms ease-out',
        }}
        onMouseEnter={() => setHovRechazado(true)}
        onMouseLeave={() => setHovRechazado(false)}
        onClick={() => act('pendiente')}
        title="Clic para reenviar"
      >
        {/* Texto centrado — separado de la nota para no desplazarse. Padding
            horizontal reserva la franja del ícono de nota (bottom-right) para
            que "Pendiente reenvío" nunca quede debajo al hacer hover. */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 46, padding: '0 28px' }}>
          <span style={{
            ...BTN.base,
            fontWeight: 600,
            fontSize: 13,
            color: hovRechazado ? '#B45309' : '#B91C1C',
            transition: 'color 200ms ease-out',
          }}>
            {hovRechazado ? 'Pendiente reenvío' : 'Rechazado'}
          </span>
        </div>

        {renderNotaButton('red', nota)}
      </td>
    )
  }

  return <td colSpan={2} className={TD_EMPTY_CLS} style={{ ...TD_STYLE, color: '#c8c5bc' }}>—</td>
}

// ─── main page ────────────────────────────────────────────────────────────────

export default function FondoEmprenderPagosPage() {
  const { user } = useAuth()
  const canAutorizar = user?.role === 'admin' || user?.permissions?.modulos?.fondoEmprender?.canAutorizarPagos === true

  // ── server state ─────────────────────────────────────────────────────────────
  const [rows,    setRows]    = useState([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)
  const [mesHabilitadoYM, setMesHabilitadoYM] = useState(null)

  // ── ui state ─────────────────────────────────────────────────────────────────
  const [activeTab,     setActiveTab]     = useState('todas')
  const [search,        setSearch]        = useState('')
  // Cuántos meses hacia atrás está el borde derecho de la ventana respecto al
  // mes habilitado — 0 significa "la ventana termina en el mes habilitado".
  const [monthsBack,    setMonthsBack]    = useState(0)

  // Al cargar / cambiar el mes habilitado (ej. tras "Habilitar mes"), volver
  // a mostrar la ventana terminando en el mes habilitado actual.
  useEffect(() => {
    if (mesHabilitadoYM != null) setMonthsBack(0)
  }, [mesHabilitadoYM])

  // Mes seleccionado para las tarjetas de resumen (Pagadas/Esperando/En mora)
  // — independiente de la ventana de la grilla (monthsBack). Mismo patrón:
  // offset hacia atrás desde el mes habilitado, 0 = mes habilitado actual.
  const [statsMonthsBack, setStatsMonthsBack] = useState(0)
  useEffect(() => {
    if (mesHabilitadoYM != null) setStatsMonthsBack(0)
  }, [mesHabilitadoYM])

  // ── data loading ──────────────────────────────────────────────────────────────
  const fetchAll = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const [lista, mesActual, pagosPorEmpresa] = await Promise.all([
        api.getFondoEmpresas(),
        api.getFondoPagosMesActual(),
        api.getFondoPagosTodasEmpresas(),
      ])
      const habilitadoYM = toYM(mesActual.anio, mesActual.mes)
      setMesHabilitadoYM(habilitadoYM)
      const pagosPorEmpresaId = new Map(pagosPorEmpresa.map(p => [p.empresaId, p.pagos]))
      const results = lista.map(e => {
        const pagos = pagosPorEmpresaId.get(e.id) ?? []
        return {
          empresa:           e,
          historialCompleto: pagos,
          mesesDebidos:      calcularMesesDebidos(pagos, habilitadoYM),
        }
      })
      setRows(results)
    } catch (err) {
      setError(err.message || 'Error al cargar historial de pagos')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  // ── refresh single empresa ────────────────────────────────────────────────────
  const refreshEmpresa = useCallback(async (empresaId) => {
    try {
      const res = await api.getFondoPagos(empresaId)
      const pagos = res.pagos ?? []
      setRows(prev => prev.map(r =>
        r.empresa.id === empresaId
          ? { ...r, historialCompleto: pagos, mesesDebidos: calcularMesesDebidos(pagos, mesHabilitadoYM) }
          : r
      ))
    } catch { /* silent — optimistic update stays */ }
  }, [mesHabilitadoYM])

  // ── habilitar / deshacer mes (solo jefas) ────────────────────────────────────
  const [avanzandoMes, setAvanzandoMes] = useState(false)
  const [confirmMes, setConfirmMes] = useState(null) // { tipo: 'habilitar' | 'deshacer', label }

  function requestAvanzarMes() {
    const { anio, mes } = fromYM(nextYM(mesHabilitadoYM))
    setConfirmMes({ tipo: 'habilitar', label: `${MONTHS_SHORT[mes - 1]} ${anio}` })
  }

  function requestRetrocederMes() {
    const { anio, mes } = fromYM(prevYM(mesHabilitadoYM))
    setConfirmMes({ tipo: 'deshacer', label: `${MONTHS_SHORT[mes - 1]} ${anio}` })
  }

  async function confirmarAccionMes() {
    const tipo = confirmMes?.tipo
    setConfirmMes(null)
    setAvanzandoMes(true)
    try {
      if (tipo === 'habilitar') await api.avanzarFondoPagosMesActual()
      else await api.retrocederFondoPagosMesActual()
      await fetchAll()
    } catch (err) {
      alert(err.status === 403 ? 'Sin permiso para modificar el mes habilitado (403)' : 'Error: ' + err.message)
    } finally {
      setAvanzandoMes(false)
    }
  }

  // ── action handler ────────────────────────────────────────────────────────────
  const handleAction = useCallback(async (action, { empresaId, anio, mes, pagoId, nota, autorizado }) => {
    const updateRow = (fn) =>
      setRows(prev => prev.map(r => r.empresa.id === empresaId ? fn(r) : r))

    switch (action) {

      case 'enviado': {
        // Optimistic
        updateRow(r => ({
          ...r,
          mesesDebidos: r.mesesDebidos.map(md =>
            md.anio === anio && md.mes === mes ? { ...md, estado: 'enviado' } : md
          ),
        }))
        try {
          let targetId = pagoId
          if (!pagoId) {
            // Backend crea con estado='pendiente'; creamos y luego actualizamos
            const np = await api.createFondoPago(empresaId, { anio, mes })
            targetId = np.id
            updateRow(r => ({
              ...r,
              mesesDebidos: r.mesesDebidos.map(md =>
                md.anio === anio && md.mes === mes ? { ...md, pagoId: np.id } : md
              ),
              historialCompleto: [...r.historialCompleto, np]
                .sort((a, b) => toYM(a.anio, a.mes) - toYM(b.anio, b.mes)),
            }))
          }
          await api.updateFondoPago(empresaId, targetId, { estado: 'enviado' })
          updateRow(r => ({
            ...r,
            historialCompleto: r.historialCompleto.map(h =>
              h.id === targetId ? { ...h, estado: 'enviado' } : h
            ),
          }))
        } catch (err) {
          refreshEmpresa(empresaId)
          alert(err.status === 403 ? 'Sin permiso para modificar pagos (403)' : 'Error: ' + err.message)
        }
        break
      }

      case 'aprobado': {
        updateRow(r => ({
          ...r,
          mesesDebidos: r.mesesDebidos.filter(md => !(md.anio === anio && md.mes === mes)),
          historialCompleto: r.historialCompleto.map(h =>
            h.id === pagoId ? { ...h, estado: 'aprobado' } : h
          ),
        }))
        try {
          await api.updateFondoPago(empresaId, pagoId, { estado: 'aprobado' })
        } catch (err) {
          refreshEmpresa(empresaId)
          alert(err.status === 403 ? 'Sin permiso para modificar pagos (403)' : 'Error: ' + err.message)
        }
        break
      }

      case 'rechazado': {
        // nota es opcional (rechazo directo desde el split de Enviado) — solo
        // se sobrescribe localmente si vino definida, para no pisar con
        // undefined una nota existente mientras el backend la preserva (COALESCE).
        updateRow(r => ({
          ...r,
          mesesDebidos: r.mesesDebidos.map(md =>
            md.anio === anio && md.mes === mes ? { ...md, estado: 'rechazado', ...(nota !== undefined ? { nota } : {}) } : md
          ),
          historialCompleto: r.historialCompleto.map(h =>
            h.id === pagoId ? { ...h, estado: 'rechazado', ...(nota !== undefined ? { nota } : {}) } : h
          ),
        }))
        try {
          await api.updateFondoPago(empresaId, pagoId, { estado: 'rechazado', nota })
        } catch (err) {
          refreshEmpresa(empresaId)
          alert(err.status === 403 ? 'Sin permiso para modificar pagos (403)' : 'Error: ' + err.message)
        }
        break
      }

      // Editar la nota sin tocar el estado — disponible desde cualquier
      // estado de la celda (botón de nota siempre visible).
      case 'nota': {
        updateRow(r => ({
          ...r,
          mesesDebidos: r.mesesDebidos.map(md =>
            md.anio === anio && md.mes === mes ? { ...md, nota } : md
          ),
          historialCompleto: r.historialCompleto.map(h =>
            h.id === pagoId ? { ...h, nota } : h
          ),
        }))
        try {
          let targetId = pagoId
          if (!targetId) {
            // Aún no existe registro para este mes (fila virtual "pendiente")
            // — el backend lo crea con estado='pendiente' y luego le agregamos la nota.
            const np = await api.createFondoPago(empresaId, { anio, mes })
            targetId = np.id
            updateRow(r => ({
              ...r,
              mesesDebidos: r.mesesDebidos.map(md =>
                md.anio === anio && md.mes === mes ? { ...md, pagoId: np.id } : md
              ),
              historialCompleto: [...r.historialCompleto, np]
                .sort((a, b) => toYM(a.anio, a.mes) - toYM(b.anio, b.mes)),
            }))
          }
          await api.updateFondoPago(empresaId, targetId, { nota })
          updateRow(r => ({
            ...r,
            historialCompleto: r.historialCompleto.map(h =>
              h.id === targetId ? { ...h, nota } : h
            ),
          }))
        } catch (err) {
          refreshEmpresa(empresaId)
          alert(err.status === 403 ? 'Sin permiso para modificar pagos (403)' : 'Error: ' + err.message)
        }
        break
      }

      case 'pendiente': {
        updateRow(r => ({
          ...r,
          mesesDebidos: r.mesesDebidos.map(md =>
            md.anio === anio && md.mes === mes ? { ...md, estado: 'pendiente' } : md
          ),
          historialCompleto: r.historialCompleto.map(h =>
            h.id === pagoId ? { ...h, estado: 'pendiente' } : h
          ),
        }))
        try {
          await api.updateFondoPago(empresaId, pagoId, { estado: 'pendiente' })
        } catch (err) {
          refreshEmpresa(empresaId)
          alert(err.status === 403 ? 'Sin permiso para modificar pagos (403)' : 'Error: ' + err.message)
        }
        break
      }

      case 'autorizar': {
        updateRow(r => ({
          ...r,
          mesesDebidos: r.mesesDebidos.map(md =>
            md.anio === anio && md.mes === mes ? { ...md, autorizado } : md
          ),
        }))
        try {
          await api.updateFondoPagoAutorizado(empresaId, anio, mes, autorizado)
          // Si el mes aún no tenía registro, el backend lo crea — refrescamos
          // para tomar el pagoId nuevo y mantener historialCompleto consistente.
          if (!pagoId) refreshEmpresa(empresaId)
        } catch (err) {
          refreshEmpresa(empresaId)
          alert(err.status === 403 ? 'Sin permiso para autorizar pagos (403)' : 'Error: ' + err.message)
        }
        break
      }

      case 'revertirAprobado': {
        // Revierte un pago aprobado a 'enviado' (para corregir un error)
        updateRow(r => {
          const newHistorial = r.historialCompleto.map(h =>
            h.id === pagoId ? { ...h, estado: 'enviado' } : h
          )
          return {
            ...r,
            historialCompleto: newHistorial,
            mesesDebidos: calcularMesesDebidos(newHistorial, mesHabilitadoYM),
          }
        })
        try {
          await api.updateFondoPago(empresaId, pagoId, { estado: 'enviado' })
        } catch (err) {
          refreshEmpresa(empresaId)
          alert(err.status === 403 ? 'Sin permiso para modificar pagos (403)' : 'Error: ' + err.message)
        }
        break
      }
    }
  }, [refreshEmpresa, mesHabilitadoYM])

  // ── derived values ────────────────────────────────────────────────────────────

  const catCounts = useMemo(() => ({
    contable:   rows.filter(r => (r.empresa.categoria ?? 'contable') === 'contable').length,
    tributario: rows.filter(r => (r.empresa.categoria ?? 'contable') === 'tributario').length,
  }), [rows])

  const tabs = [
    { key: 'todas',      label: 'Todas',      count: rows.length },
    { key: 'contable',   label: 'Contable',   count: catCounts.contable },
    { key: 'tributario', label: 'Tributario', count: catCounts.tributario },
  ]

  const scopedRows = useMemo(() =>
    activeTab === 'todas' ? rows : rows.filter(r => (r.empresa.categoria ?? 'contable') === activeTab),
  [rows, activeTab])

  // Mes seleccionado en las tarjetas de resumen — Feb 2026 hasta el mes
  // habilitado, mismo límite que la ventana de la grilla pero con su propio
  // offset (statsMonthsBack).
  const maxStatsMonthsBack = mesHabilitadoYM == null
    ? 0
    : Math.max(ymToIndex(mesHabilitadoYM) - START_IDX, 0)

  const statsSelectedYM = mesHabilitadoYM == null
    ? null
    : indexToYM(ymToIndex(mesHabilitadoYM) - statsMonthsBack)

  const statsMonthLabel = statsSelectedYM == null
    ? ''
    : `${MONTHS_SHORT[fromYM(statsSelectedYM).mes - 1]} ${fromYM(statsSelectedYM).anio}`

  const stats = useMemo(() => {
    if (statsSelectedYM == null) return { total: scopedRows.length, pagadas: 0, esperando: 0, enMora: 0 }
    const { anio: statsAnio, mes: statsMes } = fromYM(statsSelectedYM)
    const debitoDelMes = r => r.mesesDebidos.find(md => md.anio === statsAnio && md.mes === statsMes) ?? null
    return {
      total:     scopedRows.length,
      pagadas:   scopedRows.filter(r => !debitoDelMes(r)).length,
      esperando: scopedRows.filter(r => debitoDelMes(r)?.estado === 'enviado').length,
      enMora:    scopedRows.filter(r => debitoDelMes(r) != null).length,
    }
  }, [scopedRows, statsSelectedYM])

  const visibleRows = useMemo(() => {
    const q = search.toLowerCase()
    return scopedRows.filter(r => !q || r.empresa.name.toLowerCase().includes(q))
  }, [scopedRows, search])

  // Ventana deslizante de VENTANA_MESES meses (máximo) — nunca antes de
  // Feb 2026 (START_IDX) ni después del mes habilitado. Las flechas la
  // desplazan de a un mes, no de a bloques.
  const maxMonthsBack = mesHabilitadoYM == null
    ? 0
    : Math.max(ymToIndex(mesHabilitadoYM) - START_IDX - (VENTANA_MESES - 1), 0)

  const months = useMemo(() => {
    if (mesHabilitadoYM == null) return []
    const habilitadoIdx = ymToIndex(mesHabilitadoYM)
    const ventanaFinIdx = habilitadoIdx - monthsBack
    const ventanaInicioIdx = Math.max(ventanaFinIdx - (VENTANA_MESES - 1), START_IDX)
    const out = []
    for (let idx = ventanaInicioIdx; idx <= ventanaFinIdx; idx++) out.push(fromYM(indexToYM(idx)))
    return out
  }, [mesHabilitadoYM, monthsBack])

  // ── loading / error ───────────────────────────────────────────────────────────
  if (loading) return (
    <div className="flex items-center justify-center py-20 text-[#8890b5] dark:text-[#5a5f7a]">
      <span className="material-symbols-outlined mr-2" style={{ fontSize: 20, animation: 'spin 1s linear infinite' }}>
        progress_activity
      </span>
      Cargando historial de pagos…
    </div>
  )

  if (error) return (
    <div className="flex flex-col items-center gap-3 py-20">
      <span className="material-symbols-outlined text-[#ef4444]" style={{ fontSize: 32 }}>error</span>
      <p className="text-sm text-[#ef4444]">{error}</p>
      <button
        onClick={fetchAll}
        className="px-4 py-2 text-sm rounded-lg border border-[#e2e4ef] dark:border-[#2e3148] hover:bg-[#f3f4f6] dark:hover:bg-[#252840] transition"
      >
        Reintentar
      </button>
    </div>
  )

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-5 min-w-0">

      {/* ── Page header ──────────────────────────────────────────────────── */}
      <div>
        <h1 className="text-xl font-bold text-[#191c1e] dark:text-[#e4e6f0]">Pagos Fondo Emprender</h1>
        <p className="text-sm text-[#6b7280] dark:text-[#8890b5]">
          Mensualidades a la fiduciaria · {rows.length} empresas
        </p>
      </div>

      {/* ── Stats cards ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatsCard
          title="Total empresas"
          value={stats.total}
          icon="corporate_fare"
          borderColor="#004ac6" iconColor="#004ac6"
          sub={activeTab !== 'todas' ? activeTab : 'todas las categorías'}
          subColor="#434655"
        />
        <StatsCard
          title="Pagadas este mes"
          value={stats.pagadas}
          icon="check_circle"
          borderColor="#16a34a" iconColor="#16a34a"
          sub={stats.pagadas > 0 ? 'Sin pendientes ese mes' : 'Con empresas pendientes'}
          subColor={stats.pagadas > 0 ? '#16a34a' : '#434655'}
          monthLabel={statsMonthLabel}
          onPrevMonth={() => setStatsMonthsBack(b => Math.min(b + 1, maxStatsMonthsBack))}
          onNextMonth={() => setStatsMonthsBack(b => Math.max(b - 1, 0))}
          prevMonthDisabled={statsMonthsBack >= maxStatsMonthsBack}
          nextMonthDisabled={statsMonthsBack <= 0}
        />
        <StatsCard
          title="Esperando respuesta"
          value={stats.esperando}
          icon="send"
          borderColor="#d97706" iconColor="#d97706"
          sub="Documentos enviados"
          subColor="#434655"
          monthLabel={statsMonthLabel}
          onPrevMonth={() => setStatsMonthsBack(b => Math.min(b + 1, maxStatsMonthsBack))}
          onNextMonth={() => setStatsMonthsBack(b => Math.max(b - 1, 0))}
          prevMonthDisabled={statsMonthsBack >= maxStatsMonthsBack}
          nextMonthDisabled={statsMonthsBack <= 0}
        />
        <StatsCard
          title="En mora"
          value={stats.enMora}
          icon="warning"
          borderColor="#ef4444" iconColor="#ef4444"
          sub={stats.enMora > 0 ? 'Deben ese mes' : 'Todo al día'}
          subColor={stats.enMora > 0 ? '#ef4444' : '#16a34a'}
          monthLabel={statsMonthLabel}
          onPrevMonth={() => setStatsMonthsBack(b => Math.min(b + 1, maxStatsMonthsBack))}
          onNextMonth={() => setStatsMonthsBack(b => Math.max(b - 1, 0))}
          prevMonthDisabled={statsMonthsBack >= maxStatsMonthsBack}
          nextMonthDisabled={statsMonthsBack <= 0}
        />
      </div>

      {/* ── Filters row ──────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 flex-wrap">

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
                  style={active ? { background: '#004ac6', color: '#fff' } : { background: '#e2e4ef', color: '#6b7280' }}
                >
                  {count}
                </span>
              </button>
            )
          })}
        </div>

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
      </div>

      {/* ── Table ────────────────────────────────────────────────────────── */}
      {visibleRows.length === 0 ? (
        <div className="text-center py-16 text-[#8890b5] dark:text-[#5a5f7a] text-sm">
          {search || activeTab !== 'todas'
            ? 'No hay empresas que coincidan con el filtro'
            : 'No se encontraron empresas'}
        </div>
      ) : (
        <div className="flex flex-col gap-2">

          <div className="flex justify-between items-center flex-wrap gap-2">
            <div className="flex items-center gap-2 text-xs">
              <span className="text-[#6b7280] dark:text-[#8890b5]">
                Mes habilitado: <span className="font-semibold text-[#191c1e] dark:text-[#e4e6f0]">
                  {mesHabilitadoYM != null && `${MONTHS_SHORT[fromYM(mesHabilitadoYM).mes - 1]} ${fromYM(mesHabilitadoYM).anio}`}
                </span>
              </span>
              {canAutorizar && mesHabilitadoYM != null && (
                <button
                  onClick={requestAvanzarMes}
                  disabled={avanzandoMes}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold border transition-colors disabled:opacity-50"
                  style={{ background: '#f0fdf4', color: '#16a34a', borderColor: '#bbf7d0' }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 14 }}>event_available</span>
                  Habilitar {(() => { const n = fromYM(nextYM(mesHabilitadoYM)); return `${MONTHS_SHORT[n.mes - 1]} ${n.anio}` })()}
                </button>
              )}
              {canAutorizar && mesHabilitadoYM != null && (
                <button
                  onClick={requestRetrocederMes}
                  disabled={avanzandoMes}
                  title={`Deshacer — volver a ${(() => { const p = fromYM(prevYM(mesHabilitadoYM)); return `${MONTHS_SHORT[p.mes - 1]} ${p.anio}` })()}`}
                  className="flex items-center justify-center w-6 h-6 rounded-lg border transition-colors disabled:opacity-50 text-[#6b7280] dark:text-[#8890b5] border-[#e2e4ef] dark:border-[#2e3148] hover:bg-[#f3f4f6] dark:hover:bg-[#252840]"
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 14 }}>undo</span>
                </button>
              )}
            </div>

            {/* Ventana deslizante de VENTANA_MESES meses — las flechas
                desplazan de a un mes, entre Feb 2026 y el mes habilitado */}
            <div className="flex items-center gap-1 bg-white dark:bg-[#1e2030] border border-[#e2e4ef] dark:border-[#2e3148] rounded-xl px-2 py-1.5 shadow-sm">
              <button
                onClick={() => setMonthsBack(b => Math.min(b + 1, maxMonthsBack))}
                disabled={monthsBack >= maxMonthsBack}
                title="Meses anteriores"
                className="p-0.5 rounded hover:bg-[#f3f4f6] dark:hover:bg-[#252840] transition text-[#6b7280] disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent"
              >
                <span className="material-symbols-outlined text-xl">chevron_left</span>
              </button>
              <span className="text-xs font-semibold text-[#191c1e] dark:text-[#e4e6f0] px-1 min-w-[140px] text-center whitespace-nowrap">
                {months.length > 0 && (
                  months.length === 1
                    ? `${MONTHS_SHORT[months[0].mes - 1]} ${months[0].anio}`
                    : `${MONTHS_SHORT[months[0].mes - 1]} ${months[0].anio} – ${MONTHS_SHORT[months[months.length - 1].mes - 1]} ${months[months.length - 1].anio}`
                )}
              </span>
              <button
                onClick={() => setMonthsBack(b => Math.max(b - 1, 0))}
                disabled={monthsBack <= 0}
                title="Meses más recientes"
                className="p-0.5 rounded hover:bg-[#f3f4f6] dark:hover:bg-[#252840] transition text-[#6b7280] disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent"
              >
                <span className="material-symbols-outlined text-xl">chevron_right</span>
              </button>
            </div>
          </div>

          <div
            className="bg-white dark:bg-[#1e2030] rounded-xl border border-[#e2e4ef] dark:border-[#2e3148] shadow-sm"
            style={{ overflowX: 'auto' }}
          >
            {/* Ancho exacto según las columnas que haya (nunca más de
                VENTANA_MESES) — así ninguna columna se estira cuando el
                bloque queda incompleto (ej. un mes recién habilitado y
                solo): el espacio sobrante queda libre, no repartido. */}
            <table
              style={{
                borderCollapse: 'collapse',
                tableLayout: 'fixed',
                // Bloque completo (VENTANA_MESES meses): llena el ancho
                // disponible. Bloque parcial: ancho exacto de sus columnas,
                // sin estirarse — el sobrante queda libre.
                width: months.length === VENTANA_MESES ? '100%' : 240 + months.length * 200,
              }}
            >
              <colgroup>
                <col style={{ width: 240 }} />
                {months.map(m => (
                  <Fragment key={m.ym}>
                    <col style={{ width: 100 }} />
                    <col style={{ width: 100 }} />
                  </Fragment>
                ))}
              </colgroup>
              <thead>
                {/* Fila 1: Empresa (rowSpan=2) + mes encabezado (colSpan=2) */}
                <tr>
                  <th
                    rowSpan={2}
                    style={{
                      position: 'sticky', left: 0, zIndex: 3,
                      padding: '10px 12px',
                      width: 240, minWidth: 200, maxWidth: 240,
                      textAlign: 'left', fontSize: 13, fontWeight: 600,
                      boxShadow: '2px 0 4px rgba(0,0,0,0.04)',
                      overflow: 'hidden',
                    }}
                    className="bg-white dark:bg-[#1e2030] text-[#434655] dark:text-[#c4c8e8] border-b-2 border-r-2 border-[#e2e4ef] dark:border-[#2e3148]"
                  >
                    Empresa
                  </th>
                  {months.map(m => (
                    <th
                      key={m.ym}
                      colSpan={2}
                      style={{
                        textAlign: 'center', fontSize: 12, fontWeight: 600,
                        padding: '6px 4px',
                        whiteSpace: 'nowrap',
                      }}
                      className="bg-white dark:bg-[#1e2030] text-[#434655] dark:text-[#c4c8e8] border-b border-l-2 border-[#e2e4ef] dark:border-[#2e3148]"
                    >
                      {MONTHS_SHORT[m.mes - 1]} {m.anio}
                    </th>
                  ))}
                </tr>
                {/* Fila 2: Envío / Resultado sub-headers */}
                <tr>
                  {months.map(m => (
                    <Fragment key={m.ym}>
                      <th
                        style={{ textAlign: 'center', fontSize: 11, fontWeight: 500, padding: '4px 6px', width: 100, maxWidth: 100 }}
                        className="bg-[#f8f9fe] dark:bg-[#252840] text-[#8890b5] dark:text-[#5a5f7a] border-b-2 border-l-2 border-[#e2e4ef] dark:border-[#2e3148]"
                      >
                        Envío
                      </th>
                      <th
                        style={{ textAlign: 'center', fontSize: 11, fontWeight: 500, padding: '4px 6px', width: 100, maxWidth: 100 }}
                        className="bg-[#f8f9fe] dark:bg-[#252840] text-[#8890b5] dark:text-[#5a5f7a] border-b-2 border-[#e2e4ef] dark:border-[#2e3148]"
                      >
                        Resultado
                      </th>
                    </Fragment>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row, idx) => (
                  <tr
                    key={row.empresa.id}
                    style={idx > 0 ? { borderTop: '1px solid #f0f2f8' } : undefined}
                    className="dark:border-[#2e3148]"
                  >
                    {/* Sticky empresa column */}
                    <td
                      style={{
                        position: 'sticky', left: 0, zIndex: 2,
                        padding: '8px 10px',
                        boxShadow: '2px 0 4px rgba(0,0,0,0.04)',
                        width: 240, minWidth: 200, maxWidth: 240,
                        verticalAlign: 'middle',
                        overflow: 'hidden',
                        whiteSpace: 'nowrap',
                      }}
                      className="bg-white dark:bg-[#1e2030] border-r-2 border-[#e2e4ef] dark:border-[#2e3148]"
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span
                          style={{
                            width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                            background: row.mesesDebidos.length > 0 ? '#ef4444' : '#16a34a',
                          }}
                        />
                        <span
                          className="text-[#191c1e] dark:text-[#e4e6f0] truncate"
                          title={row.empresa.name}
                          style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600 }}
                        >
                          {row.empresa.name}
                        </span>
                      </div>
                      {row.mesesDebidos.length > 0 && (
                        <div style={{ marginTop: 2, paddingLeft: 14 }}>
                          <span style={{ fontSize: 12, color: '#ef4444', fontWeight: 600 }}>
                            {row.mesesDebidos.length} mes{row.mesesDebidos.length > 1 ? 'es' : ''} faltantes
                          </span>
                        </div>
                      )}
                    </td>

                    {/* Month cells */}
                    {months.map(m => (
                      <PagoCell
                        key={`${m.anio}-${m.mes}`}
                        empresa={row.empresa}
                        anio={m.anio}
                        mes={m.mes}
                        mesesDebidos={row.mesesDebidos}
                        historialCompleto={row.historialCompleto}
                        onAction={handleAction}
                        canAutorizar={canAutorizar}
                      />
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Confirmación habilitar/deshacer mes ──────────────────────────── */}
      {confirmMes && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={() => setConfirmMes(null)}>
          <div
            className="bg-white dark:bg-[#1e2030] rounded-2xl shadow-2xl p-6 max-w-xs mx-4 border border-[#e2e4ef] dark:border-[#2e3148]"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-3">
              <span
                className="material-symbols-outlined text-2xl"
                style={{ color: confirmMes.tipo === 'habilitar' ? '#16a34a' : '#6b7280' }}
              >
                {confirmMes.tipo === 'habilitar' ? 'event_available' : 'undo'}
              </span>
              <p className="text-sm font-semibold text-[#191c1e] dark:text-[#e4e6f0]">
                {confirmMes.tipo === 'habilitar' ? `¿Habilitar ${confirmMes.label}?` : `¿Volver a ${confirmMes.label}?`}
              </p>
            </div>
            <p className="text-xs text-[#6b7280] dark:text-[#8890b5] mb-4">
              {confirmMes.tipo === 'habilitar'
                ? 'Todas las empresas podrán empezar a tramitar ese mes.'
                : 'Se ocultará el mes habilitado actualmente.'}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setConfirmMes(null)}
                className="flex-1 py-2 text-xs font-semibold rounded-lg border border-[#e2e4ef] dark:border-[#2e3148] text-[#6b7280] hover:bg-[#f3f4f6] dark:hover:bg-[#252840] transition"
              >
                Cancelar
              </button>
              <button
                onClick={confirmarAccionMes}
                className="flex-1 py-2 text-xs font-semibold rounded-lg text-white transition hover:opacity-90"
                style={{ background: confirmMes.tipo === 'habilitar' ? '#16a34a' : '#6b7280' }}
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
