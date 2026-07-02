import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { api } from '../services/api'

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
  const location = useLocation()
  const navigate  = useNavigate()
  const state     = location.state ?? {}

  const {
    borradorId,
    empleados        = 0,
    meses            = 0,
    salario          = 1423500,
    costoNominaTotal = 0,
  } = state

  const [status,   setStatus]   = useState('idle')   // idle | loading | done | error
  const [filename, setFilename] = useState('')
  const [errorMsg, setErrorMsg] = useState('')

  // ── Descarga ─────────────────────────────────────────────────────────────────
  const handleDescargar = async () => {
    if (!borradorId) return
    setStatus('loading')
    setErrorMsg('')
    try {
      const { blob, filename: fname } = await api.exportarDian(borradorId, { empleados, meses, salario })

      // Trigger de descarga en el navegador
      const url = window.URL.createObjectURL(blob)
      const a   = document.createElement('a')
      a.href     = url
      a.download = fname
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.URL.revokeObjectURL(url)

      setFilename(fname)
      setStatus('done')
    } catch (err) {
      setErrorMsg(err.message || 'No se pudo generar el Excel. Inténtalo de nuevo.')
      setStatus('error')
    }
  }

  // Sin datos de sesión
  if (!borradorId) {
    return (
      <div className="max-w-lg mx-auto mt-20 text-center">
        <span className="material-symbols-outlined text-5xl text-[#d1d5db] dark:text-[#3a3e5c]">error_outline</span>
        <p className="mt-4 text-[#6b7280] dark:text-[#8890b5]">
          No hay datos de exportación. Inicia el flujo desde{' '}
          <button onClick={() => navigate('/dian/upload')} className="text-[#004ac6] underline">
            Subir reporte
          </button>.
        </p>
      </div>
    )
  }

  const tieneNomina = empleados > 0 && meses > 0

  return (
    <div className="max-w-[600px] mx-auto">

      {/* ── Encabezado ──────────────────────────────────────────────────── */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <span className="material-symbols-outlined text-3xl text-[#004ac6]">table_view</span>
          <h1 className="text-2xl font-bold text-[#191c1e] dark:text-[#e4e6f0]">
            Exportación DIAN
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
            'Reporte DIAN subido y procesado',
            'Clasificación de retenciones completa',
            tieneNomina
              ? `Nómina: ${empleados} empleado${empleados !== 1 ? 's' : ''} × ${meses} mes${meses !== 1 ? 'es' : ''}`
              : 'Nómina: no aplica',
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

        {/* Nota: los valores exactos los calculó el backend al exportar.
            Aquí mostramos los disponibles en state (nómina). */}
        <div className="divide-y divide-[#f0f2f8] dark:divide-[#2a2e45]">
          {tieneNomina && (
            <CifraRow label="Costo nómina total" value={costoNominaTotal} isNeg />
          )}
          {!tieneNomina && (
            <div className="py-2 text-sm text-[#9ca3af] dark:text-[#6b7280] italic">
              Sin nómina para este período
            </div>
          )}
        </div>

        <div className="mt-3 pt-3 border-t border-[#f0f2f8] dark:border-[#2a2e45]">
          <p className="text-xs text-[#9ca3af] dark:text-[#6b7280]">
            El Excel incluye <span className="font-semibold text-[#434655] dark:text-[#c4c8e8]">5 hojas</span>:
            Resumen · Retenciones por Proveedor · Detalle Compras
            {tieneNomina ? ' · Nómina' : ''} · Metadatos
          </p>
        </div>
      </div>

      {/* ── Panel de descarga / estado ───────────────────────────────────── */}
      {status !== 'done' ? (
        <div className="bg-white dark:bg-[#1e2030] rounded-2xl border border-[#e2e4ef] dark:border-[#2e3148] shadow-sm p-6 mb-5">
          <div className="flex flex-col items-center gap-4 py-2">
            {status === 'idle' && (
              <>
                <span className="material-symbols-outlined text-5xl text-[#004ac6]">download</span>
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
              style={{ background: '#004ac6' }}
            >
              <span className="material-symbols-outlined text-xl">download</span>
              {status === 'error' ? 'Reintentar descarga' : 'DESCARGAR EXCEL'}
            </button>
          </div>
        </div>
      ) : (
        /* ── Estado COMPLETADO ────────────────────────────────────────── */
        <div className="bg-green-50 dark:bg-green-900/20 rounded-2xl border border-green-200 dark:border-green-700 p-6 mb-5">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-full bg-green-100 dark:bg-green-900/40 flex items-center justify-center flex-shrink-0">
              <span className="material-symbols-outlined text-green-600 dark:text-green-400 text-2xl">check_circle</span>
            </div>
            <div className="flex-1">
              <h2 className="text-base font-bold text-green-800 dark:text-green-300">
                Proceso completado
              </h2>
              <p className="text-sm text-green-700 dark:text-green-400 mt-1">
                El archivo <span className="font-semibold">{filename}</span> ha sido descargado exitosamente.
              </p>
              <p className="text-xs text-green-600 dark:text-green-500 mt-1.5">
                El borrador ha sido eliminado del servidor.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 mt-5 pt-4 border-t border-green-200 dark:border-green-700">
            <button
              onClick={() => navigate('/dian/upload')}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white hover:opacity-90 transition active:scale-[0.97]"
              style={{ background: '#004ac6' }}
            >
              <span className="material-symbols-outlined text-base">upload_file</span>
              Procesar otro reporte
            </button>
            <button
              onClick={() => navigate('/')}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold border border-[#d1d5db] dark:border-[#3a3e5c] text-[#434655] dark:text-[#c4c8e8] hover:bg-[#f3f4f6] dark:hover:bg-[#252840] transition active:scale-[0.97]"
            >
              <span className="material-symbols-outlined text-base">home</span>
              Ir a inicio
            </button>
          </div>
        </div>
      )}

      {/* ── Volver ──────────────────────────────────────────────────────── */}
      {status !== 'done' && (
        <button
          onClick={() => navigate('/dian/nomina', { state })}
          className="flex items-center gap-2 text-sm text-[#6b7280] dark:text-[#8890b5] hover:text-[#434655] dark:hover:text-[#c4c8e8] transition"
        >
          <span className="material-symbols-outlined text-base">arrow_back</span>
          Volver a nómina
        </button>
      )}
    </div>
  )
}
