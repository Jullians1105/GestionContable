import { useState, useRef, useCallback } from 'react'
import StatsCard from '../components/StatsCard'
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

const formatoMoneda = (n) =>
  `$ ${Number(n ?? 0).toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

// 1001/1006/1007 quedan visibles pero deshabilitados hasta que se implementen — no toda
// empresa necesita los 4 formatos (ej. una empresa pequeña puede solo requerir 1005+1001),
// así que el usuario marca cuáles aplican en vez de procesarlos todos de una.
const FORMATOS_DISPONIBLES = [
  { id: '1001', codigo: '1001', nombre: 'Gastos/Compras', icon: 'payments', disponible: false },
  { id: '1005', codigo: '1005', nombre: 'Impuestos descontables', icon: 'receipt_long', disponible: true },
  { id: '1006', codigo: '1006', nombre: 'IVA/Inc generado', icon: 'sell', disponible: false },
  { id: '1007', codigo: '1007', nombre: 'Ingresos', icon: 'trending_up', disponible: false },
]

function FormatoCard({ formato, checked, onToggle }) {
  const { nombre, codigo, icon, disponible } = formato

  const base = 'relative flex flex-col items-start gap-2 rounded-2xl border-2 transition-all duration-150 px-4 py-4 text-left'
  const style = !disponible
    ? `${base} border-dashed border-[#e2e4ef] dark:border-[#2e3148] opacity-50 cursor-not-allowed`
    : checked
      ? `${base} border-solid border-[#004ac6] bg-[#e8f0fe] dark:bg-[#1a2550] cursor-pointer`
      : `${base} border-dashed border-[#c3c6d7] dark:border-[#3a3e5c] bg-[#f8f9ff] dark:bg-[#181a2e] hover:border-[#004ac6] hover:bg-[#eef2fd] dark:hover:bg-[#1a2040] cursor-pointer`

  return (
    <div
      className={style}
      onClick={() => disponible && onToggle(formato.id)}
      role="checkbox"
      aria-checked={checked}
      aria-disabled={!disponible}
      tabIndex={disponible ? 0 : -1}
      onKeyDown={(e) => { if (disponible && e.key === 'Enter') onToggle(formato.id) }}
    >
      {disponible ? (
        <span
          className="absolute top-3 right-3 material-symbols-outlined text-lg"
          style={{ color: checked ? '#004ac6' : '#c3c6d7' }}
        >
          {checked ? 'check_circle' : 'radio_button_unchecked'}
        </span>
      ) : (
        <span className="absolute top-3 right-3 text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-[#f0f2f8] dark:bg-[#252840] text-[#8890b5] dark:text-[#5a5f7a]">
          Próximamente
        </span>
      )}
      <span className="material-symbols-outlined text-2xl" style={{ color: disponible ? '#004ac6' : '#9ca3af' }}>
        {icon}
      </span>
      <div>
        <p className="text-sm font-bold text-[#191c1e] dark:text-[#e4e6f0]">{codigo}</p>
        <p className="text-xs text-[#6b7280] dark:text-[#8890b5]">{nombre}</p>
      </div>
    </div>
  )
}

function Dropzone({ label, hint, icon, file, onFile }) {
  const inputRef = useRef(null)
  const [isDragOver, setIsDragOver] = useState(false)

  const onDrop = useCallback((e) => {
    e.preventDefault()
    setIsDragOver(false)
    const f = e.dataTransfer.files?.[0]
    if (f) onFile(f)
  }, [onFile])

  const onChange = useCallback((e) => {
    const f = e.target.files?.[0]
    if (f) onFile(f)
    e.target.value = ''
  }, [onFile])

  const base = 'relative flex flex-col items-center justify-center gap-2 rounded-2xl border-2 transition-all duration-150 cursor-pointer select-none px-4 py-8 text-center'
  const style = file
    ? `${base} border-solid border-[#16a34a] bg-[#f0fdf4] dark:bg-[#0f2418]`
    : isDragOver
      ? `${base} border-[#004ac6] bg-[#e8f0fe] dark:bg-[#1a2550] border-solid`
      : `${base} border-dashed border-[#c3c6d7] dark:border-[#3a3e5c] bg-[#f8f9ff] dark:bg-[#181a2e] hover:border-[#004ac6] hover:bg-[#eef2fd] dark:hover:bg-[#1a2040]`

  return (
    <div
      className={style}
      onDragOver={(e) => { e.preventDefault(); setIsDragOver(true) }}
      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setIsDragOver(false) }}
      onDrop={onDrop}
      onClick={() => inputRef.current?.click()}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && inputRef.current?.click()}
    >
      <input ref={inputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={onChange} />
      <span className="material-symbols-outlined text-3xl" style={{ color: file ? '#16a34a' : '#004ac6' }}>
        {file ? 'check_circle' : icon}
      </span>
      <p className="text-sm font-semibold text-[#434655] dark:text-[#c4c8e8]">{label}</p>
      <p className="text-xs text-[#9ca3af] dark:text-[#6b7280] truncate max-w-full">
        {file ? file.name : hint}
      </p>
    </div>
  )
}

export default function ExogenasUploadPage() {
  const [estado, setEstado]   = useState('idle') // idle | analizando | preview | generando | generado | error
  const [errorMsg, setErrorMsg] = useState('')
  const [formatos, setFormatos]           = useState(['1005'])
  const [tokenFile, setTokenFile]         = useState(null)
  const [plantillaFile, setPlantillaFile] = useState(null)
  const [borrador, setBorrador]           = useState(null) // { id, totalTerceros, totalVimp, registros }
  // Blob del Excel ya generado, guardado en memoria para poder re-disparar la descarga sin
  // volver a pedirle el archivo al backend — el borrador se borra del servidor apenas se
  // genera con éxito (mismo patrón que Contabilidad DIAN).
  const [descarga, setDescarga] = useState(null) // { blob, filename }

  const toggleFormato = useCallback((id) => {
    setFormatos((prev) => (prev.includes(id) ? prev.filter((f) => f !== id) : [...prev, id]))
  }, [])

  const dispararDescarga = useCallback((blob, filename) => {
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    window.URL.revokeObjectURL(url)
  }, [])

  const analizar = useCallback(async () => {
    if (formatos.length === 0) {
      setEstado('error')
      setErrorMsg('Marca al menos un formato para generar')
      return
    }
    if (!isValidFile(tokenFile) || !isValidFile(plantillaFile)) {
      setEstado('error')
      setErrorMsg('Selecciona ambos archivos en formato Excel (.xlsx, .xls)')
      return
    }
    setEstado('analizando')
    setErrorMsg('')

    const formData = new FormData()
    // El backend hoy solo procesa un formato a la vez — con más de uno implementado, esto
    // pasa a mandar formatos.join(',') y el motor combina todo en un solo archivo de salida.
    formData.append('formato', formatos[0])
    formData.append('token', tokenFile)
    formData.append('plantilla', plantillaFile)

    try {
      const data = await api.uploadExogenas(formData)
      setBorrador(data)
      setEstado('preview')
    } catch (err) {
      setEstado('error')
      setErrorMsg(err.message || 'Error al procesar los archivos')
    }
  }, [formatos, tokenFile, plantillaFile])

  const generar = useCallback(async () => {
    if (!borrador) return
    setEstado('generando')
    setErrorMsg('')
    try {
      const { blob, filename } = await api.generarExogenas(borrador.id)
      dispararDescarga(blob, filename)
      setDescarga({ blob, filename })
      setEstado('generado')
    } catch (err) {
      setEstado('preview')
      setErrorMsg(err.message || 'Error al generar el Excel')
    }
  }, [borrador, dispararDescarga])

  // Re-descarga sin volver a pedirle el archivo al servidor (el borrador ya no existe ahí).
  const descargarDeNuevo = useCallback(() => {
    if (!descarga) return
    dispararDescarga(descarga.blob, descarga.filename)
  }, [descarga, dispararDescarga])

  const reiniciar = useCallback(() => {
    setEstado('idle')
    setErrorMsg('')
    setFormatos(['1005'])
    setTokenFile(null)
    setPlantillaFile(null)
    setBorrador(null)
    setDescarga(null)
  }, [])

  const puedeAnalizar = formatos.length > 0 && tokenFile && plantillaFile && estado !== 'analizando'

  return (
    <div className="max-w-[900px] mx-auto mt-8 mb-16">
      {/* Encabezado */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <span className="material-symbols-outlined text-3xl text-[#004ac6]">request_quote</span>
          <h1 className="text-2xl font-bold text-[#191c1e] dark:text-[#e4e6f0]">Exógenas</h1>
        </div>
        <p className="text-sm text-[#6b7280] dark:text-[#8890b5]">
          Marca los formatos que necesitas, sube el TOKEN y la plantilla SIIGO, y genera el reporte.
        </p>
      </div>

      {(estado === 'idle' || estado === 'analizando' || estado === 'error') && (
        <div className="bg-white dark:bg-[#1e2030] rounded-2xl border border-[#e2e4ef] dark:border-[#2e3148] shadow-sm p-6 mb-4">
          <h2 className="text-sm font-bold text-[#191c1e] dark:text-[#e4e6f0] mb-1">¿Qué formatos deseas generar?</h2>
          <p className="text-xs text-[#9ca3af] dark:text-[#6b7280] mb-4">
            No toda empresa necesita los 4 — marca solo los que apliquen. El archivo final trae todos los marcados en una sola plantilla.
          </p>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {FORMATOS_DISPONIBLES.map((f) => (
              <FormatoCard key={f.id} formato={f} checked={formatos.includes(f.id)} onToggle={toggleFormato} />
            ))}
          </div>
        </div>
      )}

      {(estado === 'idle' || estado === 'analizando' || estado === 'error') && (
        <div className="bg-white dark:bg-[#1e2030] rounded-2xl border border-[#e2e4ef] dark:border-[#2e3148] shadow-sm p-8">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Dropzone
              label="TOKEN (detalle de compras)"
              hint="Debe traer la hoja COMPRAS ya validada"
              icon="upload_file"
              file={tokenFile}
              onFile={setTokenFile}
            />
            <Dropzone
              label="Plantilla SIIGO"
              hint="Formato 1005 oficial, hoja 1005"
              icon="description"
              file={plantillaFile}
              onFile={setPlantillaFile}
            />
          </div>

          {estado === 'error' && errorMsg && (
            <div className="mt-5 flex items-start gap-3 p-4 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
              <span className="material-symbols-outlined text-red-500 text-xl flex-shrink-0 mt-0.5">error</span>
              <p className="text-sm font-semibold text-red-700 dark:text-red-400">{errorMsg}</p>
            </div>
          )}

          <div className="mt-6 flex justify-center">
            <button
              onClick={analizar}
              disabled={!puedeAnalizar}
              className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold text-white transition active:scale-[0.97] disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ background: '#004ac6' }}
            >
              {estado === 'analizando' ? (
                <>
                  <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-30" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                    <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                  </svg>
                  Analizando…
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-base">analytics</span>
                  Analizar y previsualizar
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {(estado === 'preview' || estado === 'generando' || estado === 'generado') && borrador && (
        <div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
            <StatsCard
              title="Terceros agrupados"
              value={borrador.totalTerceros}
              icon="groups"
              borderColor="#004ac6"
              iconColor="#004ac6"
            />
            <StatsCard
              title="Total IVA descontable"
              value={borrador.totalVimp}
              decimals={2}
              decimalSeparator=","
              thousandSeparator="."
              icon="payments"
              borderColor="#16a34a"
              iconColor="#16a34a"
              sub="VIMP acumulado de todos los terceros"
              subColor="#16a34a"
            />
          </div>

          <div className="bg-white dark:bg-[#1e2030] rounded-2xl border border-[#e2e4ef] dark:border-[#2e3148] shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr>
                    <th
                      style={{ position: 'sticky', left: 0, zIndex: 3, textAlign: 'left', padding: '10px 12px', boxShadow: '2px 0 4px rgba(0,0,0,0.04)' }}
                      className="bg-[#f8f9fe] dark:bg-[#252840] text-[#434655] dark:text-[#c4c8e8] font-semibold border-b border-r border-[#e2e4ef] dark:border-[#2e3148]"
                    >
                      Razón social
                    </th>
                    <th className="bg-[#f8f9fe] dark:bg-[#252840] text-[#434655] dark:text-[#c4c8e8] font-semibold border-b border-[#e2e4ef] dark:border-[#2e3148] px-3 py-2.5 text-center">TDOC</th>
                    <th className="bg-[#f8f9fe] dark:bg-[#252840] text-[#434655] dark:text-[#c4c8e8] font-semibold border-b border-[#e2e4ef] dark:border-[#2e3148] px-3 py-2.5 text-left">Identificación</th>
                    <th className="bg-[#f8f9fe] dark:bg-[#252840] text-[#434655] dark:text-[#c4c8e8] font-semibold border-b border-[#e2e4ef] dark:border-[#2e3148] px-3 py-2.5 text-center">DV</th>
                    <th className="bg-[#f8f9fe] dark:bg-[#252840] text-[#434655] dark:text-[#c4c8e8] font-semibold border-b border-[#e2e4ef] dark:border-[#2e3148] px-3 py-2.5 text-right">VIMP</th>
                  </tr>
                </thead>
                <tbody>
                  {borrador.registros.map((r, idx) => (
                    <tr key={`${r.tipoDocumento}-${r.identificacion}`} className={idx % 2 === 1 ? 'bg-[#fafbff] dark:bg-[#1a1c2e]' : ''}>
                      <td
                        style={{ position: 'sticky', left: 0, zIndex: 2, padding: '8px 12px', boxShadow: '2px 0 4px rgba(0,0,0,0.04)' }}
                        className={`${idx % 2 === 1 ? 'bg-[#fafbff] dark:bg-[#1a1c2e]' : 'bg-white dark:bg-[#1e2030]'} border-r border-b border-[#e2e4ef] dark:border-[#2e3148] text-[#191c1e] dark:text-[#e4e6f0] whitespace-nowrap`}
                      >
                        {r.razonSocial}
                      </td>
                      <td className="px-3 py-2 text-center border-b border-[#e2e4ef] dark:border-[#2e3148] text-[#434655] dark:text-[#c4c8e8]">{r.tipoDocumento}</td>
                      <td className="px-3 py-2 border-b border-[#e2e4ef] dark:border-[#2e3148] text-[#434655] dark:text-[#c4c8e8] whitespace-nowrap">{r.identificacion}</td>
                      <td className="px-3 py-2 text-center border-b border-[#e2e4ef] dark:border-[#2e3148] text-[#434655] dark:text-[#c4c8e8]">{r.digitoVerificacion}</td>
                      <td className="px-3 py-2 text-right border-b border-[#e2e4ef] dark:border-[#2e3148] text-[#191c1e] dark:text-[#e4e6f0] font-medium whitespace-nowrap">{formatoMoneda(r.vimp)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td
                      style={{ position: 'sticky', left: 0, zIndex: 2, padding: '10px 12px', boxShadow: '2px 0 4px rgba(0,0,0,0.04)' }}
                      className="bg-[#f8f9fe] dark:bg-[#252840] border-r border-t-2 border-[#e2e4ef] dark:border-[#2e3148] text-[#191c1e] dark:text-[#e4e6f0] font-bold whitespace-nowrap"
                    >
                      Total ({borrador.totalTerceros} terceros)
                    </td>
                    <td className="bg-[#f8f9fe] dark:bg-[#252840] border-t-2 border-[#e2e4ef] dark:border-[#2e3148]" colSpan={3} />
                    <td className="px-3 py-2.5 text-right bg-[#f8f9fe] dark:bg-[#252840] border-t-2 border-[#e2e4ef] dark:border-[#2e3148] text-[#191c1e] dark:text-[#e4e6f0] font-bold whitespace-nowrap">
                      {formatoMoneda(borrador.totalVimp)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {errorMsg && (
            <div className="mt-5 flex items-start gap-3 p-4 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
              <span className="material-symbols-outlined text-red-500 text-xl flex-shrink-0 mt-0.5">error</span>
              <p className="text-sm font-semibold text-red-700 dark:text-red-400">{errorMsg}</p>
            </div>
          )}

          <div className="mt-6 flex items-center justify-center gap-3">
            <button
              onClick={reiniciar}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold border border-[#d1d5db] dark:border-[#3a3e5c] text-[#434655] dark:text-[#c4c8e8] hover:bg-[#f3f4f6] dark:hover:bg-[#252840] transition active:scale-[0.97]"
            >
              <span className="material-symbols-outlined text-base">refresh</span>
              Procesar otro archivo
            </button>

            <button
              onClick={estado === 'generado' ? descargarDeNuevo : generar}
              disabled={estado === 'generando'}
              className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold text-white transition active:scale-[0.97] disabled:opacity-60"
              style={{ background: '#16a34a' }}
            >
              {estado === 'generando' ? (
                <>
                  <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-30" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                    <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                  </svg>
                  Generando…
                </>
              ) : estado === 'generado' ? (
                <>
                  <span className="material-symbols-outlined text-base">download</span>
                  Descargar de nuevo
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-base">file_download</span>
                  Generar Excel {formatos.join(', ')}
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
