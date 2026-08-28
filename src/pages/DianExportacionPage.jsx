import { useState, useEffect, useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api } from '../services/api'
import SALARY_CONSTANTS from '../../shared/salaryConstants.json'
import { calcularNomina, calcularCostoTotal, calcularVentasNetas, TARIFAS_ARL } from '../../shared/calcularNomina.js'

// Año más reciente configurado — mismo criterio de fallback que usa el backend (getSalaryConstants)
const LATEST_YEAR = Math.max(...Object.keys(SALARY_CONSTANTS).map(Number))
const SMMLV_ACTUAL   = SALARY_CONSTANTS[LATEST_YEAR].smmlv
const AUXILIO_ACTUAL = SALARY_CONSTANTS[LATEST_YEAR].auxilioTransporte

const fmt = (n) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n ?? 0)

const fmtAbs = (n) => fmt(Math.abs(n ?? 0))

// Fila del resumen de cifras
function CifraRow({ label, value, isNeg, isBold, isTotal }) {
  return (
    <div className={`flex items-center justify-between py-2 ${isTotal ? 'border-t border-[#e2e4ef] dark:border-[#2e3148] mt-1 pt-3' : ''}`}>
      <span className={`text-sm ${isBold || isTotal ? 'font-semibold text-[#191c1e] dark:text-[#e4e6f0]' : 'text-[#6b7280] dark:text-[#8890b5]'}`}>
        {label}
      </span>
      <span className={`text-sm tabular-nums font-medium ${isNeg ? 'text-red-600 dark:text-red-400' : 'text-[#191c1e] dark:text-[#e4e6f0]'} ${isBold || isTotal ? 'font-bold' : ''}`}>
        {isNeg ? `(${fmtAbs(value)})` : fmt(value)}
      </span>
    </div>
  )
}

export default function DianExportacionPage() {
  const { borradorId } = useParams()
  const navigate = useNavigate()

  const [cargando,   setCargando]   = useState(true)
  const [errorCarga, setErrorCarga] = useState('')
  const [calculos,   setCalculos]   = useState(null)
  const [nomina,     setNomina]     = useState(null) // { empleados, meses, salario, tarifaArl, tasaAutorretencion } | null

  const [status,   setStatus]   = useState('idle')   // idle | loading | done | error
  const [filename, setFilename] = useState('')
  const [errorMsg, setErrorMsg] = useState('')
  // Blob del Excel ya generado, guardado en memoria para poder re-disparar la descarga
  // (p.ej. si el explorador de archivos del sistema se cierra o falla) sin volver a pedirle
  // el archivo al backend — el borrador se borra del servidor apenas se genera con éxito,
  // así que una segunda llamada a exportarDian ya no encontraría nada que exportar.
  const [blobDescargado, setBlobDescargado] = useState(null)

  // Carga calculos + nómina persistida desde el backend — igual que en Clasificación y
  // Nómina, para que "volver" o un F5 accidental recuperen lo ya guardado. Se ejecuta una
  // sola vez al montar (no cuando cambia "status"): tras exportar con éxito el borrador se
  // borra del servidor, así que no debe re-consultarse después de la descarga.
  useEffect(() => {
    let cancelado = false
    setCargando(true)
    setErrorCarga('')
    api.getDianBorrador(borradorId)
      .then((data) => {
        if (cancelado) return
        setCalculos(data.calculos ?? null)
        setNomina(data.nomina ?? null)
      })
      .catch((err) => {
        if (cancelado) return
        setErrorCarga(err.message || 'No se pudo cargar el borrador')
      })
      .finally(() => {
        if (!cancelado) setCargando(false)
      })
    return () => { cancelado = true }
  }, [borradorId])

  // Vista previa de nómina — misma fórmula que usa Nómina y el backend al exportar
  // (shared/calcularNomina.js), recalculada acá a partir de lo persistido en vez de recibirla
  // ya calculada por navegación (esa era la parte que se perdía al recargar o volver).
  const calcNomina = useMemo(() => {
    const empVal = nomina?.empleados ?? 0
    const mesVal = nomina?.meses ?? 0
    const salVal = nomina?.salario ?? SMMLV_ACTUAL
    const tarifaArlVal = nomina?.tarifaArl ?? null
    const tieneNomina = empVal > 0 && mesVal > 0
    if (!tieneNomina || tarifaArlVal == null || !TARIFAS_ARL.includes(tarifaArlVal)) {
      return { tieneNomina, empleados: empVal, meses: mesVal, tarifaArl: tarifaArlVal, costoNominaTotal: 0 }
    }
    const n = calcularNomina({ salario: salVal, smmlv: SMMLV_ACTUAL, auxilioTransporte: AUXILIO_ACTUAL, tarifaArl: tarifaArlVal })
    const costoNominaTotal = calcularCostoTotal({ empleados: empVal, meses: mesVal, costoMes: n.costoMes })
    return { tieneNomina, empleados: empVal, meses: mesVal, tarifaArl: tarifaArlVal, costoNominaTotal }
  }, [nomina])

  const ventasNetas = useMemo(() => calcularVentasNetas(calculos), [calculos])

  const tasaAutorretencion  = nomina?.tasaAutorretencion ?? null
  const tieneAutorretencion = !!tasaAutorretencion
  const baseAutorretencion  = tieneAutorretencion ? ventasNetas : 0
  const valorAutorretencion = tieneAutorretencion && tasaAutorretencion !== 'N/A'
    ? ventasNetas * (parseFloat(tasaAutorretencion) / 100)
    : 0

  // Dispara la descarga en el navegador a partir de un blob ya en memoria.
  const dispararDescarga = (blob, fname) => {
    const url = window.URL.createObjectURL(blob)
    const a   = document.createElement('a')
    a.href     = url
    a.download = fname
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    window.URL.revokeObjectURL(url)
  }

  // ── Descarga ─────────────────────────────────────────────────────────────────
  const handleDescargar = async () => {
    if (!borradorId) return
    setStatus('loading')
    setErrorMsg('')
    try {
      const { blob, filename: fname } = await api.exportarDian(borradorId, {
        empleados: nomina?.empleados ?? 0,
        meses: nomina?.meses ?? 0,
        salario: nomina?.salario ?? SMMLV_ACTUAL,
        tarifaArl: nomina?.tarifaArl ?? null,
        tasaAutorretencion: nomina?.tasaAutorretencion ?? null,
      })
      dispararDescarga(blob, fname)
      setBlobDescargado(blob)
      setFilename(fname)
      setStatus('done')
    } catch (err) {
      setErrorMsg(err.message || 'No se pudo generar el Excel. Inténtalo de nuevo.')
      setStatus('error')
    }
  }

  // Re-descarga sin volver a pedirle el archivo al servidor (el borrador ya no existe ahí).
  const handleDescargarDeNuevo = () => {
    if (!blobDescargado) return
    dispararDescarga(blobDescargado, filename)
  }

  if (cargando) {
    return (
      <div className="max-w-lg mx-auto mt-20 text-center">
        <svg className="animate-spin h-10 w-10 text-[#004ac6] mx-auto" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        <p className="mt-4 text-[#6b7280] dark:text-[#8890b5]">Cargando borrador…</p>
      </div>
    )
  }

  if (errorCarga) {
    return (
      <div className="max-w-lg mx-auto mt-20 text-center">
        <span className="material-symbols-outlined text-5xl text-[#d1d5db] dark:text-[#3a3e5c]">error_outline</span>
        <p className="mt-4 text-[#6b7280] dark:text-[#8890b5]">{errorCarga}</p>
        <button onClick={() => navigate('/dian/upload')} className="mt-6 px-5 py-2.5 rounded-xl text-sm font-semibold text-white hover:opacity-90 transition active:scale-[0.97]" style={{ background: '#004ac6' }}>
          Subir otro reporte
        </button>
      </div>
    )
  }

  const tieneNomina = calcNomina.tieneNomina

  return (
    <div className="max-w-[600px] mx-auto">

      {/* ── Encabezado ──────────────────────────────────────────────────── */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <span className="material-symbols-outlined text-3xl text-[#004ac6]">table_view</span>
          <h1 className="text-2xl font-bold text-[#191c1e] dark:text-[#e4e6f0]">
            Exportación
          </h1>
        </div>
        <p className="text-sm text-[#6b7280] dark:text-[#8890b5]">
          Revisa el resumen y descarga el Excel contable.
        </p>
      </div>

      {/* ── Checklist de pasos completados ──────────────────────────────── */}
      <div className="bg-white dark:bg-[#1e2030] rounded-2xl border border-[#e2e4ef] dark:border-[#2e3148] shadow-sm p-5 mb-5">
        <h2 className="text-xs font-bold text-[#8890b5] uppercase tracking-wide mb-3">
          Estado del proceso
        </h2>
        <div className="space-y-2">
          {[
            'Reporte subido y procesado',
            'Clasificación de retenciones completa',
            tieneNomina
              ? `Nómina: ${calcNomina.empleados} empleado${calcNomina.empleados !== 1 ? 's' : ''} × ${calcNomina.meses} mes${calcNomina.meses !== 1 ? 'es' : ''} (ARL ${calcNomina.tarifaArl}%)`
              : 'Nómina: no aplica',
            tieneAutorretencion
              ? `Autorretención: tarifa ${tasaAutorretencion === 'N/A' ? 'N/A' : `${tasaAutorretencion}%`}`
              : 'Autorretención: no aplica',
            'Listo para generar Excel',
          ].map((paso) => (
            <div key={paso} className="flex items-center gap-2.5">
              <span className="material-symbols-outlined text-green-500 text-lg flex-shrink-0">check_circle</span>
              <span className="text-sm text-[#434655] dark:text-[#c4c8e8]">{paso}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Cifras a exportar ───────────────────────────────────────────── */}
      <div className="bg-white dark:bg-[#1e2030] rounded-2xl border border-[#e2e4ef] dark:border-[#2e3148] shadow-sm p-5 mb-5">
        <h2 className="text-xs font-bold text-[#8890b5] uppercase tracking-wide mb-3">
          Cifras a exportar
        </h2>

        {/* Nota: los valores exactos los calcula el backend al exportar. Aquí mostramos un
            preview calculado con la misma fórmula (shared/calcularNomina.js) a partir de lo
            guardado en el borrador. */}
        <div className="divide-y divide-[#f0f2f8] dark:divide-[#2a2e45]">
          {tieneNomina && (
            <CifraRow label="Costo nómina total" value={calcNomina.costoNominaTotal} isNeg />
          )}
          {tieneAutorretencion && (
            <>
              <CifraRow label="Base autorretención (Ventas Netas)" value={baseAutorretencion} />
              <CifraRow
                label={`Valor autorretención (${tasaAutorretencion === 'N/A' ? 'N/A' : `${tasaAutorretencion}%`})`}
                value={valorAutorretencion}
                isNeg
              />
            </>
          )}
          {!tieneNomina && !tieneAutorretencion && (
            <div className="py-2 text-sm text-[#9ca3af] dark:text-[#6b7280] italic">
              Sin nómina para este período
            </div>
          )}
        </div>

        <div className="mt-3 pt-3 border-t border-[#f0f2f8] dark:border-[#2a2e45]">
          <p className="text-xs text-[#9ca3af] dark:text-[#6b7280]">
            El Excel incluye <span className="font-semibold text-[#434655] dark:text-[#c4c8e8]">5 hojas</span>:
            Resumen · Retenciones por Proveedor · Detalle Compras
            {tieneNomina ? ' · Nómina' : ''}{tieneAutorretencion ? ' · Autorretención' : ''} · Metadatos
          </p>
        </div>
      </div>

      {/* ── Panel de descarga / estado ───────────────────────────────────── */}
      {status !== 'done' ? (
        <div className="bg-white dark:bg-[#1e2030] rounded-2xl border border-[#e2e4ef] dark:border-[#2e3148] shadow-sm p-6 mb-5">
          <div className="flex flex-col items-center gap-4 py-2">
            {status === 'idle' && (
              <>
                <span className="material-symbols-outlined text-5xl text-green-500">download</span>
                <p className="text-sm text-[#6b7280] dark:text-[#8890b5] text-center">
                  El archivo se generará con todos los cálculos finales.
                </p>
              </>
            )}

            {status === 'loading' && (
              <>
                <svg className="animate-spin h-10 w-10 text-[#004ac6]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                <p className="text-sm font-semibold text-[#434655] dark:text-[#c4c8e8]">
                  Generando Excel…
                </p>
              </>
            )}

            {status === 'error' && (
              <div className="w-full flex items-start gap-3 p-4 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700">
                <span className="material-symbols-outlined text-red-500 text-xl flex-shrink-0 mt-0.5">error</span>
                <div>
                  <p className="text-sm font-semibold text-red-700 dark:text-red-400">Error al generar el archivo</p>
                  <p className="text-sm text-red-600 dark:text-red-400 mt-0.5">{errorMsg}</p>
                </div>
              </div>
            )}

            <button
              onClick={handleDescargar}
              disabled={status === 'loading'}
              className="flex items-center gap-2.5 px-8 py-3 rounded-xl text-base font-bold text-white transition active:scale-[0.97] disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90"
              style={{ background: '#16a34a' }}
            >
              <span className="material-symbols-outlined text-xl">download</span>
              {status === 'error' ? 'Reintentar descarga' : 'DESCARGAR EXCEL'}
            </button>
          </div>
        </div>
      ) : (
        /* ── Estado COMPLETADO ────────────────────────────────────────── */
        <div className="bg-white dark:bg-[#1e2030] rounded-2xl border border-[#e2e4ef] dark:border-[#2e3148] shadow-sm p-4 mb-5">
          <div className="flex flex-col items-center gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="material-symbols-outlined text-2xl text-green-500 flex-shrink-0">check_circle</span>
              <p className="text-sm font-semibold text-[#434655] dark:text-[#c4c8e8] truncate">{filename}</p>
            </div>

            <div className="flex items-center gap-2 flex-wrap justify-center">
              <button
                onClick={handleDescargarDeNuevo}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white transition active:scale-[0.97] hover:opacity-90"
                style={{ background: '#16a34a' }}
              >
                <span className="material-symbols-outlined text-lg">download</span>
                Descargar de nuevo
              </button>
              <button
                onClick={() => navigate('/dian/upload')}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold border border-[#d1d5db] dark:border-[#3a3e5c] text-[#434655] dark:text-[#c4c8e8] hover:bg-[#f3f4f6] dark:hover:bg-[#252840] transition active:scale-[0.97]"
              >
                <span className="material-symbols-outlined text-base">upload_file</span>
                Procesar otro reporte
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Volver ──────────────────────────────────────────────────────── */}
      {status !== 'done' && (
        <button
          onClick={() => navigate(`/dian/nomina/${borradorId}`)}
          className="flex items-center gap-2 text-sm text-[#6b7280] dark:text-[#8890b5] hover:text-[#434655] dark:hover:text-[#c4c8e8] transition"
        >
          <span className="material-symbols-outlined text-base">arrow_back</span>
          Volver a nómina
        </button>
      )}
    </div>
  )
}
