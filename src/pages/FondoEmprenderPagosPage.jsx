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

const START_YM        = 2026 * 100 + 3  // Marzo 2026 — inicio del programa (para mora/meses debidos)
const BLOQUE_ORIGEN_YM = 2026 * 100 + 2 // Febrero 2026 — ancla de la grilla de bloques de a 5
                                         // (un mes antes de marzo para que el primer bloque
                                         // ya muestre 5 columnas completas en vez de 4)
const START_IDX      = ymToIndex(BLOQUE_ORIGEN_YM)
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
const TD_ENV_CLS   = 'border border-[#93C5FD] bg-[#DBEAFE]'
const TD_PAG_CLS   = 'border border-[#86EFAC] bg-[#DCFCE7]'
const TD_ENV_RES_CLS = 'border border-[#93C5FD] bg-[#F0F9FF]'

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
  const [notaInput,    setNotaInput]    = useState({ open: false, draft: '' })

  const debito    = mesesDebidos.find(md => md.anio === anio && md.mes === mes) ?? null
  const histEntry = historialCompleto.find(h => h.anio === anio && h.mes === mes) ?? null

  function act(action, extra = {}) {
    onAction(action, { empresaId: empresa.id, anio, mes, pagoId: debito?.pagoId ?? histEntry?.id ?? null, ...extra })
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
        </td>
      )
    }
    return <td colSpan={2} className={TD_EMPTY_CLS} style={{ ...TD_STYLE, color: '#c8c5bc' }}>—</td>
  }

  const { estado, nota, autorizado } = debito

  // ── Pendiente ────────────────────────────────────────────────────────────────
  if (estado === 'pendiente') {
    return (
      <td colSpan={2} className={autorizado ? TD_PEND_CLS : TD_BLOQ_CLS} style={TD_STYLE}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
          <div style={ROW}>
            {autorizado ? (
              <>
                <span style={{ ...BTN.base, ...BTN.pendiente }}>Pendiente</span>
                <button
                  className="hover:opacity-80"
                  onClick={() => act('enviado')}
                  style={{ ...BTN.base, ...BTN.pill, ...BTN.enviado }}
                >
                  Enviado →
                </button>
              </>
            ) : (
              <span style={{ ...BTN.base, color: '#4B5563', fontWeight: 600, fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 14 }}>lock</span>
                Bloqueado
              </span>
            )}
          </div>

          {/* Toggle de autorización — ícono simple, tenue por defecto y a
              toda opacidad al hover; el significado va en el title. En su
              propia fila para que nunca invada el resto de la celda. */}
          {canAutorizar && (
            <button
              onClick={() => act('autorizar', { autorizado: !autorizado })}
              title={autorizado ? 'Bloquear envío hasta nueva orden' : 'Autorizar envío'}
              className="opacity-50 hover:opacity-100 transition-opacity duration-150"
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                border: 'none', background: 'transparent', padding: 0, cursor: 'pointer',
              }}
            >
              <span
                className="material-symbols-outlined"
                style={{ fontSize: 14, color: autorizado ? '#9CA3AF' : '#4B5563', lineHeight: 1 }}
              >
                {autorizado ? 'lock_open' : 'lock'}
              </span>
            </button>
          )}
        </div>
      </td>
    )
  }

  // ── Enviado ──────────────────────────────────────────────────────────────────
  if (estado === 'enviado') {
    return (
      <>
        <td className={TD_ENV_CLS} style={TD_STYLE}>
          <span style={{ ...BTN.base, ...BTN.enviadoFix }}>Enviado</span>
        </td>
        <td className={TD_ENV_RES_CLS} style={{ ...TD_STYLE, padding: '6px 12px' }}>
          {notaInput.open ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, width: '100%' }}>
              <input
                autoFocus
                value={notaInput.draft}
                onChange={e => setNotaInput(s => ({ ...s, draft: e.target.value }))}
                onKeyDown={e => {
                  if (e.key === 'Enter') { act('rechazado', { nota: notaInput.draft }); setNotaInput({ open: false, draft: '' }) }
                  if (e.key === 'Escape') setNotaInput({ open: false, draft: '' })
                }}
                placeholder="Motivo del rechazo..."
                style={{
                  width: '100%', padding: '4px 8px', fontSize: 11, borderRadius: 6,
                  border: '1px solid #93C5FD', outline: 'none', boxSizing: 'border-box',
                  background: 'rgba(255,255,255,0.8)',
                }}
              />
              <div style={{ display: 'flex', gap: 4 }}>
                <button
                  className="hover:opacity-80"
                  onClick={() => { act('rechazado', { nota: notaInput.draft }); setNotaInput({ open: false, draft: '' }) }}
                  style={{ flex: 1, padding: '4px 0', borderRadius: 6, border: 'none', background: '#EF4444', color: '#fff', fontWeight: 600, fontSize: 11, cursor: 'pointer', transition: 'all 150ms ease-out' }}
                >OK</button>
                <button
                  onClick={() => setNotaInput({ open: false, draft: '' })}
                  style={{ padding: '4px 8px', borderRadius: 6, border: 'none', background: 'rgba(255,255,255,0.6)', color: '#444441', fontWeight: 400, fontSize: 11, cursor: 'pointer' }}
                >×</button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
              <button
                className="hover:opacity-80"
                onClick={() => act('aprobado')}
                style={{ ...BTN.base, ...BTN.pill, ...BTN.pagado, width: 90, padding: '4px 14px' }}
              >Pagado</button>
              <button
                className="hover:opacity-80"
                onClick={() => setNotaInput({ open: true, draft: '' })}
                style={{ ...BTN.base, ...BTN.pill, ...BTN.rechazado, width: 90, padding: '4px 14px' }}
              >Rechazado</button>
            </div>
          )}
        </td>
      </>
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
        {/* Texto centrado — separado de la nota para no desplazarse */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 46 }}>
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

        {/* Pill "Nota" en esquina inferior derecha — solo si hay nota */}
        {nota?.trim() && (
          <>
            <div
              style={{
                position: 'absolute',
                bottom: 6,
                right: 6,
                height: 22,
                width: hovNota ? 60 : 22,
                background: hovNota ? 'rgba(239,68,68,0.20)' : 'rgba(239,68,68,0.12)',
                borderRadius: 11,
                overflow: 'hidden',
                transition: 'width 220ms ease-out, background 150ms ease-out',
                display: 'flex',
                alignItems: 'center',
                paddingLeft: 4,
                gap: 2,
                cursor: 'default',
                whiteSpace: 'nowrap',
                zIndex: 1,
              }}
              onMouseEnter={(e) => { e.stopPropagation(); setHovNota(true) }}
              onMouseLeave={() => setHovNota(false)}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 13, color: '#991B1B', lineHeight: 1, flexShrink: 0 }}>sticky_note_2</span>
              <span style={{ fontSize: 11, fontWeight: 600, color: '#991B1B', opacity: hovNota ? 1 : 0, transition: 'opacity 140ms ease-out 60ms' }}>Nota</span>
            </div>

            {/* Popover flotante con el contenido — no afecta el tamaño de la celda */}
            <div style={{
              position: 'absolute',
              bottom: 34,
              right: 6,
              width: 190,
              background: 'white',
              borderRadius: 8,
              boxShadow: '0 6px 16px rgba(0,0,0,0.12)',
              border: '1px solid #FEE2E2',
              padding: '10px 12px',
              zIndex: 200,
              opacity: hovNota ? 1 : 0,
              pointerEvents: 'none',
              transform: hovNota ? 'translateY(0)' : 'translateY(6px)',
              transition: 'opacity 160ms ease-out, transform 160ms ease-out',
            }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: '#EF4444', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 5 }}>Nota</div>
              <div style={{ fontSize: 12, color: '#7F1D1D', lineHeight: 1.5, wordBreak: 'break-word' }}>{nota}</div>
            </div>
          </>
        )}

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
  const [blockIndex,    setBlockIndex]    = useState(0) // índice del bloque de VENTANA_MESES, contado desde marzo

  // Al cargar / cambiar el mes habilitado, mostrar el bloque que lo contiene
  useEffect(() => {
    if (mesHabilitadoYM != null) {
      setBlockIndex(Math.floor((ymToIndex(mesHabilitadoYM) - START_IDX) / VENTANA_MESES))
    }
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
        updateRow(r => ({
          ...r,
          mesesDebidos: r.mesesDebidos.map(md =>
            md.anio === anio && md.mes === mes ? { ...md, estado: 'rechazado', nota } : md
          ),
          historialCompleto: r.historialCompleto.map(h =>
            h.id === pagoId ? { ...h, estado: 'rechazado', nota } : h
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

  const stats = useMemo(() => ({
    total:     scopedRows.length,
    pagadas:   scopedRows.filter(r => r.mesesDebidos.length === 0).length,
    esperando: scopedRows.filter(r => {
      const oldest = [...r.mesesDebidos].sort((a, b) => toYM(a.anio, a.mes) - toYM(b.anio, b.mes))[0]
      return oldest?.estado === 'enviado'
    }).length,
    enMora: scopedRows.filter(r => r.mesesDebidos.length > 0).length,
  }), [scopedRows])

  const visibleRows = useMemo(() => {
    const q = search.toLowerCase()
    return scopedRows.filter(r => !q || r.empresa.name.toLowerCase().includes(q))
  }, [scopedRows, search])

  // Bloques fijos de VENTANA_MESES meses contados desde marzo (START_YM), en
  // orden — no una ventana deslizante. Bloque 0 = Mar-Jul, bloque 1 = Ago-Dic,
  // etc. Nunca muestra más de VENTANA_MESES columnas, así que no debería
  // necesitar scroll horizontal. Las flechas pasean entre bloques completos.
  const maxBlockIndex = mesHabilitadoYM == null
    ? 0
    : Math.floor((ymToIndex(mesHabilitadoYM) - START_IDX) / VENTANA_MESES)

  const months = useMemo(() => {
    if (mesHabilitadoYM == null) return []
    const habilitadoIdx = ymToIndex(mesHabilitadoYM)
    const bloqueInicioIdx = START_IDX + blockIndex * VENTANA_MESES
    const bloqueFinIdx = Math.min(bloqueInicioIdx + VENTANA_MESES - 1, habilitadoIdx)
    const out = []
    for (let idx = bloqueInicioIdx; idx <= bloqueFinIdx; idx++) out.push(fromYM(indexToYM(idx)))
    return out
  }, [mesHabilitadoYM, blockIndex])

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
          sub={stats.pagadas > 0 ? 'Sin meses debidos' : 'Con meses pendientes'}
          subColor={stats.pagadas > 0 ? '#16a34a' : '#434655'}
        />
        <StatsCard
          title="Esperando respuesta"
          value={stats.esperando}
          icon="send"
          borderColor="#d97706" iconColor="#d97706"
          sub="Documentos enviados"
          subColor="#434655"
        />
        <StatsCard
          title="En mora"
          value={stats.enMora}
          icon="warning"
          borderColor="#ef4444" iconColor="#ef4444"
          sub={stats.enMora > 0 ? 'Requieren atención' : 'Todo al día'}
          subColor={stats.enMora > 0 ? '#ef4444' : '#16a34a'}
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

            {/* Navegador de bloques de VENTANA_MESES meses — nunca crece, se
                pasea por bloques fijos en vez de expandir la tabla */}
            <div className="flex items-center gap-1 bg-white dark:bg-[#1e2030] border border-[#e2e4ef] dark:border-[#2e3148] rounded-xl px-2 py-1.5 shadow-sm">
              <button
                onClick={() => setBlockIndex(i => Math.max(i - 1, 0))}
                disabled={blockIndex <= 0}
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
                onClick={() => setBlockIndex(i => Math.min(i + 1, maxBlockIndex))}
                disabled={blockIndex >= maxBlockIndex}
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
                        <span
                          style={{
                            fontSize: 9, fontWeight: 700, padding: '2px 5px', borderRadius: 4, flexShrink: 0,
                            ...((row.empresa.categoria ?? 'contable') === 'contable'
                              ? { background: '#f0f4ff', color: '#004ac6' }
                              : { background: '#f0fdf4', color: '#16a34a' }),
                          }}
                        >
                          {(row.empresa.categoria ?? 'contable') === 'contable' ? 'CON' : 'TRI'}
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
