import { useState, useRef, useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../services/api'

const SIN_EMPRESA = ''

const VALID_EXTS  = ['.xlsx', '.xls']
const VALID_MIMES = [
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
]

function isValidFile(file) {
  if (!file) return false
  const name = file.name.toLowerCase()
  const extOk  = VALID_EXTS.some((e) => name.endsWith(e))
  const mimeOk = !file.type || VALID_MIMES.includes(file.type) || file.type === 'application/octet-stream'
  return extOk && mimeOk
}

// Numerito de paso — mismo patrón visual en las dos secciones de la tarjeta (empresa / archivo)
// para que se lea como un flujo de dos pasos en vez de dos bloques sueltos.
function PasoLabel({ n, children }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <span className="w-5 h-5 rounded-full bg-[#004ac6] text-white text-[11px] font-bold flex items-center justify-center flex-shrink-0">
        {n}
      </span>
      <span className="text-xs font-semibold text-[#434655] dark:text-[#c4c8e8] uppercase tracking-wide">
        {children}
      </span>
    </div>
  )
}

// ── Buscador de empresa ────────────────────────────────────────────────────────
// Combobox liviano: input con filtro en vivo + lista desplegable, en vez de un <select> plano
// con 52+ empresas sin buscador. La opción de agregar una empresa nueva vive integrada en la
// misma lista (fila final "Agregar '<texto>'") en vez de un formulario aparte.
function EmpresaCombobox({ empresas, value, onChange, onCrear }) {
  const [query, setQuery]   = useState('')
  const [open, setOpen]     = useState(false)
  const [creando, setCreando] = useState(false)
  const [errorNueva, setErrorNueva] = useState('')
  const wrapRef = useRef(null)

  const empresaSeleccionada = empresas.find((e) => e.id === value) ?? null

  useEffect(() => {
    const onClickFuera = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickFuera)
    return () => document.removeEventListener('mousedown', onClickFuera)
  }, [])

  const queryNormalizada = query.trim().toLowerCase()
  const filtradas = queryNormalizada
    ? empresas.filter((e) => e.name.toLowerCase().includes(queryNormalizada))
    : empresas
  const hayCoincidenciaExacta = filtradas.some((e) => e.name.toLowerCase() === queryNormalizada)

  const seleccionar = (empresa) => {
    onChange(empresa.id)
    setQuery('')
    setErrorNueva('')
    setOpen(false)
  }

  const crear = async () => {
    const nombre = query.trim()
    if (!nombre) return
    setCreando(true)
    setErrorNueva('')
    try {
      const nueva = await onCrear(nombre)
      seleccionar(nueva)
    } catch (err) {
      setErrorNueva(err.message || 'No se pudo agregar la empresa')
    } finally {
      setCreando(false)
    }
  }

  return (
    <div ref={wrapRef} className="relative">
      {empresaSeleccionada && !open ? (
        <button
          type="button"
          onClick={() => { setOpen(true); setQuery('') }}
          className="w-full flex items-center justify-between gap-2 px-3.5 py-2.5 rounded-xl border border-[#c7d9ff] dark:border-[#2e4470] bg-[#eef3ff] dark:bg-[#1a2540] text-sm transition hover:border-[#004ac6]/50"
        >
          <span className="flex items-center gap-2 min-w-0">
            <span className="material-symbols-outlined text-[#004ac6] text-lg flex-shrink-0">business</span>
            <span className="truncate font-medium text-[#191c1e] dark:text-[#e4e6f0]">{empresaSeleccionada.name}</span>
          </span>
          <span className="material-symbols-outlined text-[#8890b5] text-lg flex-shrink-0">unfold_more</span>
        </button>
      ) : (
        <div className="relative">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[#9ca3af] text-lg pointer-events-none">
            search
          </span>
          <input
            autoFocus={open}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setOpen(true)}
            placeholder="Buscar empresa…"
            className="w-full pl-10 pr-3.5 py-2.5 rounded-xl border border-[#d1d5db] dark:border-[#3a3e5c] bg-white dark:bg-[#181a2e] text-sm text-[#191c1e] dark:text-[#e4e6f0] focus:outline-none focus:ring-2 focus:ring-[#004ac6]/30 focus:border-[#004ac6]"
          />
        </div>
      )}

      {open && (
        <div className="absolute z-20 mt-1.5 w-full bg-white dark:bg-[#1e2030] border border-[#e2e4ef] dark:border-[#2e3148] rounded-xl shadow-lg overflow-hidden">
          <div className="max-h-56 overflow-y-auto scrollbar-styled">
            {filtradas.length === 0 ? (
              <p className="px-3.5 py-3 text-sm text-[#9ca3af] italic">Ninguna empresa coincide</p>
            ) : (
              filtradas.map((e) => (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => seleccionar(e)}
                  className="w-full text-left px-3.5 py-2.5 text-sm text-[#191c1e] dark:text-[#e4e6f0] hover:bg-[#eef3ff] dark:hover:bg-[#1a2540] transition-colors flex items-center gap-2"
                >
                  <span className="material-symbols-outlined text-[#8890b5] text-base flex-shrink-0">business</span>
                  <span className="truncate">{e.name}</span>
                </button>
              ))
            )}
          </div>

          {query.trim() && !hayCoincidenciaExacta && (
            <button
              type="button"
              onClick={crear}
              disabled={creando}
              className="w-full text-left px-3.5 py-2.5 text-sm font-semibold text-[#004ac6] hover:bg-[#eef3ff] dark:hover:bg-[#1a2540] border-t border-[#f0f2f8] dark:border-[#2a2e45] transition-colors flex items-center gap-2 disabled:opacity-50"
            >
              <span className="material-symbols-outlined text-base flex-shrink-0">add_circle</span>
              {creando ? 'Agregando…' : <>Agregar <span className="truncate">&ldquo;{query.trim()}&rdquo;</span> como empresa nueva</>}
            </button>
          )}
        </div>
      )}
      {errorNueva && <p className="text-xs text-red-500 mt-1.5">{errorNueva}</p>}
    </div>
  )
}

export default function DianUploadPage() {
  const navigate    = useNavigate()
  const inputRef    = useRef(null)

  const [isDragOver, setIsDragOver]   = useState(false)
  const [estado, setEstado]           = useState('idle') // idle | loading | success | error
  const [errorMsg, setErrorMsg]       = useState('')
  const [archivoNombre, setArchivoNombre] = useState('')

  // ── Empresa ──────────────────────────────────────────────────────────────
  // Dos modos, elegidos con un toggle (no un valor más dentro del buscador de empresas):
  // "Guardar para una empresa" exige elegir una y clasificar retención + IVA + concepto al
  // exportar; "Solo calcular" procesa el reporte exactamente igual que antes de este cambio,
  // sin persistir nada — así cada quien migra a su ritmo.
  const [modo, setModo]               = useState('empresa') // 'empresa' | 'sin_empresa'
  const [empresas, setEmpresas]       = useState([])
  const [empresaId, setEmpresaId]     = useState(SIN_EMPRESA)

  useEffect(() => {
    api.getContabEmpresas().then(setEmpresas).catch(() => {})
  }, [])

  const crearEmpresa = useCallback(async (nombre) => {
    const nueva = await api.createContabEmpresa({ name: nombre })
    setEmpresas((prev) => [...prev, nueva].sort((a, b) => a.name.localeCompare(b.name)))
    return nueva
  }, [])

  const cambiarModo = useCallback((nuevoModo) => {
    setModo(nuevoModo)
    if (nuevoModo === 'sin_empresa') setEmpresaId(SIN_EMPRESA)
  }, [])

  // Se guarda el File seleccionado para poder reintentar sin pedirlo de nuevo cuando el
  // backend responde "requiereConfirmacion" (primera vez que se vincula una empresa sin NIT
  // todavía, y el nombre real del reporte no se parece al de la empresa elegida — ver
  // dianController.js#nombresSeParecen).
  const [archivoPendiente, setArchivoPendiente] = useState(null)
  const [confirmacionPendiente, setConfirmacionPendiente] = useState(null) // { nombreDetectado, nitReporte } | null

  const subirArchivo = useCallback(async (file, { confirmarEmpresa = false } = {}) => {
    if (!isValidFile(file)) {
      setEstado('error')
      setErrorMsg('Solo archivos Excel (.xlsx, .xls)')
      return
    }

    setArchivoNombre(file.name)
    setEstado('loading')
    setErrorMsg('')
    setConfirmacionPendiente(null)

    const formData = new FormData()
    formData.append('archivo', file)
    if (empresaId) formData.append('empresaId', empresaId)
    if (confirmarEmpresa) formData.append('confirmarEmpresa', 'true')

    try {
      const respuesta = await api.uploadDian(formData)
      setEstado('success')
      setArchivoPendiente(null)
      setTimeout(() => {
        navigate(`/dian/clasificacion/${respuesta.id}`)
      }, 1000)
    } catch (err) {
      setEstado('error')
      if (err.status === 409 && err.requiereConfirmacion) {
        setArchivoPendiente(file)
        setConfirmacionPendiente({ nombreDetectado: err.nombreDetectado, nitReporte: err.nitReporte })
        setErrorMsg(err.message)
        return
      }
      // El 409 de NIT no coincidente (empresa ya con NIT distinto, o NIT de otra empresa
      // del catálogo) trae detalle específico (ver api.uploadDian).
      setErrorMsg(
        err.status === 409 && err.nitEsperado
          ? `${err.message} Si el reporte sí es de "${err.empresaNombre}", verifica el NIT registrado; si no, elige la empresa correcta.`
          : err.message || 'Error al procesar el archivo'
      )
    }
  }, [navigate, empresaId])

  // ── drag handlers ──────────────────────────────────────────────────────────
  const onDragOver = useCallback((e) => {
    e.preventDefault()
    setIsDragOver(true)
  }, [])

  const onDragLeave = useCallback((e) => {
    // Evita flickering cuando el cursor pasa sobre hijos del área
    if (!e.currentTarget.contains(e.relatedTarget)) setIsDragOver(false)
  }, [])

  const onDrop = useCallback((e) => {
    e.preventDefault()
    setIsDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (file) subirArchivo(file)
  }, [subirArchivo])

  const onFileChange = useCallback((e) => {
    const file = e.target.files?.[0]
    if (file) subirArchivo(file)
    e.target.value = ''
  }, [subirArchivo])

  const reintentar = useCallback(() => {
    setEstado('idle')
    setErrorMsg('')
    setArchivoNombre('')
    setArchivoPendiente(null)
    setConfirmacionPendiente(null)
  }, [])

  // ── estilos del área de drop ───────────────────────────────────────────────
  const dropBase = 'relative flex flex-col items-center justify-center gap-4 rounded-2xl border-2 transition-all duration-150 cursor-pointer select-none'
  const dropStyle = estado === 'loading'
    ? `${dropBase} border-[#c3c6d7] dark:border-[#3a3e5c] bg-[#f8f9ff] dark:bg-[#1a1c2e] opacity-60 cursor-not-allowed`
    : isDragOver
      ? `${dropBase} border-[#004ac6] bg-[#e8f0fe] dark:bg-[#1a2550] border-solid`
      : `${dropBase} border-dashed border-[#c3c6d7] dark:border-[#3a3e5c] bg-[#f8f9ff] dark:bg-[#181a2e] hover:border-[#004ac6] hover:bg-[#eef2fd] dark:hover:bg-[#1a2040]`

  return (
    <div className="max-w-[600px] mx-auto mt-12">
      {/* Encabezado */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <span className="material-symbols-outlined text-3xl text-[#004ac6]">upload_file</span>
          <h1 className="text-2xl font-bold text-[#191c1e] dark:text-[#e4e6f0]">
            Cargar reporte DIAN
          </h1>
        </div>
        <p className="text-sm text-[#6b7280] dark:text-[#8890b5]">
          Sube el Excel de compras y ventas para clasificar retención, IVA y concepto.
        </p>
      </div>

      {/* Tarjeta principal */}
      <div className="bg-white dark:bg-[#1e2030] rounded-2xl border border-[#e2e4ef] dark:border-[#2e3148] shadow-sm p-8">

        {/* ── ESTADO: idle / drag ─────────────────────────────────────────── */}
        {(estado === 'idle' || estado === 'error') && (
          <>
            {/* ── Paso 1 — Empresa ────────────────────────────────────────── */}
            <div className="mb-7">
              <PasoLabel n={1}>Empresa</PasoLabel>

              <div className="inline-flex bg-[#f0f2f8] dark:bg-[#181a2e] rounded-xl p-1 mb-3">
                <button
                  type="button"
                  onClick={() => cambiarModo('empresa')}
                  className={`px-3.5 py-1.5 rounded-lg text-sm font-semibold transition ${
                    modo === 'empresa'
                      ? 'bg-white dark:bg-[#252840] shadow-sm text-[#004ac6]'
                      : 'text-[#6b7280] dark:text-[#8890b5] hover:text-[#434655] dark:hover:text-[#c4c8e8]'
                  }`}
                >
                  Guardar para una empresa
                </button>
                <button
                  type="button"
                  onClick={() => cambiarModo('sin_empresa')}
                  className={`px-3.5 py-1.5 rounded-lg text-sm font-semibold transition ${
                    modo === 'sin_empresa'
                      ? 'bg-white dark:bg-[#252840] shadow-sm text-[#004ac6]'
                      : 'text-[#6b7280] dark:text-[#8890b5] hover:text-[#434655] dark:hover:text-[#c4c8e8]'
                  }`}
                >
                  Solo calcular
                </button>
              </div>

              {modo === 'empresa' ? (
                <>
                  <EmpresaCombobox empresas={empresas} value={empresaId} onChange={setEmpresaId} onCrear={crearEmpresa} />
                  <p className="text-xs text-[#9ca3af] dark:text-[#6b7280] mt-1.5">
                    Se guarda mensualmente para esta empresa — exige clasificar retención, IVA y concepto.
                  </p>
                </>
              ) : (
                <p className="text-xs text-[#9ca3af] dark:text-[#6b7280]">
                  El reporte se procesa igual que siempre, sin guardarse en la base de datos.
                </p>
              )}
            </div>

            <div className="h-px bg-[#f0f2f8] dark:bg-[#2a2e45] mb-7" />

            {/* ── Paso 2 — Archivo ────────────────────────────────────────── */}
            <div>
              <PasoLabel n={2}>Reporte</PasoLabel>

              <div
                className={`${dropStyle} px-8 py-12`}
                onDragOver={onDragOver}
                onDragLeave={onDragLeave}
                onDrop={onDrop}
                onClick={() => inputRef.current?.click()}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === 'Enter' && inputRef.current?.click()}
                aria-label="Área para cargar archivo Excel"
              >
                <input
                  ref={inputRef}
                  type="file"
                  accept=".xlsx,.xls"
                  className="hidden"
                  onChange={onFileChange}
                />

                <span className="material-symbols-outlined text-5xl text-[#004ac6]" aria-hidden>
                  {isDragOver ? 'file_download' : 'upload_file'}
                </span>

                <div className="text-center">
                  <p className="text-sm font-semibold text-[#434655] dark:text-[#c4c8e8]">
                    {isDragOver
                      ? 'Suelta el archivo aquí'
                      : 'Arrastra tu reporte aquí o haz clic para seleccionar'}
                  </p>
                  <p className="text-xs text-[#9ca3af] dark:text-[#6b7280] mt-1">
                    Formato aceptado: .xlsx, .xls
                  </p>
                </div>
              </div>

              {/* Botón fallback */}
              <div className="mt-4 flex justify-center">
                <button
                  onClick={() => inputRef.current?.click()}
                  className="flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-semibold border border-[#d1d5db] dark:border-[#3a3e5c] text-[#434655] dark:text-[#c4c8e8] hover:bg-[#f3f4f6] dark:hover:bg-[#252840] transition active:scale-[0.97]"
                >
                  <span className="material-symbols-outlined text-base">folder_open</span>
                  Seleccionar archivo
                </button>
              </div>
            </div>

            {/* Confirmación de empresa — el reporte no se parece a la empresa elegida y
                todavía no tiene NIT registrado (primera vinculación, sin nada con qué
                verificar automáticamente). Ver dianController.js#nombresSeParecen. */}
            {estado === 'error' && confirmacionPendiente && (
              <div className="mt-5 flex items-start gap-3 p-4 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                <span className="material-symbols-outlined text-amber-500 text-xl flex-shrink-0 mt-0.5">warning</span>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">{errorMsg}</p>
                  <div className="flex gap-3 mt-3">
                    <button
                      onClick={() => archivoPendiente && subirArchivo(archivoPendiente, { confirmarEmpresa: true })}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#004ac6] text-white"
                    >
                      Sí, es la misma empresa
                    </button>
                    <button
                      onClick={reintentar}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-300"
                    >
                      No, elegir otra empresa
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Error de validación o API */}
            {estado === 'error' && errorMsg && !confirmacionPendiente && (
              <div className="mt-5 flex items-start gap-3 p-4 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                <span className="material-symbols-outlined text-red-500 text-xl flex-shrink-0 mt-0.5">error</span>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-red-700 dark:text-red-400">{errorMsg}</p>
                  {archivoNombre && (
                    <p className="text-xs text-red-500 dark:text-red-500 mt-0.5">{archivoNombre}</p>
                  )}
                </div>
                <button
                  onClick={reintentar}
                  className="text-xs font-semibold text-red-600 dark:text-red-400 hover:underline flex-shrink-0"
                >
                  Reintentar
                </button>
              </div>
            )}
          </>
        )}

        {/* ── ESTADO: loading ─────────────────────────────────────────────── */}
        {estado === 'loading' && (
          <div className="flex flex-col items-center gap-5 py-12">
            {/* Spinner */}
            <svg
              className="w-12 h-12 text-[#004ac6] animate-spin"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden
            >
              <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
              <path className="opacity-80" fill="currentColor"
                d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
            </svg>
            <div className="text-center">
              <p className="text-sm font-semibold text-[#434655] dark:text-[#c4c8e8]">Procesando…</p>
              <p className="text-xs text-[#9ca3af] dark:text-[#6b7280] mt-1 max-w-xs truncate">{archivoNombre}</p>
            </div>
          </div>
        )}

        {/* ── ESTADO: success ─────────────────────────────────────────────── */}
        {estado === 'success' && (
          <div className="flex flex-col items-center gap-4 py-12">
            <div className="w-14 h-14 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
              <span className="material-symbols-outlined text-3xl text-green-600 dark:text-green-400">
                check_circle
              </span>
            </div>
            <p className="text-sm font-semibold text-[#191c1e] dark:text-[#e4e6f0]">
              ✓ Reporte cargado correctamente
            </p>
            <p className="text-xs text-[#9ca3af] dark:text-[#6b7280]">Redirigiendo a clasificación…</p>
          </div>
        )}
      </div>
    </div>
  )
}
