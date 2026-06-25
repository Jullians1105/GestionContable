import { useState, useEffect } from 'react'
import { api } from '../services/api'

const MONTHS = [
  'Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre',
]

const MACROS = [
  { id: 'mp1', nombre: 'Facturación' },
  { id: 'mp2', nombre: 'Nómina' },
  { id: 'mp3', nombre: 'Nómina electrónica' },
  { id: 'mp4', nombre: 'Documentos contador - Pagos' },
  { id: 'mp6', nombre: 'Información tributaria' },
  { id: 'mp7', nombre: 'Producción y ventas' },
]

// taskId: presente → guarda en API; ausente → modo draft (llama onDraftChange con los datos)
export default function FondoLinkSelector({ taskId = null, readOnly = false, onDraftChange = null }) {
  const today = new Date()

  const [link, setLink]            = useState(null)
  const [loadingLink, setLoadLink] = useState(!!taskId)
  const [editing, setEditing]      = useState(false)
  const [saving, setSaving]        = useState(false)
  const [error, setError]          = useState(null)

  const [linkType, setLinkType]    = useState('macroproceso')
  const [empresaId, setEmpresaId]  = useState('')
  const [macroId, setMacroId]      = useState('mp1')
  const [procesoId, setProcesoId]  = useState('')
  const [anio, setAnio]            = useState(today.getFullYear())
  const [mes, setMes]              = useState(today.getMonth() + 1)

  const [empresas, setEmpresas]    = useState([])
  const [procesos, setProcesos]    = useState([])

  // Cargar link actual (solo si existe taskId)
  useEffect(() => {
    if (!taskId) return
    setLoadLink(true)
    api.getFondoLink(taskId)
      .then(data => setLink(data))
      .catch(() => setLink(null))
      .finally(() => setLoadLink(false))
  }, [taskId])

  // Cargar catálogos al abrir el form
  useEffect(() => {
    if (!editing) return
    Promise.all([api.getFondoEmpresas(), api.getFondoProcesos()])
      .then(([emp, proc]) => {
        setEmpresas(emp)
        setProcesos(proc)
        if (link) {
          setLinkType(link.linkType)
          setEmpresaId(link.empresaId)
          setMacroId(link.macroId ?? 'mp1')
          setProcesoId(link.procesoId ?? '')
          setAnio(link.anio ?? today.getFullYear())
          setMes(link.mes ?? today.getMonth() + 1)
        } else {
          if (emp.length > 0) setEmpresaId(emp[0].id)
          if (proc.length > 0) setProcesoId(proc[0].id)
        }
      })
      .catch(() => setError('Error cargando catálogos'))
  }, [editing]) // eslint-disable-line react-hooks/exhaustive-deps

  const buildPayload = () => {
    const payload = { empresaId, linkType }
    if (linkType === 'macroproceso') payload.macroId = macroId
    else { payload.procesoId = procesoId; payload.anio = anio; payload.mes = mes }
    return payload
  }

  const handleSave = async () => {
    setError(null)
    const payload = buildPayload()

    // Modo draft: no hay taskId todavía
    if (!taskId) {
      setLink({ ...payload, _draft: true })
      setEditing(false)
      onDraftChange?.(payload)
      return
    }

    setSaving(true)
    try {
      const saved = await api.setFondoLink(taskId, payload)
      setLink(saved)
      setEditing(false)
    } catch (err) {
      setError(err.message || 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!taskId) {
      setLink(null)
      setEditing(false)
      onDraftChange?.(null)
      return
    }
    setSaving(true)
    try {
      await api.deleteFondoLink(taskId)
      setLink(null)
      setEditing(false)
    } catch (err) {
      setError(err.message || 'Error al eliminar')
    } finally {
      setSaving(false)
    }
  }

  if (loadingLink) return null

  // ── Badge con link activo ─────────────────────────────────────────────────
  if (link && !editing) {
    const macroLabel = MACROS.find(m => m.id === link.macroId)?.nombre ?? link.macroNombre ?? link.macroId
    const desc = link.linkType === 'macroproceso'
      ? `${link.empresaNombre ?? empresaId} → ${macroLabel}`
      : `${link.empresaNombre ?? empresaId} → ${link.procesoNombre ?? procesoId} (${MONTHS[link.mes - 1]} ${link.anio})`

    return (
      <div className="flex items-center gap-2 flex-wrap">
        <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-[#ede9fe] text-[#6d28d9] border border-[#c4b5fd]">
          <span className="material-symbols-outlined" style={{ fontSize: 13 }}>link</span>
          {desc}
        </span>
        {!readOnly && (
          <>
            <button
              onClick={() => setEditing(true)}
              className="p-1 rounded hover:bg-[#f3f4f6] dark:hover:bg-[#252840] text-[#8890b5] hover:text-[#004ac6] transition"
              title="Cambiar vínculo"
            >
              <span className="material-symbols-outlined" style={{ fontSize: 14 }}>edit</span>
            </button>
            <button
              onClick={handleDelete}
              disabled={saving}
              className="p-1 rounded hover:bg-red-50 text-[#8890b5] hover:text-red-500 transition"
              title="Quitar vínculo"
            >
              <span className="material-symbols-outlined" style={{ fontSize: 14 }}>link_off</span>
            </button>
          </>
        )}
      </div>
    )
  }

  // ── Sin link — botón "Vincular" ───────────────────────────────────────────
  if (!link && !editing) {
    if (readOnly) return null
    return (
      <button
        onClick={() => setEditing(true)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-dashed border-[#c4b5fd] text-[#7c3aed] hover:bg-[#ede9fe] transition"
      >
        <span className="material-symbols-outlined" style={{ fontSize: 14 }}>add_link</span>
        Vincular a Fondo Emprender
      </button>
    )
  }

  // ── Formulario de edición ─────────────────────────────────────────────────
  return (
    <div className="rounded-xl border border-[#c4b5fd] bg-[#faf5ff] dark:bg-[#1e1530] p-3 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold text-[#7c3aed] uppercase tracking-wide flex items-center gap-1">
          <span className="material-symbols-outlined" style={{ fontSize: 13 }}>link</span>
          Vínculo Fondo Emprender
        </span>
        <button
          onClick={() => { setEditing(false); setError(null) }}
          className="p-0.5 rounded text-[#8890b5] hover:text-[#191c1e] dark:hover:text-[#e4e6f0] transition"
        >
          <span className="material-symbols-outlined" style={{ fontSize: 14 }}>close</span>
        </button>
      </div>

      <div className="flex gap-2">
        {[{ v: 'macroproceso', label: 'Macroproceso' }, { v: 'checklist', label: 'Checklist' }].map(opt => (
          <button
            key={opt.v}
            type="button"
            onClick={() => setLinkType(opt.v)}
            className="flex-1 py-1.5 text-xs font-semibold rounded-lg border-2 transition"
            style={
              linkType === opt.v
                ? { background: '#7c3aed', color: '#fff', borderColor: '#7c3aed' }
                : { background: 'transparent', color: '#7c3aed', borderColor: '#c4b5fd' }
            }
          >
            {opt.label}
          </button>
        ))}
      </div>

      <div>
        <label className="block text-[10px] font-semibold text-[#6b7280] dark:text-[#8890b5] mb-1 uppercase tracking-wide">Empresa</label>
        <select
          value={empresaId}
          onChange={e => setEmpresaId(e.target.value)}
          className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-[#e2e4ef] dark:border-[#2e3148] bg-white dark:bg-[#252840] text-[#191c1e] dark:text-[#e4e6f0] outline-none focus:ring-2 focus:ring-[#7c3aed]/30"
        >
          <option value="">-- Seleccionar --</option>
          {empresas.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
      </div>

      {linkType === 'macroproceso' && (
        <div>
          <label className="block text-[10px] font-semibold text-[#6b7280] dark:text-[#8890b5] mb-1 uppercase tracking-wide">Macroproceso</label>
          <select
            value={macroId}
            onChange={e => setMacroId(e.target.value)}
            className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-[#e2e4ef] dark:border-[#2e3148] bg-white dark:bg-[#252840] text-[#191c1e] dark:text-[#e4e6f0] outline-none focus:ring-2 focus:ring-[#7c3aed]/30"
          >
            {MACROS.map(m => <option key={m.id} value={m.id}>{m.nombre}</option>)}
          </select>
        </div>
      )}

      {linkType === 'checklist' && (
        <>
          <div>
            <label className="block text-[10px] font-semibold text-[#6b7280] dark:text-[#8890b5] mb-1 uppercase tracking-wide">Proceso</label>
            <select
              value={procesoId}
              onChange={e => setProcesoId(e.target.value)}
              className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-[#e2e4ef] dark:border-[#2e3148] bg-white dark:bg-[#252840] text-[#191c1e] dark:text-[#e4e6f0] outline-none focus:ring-2 focus:ring-[#7c3aed]/30"
            >
              <option value="">-- Seleccionar --</option>
              {procesos.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="block text-[10px] font-semibold text-[#6b7280] dark:text-[#8890b5] mb-1 uppercase tracking-wide">Mes</label>
              <select
                value={mes}
                onChange={e => setMes(Number(e.target.value))}
                className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-[#e2e4ef] dark:border-[#2e3148] bg-white dark:bg-[#252840] text-[#191c1e] dark:text-[#e4e6f0] outline-none focus:ring-2 focus:ring-[#7c3aed]/30"
              >
                {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
              </select>
            </div>
            <div className="flex-1">
              <label className="block text-[10px] font-semibold text-[#6b7280] dark:text-[#8890b5] mb-1 uppercase tracking-wide">Año</label>
              <input
                type="number"
                value={anio}
                min={2020}
                max={2100}
                onChange={e => setAnio(Number(e.target.value))}
                className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-[#e2e4ef] dark:border-[#2e3148] bg-white dark:bg-[#252840] text-[#191c1e] dark:text-[#e4e6f0] outline-none focus:ring-2 focus:ring-[#7c3aed]/30"
              />
            </div>
          </div>
        </>
      )}

      {error && (
        <p className="text-xs text-red-500 flex items-center gap-1">
          <span className="material-symbols-outlined" style={{ fontSize: 13 }}>error</span>
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || !empresaId || (linkType === 'macroproceso' && !macroId) || (linkType === 'checklist' && !procesoId)}
          className="flex-1 py-1.5 text-xs font-semibold rounded-lg text-white transition disabled:opacity-50"
          style={{ background: '#7c3aed' }}
        >
          {saving ? 'Guardando…' : 'Guardar vínculo'}
        </button>
        {link && (
          <button
            type="button"
            onClick={handleDelete}
            disabled={saving}
            className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-red-200 text-red-500 hover:bg-red-50 transition disabled:opacity-50"
          >
            Quitar
          </button>
        )}
      </div>
    </div>
  )
}
