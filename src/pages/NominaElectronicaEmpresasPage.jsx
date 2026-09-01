import { useState, useEffect, useCallback, useRef } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../services/api'
import { useTeam } from '../context/TeamContext'
import { useAuth } from '../context/AuthContext'
import { ORIGEN_LABELS, ORIGEN_ACCENTS } from '../data/nominaElectronica'

// ─── catálogo de empresas — admin o permiso canGestionar ──────────────────────
// Mismo diseño de 3 columnas (Maritza | Diana | Externas) y mismo mecanismo de
// popup flotante que NominaElectronicaPage.jsx (clic → dropdown anclado cerca
// del clic, no un modal centrado) — para que el catálogo se sienta como la
// misma app y no como una pantalla de administración aparte. Acá el popup
// edita nombre/grupo/responsable/enlaces en vez de marcar un estado.
//
// Nombre, grupo (origen), responsable y enlaces a Fondo Emprender/Empresas
// Externas se editan acá exclusivamente (requireNEAdmin en el backend, que
// acepta admin o el permiso granular nominaElectronica.canGestionar) — el
// resto del equipo solo marca el estado mensual en NominaElectronicaPage.jsx.
// El enlace a fondoEmpresaId/extEmpresaId es lo que hace que la celda "Nómina
// electrónica" de esos dos módulos deje de ser editable ahí y refleje esto en
// vivo. origen es solo agrupación visual (los 3 bloques del Excel original,
// ver migración 047) — no tiene relación con responsableId.
//
// La lectura (ver el listado) es libre para cualquier autenticado — solo se
// ocultan/deshabilitan los botones de crear/editar si no se tiene el permiso,
// como refuerzo de UX; el backend ya lo exige igual aunque alguien fuerce el
// botón desde las devtools.

const ORIGEN_ORDER = ['maritza', 'diana', 'externas']
const emptyForm = { name: '', origen: '', responsableId: '', fondoEmpresaId: '', extEmpresaId: '', activa: true }

export default function NominaElectronicaEmpresasPage() {
  const { allUsers } = useTeam()
  const { isAdmin, user } = useAuth()
  const puedeGestionar = isAdmin() || user?.permissions?.modulos?.nominaElectronica?.canGestionar === true

  const [empresas,  setEmpresas]  = useState([])
  const [fondoList, setFondoList] = useState([])
  const [extList,   setExtList]   = useState([])
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState(null)
  const [search,    setSearch]    = useState('')

  // popup flotante — { mode: 'edit'|'create', empresaId, left, top }
  const [popup,    setPopup]    = useState(null)
  const [form,     setForm]     = useState(emptyForm)
  const [saving,   setSaving]   = useState(false)
  const [formError, setFormError] = useState(null)
  const popupRef = useRef(null)

  const fetchAll = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const [emp, fondo, ext] = await Promise.all([
        api.getNEEmpresas(),
        api.getFondoEmpresas(),
        api.getExtEmpresas(),
      ])
      setEmpresas(emp)
      setFondoList(fondo)
      setExtList(ext)
    } catch (err) {
      setError(err.message || 'Error al cargar el catálogo')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  useEffect(() => {
    if (!popup) return
    const onDown = (e) => { if (popupRef.current && !popupRef.current.contains(e.target)) setPopup(null) }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [popup])

  function openPopup(mode, emp, e) {
    const rect = e.currentTarget.getBoundingClientRect()
    const PW = 260, PH = 420
    let left = rect.right - PW
    let top  = rect.bottom + 4
    if (left < 8) left = 8
    if (left + PW > window.innerWidth - 8)  left = window.innerWidth - PW - 8
    if (top  + PH > window.innerHeight - 8) top  = rect.top - PH - 4
    if (top  < 8) top  = 8

    setForm(emp ? {
      name: emp.name,
      origen: emp.origen ?? '',
      responsableId: emp.responsableId ?? '',
      fondoEmpresaId: emp.fondoEmpresaId ?? '',
      extEmpresaId: emp.extEmpresaId ?? '',
      activa: emp.activa,
    } : emptyForm)
    setFormError(null)
    setPopup({ mode, empresaId: emp?.id ?? null, left, top })
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.name.trim()) { setFormError('El nombre es obligatorio'); return }
    setSaving(true)
    setFormError(null)
    const body = {
      name: form.name.trim(),
      origen: form.origen || null,
      responsableId: form.responsableId || null,
      fondoEmpresaId: form.fondoEmpresaId || null,
      extEmpresaId: form.extEmpresaId || null,
      activa: form.activa,
    }
    try {
      if (popup.mode === 'edit') await api.updateNEEmpresa(popup.empresaId, body)
      else await api.createNEEmpresa(body)
      setPopup(null)
      fetchAll()
    } catch (err) {
      setFormError(err.message || 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  const q = search.trim().toLowerCase()
  const grouped = { maritza: [], diana: [], externas: [], otras: [] }
  for (const emp of empresas) {
    if (q && !emp.name.toLowerCase().includes(q)) continue
    ;(grouped[emp.origen] ?? grouped.otras).push(emp)
  }

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <Link to="/dian/nomina-electronica" className="text-[12px] text-[#004ac6] dark:text-[#7ba8f0] hover:underline flex items-center gap-1 mb-1">
            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>arrow_back</span>
            Volver al seguimiento
          </Link>
          <h1 className="text-xl font-bold text-[#191c1e] dark:text-[#e4e6f0]">Editar empresas — Nómina Electrónica</h1>
          <p className="text-[13px] text-[#6b7280] dark:text-[#8890b5]">{empresas.length} empresas</p>
        </div>
        {puedeGestionar && (
          <button
            onClick={(e) => openPopup('create', null, e)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#004ac6] text-white text-[13px] font-semibold hover:bg-[#003a9c] transition-colors shadow-sm"
          >
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>add</span>
            Nueva empresa
          </button>
        )}
      </div>

      <div className="relative w-64">
        <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-[#8890b5]" style={{ fontSize: 18 }}>search</span>
        <input
          type="text"
          placeholder="Buscar empresa..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9 pr-3 py-2 text-[13px] rounded-xl border border-[#e2e4ef] dark:border-[#2e3148] bg-white dark:bg-[#1e2030] text-[#191c1e] dark:text-[#e4e6f0] focus:outline-none focus:ring-2 focus:ring-[#004ac6]/30 w-full"
        />
      </div>

      {error && (
        <div className="text-[13px] px-4 py-2.5 rounded-xl bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800">{error}</div>
      )}

      {loading ? (
        <div className="text-center py-12 text-[#6b7280] dark:text-[#8890b5] text-[13px]">Cargando...</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
          {ORIGEN_ORDER.map(key => (
            <EmpresaColumn
              key={key}
              title={ORIGEN_LABELS[key]}
              accent={ORIGEN_ACCENTS[key]}
              empresas={grouped[key]}
              onEdit={puedeGestionar ? (emp, e) => openPopup('edit', emp, e) : null}
            />
          ))}
          {grouped.otras.length > 0 && (
            <EmpresaColumn
              title="Otras"
              accent={ORIGEN_ACCENTS.otras}
              empresas={grouped.otras}
              onEdit={puedeGestionar ? (emp, e) => openPopup('edit', emp, e) : null}
            />
          )}
        </div>
      )}

      {/* ── Popup flotante de crear/editar — mismo mecanismo que el popup de
          estado en NominaElectronicaPage.jsx ─────────────────────────────── */}
      {popup && (
        <div
          ref={popupRef}
          className="fixed z-50 bg-white dark:bg-[#1e2030] border border-[#e2e4ef] dark:border-[#2e3148] rounded-xl shadow-2xl p-4 w-64"
          style={{ left: popup.left, top: popup.top }}
        >
          <p className="text-[11px] font-bold text-[#191c1e] dark:text-[#e4e6f0] mb-3">
            {popup.mode === 'edit' ? 'Editar empresa' : 'Nueva empresa'}
          </p>
          <form onSubmit={handleSubmit} className="space-y-2.5">
            <div>
              <label className="block text-[10px] font-bold uppercase text-[#8890b5] mb-1">Nombre</label>
              <input
                type="text"
                autoFocus
                value={form.name}
                onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
                className="w-full text-xs px-2.5 py-1.5 rounded-lg border border-[#e2e4ef] dark:border-[#2e3148] bg-[#f8f9fc] dark:bg-[#252840] text-[#191c1e] dark:text-[#e4e6f0] outline-none focus:ring-2 focus:ring-[#004ac6]/30"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase text-[#8890b5] mb-1">Grupo</label>
              <select
                value={form.origen}
                onChange={(e) => setForm(f => ({ ...f, origen: e.target.value }))}
                className="w-full text-xs px-2.5 py-1.5 rounded-lg border border-[#e2e4ef] dark:border-[#2e3148] bg-[#f8f9fc] dark:bg-[#252840] text-[#191c1e] dark:text-[#e4e6f0] outline-none focus:ring-2 focus:ring-[#004ac6]/30"
              >
                <option value="">Sin grupo</option>
                {Object.entries(ORIGEN_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase text-[#8890b5] mb-1">Responsable</label>
              <select
                value={form.responsableId}
                onChange={(e) => setForm(f => ({ ...f, responsableId: e.target.value }))}
                className="w-full text-xs px-2.5 py-1.5 rounded-lg border border-[#e2e4ef] dark:border-[#2e3148] bg-[#f8f9fc] dark:bg-[#252840] text-[#191c1e] dark:text-[#e4e6f0] outline-none focus:ring-2 focus:ring-[#004ac6]/30"
              >
                <option value="">Sin asignar</option>
                {allUsers.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase text-[#8890b5] mb-1">Enlazar Fondo Emprender</label>
              <select
                value={form.fondoEmpresaId}
                onChange={(e) => setForm(f => ({ ...f, fondoEmpresaId: e.target.value }))}
                className="w-full text-xs px-2.5 py-1.5 rounded-lg border border-[#e2e4ef] dark:border-[#2e3148] bg-[#f8f9fc] dark:bg-[#252840] text-[#191c1e] dark:text-[#e4e6f0] outline-none focus:ring-2 focus:ring-[#004ac6]/30"
              >
                <option value="">Sin enlazar</option>
                {fondoList.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase text-[#8890b5] mb-1">Enlazar Empresas Externas</label>
              <select
                value={form.extEmpresaId}
                onChange={(e) => setForm(f => ({ ...f, extEmpresaId: e.target.value }))}
                className="w-full text-xs px-2.5 py-1.5 rounded-lg border border-[#e2e4ef] dark:border-[#2e3148] bg-[#f8f9fc] dark:bg-[#252840] text-[#191c1e] dark:text-[#e4e6f0] outline-none focus:ring-2 focus:ring-[#004ac6]/30"
              >
                <option value="">Sin enlazar</option>
                {extList.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
              </select>
            </div>
            <label className="flex items-center gap-2 text-xs font-medium text-[#434655] dark:text-[#c4c8e8] cursor-pointer select-none pt-1">
              <input
                type="checkbox"
                checked={form.activa}
                onChange={(e) => setForm(f => ({ ...f, activa: e.target.checked }))}
              />
              Activa
            </label>

            {formError && <p className="text-[11px] text-red-600 dark:text-red-400">{formError}</p>}

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => setPopup(null)}
                className="flex-1 py-1.5 rounded-lg text-xs font-semibold text-[#6b7280] dark:text-[#8890b5] hover:bg-[#f3f4f6] dark:hover:bg-[#252840] transition-colors text-center"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={saving}
                className="flex-1 py-1.5 rounded-lg text-xs font-semibold bg-[#004ac6] text-white hover:bg-[#003a9c] transition-colors disabled:opacity-60"
              >
                {saving ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}

// ─── una columna (Maritza / Diana / Externas) — mismo shape que
// CompanyColumn en NominaElectronicaPage.jsx ───────────────────────────────
function EmpresaColumn({ title, accent, empresas, onEdit }) {
  return (
    <div className="bg-white dark:bg-[#1e2030] rounded-xl border border-[#e2e4ef] dark:border-[#2e3148] shadow-sm overflow-hidden">
      <div
        className="px-4 py-2.5 bg-[#f8f9fc] dark:bg-[#252840] flex items-center justify-between"
        style={{ borderBottom: `2px solid ${accent}` }}
      >
        <span className="text-xs font-bold uppercase tracking-wide" style={{ color: accent }}>{title}</span>
        <span className="text-xs text-[#8890b5]">{empresas.length}</span>
      </div>
      {empresas.length === 0 ? (
        <div className="px-4 py-6 text-center text-xs text-[#8890b5]">Sin resultados</div>
      ) : (
        empresas.map(emp => (
          <div
            key={emp.id}
            className="flex items-center gap-2 pl-4 pr-2.5 py-1.5 border-b border-black/5 dark:border-white/10 last:border-0 hover:bg-[#f9fafb] dark:hover:bg-[#20233a] transition-colors"
            style={{ opacity: emp.activa ? 1 : 0.5 }}
          >
            <div className="flex-1 min-w-0">
              <div className="truncate text-[13px] font-medium text-[#191c1e] dark:text-[#e4e6f0]" title={emp.name}>
                {emp.name}
              </div>
              <div className="truncate text-[11px] text-[#8890b5]">
                {emp.responsableNombre || 'Sin asignar'}
                {!emp.activa && <span className="text-red-500 font-medium"> · Inactiva</span>}
              </div>
            </div>
            {(emp.fondoEmpresaNombre || emp.extEmpresaNombre) && (
              <span
                className="material-symbols-outlined text-[#0891b2] shrink-0"
                style={{ fontSize: 15 }}
                title={emp.fondoEmpresaNombre ? `Enlazada con Fondo: ${emp.fondoEmpresaNombre}` : `Enlazada con Externas: ${emp.extEmpresaNombre}`}
              >
                link
              </span>
            )}
            {onEdit && (
              <button
                onClick={(e) => onEdit(emp, e)}
                className="flex items-center justify-center relative transition-all hover:scale-110 active:scale-95 rounded-full bg-white/80 border border-black/10 shadow-sm shrink-0"
                style={{ width: 26, height: 26 }}
                title="Editar"
              >
                <span className="material-symbols-outlined" style={{ color: '#004ac6', fontSize: 15 }}>edit</span>
              </button>
            )}
          </div>
        ))
      )}
    </div>
  )
}
