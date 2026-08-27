import { useState, useRef, useCallback } from 'react'
import StatsCard from '../components/StatsCard'
import { api } from '../services/api'

const VALID_MIMES = ['application/pdf', 'application/octet-stream']

function isValidPdf(file) {
  return file.name.toLowerCase().endsWith('.pdf') && (!file.type || VALID_MIMES.includes(file.type))
}

// Multi-dropzone: a diferencia del Dropzone de un solo archivo (ExogenasUploadPage), acá se
// van ACUMULANDO archivos en cada drop/selección — el usuario puede ir juntando PDFs de
// distintas carpetas antes de procesar el lote completo de una vez.
function DropzoneMultiple({ archivos, onAgregar, onQuitar, onLimpiar }) {
  const inputRef = useRef(null)
  const [isDragOver, setIsDragOver] = useState(false)

  const agregarArchivos = useCallback((lista) => {
    const validos = Array.from(lista).filter(isValidPdf)
    if (validos.length > 0) onAgregar(validos)
  }, [onAgregar])

  const onDrop = useCallback((e) => {
    e.preventDefault()
    setIsDragOver(false)
    agregarArchivos(e.dataTransfer.files)
  }, [agregarArchivos])

  const onChange = useCallback((e) => {
    agregarArchivos(e.target.files)
    e.target.value = ''
  }, [agregarArchivos])

  const base = 'group relative flex flex-col items-center justify-center gap-2 rounded-2xl border-2 transition-all duration-150 cursor-pointer select-none px-4 py-10 text-center'
  const style = archivos.length > 0
    ? `${base} border-solid border-[#16a34a] bg-[#f0fdf4] dark:bg-[#0f2418]`
    : isDragOver
      ? `${base} border-[#004ac6] bg-[#e8f0fe] dark:bg-[#1a2550] border-solid`
      : `${base} border-dashed border-[#c3c6d7] dark:border-[#3a3e5c] bg-[#f8f9ff] dark:bg-[#181a2e] hover:border-[#004ac6] hover:bg-[#eef2fd] dark:hover:bg-[#1a2040]`

  return (
    <div>
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
        <input ref={inputRef} type="file" accept=".pdf" multiple className="hidden" onChange={onChange} />
        <span className="material-symbols-outlined text-3xl" style={{ color: archivos.length > 0 ? '#16a34a' : '#004ac6' }}>
          {archivos.length > 0 ? 'check_circle' : 'upload_file'}
        </span>
        <p className="text-sm font-semibold text-[#434655] dark:text-[#c4c8e8]">
          {archivos.length > 0
            ? `${archivos.length} PDF${archivos.length > 1 ? 's' : ''} listo${archivos.length > 1 ? 's' : ''} para procesar`
            : 'Arrastra PDFs de factura DIAN, o haz clic para elegir'}
        </p>
        <p className="text-xs text-[#9ca3af] dark:text-[#6b7280]">
          {archivos.length > 0 ? 'Puedes seguir agregando más' : 'Se pueden seleccionar varios a la vez'}
        </p>
      </div>

      {archivos.length > 0 && (
        <div className="mt-3 max-h-48 overflow-y-auto rounded-xl border border-[#e2e4ef] dark:border-[#2e3148]">
          {archivos.map((f, i) => (
            <div
              key={`${f.name}-${i}`}
              className={`flex items-center justify-between gap-2 px-3 py-2 text-xs ${i % 2 === 1 ? 'bg-[#fafbff] dark:bg-[#1a1c2e]' : ''}`}
            >
              <span className="truncate text-[#434655] dark:text-[#c4c8e8]">{f.name}</span>
              <button
                type="button"
                onClick={() => onQuitar(i)}
                aria-label={`Quitar ${f.name}`}
                className="flex-shrink-0 text-[#9ca3af] hover:text-red-600 transition"
              >
                <span className="material-symbols-outlined text-base">close</span>
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={onLimpiar}
            className="w-full px-3 py-2 text-xs font-semibold text-[#6b7280] dark:text-[#8890b5] hover:bg-[#f3f4f6] dark:hover:bg-[#252840] transition border-t border-[#e2e4ef] dark:border-[#2e3148]"
          >
            Quitar todos
          </button>
        </div>
      )}
    </div>
  )
}

export default function TercerosPage() {
  const [estado, setEstado] = useState('idle') // idle | procesando | resultado | error
  const [archivos, setArchivos] = useState([])
  const [errorMsg, setErrorMsg] = useState('')
  const [resultado, setResultado] = useState(null) // { totalArchivos, procesados, terceros, errores }
  // Desplegables: colapsados por default, para no tapar la pantalla con un cuadro gigante de
  // errores o de cambios apenas termina de procesar — el usuario los abre si quiere el detalle.
  const [erroresAbiertos, setErroresAbiertos] = useState(false)
  const [actualizadosAbiertos, setActualizadosAbiertos] = useState(false)
  // El tercero que interesa depende de qué lado de la transacción es la propia empresa (mismo
  // criterio que 1005/1006): en compras la empresa recibe, así que el tercero es el Emisor
  // (vendedor); en ventas la empresa emite, así que el tercero es el Adquiriente (comprador).
  const [tipoOperacion, setTipoOperacion] = useState(null) // 'compras' | 'ventas'

  const agregarArchivos = useCallback((nuevos) => {
    setArchivos((prev) => [...prev, ...nuevos])
  }, [])
  const quitarArchivo = useCallback((i) => {
    setArchivos((prev) => prev.filter((_, idx) => idx !== i))
  }, [])
  const limpiarArchivos = useCallback(() => setArchivos([]), [])

  const procesar = useCallback(async () => {
    if (archivos.length === 0 || !tipoOperacion) return
    setEstado('procesando')
    setErrorMsg('')
    try {
      const formData = new FormData()
      formData.append('tipoOperacion', tipoOperacion)
      archivos.forEach((f) => formData.append('pdfs', f))
      const data = await api.uploadTerceros(formData)
      setResultado(data)
      setEstado('resultado')
    } catch (err) {
      setEstado('error')
      setErrorMsg(err.message || 'Error al procesar los PDFs')
    }
  }, [archivos, tipoOperacion])

  const reiniciar = useCallback(() => {
    setEstado('idle')
    setArchivos([])
    setResultado(null)
    setErrorMsg('')
    setTipoOperacion(null)
    setErroresAbiertos(false)
    setActualizadosAbiertos(false)
  }, [])

  const pendientesDesambiguar = resultado?.terceros?.filter((t) => t.pendienteDesambiguar) ?? []
  // Distinto de "Ambiguo": acá la factura ni siquiera traía municipio/departamento (campo
  // vacío en el PDF), no es que no se pudiera mapear un texto que sí vino.
  const sinDatos = resultado?.terceros?.filter((t) => !t.pendienteDesambiguar && !t.codigo_municipio_dane && !t.municipio) ?? []
  // Terceros cuyo NIT ya existía y algún campo cambió con esta factura — no todo "ya existía"
  // cuenta: si la factura trae exactamente los mismos datos, no hay nada que revisar.
  const actualizados = resultado?.terceros?.filter((t) => !t.esNuevo && t.cambios?.length > 0) ?? []

  return (
    <div className="max-w-[1100px] mx-auto mt-8 mb-16">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <span className="material-symbols-outlined text-3xl text-[#004ac6]">location_on</span>
          <h1 className="text-2xl font-bold text-[#191c1e] dark:text-[#e4e6f0]">Datos de Terceros</h1>
        </div>
        <p className="text-sm text-[#6b7280] dark:text-[#8890b5]">
          Sube los PDFs de documento electrónico descargados de la DIAN (factura, nota crédito, documento
          soporte) — se extrae dirección, municipio y departamento (con su código DANE) del tercero y queda
          guardado para cuando generes el formato 1001.
        </p>
      </div>

      {(estado === 'idle' || estado === 'procesando' || estado === 'error') && (
        <div className="bg-white dark:bg-[#1e2030] rounded-2xl border border-[#e2e4ef] dark:border-[#2e3148] shadow-sm p-6 mb-4">
          <h2 className="text-sm font-bold text-[#191c1e] dark:text-[#e4e6f0] mb-1">¿Estos PDFs son de compras o de ventas?</h2>
          <p className="text-xs text-[#9ca3af] dark:text-[#6b7280] mb-4">
            En compras se guarda el Emisor (tu proveedor); en ventas se guarda el Adquiriente (tu cliente) — el otro lado es tu propia empresa, no un tercero.
          </p>
          <div className="grid grid-cols-2 gap-3">
            {[
              { id: 'compras', label: 'Compras', hint: 'Guarda al vendedor (Emisor)', icon: 'shopping_cart' },
              { id: 'ventas', label: 'Ventas', hint: 'Guarda al comprador (Adquiriente)', icon: 'sell' },
            ].map((op) => {
              const checked = tipoOperacion === op.id
              return (
                <button
                  key={op.id}
                  type="button"
                  onClick={() => setTipoOperacion(op.id)}
                  className={`relative flex flex-col items-start gap-1 rounded-2xl border-2 transition-all duration-150 px-4 py-4 text-left ${
                    checked
                      ? 'border-solid border-[#004ac6] bg-[#e8f0fe] dark:bg-[#1a2550]'
                      : 'border-dashed border-[#c3c6d7] dark:border-[#3a3e5c] bg-[#f8f9ff] dark:bg-[#181a2e] hover:border-[#004ac6] hover:bg-[#eef2fd] dark:hover:bg-[#1a2040]'
                  }`}
                >
                  <span
                    className="absolute top-3 right-3 material-symbols-outlined text-lg"
                    style={{ color: checked ? '#004ac6' : '#c3c6d7' }}
                  >
                    {checked ? 'check_circle' : 'radio_button_unchecked'}
                  </span>
                  <span className="material-symbols-outlined text-2xl" style={{ color: '#004ac6' }}>{op.icon}</span>
                  <p className="text-sm font-bold text-[#191c1e] dark:text-[#e4e6f0]">{op.label}</p>
                  <p className="text-xs text-[#6b7280] dark:text-[#8890b5]">{op.hint}</p>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {(estado === 'idle' || estado === 'procesando' || estado === 'error') && (
        <div className="bg-white dark:bg-[#1e2030] rounded-2xl border border-[#e2e4ef] dark:border-[#2e3148] shadow-sm p-8">
          <DropzoneMultiple
            archivos={archivos}
            onAgregar={agregarArchivos}
            onQuitar={quitarArchivo}
            onLimpiar={limpiarArchivos}
          />

          {estado === 'error' && errorMsg && (
            <div className="mt-5 flex items-start gap-3 p-4 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
              <span className="material-symbols-outlined text-red-500 text-xl flex-shrink-0 mt-0.5">error</span>
              <p className="text-sm font-semibold text-red-700 dark:text-red-400">{errorMsg}</p>
            </div>
          )}

          <div className="mt-6 flex justify-center">
            <button
              onClick={procesar}
              disabled={archivos.length === 0 || !tipoOperacion || estado === 'procesando'}
              className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold text-white transition active:scale-[0.97] disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ background: '#004ac6' }}
            >
              {estado === 'procesando' ? (
                <>
                  <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-30" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                    <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                  </svg>
                  Extrayendo…
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-base">location_searching</span>
                  Extraer y guardar
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {estado === 'resultado' && resultado && (
        <div>
          <div className="flex flex-wrap sm:flex-nowrap gap-4 mb-6">
            <div className="w-full sm:flex-1">
              <StatsCard
                title="PDFs procesados"
                value={resultado.totalArchivos}
                icon="description"
                borderColor="#004ac6"
                iconColor="#004ac6"
              />
            </div>
            <div className="w-full sm:flex-1">
              <StatsCard
                title="Terceros guardados"
                value={resultado.procesados}
                icon="groups"
                borderColor="#16a34a"
                iconColor="#16a34a"
                sub={[
                  pendientesDesambiguar.length > 0 && `${pendientesDesambiguar.length} municipio ambiguo`,
                  sinDatos.length > 0 && `${sinDatos.length} sin datos de ubicación`,
                ].filter(Boolean).join(' · ') || undefined}
                subColor="#d97706"
              />
            </div>
            <div className="w-full sm:flex-1">
              <StatsCard
                title="Con error"
                value={resultado.errores.length}
                icon="error_outline"
                borderColor={resultado.errores.length > 0 ? '#dc2626' : '#9ca3af'}
                iconColor={resultado.errores.length > 0 ? '#dc2626' : '#9ca3af'}
              />
            </div>
          </div>

          {resultado.omitidosNoFactura > 0 && (
            // No es un error (el usuario pidió explícitamente no procesar notas crédito ni
            // documentos soporte) — un resumen de cuántos se descartaron alcanza, no hace falta
            // listarlos uno por uno como si algo hubiera fallado.
            <div className="mb-4 flex items-center gap-2 rounded-xl bg-[#f0f2f8] dark:bg-[#252840] px-4 py-2.5 text-sm text-[#6b7280] dark:text-[#8890b5]">
              <span className="material-symbols-outlined text-base">info</span>
              {resultado.omitidosNoFactura} archivo{resultado.omitidosNoFactura > 1 ? 's' : ''} omitido{resultado.omitidosNoFactura > 1 ? 's' : ''} (nota crédito / documento soporte — no se procesan)
            </div>
          )}

          {actualizados.length > 0 && (
            // Colapsado por default — el punto es que el usuario pueda revisar qué cambió (por
            // si una factura vieja pisó un dato bueno con uno desactualizado), sin que la alerta
            // ocupe media pantalla apenas termina de procesar.
            <div className="mb-4 rounded-2xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 overflow-hidden">
              <button
                type="button"
                onClick={() => setActualizadosAbiertos((v) => !v)}
                className="w-full flex items-center justify-between gap-2 px-4 py-3 text-left"
              >
                <span className="flex items-center gap-2 text-sm font-bold text-blue-700 dark:text-blue-400">
                  <span className="material-symbols-outlined text-base">sync</span>
                  {actualizados.length} tercero{actualizados.length > 1 ? 's' : ''} ya existía{actualizados.length > 1 ? 'n' : ''} y se actualiz{actualizados.length > 1 ? 'aron' : 'ó'} con esta factura
                </span>
                <span className="material-symbols-outlined text-blue-700 dark:text-blue-400">
                  {actualizadosAbiertos ? 'expand_less' : 'expand_more'}
                </span>
              </button>
              {actualizadosAbiertos && (
                <div className="px-4 pb-4 space-y-3">
                  {actualizados.map((t, i) => (
                    <div key={i} className="text-xs text-blue-700 dark:text-blue-400">
                      <p className="font-semibold mb-1">{t.razon_social} <span className="font-normal opacity-70">({t.nit})</span></p>
                      <ul className="space-y-0.5 pl-4 list-disc">
                        {t.cambios.map((c, j) => (
                          <li key={j}>
                            <span className="font-semibold">{c.campo}:</span> "{c.antes ?? '—'}" → "{c.despues ?? '—'}"
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {resultado.errores.length > 0 && (
            // Colapsado por default — un lote grande puede traer muchos errores y no queremos
            // un cuadro rojo gigante tapando la pantalla; el conteo en el título ya avisa.
            <div className="mb-4 rounded-2xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 overflow-hidden">
              <button
                type="button"
                onClick={() => setErroresAbiertos((v) => !v)}
                className="w-full flex items-center justify-between gap-2 px-4 py-3 text-left"
              >
                <span className="flex items-center gap-2 text-sm font-bold text-red-700 dark:text-red-400">
                  <span className="material-symbols-outlined text-base">error</span>
                  {resultado.errores.length === 1
                    ? '1 archivo no se pudo procesar'
                    : `${resultado.errores.length} archivos no se pudieron procesar`}
                </span>
                <span className="material-symbols-outlined text-red-700 dark:text-red-400">
                  {erroresAbiertos ? 'expand_less' : 'expand_more'}
                </span>
              </button>
              {erroresAbiertos && (
                <ul className="px-4 pb-4 text-xs text-red-700 dark:text-red-400 space-y-1">
                  {resultado.errores.map((e, i) => (
                    <li key={i}><span className="font-semibold">{e.archivo}:</span> {e.error}</li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <div className="bg-white dark:bg-[#1e2030] rounded-2xl border border-[#e2e4ef] dark:border-[#2e3148] shadow-sm overflow-hidden overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  <th className="bg-[#f8f9fe] dark:bg-[#252840] text-[#434655] dark:text-[#c4c8e8] font-semibold border-b border-[#e2e4ef] dark:border-[#2e3148] px-3 py-2.5 text-left whitespace-nowrap">Razón social</th>
                  <th className="bg-[#f8f9fe] dark:bg-[#252840] text-[#434655] dark:text-[#c4c8e8] font-semibold border-b border-[#e2e4ef] dark:border-[#2e3148] px-2 py-2.5 text-left whitespace-nowrap">NIT</th>
                  <th className="bg-[#f8f9fe] dark:bg-[#252840] text-[#434655] dark:text-[#c4c8e8] font-semibold border-b border-[#e2e4ef] dark:border-[#2e3148] px-2 py-2.5 text-left whitespace-nowrap">Dirección</th>
                  <th className="bg-[#f8f9fe] dark:bg-[#252840] text-[#434655] dark:text-[#c4c8e8] font-semibold border-b border-[#e2e4ef] dark:border-[#2e3148] px-2 py-2.5 text-left whitespace-nowrap">Municipio</th>
                  <th className="bg-[#f8f9fe] dark:bg-[#252840] text-[#434655] dark:text-[#c4c8e8] font-semibold border-b border-[#e2e4ef] dark:border-[#2e3148] px-2 py-2.5 text-left whitespace-nowrap">Cód. DANE</th>
                  <th className="bg-[#f8f9fe] dark:bg-[#252840] text-[#434655] dark:text-[#c4c8e8] font-semibold border-b border-[#e2e4ef] dark:border-[#2e3148] px-2 py-2.5 text-left whitespace-nowrap">Estado</th>
                </tr>
              </thead>
              <tbody>
                {resultado.terceros.map((t, idx) => (
                  <tr key={`${t.nit}-${idx}`} className={idx % 2 === 1 ? 'bg-[#fafbff] dark:bg-[#1a1c2e]' : ''}>
                    <td className="px-3 py-2 border-b border-[#e2e4ef] dark:border-[#2e3148] text-[#191c1e] dark:text-[#e4e6f0]">{t.razon_social}</td>
                    <td className="px-2 py-2 border-b border-[#e2e4ef] dark:border-[#2e3148] text-[#434655] dark:text-[#c4c8e8] whitespace-nowrap">{t.nit}</td>
                    <td className="px-2 py-2 border-b border-[#e2e4ef] dark:border-[#2e3148] text-[#434655] dark:text-[#c4c8e8]">{t.direccion || '—'}</td>
                    <td className="px-2 py-2 border-b border-[#e2e4ef] dark:border-[#2e3148] text-[#434655] dark:text-[#c4c8e8] whitespace-nowrap">{t.municipio || '—'}</td>
                    <td className="px-2 py-2 border-b border-[#e2e4ef] dark:border-[#2e3148] whitespace-nowrap">
                      {t.pendienteDesambiguar ? (
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">Ambiguo</span>
                      ) : t.codigo_municipio_dane ? (
                        // codigo_municipio_dane ya trae el departamento como prefijo (los 5
                        // dígitos del código DIVIPOLA) — se recorta solo al mostrarlo para no
                        // repetirlo al lado del código de departamento.
                        <span className="text-[#434655] dark:text-[#c4c8e8]">{t.codigo_departamento_dane}-{t.codigo_municipio_dane?.slice(2)}</span>
                      ) : t.municipio ? (
                        // Había texto de municipio en la factura pero no calzó con el catálogo
                        // DANE (ni exacto ni por similitud) — distinto del caso de abajo, donde
                        // la factura ni siquiera traía el dato.
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-[#f0f2f8] dark:bg-[#252840] text-[#9ca3af]">Sin mapear</span>
                      ) : (
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">Sin datos</span>
                      )}
                    </td>
                    <td className="px-2 py-2 border-b border-[#e2e4ef] dark:border-[#2e3148] whitespace-nowrap">
                      {t.esNuevo ? (
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">Nuevo</span>
                      ) : t.cambios?.length > 0 ? (
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" title="Se actualizó la información de esta empresa">Actualizado</span>
                      ) : (
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-[#f0f2f8] dark:bg-[#252840] text-[#9ca3af]">Sin cambios</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-6 flex justify-center">
            <button
              onClick={reiniciar}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold border border-[#d1d5db] dark:border-[#3a3e5c] text-[#434655] dark:text-[#c4c8e8] hover:bg-[#f3f4f6] dark:hover:bg-[#252840] transition active:scale-[0.97]"
            >
              <span className="material-symbols-outlined text-base">refresh</span>
              Procesar más PDFs
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
