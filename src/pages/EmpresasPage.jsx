import { useState, useEffect, useCallback, useMemo, Fragment } from 'react'
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

// Separador de miles al estilo colombiano (punto cada 3 dígitos), solo para MOSTRAR — nunca se
// usa para lo que se copia al portapapeles (eso siempre es el número crudo, sin puntos, porque
// es lo que se pega en un formulario de la DIAN u otro sistema que no lo acepta formateado).
const formatearDocumento = (valor) => (
  valor && /^\d+$/.test(valor) ? valor.replace(/\B(?=(\d{3})+(?!\d))/g, '.') : valor
)

// Llamada de "guardar vigencia" por módulo — cada uno vive en su propia tabla/endpoint, así que
// no hay un update genérico único.
const MODULO_UPDATE = {
  fondo:  (id, data) => api.updateFondoEmpresa(id, data),
  ext:    (id, data) => api.updateExtEmpresa(id, data),
  ne:     (id, data) => api.updateNEEmpresa(id, data),
  contab: (id, data) => api.updateContabEmpresa(id, data),
}

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]
const ANIO_ACTUAL = new Date().getFullYear()
const ANIOS_VIGENCIA = [ANIO_ACTUAL - 1, ANIO_ACTUAL, ANIO_ACTUAL + 1, ANIO_ACTUAL + 2]

export default function EmpresasPage() {
  const { isAdmin } = useAuth()
  // Solo admin: crear/editar identidad, vigencia por módulo, habilitar módulos, fusionar.
  // "Generar token DIAN" es la única acción abierta a cualquier usuario autenticado (ver
  // generarToken más abajo) — es operativa del día a día, no administración del directorio.
  const puedeEditar = isAdmin()

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

  // ── búsqueda + filtro por módulo ────────────────────────────────────────────
  // Copiar NIT/cédula con un clic — mismo patrón que ConsultaTerceroPage.jsx (copiar valor
  // puntual, mostrar un check breve). `copiado` guarda el valor recién copiado (no el campo),
  // alcanza porque NIT y cédula nunca son iguales entre sí en la misma fila.
  const [copiado, setCopiado] = useState(null)
  const copiar = async (valor) => {
    try {
      await navigator.clipboard.writeText(valor)
      setCopiado(valor)
      setTimeout(() => setCopiado((c) => (c === valor ? null : c)), 1500)
    } catch { /* portapapeles no disponible — no hay nada más que hacer acá */ }
  }

  const [busqueda, setBusqueda] = useState('')
  const [moduloFiltro, setModuloFiltro] = useState('todas')

  const moduloCounts = useMemo(() => {
    const counts = { todas: empresas.length, fondo: 0, ext: 0, ne: 0, contab: 0 }
    empresas.forEach((e) => {
      Object.keys(MODULOS_INFO).forEach((m) => { if (e.modulos[m]) counts[m] += 1 })
    })
    return counts
  }, [empresas])

  const empresasFiltradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    return empresas.filter((e) => {
      if (moduloFiltro !== 'todas' && !e.modulos[moduloFiltro]) return false
      if (!q) return true
      return e.name.toLowerCase().includes(q)
        || e.nit?.toLowerCase().includes(q)
        || e.cedulaRepresentante?.toLowerCase().includes(q)
    })
  }, [empresas, busqueda, moduloFiltro])

  const stats = useMemo(() => ({ total: empresas.length }), [empresas])

  // ── crear empresa nueva (modal: nombre + tipo + NIT/cédula) ─────────────────
  const [modalNuevaEmpresa, setModalNuevaEmpresa] = useState(false)
  const [nuevaEmpresaForm, setNuevaEmpresaForm] = useState({ name: '', tipoContribuyente: 'empresa', nit: '', cedulaRepresentante: '' })
  const [creandoEmpresa, setCreandoEmpresa] = useState(false)
  const [errorCrear, setErrorCrear] = useState('')

  const abrirModalNuevaEmpresa = () => {
    setNuevaEmpresaForm({ name: '', tipoContribuyente: 'empresa', nit: '', cedulaRepresentante: '' })
    setErrorCrear('')
    setModalNuevaEmpresa(true)
  }

  const crearEmpresa = async () => {
    const nombre = nuevaEmpresaForm.name.trim()
    if (!nombre) { setErrorCrear('El nombre es obligatorio'); return }
    setCreandoEmpresa(true)
    setErrorCrear('')
    try {
      await api.createEmpresaMaestro({
        name: nombre,
        tipoContribuyente: nuevaEmpresaForm.tipoContribuyente,
        nit: nuevaEmpresaForm.tipoContribuyente === 'empresa' ? (nuevaEmpresaForm.nit.trim() || null) : null,
        cedulaRepresentante: nuevaEmpresaForm.cedulaRepresentante.trim() || null,
      })
      setModalNuevaEmpresa(false)
      await cargar()
    } catch (err) {
      setErrorCrear(err.message || 'No se pudo crear la empresa')
    } finally {
      setCreandoEmpresa(false)
    }
  }

  // ── fila expandida: identidad + módulos/vigencia ────────────────────────────
  const [expandidoId, setExpandidoId] = useState(null)
  const [identidadEdit, setIdentidadEdit] = useState(null) // { name, tipoContribuyente, nit, cedulaRepresentante }
  const [vigenciaDrafts, setVigenciaDrafts] = useState({}) // { [modulo]: { anio, mes } }
  const [moduloNuevo, setModuloNuevo] = useState('')
  const [accionError, setAccionError] = useState('')
  const [accionEnCurso, setAccionEnCurso] = useState(false)
  const [guardandoIdentidad, setGuardandoIdentidad] = useState(false)
  const [guardandoVigenciaModulo, setGuardandoVigenciaModulo] = useState(null) // clave del módulo en curso, o null

  const toggleExpandir = (empresa) => {
    if (expandidoId === empresa.id) {
      setExpandidoId(null)
      setIdentidadEdit(null)
      setVigenciaDrafts({})
      return
    }
    setExpandidoId(empresa.id)
    setAccionError('')
    setModuloNuevo('')
    setIdentidadEdit({
      name: empresa.name,
      tipoContribuyente: empresa.tipoContribuyente || 'empresa',
      nit: empresa.nit || '',
      cedulaRepresentante: empresa.cedulaRepresentante || '',
    })
    const drafts = {}
    Object.entries(empresa.modulos).forEach(([modulo, data]) => {
      if (data) drafts[modulo] = { anio: data.vigenteHastaAnio ?? '', mes: data.vigenteHastaMes ?? '' }
    })
    setVigenciaDrafts(drafts)
  }

  const guardarIdentidad = async (empresaId) => {
    if (!identidadEdit) return
    setGuardandoIdentidad(true)
    setAccionError('')
    try {
      await api.updateEmpresaMaestro(empresaId, {
        name: identidadEdit.name,
        tipoContribuyente: identidadEdit.tipoContribuyente,
        nit: identidadEdit.tipoContribuyente === 'empresa' ? (identidadEdit.nit || null) : null,
        cedulaRepresentante: identidadEdit.cedulaRepresentante || null,
      })
      await cargar()
    } catch (err) {
      setAccionError(err.message || 'No se pudo guardar la identidad')
    } finally {
      setGuardandoIdentidad(false)
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

  // "Deshabilitar" (borrado en cascada del histórico del módulo) ya no existe acá — para dejar
  // de aparecer en los seguimientos mensuales se usa "vigente hasta" (guardarVigencia abajo),
  // que no borra nada.
  const guardarVigencia = async (empresa, modulo) => {
    const draft = vigenciaDrafts[modulo] || { anio: '', mes: '' }
    const moduloId = empresa.modulos[modulo]?.id
    if (!moduloId) return
    setGuardandoVigenciaModulo(modulo)
    setAccionError('')
    try {
      await MODULO_UPDATE[modulo](moduloId, {
        vigenteHastaAnio: draft.anio ? Number(draft.anio) : null,
        vigenteHastaMes: draft.mes ? Number(draft.mes) : null,
      })
      await cargar()
    } catch (err) {
      setAccionError(err.message || 'No se pudo guardar la vigencia')
    } finally {
      setGuardandoVigenciaModulo(null)
    }
  }

  const quitarVigencia = async (empresa, modulo) => {
    const moduloId = empresa.modulos[modulo]?.id
    if (!moduloId) return
    setGuardandoVigenciaModulo(modulo)
    setAccionError('')
    try {
      await MODULO_UPDATE[modulo](moduloId, { vigenteHastaAnio: null, vigenteHastaMes: null })
      setVigenciaDrafts((prev) => ({ ...prev, [modulo]: { anio: '', mes: '' } }))
      await cargar()
    } catch (err) {
      setAccionError(err.message || 'No se pudo quitar la vigencia')
    } finally {
      setGuardandoVigenciaModulo(null)
    }
  }

  // ── generar token DIAN ──────────────────────────────────────────────────────
  // Abierto a cualquier autenticado (no solo admin, ver empresasMaestro.js) — es una acción
  // operativa del día a día, no algo que deba restringirse como crear/fusionar empresas.
  const [generandoTokenId, setGenerandoTokenId] = useState(null)
  const [tokenEtapa, setTokenEtapa] = useState('') // texto de la etapa actual mientras genera
  const [resultadoToken, setResultadoToken] = useState(null) // { empresaId, success, mensaje } | null

  // El backend hace un solo request síncrono (automatiza Chrome contra la DIAN, ver
  // dianTokenService.js) — no manda progreso real. Estas etapas son simuladas por tiempo, solo
  // para que la espera (puede tardar bastante: hasta 2 min esperando que Cloudflare valide) no
  // se sienta colgada. La última etapa ("Esperando verificación…") se queda fija hasta que el
  // request de verdad responda, porque esa es la parte de duración variable.
  const ETAPAS_TOKEN = [
    { ms: 0,    texto: 'Entrando a la DIAN…' },
    { ms: 2500, texto: 'Pegando documentos…' },
    { ms: 5500, texto: 'Esperando verificación…' },
  ]

  const generarToken = async (empresaId) => {
    setGenerandoTokenId(empresaId)
    setResultadoToken(null)
    const timers = ETAPAS_TOKEN.map(({ ms, texto }) => setTimeout(() => setTokenEtapa(texto), ms))
    try {
      const resultado = await api.generarTokenDian(empresaId)
      setResultadoToken({ empresaId, ...resultado })
    } catch (err) {
      setResultadoToken({ empresaId, success: false, mensaje: err.message || 'No se pudo generar el token' })
    } finally {
      timers.forEach(clearTimeout)
      setGenerandoTokenId(null)
      setTokenEtapa('')
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

  const [descartandoId, setDescartandoId] = useState(null) // `${empresaA.id}-${empresaB.id}` en curso
  const descartarSugerencia = async (empresaA, empresaB) => {
    const key = `${empresaA.id}-${empresaB.id}`
    setDescartandoId(key)
    try {
      await api.descartarDuplicadoEmpresa(empresaA.id, empresaB.id)
      await cargar()
    } catch (err) {
      setFusionError(err.message || 'No se pudo descartar')
    } finally {
      setDescartandoId(null)
    }
  }

  if (cargando) {
    return (
      <div className="max-w-5xl mx-auto mt-20 text-center">
        <svg className="animate-spin h-10 w-10 text-[#004ac6] mx-auto" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        <p className="mt-4 text-[#6b7280]">Cargando directorio de empresas…</p>
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <span className="material-symbols-outlined text-3xl text-[#004ac6]">contacts</span>
          <h1 className="text-2xl font-bold text-[#191c1e]">Empresas</h1>
        </div>
        <div className="flex items-center gap-4 mt-1 text-xs">
          <span className="text-[#6b7280]">
            <b className="text-[#191c1e] text-sm">{stats.total}</b> empresas
          </span>
        </div>
      </div>

      {error && (
        <div className="mb-5 p-4 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* ── Posibles duplicados ─────────────────────────────────────────── */}
      {duplicados.length > 0 && (
        <div className="mb-5 p-4 rounded-2xl bg-amber-50 border border-amber-200">
          <p className="text-sm font-semibold text-amber-800 flex items-center gap-2">
            <span className="material-symbols-outlined text-lg">warning</span>
            {duplicados.length === 1 ? 'Una posible empresa duplicada' : `${duplicados.length} posibles empresas duplicadas`}
          </p>
          <p className="text-xs text-amber-700 mt-0.5">
            Nombre parecido entre dos empresas — revisa si de verdad son la misma antes de fusionar. No se une nada solo.
          </p>
          <div className="mt-3 flex flex-col gap-2">
            {duplicados.map((d) => (
              <div key={`${d.empresaA.id}-${d.empresaB.id}`} className="flex items-center justify-between gap-3 bg-white rounded-xl px-3.5 py-2.5 border border-amber-200">
                <span className="text-sm text-[#191c1e] min-w-0 truncate">
                  <b>{d.empresaA.name}</b> ↔ <b>{d.empresaB.name}</b>
                  <span className="text-xs text-[#9ca3af] ml-2">
                    ({d.motivo === 'nit' ? `mismo NIT: ${d.detalle}` : `nombre parecido: ${d.detalle}`})
                  </span>
                </span>
                {puedeEditar && (
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <button
                      onClick={() => descartarSugerencia(d.empresaA, d.empresaB)}
                      disabled={descartandoId === `${d.empresaA.id}-${d.empresaB.id}`}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold text-[#6b7280] border border-[#d1d5db] hover:bg-[#f3f4f6] disabled:opacity-50"
                    >
                      No es duplicado
                    </button>
                    <button
                      onClick={() => setFusionando({ empresaA: d.empresaA, empresaB: d.empresaB })}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold text-amber-800 border border-amber-300 hover:bg-amber-100"
                    >
                      Fusionar
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Buscar + crear ─────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="relative w-64 flex-shrink-0">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[#9ca3af] text-lg">search</span>
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por nombre, NIT o cédula…"
            className="w-full pl-10 pr-8 py-2.5 rounded-xl border border-[#d1d5db] bg-white text-sm text-[#191c1e] focus:outline-none focus:ring-2 focus:ring-[#004ac6]/30"
          />
          {busqueda && (
            <button
              onClick={() => setBusqueda('')}
              title="Borrar búsqueda"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#9ca3af] hover:text-[#434655] transition"
            >
              <span className="material-symbols-outlined" style={{ fontSize: 17 }}>close</span>
            </button>
          )}
        </div>
        {puedeEditar && (
          <button
            onClick={abrirModalNuevaEmpresa}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-semibold text-white hover:opacity-90 transition active:scale-[0.97]"
            style={{ background: '#004ac6' }}
          >
            <span className="material-symbols-outlined text-lg">add_business</span>
            Nueva empresa
          </button>
        )}
      </div>

      {/* ── Filtro por módulo ───────────────────────────────────────────── */}
      <div className="flex items-center gap-6 mb-6 border-b border-[#e2e4ef]">
        {[{ key: 'todas', label: 'Todas' }, ...Object.entries(MODULOS_INFO).map(([key, info]) => ({ key, label: info.label }))].map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setModuloFiltro(key)}
            className={`relative pb-3 text-sm transition ${
              moduloFiltro === key ? 'font-bold text-[#191c1e]' : 'font-semibold text-[#9ca3af] hover:text-[#434655]'
            }`}
          >
            {label}
            <span className="ml-1.5 text-xs tabular-nums text-[#9ca3af]">{moduloCounts[key]}</span>
            {moduloFiltro === key && (
              <span className="absolute left-0 right-0 -bottom-px h-[2.5px] rounded-full" style={{ background: '#004ac6' }} />
            )}
          </button>
        ))}
      </div>

      {/* ── Lista ────────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-[#e2e4ef] shadow-sm overflow-hidden">
        {empresasFiltradas.length === 0 ? (
          <p className="text-sm text-[#9ca3af] italic px-5 py-8 text-center">Ninguna empresa coincide</p>
        ) : (
          <table className="w-full text-sm border-collapse table-fixed">
            <thead>
              <tr className="bg-[#f8f9fc] border-b border-[#e2e4ef] text-left text-[12px] font-bold text-[#434655] uppercase tracking-wide">
                <th className="px-5 py-2.5 font-bold w-[38%]">Empresa</th>
                <th className="px-5 py-2.5 font-bold w-52">Documento</th>
                <th className="px-5 py-2.5 font-bold w-28">Módulos</th>
                <th className="px-3 py-2.5 font-bold w-48">Token DIAN</th>
                <th className="w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f0f2f8]">
              {empresasFiltradas.map((empresa) => {
                const expandido = expandidoId === empresa.id
                const modulosHabilitados = Object.entries(empresa.modulos).filter(([, v]) => v)
                const modulosSinHabilitar = Object.keys(MODULOS_INFO).filter((m) => !empresa.modulos[m])
                const documentoEtiqueta = !empresa.nit ? null : (empresa.tipoContribuyente === 'natural' ? 'C.C.' : 'NIT')
                const cedulaRepLegal = empresa.tipoContribuyente !== 'natural' ? empresa.cedulaRepresentante : null

                return (
                  <Fragment key={empresa.id}>
                    <tr
                      onClick={() => toggleExpandir(empresa)}
                      className={`transition cursor-pointer ${expandido ? 'bg-[#eef3ff]' : 'hover:bg-[#f8f9ff]'}`}
                    >
                      <td className={`px-5 py-3 border-l-4 ${expandido ? 'border-[#004ac6]' : 'border-transparent'}`}>
                        <span className={`font-semibold ${empresa.activa ? 'text-[#191c1e]' : 'text-[#9ca3af] line-through'}`}>
                          {empresa.name}
                        </span>
                      </td>
                      <td className="px-5 py-3" onClick={(e) => e.stopPropagation()}>
                        {documentoEtiqueta ? (
                          <div className="text-xs leading-tight flex flex-col items-start gap-0.5">
                            <button
                              onClick={() => copiar(empresa.nit)}
                              title="Copiar"
                              className="group flex items-center gap-1 text-[#434655] font-medium px-1 -mx-1 rounded hover:bg-[#f3f4f6] transition"
                            >
                              {documentoEtiqueta} {formatearDocumento(empresa.nit)}
                              <span className="material-symbols-outlined opacity-0 group-hover:opacity-60 transition" style={{ fontSize: 13 }}>
                                {copiado === empresa.nit ? 'check' : 'content_copy'}
                              </span>
                            </button>
                            {cedulaRepLegal && (
                              <button
                                onClick={() => copiar(cedulaRepLegal)}
                                title="Copiar"
                                className="group flex items-center gap-1 text-[#434655] font-medium px-1 -mx-1 rounded hover:bg-[#f3f4f6] transition"
                              >
                                C.C. {formatearDocumento(cedulaRepLegal)}
                                <span className="material-symbols-outlined opacity-0 group-hover:opacity-60 transition" style={{ fontSize: 13 }}>
                                  {copiado === cedulaRepLegal ? 'check' : 'content_copy'}
                                </span>
                              </button>
                            )}
                          </div>
                        ) : (
                          <span title="Falta NIT/cédula — no se puede generar el token DIAN todavía" className="flex items-center gap-1 text-amber-600 italic text-xs">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 flex-shrink-0" />
                            Sin NIT/cédula
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex gap-1.5 flex-wrap">
                          {modulosHabilitados.length === 0 ? (
                            <span className="text-xs text-[#c3c6d7] italic">Ninguno</span>
                          ) : modulosHabilitados.map(([modulo]) => (
                            <span
                              key={modulo}
                              title={MODULOS_INFO[modulo].label}
                              className="material-symbols-outlined text-[#6b7280] flex-shrink-0"
                              style={{ fontSize: 18 }}
                            >
                              {MODULOS_INFO[modulo].icon}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => generarToken(empresa.id)}
                            disabled={generandoTokenId === empresa.id || !empresa.tipoContribuyente}
                            title={!empresa.tipoContribuyente ? 'Completa el tipo de contribuyente primero' : 'Generar token DIAN'}
                            className="flex items-center gap-1.5 px-5 py-2 rounded-full text-sm font-semibold text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors duration-200 active:scale-[0.96] whitespace-nowrap"
                            style={{ background: '#004ac6' }}
                          >
                            {generandoTokenId === empresa.id && (
                              <span className="material-symbols-outlined animate-spin flex-shrink-0" style={{ fontSize: 15 }}>progress_activity</span>
                            )}
                            <span key={generandoTokenId === empresa.id ? tokenEtapa : 'idle'} className="gc-etapa-fade">
                              {generandoTokenId === empresa.id ? tokenEtapa : 'Generar Token'}
                            </span>
                          </button>
                        </div>
                      </td>
                      <td className="px-3 text-right">
                        <span className="material-symbols-outlined text-[#9ca3af]" style={{ fontSize: 20 }}>
                          {expandido ? 'expand_less' : 'expand_more'}
                        </span>
                      </td>
                    </tr>

                    {resultadoToken?.empresaId === empresa.id && (
                      <tr>
                        <td colSpan={5} className="px-5 py-0">
                          <div
                            className="flex items-start gap-2 px-3.5 py-2.5 my-2 rounded-lg text-xs"
                            style={resultadoToken.success
                              ? { background: '#ecfdf5', color: '#065f46' }
                              : { background: '#fef2f2', color: '#991b1b' }}
                          >
                            <span className="material-symbols-outlined flex-shrink-0" style={{ fontSize: 16 }}>
                              {resultadoToken.success ? 'check_circle' : 'error'}
                            </span>
                            <span>{resultadoToken.mensaje}</span>
                            <button
                              onClick={() => setResultadoToken(null)}
                              className="material-symbols-outlined ml-auto flex-shrink-0 opacity-60 hover:opacity-100"
                              style={{ fontSize: 15 }}
                            >
                              close
                            </button>
                          </div>
                        </td>
                      </tr>
                    )}

                    {expandido && (
                      <tr>
                        <td colSpan={5} className="bg-[#fafbff] border-l-4 border-[#004ac6] px-5 py-5">
                          {accionError && <p className="text-xs text-red-500 mb-3">{accionError}</p>}

                          <div className="flex gap-8 flex-wrap items-start">
                            {/* ── Identidad ── */}
                            <div className="w-full sm:w-96 flex-shrink-0">
                              <div className="flex items-center gap-2 mb-3">
                                <span className="material-symbols-outlined text-[#004ac6]" style={{ fontSize: 16 }}>badge</span>
                                <span className="text-xs font-bold text-[#191c1e]">Información</span>
                                {!puedeEditar && (
                                  <span className="text-[10px] font-semibold bg-[#f3f4f6] text-[#9ca3af] px-1.5 py-0.5 rounded uppercase">Solo admin</span>
                                )}
                              </div>
                              <div className="flex flex-col gap-2.5">
                                <div>
                                  <label className="text-[11px] font-semibold text-[#9ca3af] uppercase block mb-1">Nombre</label>
                                  <input
                                    value={identidadEdit?.name ?? empresa.name}
                                    onChange={(e) => setIdentidadEdit((prev) => ({ ...prev, name: e.target.value }))}
                                    disabled={!puedeEditar}
                                    className="w-full px-3 py-1.5 rounded-lg border border-[#d1d5db] bg-white text-sm text-[#191c1e] disabled:bg-[#f3f4f6] disabled:text-[#6b7280]"
                                  />
                                </div>
                                <div>
                                  <label className="text-[11px] font-semibold text-[#9ca3af] uppercase block mb-1">Tipo</label>
                                  {puedeEditar ? (
                                    <div className="flex gap-1.5">
                                      {[['empresa', 'Empresa'], ['natural', 'Persona natural']].map(([val, label]) => (
                                        <button
                                          key={val}
                                          type="button"
                                          onClick={() => setIdentidadEdit((prev) => ({ ...prev, tipoContribuyente: val }))}
                                          className={`flex-1 py-1.5 rounded-lg text-[11px] font-semibold border-2 transition ${
                                            identidadEdit?.tipoContribuyente === val
                                              ? 'border-[#004ac6] bg-[#eef3ff] text-[#004ac6]'
                                              : 'border-[#d1d5db] text-[#9ca3af] bg-white'
                                          }`}
                                        >
                                          {label}
                                        </button>
                                      ))}
                                    </div>
                                  ) : (
                                    <p className="text-sm text-[#191c1e]">
                                      {empresa.tipoContribuyente === 'natural' ? 'Persona natural' : empresa.tipoContribuyente === 'empresa' ? 'Empresa' : '—'}
                                    </p>
                                  )}
                                </div>
                                {identidadEdit?.tipoContribuyente !== 'natural' && (
                                  <div>
                                    <label className="text-[11px] font-semibold text-[#9ca3af] uppercase block mb-1">NIT</label>
                                    <input
                                      value={identidadEdit?.nit ?? ''}
                                      onChange={(e) => setIdentidadEdit((prev) => ({ ...prev, nit: e.target.value }))}
                                      disabled={!puedeEditar}
                                      className="w-full px-3 py-1.5 rounded-lg border border-[#d1d5db] bg-white text-sm text-[#191c1e] disabled:bg-[#f3f4f6] disabled:text-[#6b7280]"
                                    />
                                  </div>
                                )}
                                <div>
                                  <label className="text-[11px] font-semibold text-[#9ca3af] uppercase block mb-1">Cédula representante</label>
                                  <input
                                    value={identidadEdit?.cedulaRepresentante ?? ''}
                                    onChange={(e) => setIdentidadEdit((prev) => ({ ...prev, cedulaRepresentante: e.target.value }))}
                                    disabled={!puedeEditar}
                                    className="w-full px-3 py-1.5 rounded-lg border border-[#d1d5db] bg-white text-sm text-[#191c1e] disabled:bg-[#f3f4f6] disabled:text-[#6b7280]"
                                  />
                                </div>
                                {puedeEditar && (
                                  <div className="flex items-center gap-2 mt-1">
                                    <button
                                      onClick={() => guardarIdentidad(empresa.id)}
                                      disabled={guardandoIdentidad}
                                      className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white disabled:opacity-50"
                                      style={{ background: '#004ac6' }}
                                    >
                                      {guardandoIdentidad ? 'Guardando…' : 'Guardar'}
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* ── Módulos ── */}
                            <div className="flex-1 min-w-[280px]">
                              <p className="text-xs font-bold text-[#191c1e] mb-3">Módulos habilitados</p>
                              {modulosHabilitados.length === 0 ? (
                                <p className="text-xs text-[#9ca3af] italic mb-3">Ninguno todavía</p>
                              ) : (
                                <div className="flex flex-col gap-2 mb-3">
                                  {modulosHabilitados.map(([modulo, data]) => {
                                    const draft = vigenciaDrafts[modulo] || { anio: '', mes: '' }
                                    const vigenciaActual = data.vigenteHastaAnio && data.vigenteHastaMes
                                      ? `Vigente hasta ${MESES[data.vigenteHastaMes - 1]} ${data.vigenteHastaAnio}`
                                      : null
                                    return (
                                      <div key={modulo} className="rounded-xl overflow-hidden border border-[#e2e4ef]">
                                        <div className="flex items-center gap-2 px-3.5 py-2.5 bg-[#f8f9fc] border-b border-[#e2e4ef]">
                                          <span className="material-symbols-outlined text-[#6b7280]" style={{ fontSize: 16 }}>
                                            {MODULOS_INFO[modulo].icon}
                                          </span>
                                          <span className="text-xs font-bold text-[#191c1e] flex-1">{MODULOS_INFO[modulo].label}</span>
                                          {vigenciaActual && (
                                            <span className="text-[11px] font-semibold text-[#6b7280]">{vigenciaActual}</span>
                                          )}
                                        </div>
                                        {puedeEditar && (
                                          <div className="flex items-center gap-1.5 flex-wrap px-3.5 py-3">
                                            <select
                                              value={draft.mes}
                                              onChange={(e) => setVigenciaDrafts((prev) => ({ ...prev, [modulo]: { ...draft, mes: e.target.value } }))}
                                              className="px-2 py-1.5 rounded-lg border border-[#d1d5db] bg-white text-xs text-[#191c1e]"
                                            >
                                              <option value="">Mes…</option>
                                              {MESES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                                            </select>
                                            <select
                                              value={draft.anio}
                                              onChange={(e) => setVigenciaDrafts((prev) => ({ ...prev, [modulo]: { ...draft, anio: e.target.value } }))}
                                              className="w-20 px-2 py-1.5 rounded-lg border border-[#d1d5db] bg-white text-xs text-[#191c1e]"
                                            >
                                              <option value="">Año…</option>
                                              {ANIOS_VIGENCIA.map((a) => <option key={a} value={a}>{a}</option>)}
                                            </select>
                                            <button
                                              onClick={() => guardarVigencia(empresa, modulo)}
                                              disabled={guardandoVigenciaModulo === modulo || !draft.mes || !draft.anio}
                                              title={!draft.mes || !draft.anio ? 'Elige mes y año' : undefined}
                                              className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold text-white disabled:opacity-50"
                                              style={{ background: '#004ac6' }}
                                            >
                                              Guardar
                                            </button>
                                            {vigenciaActual && (
                                              <button
                                                onClick={() => quitarVigencia(empresa, modulo)}
                                                disabled={guardandoVigenciaModulo === modulo}
                                                className="text-[11px] text-[#6b7280] hover:underline whitespace-nowrap disabled:opacity-50"
                                              >
                                                Quitar límite
                                              </button>
                                            )}
                                          </div>
                                        )}
                                      </div>
                                    )
                                  })}
                                </div>
                              )}

                              {puedeEditar && modulosSinHabilitar.length > 0 && (
                                <div className="flex items-center gap-2 mb-3">
                                  <select
                                    value={moduloNuevo}
                                    onChange={(e) => setModuloNuevo(e.target.value)}
                                    className="px-3 py-1.5 rounded-lg border border-[#d1d5db] bg-white text-xs text-[#191c1e]"
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
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Modal: nueva empresa ────────────────────────────────────────── */}
      {modalNuevaEmpresa && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setModalNuevaEmpresa(false)}>
          <div className="bg-white rounded-2xl shadow-xl p-6 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-1">
              <span className="material-symbols-outlined text-[#004ac6]" style={{ fontSize: 20 }}>add_business</span>
              <h3 className="text-base font-bold text-[#191c1e]">Nueva empresa</h3>
            </div>
            <p className="text-xs text-[#6b7280] mb-4">
              Crea la identidad de la empresa en el directorio. Los módulos (Fondo, Externas…) se habilitan después, desde su ficha.
            </p>
            {errorCrear && <p className="text-xs text-red-500 mb-3">{errorCrear}</p>}
            <div className="flex flex-col gap-3">
              <div>
                <label className="text-xs font-semibold text-[#434655] block mb-1">Nombre</label>
                <input
                  value={nuevaEmpresaForm.name}
                  onChange={(e) => setNuevaEmpresaForm((prev) => ({ ...prev, name: e.target.value }))}
                  placeholder="Ej. Achiras del Rancho"
                  className="w-full px-3 py-2 rounded-lg border border-[#d1d5db] text-sm text-[#191c1e]"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-[#434655] block mb-1">Tipo de contribuyente</label>
                <div className="flex gap-2">
                  {[['empresa', 'Empresa'], ['natural', 'Persona natural']].map(([val, label]) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setNuevaEmpresaForm((prev) => ({ ...prev, tipoContribuyente: val }))}
                      className={`flex-1 py-2 rounded-lg text-xs font-semibold border-2 transition ${
                        nuevaEmpresaForm.tipoContribuyente === val
                          ? 'border-[#004ac6] bg-[#eef3ff] text-[#004ac6]'
                          : 'border-[#d1d5db] text-[#9ca3af]'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              {nuevaEmpresaForm.tipoContribuyente === 'empresa' && (
                <div>
                  <label className="text-xs font-semibold text-[#434655] block mb-1">NIT</label>
                  <input
                    value={nuevaEmpresaForm.nit}
                    onChange={(e) => setNuevaEmpresaForm((prev) => ({ ...prev, nit: e.target.value }))}
                    placeholder="Ej. 901234567"
                    className="w-full px-3 py-2 rounded-lg border border-[#d1d5db] text-sm text-[#191c1e]"
                  />
                </div>
              )}
              <div>
                <label className="text-xs font-semibold text-[#434655] block mb-1">Cédula representante legal</label>
                <input
                  value={nuevaEmpresaForm.cedulaRepresentante}
                  onChange={(e) => setNuevaEmpresaForm((prev) => ({ ...prev, cedulaRepresentante: e.target.value }))}
                  placeholder="Ej. 1052395147"
                  className="w-full px-3 py-2 rounded-lg border border-[#d1d5db] text-sm text-[#191c1e]"
                />
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={() => setModalNuevaEmpresa(false)} className="flex-1 py-2 rounded-lg text-sm font-semibold text-[#434655] bg-[#f3f4f6]">
                Cancelar
              </button>
              <button
                onClick={crearEmpresa}
                disabled={creandoEmpresa || !nuevaEmpresaForm.name.trim()}
                className="flex-1 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-40"
                style={{ background: '#004ac6' }}
              >
                {creandoEmpresa ? 'Creando…' : 'Crear empresa'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal de fusión ─────────────────────────────────────────────── */}
      {fusionando && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setFusionando(null)}>
          <div className="bg-white rounded-2xl shadow-xl p-6 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-[#191c1e] mb-2">¿Cuál nombre se conserva?</h3>
            <p className="text-sm text-[#6b7280] mb-4">
              La otra se borra — sus módulos habilitados pasan a la que elijas.
            </p>
            {fusionError && <p className="text-xs text-red-500 mb-3">{fusionError}</p>}
            <div className="flex flex-col gap-2">
              <button
                onClick={() => confirmarFusion(fusionando.empresaA, fusionando.empresaB)}
                className="text-left px-4 py-2.5 rounded-xl border border-[#e2e4ef] hover:border-[#004ac6] transition text-sm font-medium"
              >
                {fusionando.empresaA.name}
              </button>
              <button
                onClick={() => confirmarFusion(fusionando.empresaB, fusionando.empresaA)}
                className="text-left px-4 py-2.5 rounded-xl border border-[#e2e4ef] hover:border-[#004ac6] transition text-sm font-medium"
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
