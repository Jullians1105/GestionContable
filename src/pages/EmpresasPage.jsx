import { useState, useEffect, useCallback, useMemo } from 'react'
import { api } from '../services/api'
import { useAuth } from '../context/AuthContext'

// Ver empresasMaestroController.js — 'fondo'/'ext'/'ne'/'contab' son las claves que usa el
// backend para MODULOS, no se inventan acá.
const MODULOS_INFO = {
  fondo:  { label: 'Fondo Emprender',    icon: 'rocket_launch' },
  ext:    { label: 'Empresas Externas',  icon: 'corporate_fare' },
  ne:     { label: 'Nómina Electrónica', icon: 'badge' },
  contab: { label: 'Contabilidad',       icon: 'receipt_long' },
}

export default function EmpresasPage() {
  const { isAdmin, isLeader } = useAuth()
  const puedeEditar = isAdmin() || isLeader()

  const [empresas, setEmpresas]     = useState([])
  const [duplicados, setDuplicados] = useState([])
  const [cargando, setCargando]     = useState(true)
  const [error, setError]           = useState('')

  const cargar = useCallback(async () => {
    setError('')
    try {
      const [dir, dup] = await Promise.all([api.getEmpresasDirectorio(), api.getEmpresasDuplicados()])
      setEmpresas(dir)
      setDuplicados(dup)
    } catch (err) {
      setError(err.message || 'No se pudo cargar el directorio de empresas')
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => { cargar() }, [cargar])

  // ── búsqueda ─────────────────────────────────────────────────────────────
  const [busqueda, setBusqueda] = useState('')
  const empresasFiltradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    if (!q) return empresas
    return empresas.filter((e) => e.name.toLowerCase().includes(q))
  }, [empresas, busqueda])

  // ── crear empresa nueva (solo identidad, sin habilitar módulo todavía) ────
  const [nuevoNombre, setNuevoNombre] = useState('')
  const [creando, setCreando] = useState(false)
  const [errorCrear, setErrorCrear] = useState('')

  const crearEmpresa = async () => {
    const nombre = nuevoNombre.trim()
    if (!nombre) return
    setCreando(true)
    setErrorCrear('')
    try {
      await api.createEmpresaMaestro({ name: nombre })
      setNuevoNombre('')
      await cargar()
    } catch (err) {
      setErrorCrear(err.message || 'No se pudo crear la empresa')
    } finally {
      setCreando(false)
    }
  }

  // ── fila expandida (habilitar/deshabilitar/renombrar) ─────────────────────
  const [expandidoId, setExpandidoId] = useState(null)
  const [renombrando, setRenombrando] = useState(null) // { id, name } | null
  const [moduloNuevo, setModuloNuevo] = useState('')
  const [accionError, setAccionError] = useState('')
  const [accionEnCurso, setAccionEnCurso] = useState(false)

  const toggleExpandir = (id) => {
    setExpandidoId((prev) => (prev === id ? null : id))
    setAccionError('')
    setModuloNuevo('')
  }

  const guardarRenombre = async () => {
    if (!renombrando) return
    setAccionEnCurso(true)
    setAccionError('')
    try {
      await api.updateEmpresaMaestro(renombrando.id, { name: renombrando.name })
      setRenombrando(null)
      await cargar()
    } catch (err) {
      setAccionError(err.message || 'No se pudo renombrar')
    } finally {
      setAccionEnCurso(false)
    }
  }

  const toggleActiva = async (empresa) => {
    setAccionEnCurso(true)
    setAccionError('')
    try {
      await api.updateEmpresaMaestro(empresa.id, { activa: !empresa.activa })
      await cargar()
    } catch (err) {
      setAccionError(err.message || 'No se pudo actualizar')
    } finally {
      setAccionEnCurso(false)
    }
  }

  const habilitar = async (empresaId) => {
    if (!moduloNuevo) return
    setAccionEnCurso(true)
    setAccionError('')
    try {
      await api.habilitarEmpresaModulo(empresaId, { modulo: moduloNuevo })
      setModuloNuevo('')
      await cargar()
    } catch (err) {
      setAccionError(err.message || 'No se pudo habilitar')
    } finally {
      setAccionEnCurso(false)
    }
  }

  const deshabilitar = async (empresaId, modulo) => {
    if (!confirm(`¿Deshabilitar esta empresa de ${MODULOS_INFO[modulo].label}? Esto borra su fila (y lo asociado) en ese módulo.`)) return
    setAccionEnCurso(true)
    setAccionError('')
    try {
      await api.deshabilitarEmpresaModulo(empresaId, modulo)
      await cargar()
    } catch (err) {
      setAccionError(err.message || 'No se pudo deshabilitar')
    } finally {
      setAccionEnCurso(false)
    }
  }

  // ── fusionar duplicados sugeridos ──────────────────────────────────────────
  const [fusionando, setFusionando] = useState(null) // { empresaA, empresaB } | null
  const [fusionError, setFusionError] = useState('')

  const confirmarFusion = async (conservar, descartar) => {
    setFusionError('')
    try {
      await api.fusionarEmpresas(conservar.id, descartar.id)
      setFusionando(null)
      await cargar()
    } catch (err) {
      setFusionError(err.message || 'No se pudo fusionar')
    }
  }

  if (cargando) {
    return (
      <div className="max-w-5xl mx-auto mt-20 text-center">
        <svg className="animate-spin h-10 w-10 text-[#004ac6] mx-auto" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        <p className="mt-4 text-[#6b7280] dark:text-[#8890b5]">Cargando directorio de empresas…</p>
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <span className="material-symbols-outlined text-3xl text-[#004ac6]">domain</span>
          <h1 className="text-2xl font-bold text-[#191c1e] dark:text-[#e4e6f0]">Empresas</h1>
        </div>
        <p className="text-sm text-[#6b7280] dark:text-[#8890b5]">
          Todas las empresas del software en un solo lugar — Fondo Emprender, Empresas Externas,
          Nómina Electrónica y Contabilidad. {!puedeEditar && 'Solo un admin o leader puede editar esto.'}
        </p>
      </div>

      {error && (
        <div className="mb-5 p-4 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-400">
          {error}
        </div>
      )}

      {/* ── Posibles duplicados ─────────────────────────────────────────── */}
      {duplicados.length > 0 && (
        <div className="mb-5 p-4 rounded-2xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
          <p className="text-sm font-semibold text-amber-800 dark:text-amber-300 flex items-center gap-2">
            <span className="material-symbols-outlined text-lg">warning</span>
            {duplicados.length === 1 ? 'Una posible empresa duplicada' : `${duplicados.length} posibles empresas duplicadas`}
          </p>
          <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
            Nombre parecido entre dos empresas — revisa si de verdad son la misma antes de fusionar. No se une nada solo.
          </p>
          <div className="mt-3 flex flex-col gap-2">
            {duplicados.map((d) => (
              <div key={`${d.empresaA.id}-${d.empresaB.id}`} className="flex items-center justify-between gap-3 bg-white dark:bg-[#1e2030] rounded-xl px-3.5 py-2.5 border border-amber-200 dark:border-amber-800">
                <span className="text-sm text-[#191c1e] dark:text-[#e4e6f0] min-w-0 truncate">
                  <b>{d.empresaA.name}</b> ↔ <b>{d.empresaB.name}</b>
                  <span className="text-xs text-[#9ca3af] ml-2">({d.palabrasCompartidas.join(', ')})</span>
                </span>
                {puedeEditar && (
                  <button
                    onClick={() => setFusionando({ empresaA: d.empresaA, empresaB: d.empresaB })}
                    className="flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-700 hover:bg-amber-100 dark:hover:bg-amber-900/40"
                  >
                    Fusionar
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Buscar + crear ─────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[#9ca3af] text-lg">search</span>
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar empresa…"
            className="w-full pl-10 pr-3.5 py-2.5 rounded-xl border border-[#d1d5db] dark:border-[#3a3e5c] bg-white dark:bg-[#181a2e] text-sm text-[#191c1e] dark:text-[#e4e6f0] focus:outline-none focus:ring-2 focus:ring-[#004ac6]/30"
          />
        </div>
        {puedeEditar && (
          <div className="flex items-center gap-2">
            <input
              value={nuevoNombre}
              onChange={(e) => setNuevoNombre(e.target.value)}
              placeholder="Nombre de empresa nueva…"
              className="px-3.5 py-2.5 rounded-xl border border-[#d1d5db] dark:border-[#3a3e5c] bg-white dark:bg-[#181a2e] text-sm text-[#191c1e] dark:text-[#e4e6f0] focus:outline-none focus:ring-2 focus:ring-[#004ac6]/30"
            />
            <button
              onClick={crearEmpresa}
              disabled={creando || !nuevoNombre.trim()}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-semibold text-white hover:opacity-90 transition active:scale-[0.97] disabled:opacity-40"
              style={{ background: '#004ac6' }}
            >
              <span className="material-symbols-outlined text-lg">add_business</span>
              {creando ? 'Creando…' : 'Nueva empresa'}
            </button>
          </div>
        )}
      </div>
      {errorCrear && <p className="text-xs text-red-500 -mt-3 mb-4">{errorCrear}</p>}

      {/* ── Lista ────────────────────────────────────────────────────────── */}
      <div className="bg-white dark:bg-[#1e2030] rounded-2xl border border-[#e2e4ef] dark:border-[#2e3148] shadow-sm overflow-hidden">
        {empresasFiltradas.length === 0 ? (
          <p className="text-sm text-[#9ca3af] italic px-5 py-8 text-center">Ninguna empresa coincide</p>
        ) : (
          <div className="divide-y divide-[#f0f2f8] dark:divide-[#2a2e45]">
            {empresasFiltradas.map((empresa) => {
              const expandido = expandidoId === empresa.id
              const modulosHabilitados = Object.entries(empresa.modulos).filter(([, v]) => v)
              const modulosSinHabilitar = Object.keys(MODULOS_INFO).filter((m) => !empresa.modulos[m])
              return (
                <div key={empresa.id}>
                  <button
                    onClick={() => toggleExpandir(empresa.id)}
                    className="w-full flex items-center justify-between gap-3 px-5 py-3 text-left hover:bg-[#f8f9ff] dark:hover:bg-[#181a2e] transition"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className={`material-symbols-outlined text-lg ${empresa.activa ? 'text-[#004ac6]' : 'text-[#c3c6d7]'}`}>business</span>
                      <span className={`text-sm font-medium truncate ${empresa.activa ? 'text-[#191c1e] dark:text-[#e4e6f0]' : 'text-[#9ca3af] line-through'}`}>
                        {empresa.name}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {Object.entries(MODULOS_INFO).map(([key, info]) => (
                        <span
                          key={key}
                          title={empresa.modulos[key] ? info.label : `No habilitada en ${info.label}`}
                          className={`w-6 h-6 rounded-full flex items-center justify-center ${
                            empresa.modulos[key]
                              ? 'bg-[#eef3ff] dark:bg-[#1a2540] text-[#004ac6] dark:text-[#7ba8f0]'
                              : 'bg-[#f3f4f6] dark:bg-[#181a2e] text-[#c3c6d7] dark:text-[#3a3e5c]'
                          }`}
                        >
                          <span className="material-symbols-outlined" style={{ fontSize: 13 }}>{info.icon}</span>
                        </span>
                      ))}
                      <span className="material-symbols-outlined text-[#9ca3af] ml-1">{expandido ? 'expand_less' : 'expand_more'}</span>
                    </div>
                  </button>

                  {expandido && (
                    <div className="px-5 pb-4 bg-[#fafbff] dark:bg-[#181a2e]">
                      {accionError && <p className="text-xs text-red-500 mb-2">{accionError}</p>}

                      {puedeEditar && (
                        <div className="flex items-center gap-2 mb-3 flex-wrap">
                          {renombrando?.id === empresa.id ? (
                            <>
                              <input
                                value={renombrando.name}
                                onChange={(e) => setRenombrando({ id: empresa.id, name: e.target.value })}
                                className="px-3 py-1.5 rounded-lg border border-[#d1d5db] dark:border-[#3a3e5c] bg-white dark:bg-[#1e2030] text-sm"
                              />
                              <button onClick={guardarRenombre} disabled={accionEnCurso} className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white" style={{ background: '#004ac6' }}>Guardar</button>
                              <button onClick={() => setRenombrando(null)} className="px-3 py-1.5 rounded-lg text-xs font-semibold text-[#6b7280]">Cancelar</button>
                            </>
                          ) : (
                            <button
                              onClick={() => setRenombrando({ id: empresa.id, name: empresa.name })}
                              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-[#004ac6] border border-[#c7d9ff] dark:border-[#2e4470] hover:bg-[#eef3ff] dark:hover:bg-[#1a2540]"
                            >
                              <span className="material-symbols-outlined" style={{ fontSize: 14 }}>edit</span>
                              Renombrar
                            </button>
                          )}
                          <button
                            onClick={() => toggleActiva(empresa)}
                            disabled={accionEnCurso}
                            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-[#6b7280] dark:text-[#8890b5] border border-[#d1d5db] dark:border-[#3a3e5c] hover:bg-[#f3f4f6] dark:hover:bg-[#252840]"
                          >
                            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>{empresa.activa ? 'visibility_off' : 'visibility'}</span>
                            {empresa.activa ? 'Desactivar' : 'Activar'}
                          </button>
                        </div>
                      )}

                      <p className="text-xs font-semibold text-[#8890b5] uppercase tracking-wide mb-1.5">Módulos habilitados</p>
                      {modulosHabilitados.length === 0 ? (
                        <p className="text-xs text-[#9ca3af] italic mb-2">Ninguno todavía</p>
                      ) : (
                        <div className="flex flex-col gap-1.5 mb-3">
                          {modulosHabilitados.map(([modulo]) => (
                            <div key={modulo} className="flex items-center justify-between gap-2 text-xs bg-white dark:bg-[#1e2030] rounded-lg px-3 py-2 border border-[#e2e4ef] dark:border-[#2e3148]">
                              <span className="flex items-center gap-1.5 text-[#434655] dark:text-[#c4c8e8]">
                                <span className="material-symbols-outlined" style={{ fontSize: 14 }}>{MODULOS_INFO[modulo].icon}</span>
                                {MODULOS_INFO[modulo].label}
                              </span>
                              {puedeEditar && (
                                <button
                                  onClick={() => deshabilitar(empresa.id, modulo)}
                                  disabled={accionEnCurso}
                                  className="text-red-500 hover:underline"
                                >
                                  Deshabilitar
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      )}

                      {puedeEditar && modulosSinHabilitar.length > 0 && (
                        <div className="flex items-center gap-2">
                          <select
                            value={moduloNuevo}
                            onChange={(e) => setModuloNuevo(e.target.value)}
                            className="px-3 py-1.5 rounded-lg border border-[#d1d5db] dark:border-[#3a3e5c] bg-white dark:bg-[#1e2030] text-xs"
                          >
                            <option value="">Habilitar en…</option>
                            {modulosSinHabilitar.map((m) => (
                              <option key={m} value={m}>{MODULOS_INFO[m].label}</option>
                            ))}
                          </select>
                          <button
                            onClick={() => habilitar(empresa.id)}
                            disabled={!moduloNuevo || accionEnCurso}
                            className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white disabled:opacity-40"
                            style={{ background: '#16a34a' }}
                          >
                            Habilitar
                          </button>
                        </div>
                      )}
                      <p className="text-xs text-[#9ca3af] mt-2">
                        Los campos propios de cada módulo (categoría, responsable, NIT…) se editan en la pantalla de ese módulo.
                      </p>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Modal de fusión ─────────────────────────────────────────────── */}
      {fusionando && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setFusionando(null)}>
          <div className="bg-white dark:bg-[#1e2030] rounded-2xl shadow-xl p-6 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-[#191c1e] dark:text-[#e4e6f0] mb-2">¿Cuál nombre se conserva?</h3>
            <p className="text-sm text-[#6b7280] dark:text-[#8890b5] mb-4">
              La otra se borra — sus módulos habilitados pasan a la que elijas.
            </p>
            {fusionError && <p className="text-xs text-red-500 mb-3">{fusionError}</p>}
            <div className="flex flex-col gap-2">
              <button
                onClick={() => confirmarFusion(fusionando.empresaA, fusionando.empresaB)}
                className="text-left px-4 py-2.5 rounded-xl border border-[#e2e4ef] dark:border-[#2e3148] hover:border-[#004ac6] transition text-sm font-medium"
              >
                {fusionando.empresaA.name}
              </button>
              <button
                onClick={() => confirmarFusion(fusionando.empresaB, fusionando.empresaA)}
                className="text-left px-4 py-2.5 rounded-xl border border-[#e2e4ef] dark:border-[#2e3148] hover:border-[#004ac6] transition text-sm font-medium"
              >
                {fusionando.empresaB.name}
              </button>
            </div>
            <button onClick={() => setFusionando(null)} className="mt-4 text-xs text-[#6b7280] hover:underline">Cancelar</button>
          </div>
        </div>
      )}
    </div>
  )
}
