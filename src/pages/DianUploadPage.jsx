import { useState, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../services/api'

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

export default function DianUploadPage() {
  const navigate    = useNavigate()
  const inputRef    = useRef(null)

  const [isDragOver, setIsDragOver]   = useState(false)
  const [estado, setEstado]           = useState('idle') // idle | loading | success | error
  const [errorMsg, setErrorMsg]       = useState('')
  const [archivoNombre, setArchivoNombre] = useState('')

  const subirArchivo = useCallback(async (file) => {
    if (!isValidFile(file)) {
      setEstado('error')
      setErrorMsg('Solo archivos Excel (.xlsx, .xls)')
      return
    }

    setArchivoNombre(file.name)
    setEstado('loading')
    setErrorMsg('')

    const formData = new FormData()
    formData.append('archivo', file)

    try {
      const respuesta = await api.uploadDian(formData)
      setEstado('success')
      setTimeout(() => {
        navigate('/dian/clasificacion', {
          state: {
            borradorId:          respuesta.id,
            filasParaClasificar: respuesta.filasParaClasificar,
          },
        })
      }, 1000)
    } catch (err) {
      setEstado('error')
      setErrorMsg(err.message || 'Error al procesar el archivo')
    }
  }, [navigate])

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
          <span className="material-symbols-outlined text-3xl text-[#004ac6]">receipt_long</span>
          <h1 className="text-2xl font-bold text-[#191c1e] dark:text-[#e4e6f0]">
            Reporte DIAN
          </h1>
        </div>
        <p className="text-sm text-[#6b7280] dark:text-[#8890b5]">
          Sube el archivo Excel exportado del portal DIAN para calcular retenciones.
        </p>
      </div>

      {/* Tarjeta principal */}
      <div className="bg-white dark:bg-[#1e2030] rounded-2xl border border-[#e2e4ef] dark:border-[#2e3148] shadow-sm p-8">

        {/* ── ESTADO: idle / drag ─────────────────────────────────────────── */}
        {(estado === 'idle' || estado === 'error') && (
          <>
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
                    : 'Arrastra tu reporte DIAN aquí o haz clic para seleccionar'}
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

            {/* Error de validación o API */}
            {estado === 'error' && errorMsg && (
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
