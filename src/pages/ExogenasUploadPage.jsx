import { useState, useRef, useCallback, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
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

// 1007 queda visible pero deshabilitado hasta que se implemente. 1001 SÍ se puede marcar, pero
// todavía es solo "Fase 1" (ver formato1001.js en el backend): verifica qué terceros ya tienen
// dirección completa, no genera ningún Excel — el concepto (CPT) y las columnas de dinero
// siguen sin definir. `soloVerificacion` distingue ese caso especial en el resto de la página
// (no entra a `borradores`, no se puede incluir en "Generar Excel").
const FORMATOS_DISPONIBLES = [
  { id: '1001', codigo: '1001', nombre: 'Gastos/Compras (verificación)', icon: 'payments', disponible: true, soloVerificacion: true },
  { id: '1005', codigo: '1005', nombre: 'Impuestos descontables', icon: 'receipt_long', disponible: true },
  { id: '1006', codigo: '1006', nombre: 'IVA/Inc generado', icon: 'sell', disponible: true },
  { id: '1007', codigo: '1007', nombre: 'Ingresos', icon: 'trending_up', disponible: false },
]

// Hoja obligatoria del TOKEN y campos monetarios de salida por formato — usado para adaptar
// hints y la tabla de vista previa sin acoplar el resto de la página a un formato específico.
const CONFIG_FORMATO = {
  '1001': { hojaToken: 'COMPRAS', campos: [] },
  '1005': {
    hojaToken: 'COMPRAS',
    campos: [
      { key: 'vimp', totalKey: 'totalVimp', label: 'VIMP', statTitle: 'Total IVA descontable', statSub: 'VIMP acumulado de todos los terceros' },
      { key: 'ivade', totalKey: 'totalIvade', label: 'IVADE', statTitle: 'Total IVA devoluciones ventas', statSub: 'IVADE acumulado de todos los terceros' },
    ],
  },
  '1006': {
    hojaToken: 'VENTAS',
    campos: [
      { key: 'imp', totalKey: 'totalImp', label: 'IMP', statTitle: 'Total IVA generado', statSub: 'IMP acumulado de todos los terceros' },
      { key: 'iva', totalKey: 'totalIva', label: 'IVA', statTitle: 'Total IVA devoluciones compras', statSub: 'IVA acumulado de todos los terceros' },
      { key: 'icon', totalKey: 'totalIcon', label: 'ICON', statTitle: 'Total INC generado', statSub: 'ICON acumulado de todos los terceros' },
    ],
  },
}
const STAT_COLORS = ['#16a34a', '#004ac6', '#d97706']

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

function Dropzone({ label, hint, icon, file, onFile, onClear }) {
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

  const base = 'group relative flex flex-col items-center justify-center gap-2 rounded-2xl border-2 transition-all duration-150 cursor-pointer select-none px-4 py-8 text-center overflow-hidden'
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
      {file && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onClear() }}
          aria-label={`Quitar ${label}`}
          title="Quitar archivo"
          className="absolute top-2.5 right-2.5 z-10 flex items-center justify-center w-6 h-6 rounded-full bg-white dark:bg-[#1e2030] border border-[#d1d5db] dark:border-[#3a3e5c] text-[#6b7280] dark:text-[#8890b5] hover:bg-red-50 hover:border-red-300 hover:text-red-600 dark:hover:bg-red-900/20 dark:hover:text-red-400 transition"
        >
          <span className="material-symbols-outlined text-sm">close</span>
        </button>
      )}
      <span className="material-symbols-outlined text-3xl" style={{ color: file ? '#16a34a' : '#004ac6' }}>
        {file ? 'check_circle' : icon}
      </span>
      <p className="text-sm font-semibold text-[#434655] dark:text-[#c4c8e8]">{label}</p>
      <p className="text-xs text-[#9ca3af] dark:text-[#6b7280] truncate max-w-full">
        {file ? file.name : hint}
      </p>
      {file && (
        <div className="absolute -inset-0.5 flex items-center justify-center gap-1.5 rounded-2xl bg-[#0f2418]/80 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
          <span className="material-symbols-outlined text-base text-white">sync_alt</span>
          <p className="text-xs font-semibold text-white">Clic para cambiar el archivo</p>
        </div>
      )}
    </div>
  )
}

// Contenido de la pestaña "1001" — distinto del resto (StatsCard de dinero + tabla de montos):
// acá no hay monto ni concepto, solo el chequeo de qué terceros ya tienen dirección completa
// en `terceros`, con los faltantes primero (es lo accionable).
function Verificacion1001View({ verificacion }) {
  const terceros = [...verificacion.terceros].sort(
    (a, b) => Number(a.tieneDatosCompletos) - Number(b.tieneDatosCompletos)
  )

  return (
    <div>
      <div className="flex items-center gap-2 mb-4 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 px-4 py-2.5">
        <span className="material-symbols-outlined text-amber-600 dark:text-amber-400 text-base flex-shrink-0">info</span>
        <p className="text-xs text-amber-800 dark:text-amber-400">
          Esto solo verifica ubicación de terceros — el 1001 completo (concepto y retenciones)
          todavía no se puede generar aquí.
        </p>
      </div>

      <div className="flex flex-wrap sm:flex-nowrap gap-4 mb-6">
        <div className="w-full sm:flex-1">
          <StatsCard
            title="Terceros en el TOKEN"
            value={verificacion.totalTerceros}
            icon="groups"
            borderColor="#004ac6"
            iconColor="#004ac6"
          />
        </div>
        <div className="w-full sm:flex-1">
          <StatsCard
            title="Con dirección completa"
            value={verificacion.completos}
            icon="check_circle"
            borderColor="#16a34a"
            iconColor="#16a34a"
          />
        </div>
        <div className="w-full sm:flex-1">
          <StatsCard
            title="Faltantes"
            value={verificacion.faltantes}
            icon="error_outline"
            borderColor={verificacion.faltantes > 0 ? '#dc2626' : '#9ca3af'}
            iconColor={verificacion.faltantes > 0 ? '#dc2626' : '#9ca3af'}
          />
        </div>
      </div>

      <div className="bg-white dark:bg-[#1e2030] rounded-2xl border border-[#e2e4ef] dark:border-[#2e3148] shadow-sm overflow-hidden overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              <th className="bg-[#f8f9fe] dark:bg-[#252840] text-[#434655] dark:text-[#c4c8e8] font-semibold border-b border-[#e2e4ef] dark:border-[#2e3148] px-3 py-2.5 text-left whitespace-nowrap">Razón social</th>
              <th className="bg-[#f8f9fe] dark:bg-[#252840] text-[#434655] dark:text-[#c4c8e8] font-semibold border-b border-[#e2e4ef] dark:border-[#2e3148] px-2 py-2.5 text-left whitespace-nowrap">NIT</th>
              <th className="bg-[#f8f9fe] dark:bg-[#252840] text-[#434655] dark:text-[#c4c8e8] font-semibold border-b border-[#e2e4ef] dark:border-[#2e3148] px-2 py-2.5 text-left whitespace-nowrap">Dirección</th>
              <th className="bg-[#f8f9fe] dark:bg-[#252840] text-[#434655] dark:text-[#c4c8e8] font-semibold border-b border-[#e2e4ef] dark:border-[#2e3148] px-2 py-2.5 text-left whitespace-nowrap">Estado</th>
            </tr>
          </thead>
          <tbody>
            {terceros.map((t, idx) => (
              <tr key={`${t.identificacion}-${idx}`} className={idx % 2 === 1 ? 'bg-[#fafbff] dark:bg-[#1a1c2e]' : ''}>
                <td className="px-3 py-2 border-b border-[#e2e4ef] dark:border-[#2e3148] text-[#191c1e] dark:text-[#e4e6f0]">{t.razonSocial}</td>
                <td className="px-2 py-2 border-b border-[#e2e4ef] dark:border-[#2e3148] text-[#434655] dark:text-[#c4c8e8] whitespace-nowrap">{t.identificacion}</td>
                <td className="px-2 py-2 border-b border-[#e2e4ef] dark:border-[#2e3148] text-[#434655] dark:text-[#c4c8e8]">{t.direccion || '—'}</td>
                <td className="px-2 py-2 border-b border-[#e2e4ef] dark:border-[#2e3148] whitespace-nowrap">
                  {t.tieneDatosCompletos ? (
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">Completo</span>
                  ) : t.tieneTercero ? (
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">Incompleto</span>
                  ) : (
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">Sin factura subida</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default function ExogenasUploadPage() {
  // Si la URL ya trae ids de borradores al montar, arranca en 'restaurando' (no 'idle') para
  // que el formulario de carga nunca llegue a pintarse mientras se piden los datos — si
  // arrancara en 'idle', se vería un parpadeo del formulario antes de que el efecto de abajo
  // termine de restaurar la vista previa.
  const [estado, setEstado] = useState(
    () => (new URLSearchParams(window.location.search).get('b') ? 'restaurando' : 'idle')
  ) // idle | restaurando | analizando | preview | error
  const [errorMsg, setErrorMsg] = useState('')
  const [formatos, setFormatos]           = useState(['1005'])
  const [tokenFile, setTokenFile]         = useState(null)
  const [plantillaFile, setPlantillaFile] = useState(null)
  // Un borrador por formato analizado — el backend procesa un formato a la vez, así que
  // "Analizar" llama el endpoint una vez por cada formato marcado y guarda cada resultado acá,
  // indexado por formato, para poder cambiar de pestaña sin volver a subir los archivos.
  const [borradores, setBorradores] = useState({}) // { [formato]: { id, totalTerceros, ..., registros } }
  // 1001 no crea un borrador real (no hay nada que generar todavía) — su resultado vive aparte,
  // con su propia forma { totalTerceros, completos, faltantes, terceros }.
  const [verificacion1001, setVerificacion1001] = useState(null)
  const [tabActivo, setTabActivo]   = useState(null) // solo controla qué pestaña se PREVISUALIZA
  const [generando, setGenerando]   = useState(false)
  // Un solo botón "Generar Excel" para TODOS los formatos analizados juntos — el backend arma
  // un solo archivo con la hoja de cada formato ya llena. Blob guardado en memoria para poder
  // re-disparar la descarga sin volver a pedirle el archivo al servidor — los borradores se
  // borran del servidor apenas se genera con éxito (mismo patrón que Contabilidad DIAN).
  const [descargaCombinada, setDescargaCombinada] = useState(null) // { blob, filename }

  // El id de cada borrador vive en la URL (?b=1005:<uuid>,1006:<uuid>) — al recargar la página,
  // el efecto de abajo los recupera del backend (mismo endpoint que ya usa Contabilidad DIAN
  // para esto). No hay que guardar los registros en localStorage: siempre se piden frescos al
  // servidor, así que nunca queda una copia vieja/desactualizada dando vueltas en el navegador,
  // y solo es un GET liviano por formato (igual de rápido que abrir la página de cero).
  const [searchParams, setSearchParams] = useSearchParams()
  const toggleFormato = useCallback((id) => {
    setFormatos((prev) => (prev.includes(id) ? prev.filter((f) => f !== id) : [...prev, id]))
  }, [])

  // Cambiar o quitar un archivo limpia el error de un intento fallido anterior — si no, el
  // usuario ve el mensaje de "archivo inválido" pegado aunque ya haya corregido el archivo.
  const limpiarErrorSiHabia = useCallback(() => {
    setEstado((prev) => (prev === 'error' ? 'idle' : prev))
    setErrorMsg('')
  }, [])

  const onTokenFile = useCallback((f) => { setTokenFile(f); limpiarErrorSiHabia() }, [limpiarErrorSiHabia])
  const onPlantillaFile = useCallback((f) => { setPlantillaFile(f); limpiarErrorSiHabia() }, [limpiarErrorSiHabia])
  const limpiarToken = useCallback(() => { setTokenFile(null); limpiarErrorSiHabia() }, [limpiarErrorSiHabia])
  const limpiarPlantilla = useCallback(() => { setPlantillaFile(null); limpiarErrorSiHabia() }, [limpiarErrorSiHabia])

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

  // Escribe los ids de los borradores vivos en la URL (?b=1005:<uuid>,1006:<uuid>). Un mapa
  // vacío limpia el parámetro por completo.
  const actualizarUrlBorradores = useCallback((mapaBorradores) => {
    const pares = Object.entries(mapaBorradores).map(([formato, b]) => `${formato}:${b.id}`)
    setSearchParams(pares.length > 0 ? { b: pares.join(',') } : {}, { replace: true })
  }, [setSearchParams])

  // Al montar (o al recargar la página), si la URL trae ids de borradores se piden frescos al
  // servidor — nunca se guarda el contenido en el navegador, solo el id. Si alguno ya expiró o
  // ya se generó (y por eso se borró en el servidor), simplemente se descarta sin romper el
  // resto; si no queda ninguno vivo, la URL se limpia y la página vuelve a "idle" con el ✕.
  useEffect(() => {
    const param = searchParams.get('b')
    if (!param) return

    let cancelado = false
    ;(async () => {
      const pares = param.split(',').map((p) => p.split(':')).filter(([, id]) => id)
      const resultados = await Promise.all(
        pares.map(([, id]) => api.getExogenasBorrador(id).catch(() => null))
      )
      if (cancelado) return

      const recuperados = {}
      resultados.forEach((data) => { if (data) recuperados[data.formato] = data })

      if (Object.keys(recuperados).length > 0) {
        setBorradores(recuperados)
        setTabActivo(Object.keys(recuperados)[0])
        setFormatos(Object.keys(recuperados))
        setEstado('preview')
      } else {
        setEstado('idle')
      }
      actualizarUrlBorradores(recuperados)
    })()

    return () => { cancelado = true }
    // Solo al montar — la URL se actualiza desde analizar/generar/reiniciar, no al revés.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

    // Un formato a la vez (limitación actual del backend) — se analizan todos los marcados en
    // secuencia y se guardan por separado; si alguno falla se corta ahí y no se pierde el
    // mensaje de cuál formato fue. 1001 no pasa por uploadExogenas (no genera un borrador real
    // todavía) — usa su propio endpoint de solo verificación, con únicamente el TOKEN.
    const nuevosBorradores = {}
    let nuevaVerificacion1001 = null
    try {
      for (const formato of formatos) {
        if (formato === '1001') {
          const formData = new FormData()
          formData.append('token', tokenFile)
          nuevaVerificacion1001 = await api.verificarTerceros1001(formData)
          continue
        }
        const formData = new FormData()
        formData.append('formato', formato)
        formData.append('token', tokenFile)
        formData.append('plantilla', plantillaFile)
        nuevosBorradores[formato] = await api.uploadExogenas(formData)
      }
      setBorradores(nuevosBorradores)
      setVerificacion1001(nuevaVerificacion1001)
      setTabActivo(formatos[0])
      setEstado('preview')
      actualizarUrlBorradores(nuevosBorradores)
    } catch (err) {
      setEstado('error')
      setErrorMsg(err.message || 'Error al procesar los archivos')
    }
  }, [formatos, tokenFile, plantillaFile, actualizarUrlBorradores])

  // Un solo Excel con todos los formatos analizados, cada uno en su propia hoja — no depende
  // de cuál pestaña esté activa, esa solo controla qué se está previsualizando.
  const generar = useCallback(async () => {
    const ids = Object.values(borradores).map((b) => b.id)
    if (ids.length === 0) return
    setGenerando(true)
    setErrorMsg('')
    try {
      const { blob, filename } = await api.generarExogenasCombinado(ids)
      dispararDescarga(blob, filename)
      setDescargaCombinada({ blob, filename })
      // Los borradores ya no existen en el servidor una vez generados — se limpia la URL para
      // que un reload no intente recargar ids que ya no sirven.
      actualizarUrlBorradores({})
    } catch (err) {
      setErrorMsg(err.message || 'Error al generar el Excel')
    } finally {
      setGenerando(false)
    }
  }, [borradores, dispararDescarga, actualizarUrlBorradores])

  // Re-descarga sin volver a pedirle el archivo al servidor (los borradores ya no existen ahí).
  const descargarDeNuevo = useCallback(() => {
    if (!descargaCombinada) return
    dispararDescarga(descargaCombinada.blob, descargaCombinada.filename)
  }, [descargaCombinada, dispararDescarga])

  const reiniciar = useCallback(() => {
    setEstado('idle')
    setErrorMsg('')
    setFormatos(['1005'])
    setTokenFile(null)
    setPlantillaFile(null)
    setBorradores({})
    setVerificacion1001(null)
    setTabActivo(null)
    setDescargaCombinada(null)
    actualizarUrlBorradores({})
  }, [actualizarUrlBorradores])

  // Simplificación a propósito: 1001 no necesita la plantilla (no escribe nada en ella
  // todavía), pero se sigue exigiendo igual que a los demás — en la práctica siempre se marca
  // junto a 1005/1006, que sí la necesitan.
  const puedeAnalizar = formatos.length > 0 && tokenFile && plantillaFile && estado !== 'analizando'
  const borrador = borradores[tabActivo] ?? null
  const camposFormato = CONFIG_FORMATO[tabActivo]?.campos ?? []
  const mostrando1001 = tabActivo === '1001'
  // Pestañas: formatos ya analizados (con datos) + los que aún no están implementados, siempre
  // visibles como "Próximamente" al final — así el usuario ve hacia dónde va creciendo esto.
  // 1001 no guarda su resultado en `borradores` (ver analizar) — se chequea `verificacion1001`.
  const tieneResultado = (f) => (f.soloVerificacion ? Boolean(verificacion1001) : Boolean(borradores[f.id]))
  const tabsFormato = FORMATOS_DISPONIBLES.filter((f) => (f.disponible ? tieneResultado(f) : true))
  // Con 1-2 formatos el botón muestra los códigos (informativo y corto); con más, un conteo —
  // "Generar Excel 1001, 1005, 1006, 1007" ya no cabe cómodo ni aporta más que el número. 1001
  // nunca entra acá: no genera Excel, solo verifica (ver FORMATOS_DISPONIBLES#soloVerificacion).
  const formatosAnalizados = Object.keys(borradores).sort()
  const etiquetaGenerar = formatosAnalizados.length <= 2
    ? `Generar Excel ${formatosAnalizados.join(', ')}`
    : `Generar Excel (${formatosAnalizados.length} formatos)`

  return (
    <div className="max-w-[1100px] mx-auto mt-8 mb-16">
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

      {estado === 'restaurando' && (
        <div className="flex flex-col items-center justify-center gap-3 py-24">
          <svg className="w-8 h-8 animate-spin text-[#004ac6]" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-30" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
            <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
          </svg>
          <p className="text-sm text-[#6b7280] dark:text-[#8890b5]">Recuperando tu último análisis…</p>
        </div>
      )}

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
              label="TOKEN (detalle de compras/ventas)"
              hint={`Debe traer la${formatos.length > 1 ? 's' : ''} hoja${formatos.length > 1 ? 's' : ''} ${formatos.map((f) => CONFIG_FORMATO[f]?.hojaToken).filter(Boolean).join(' y ') || 'correspondiente'} ya validada${formatos.length > 1 ? 's' : ''}`}
              icon="upload_file"
              file={tokenFile}
              onFile={onTokenFile}
              onClear={limpiarToken}
            />
            <Dropzone
              label="Plantilla SIIGO"
              hint={`Formato${formatos.length > 1 ? 's' : ''} ${formatos.join(', ') || ''} oficial`}
              icon="description"
              file={plantillaFile}
              onFile={onPlantillaFile}
              onClear={limpiarPlantilla}
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

      {estado === 'preview' && (borrador || (mostrando1001 && verificacion1001)) && (
        <div>
          <div className="flex items-center gap-2 mb-6 flex-wrap">
            {tabsFormato.map((f) => {
              const tieneDatos = tieneResultado(f)
              if (!tieneDatos) {
                return (
                  <span
                    key={f.id}
                    className="flex items-center gap-1.5 pl-2.5 pr-3 py-2 rounded-xl border-2 border-dashed border-[#e2e4ef] dark:border-[#2e3148] text-[#9ca3af] dark:text-[#5a5f7a] opacity-60 cursor-not-allowed"
                  >
                    <span className="material-symbols-outlined text-base">{f.icon}</span>
                    <span className="text-xs font-bold">{f.codigo}</span>
                    <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-[#f0f2f8] dark:bg-[#252840]">Próximamente</span>
                  </span>
                )
              }
              const active = tabActivo === f.id
              return (
                <button
                  key={f.id}
                  onClick={() => setTabActivo(f.id)}
                  className={`flex items-center gap-1.5 pl-2.5 pr-3.5 py-2 rounded-xl border-2 transition-all duration-150 whitespace-nowrap ${
                    active
                      ? 'border-solid border-[#004ac6] bg-[#e8f0fe] dark:bg-[#1a2550]'
                      : 'border-solid border-[#e2e4ef] dark:border-[#2e3148] bg-white dark:bg-[#1e2030] hover:border-[#c3c6d7] dark:hover:border-[#3a3e5c]'
                  }`}
                >
                  <span className="material-symbols-outlined text-base" style={{ color: active ? '#004ac6' : '#9ca3af' }}>{f.icon}</span>
                  <span className={`text-xs font-bold ${active ? 'text-[#004ac6] dark:text-[#7ba8f0]' : 'text-[#434655] dark:text-[#c4c8e8]'}`}>{f.codigo}</span>
                </button>
              )
            })}
          </div>

          {mostrando1001 ? (
            <Verificacion1001View verificacion={verificacion1001} />
          ) : (
            <>
              {/* Siempre en una sola fila de tablet para arriba (sm:flex-nowrap) — nunca baja tarjetas
                  a una segunda fila, sin importar si el formato activo trae 1, 2 o 4 campos de
                  monto. "Terceros" es angosta y fija (trae poco contenido, no necesita crecer); las
                  tarjetas de monto crecen con flex-1 para repartirse TODO el ancho sobrante entre
                  ellas (sin max-width — un tope ahí dejaba espacio muerto a la derecha cuando hay
                  pocas tarjetas, como en 1005 con solo 2) y, si el espacio queda justo (muchas
                  tarjetas a la vez), se encogen (flex-shrink) en vez de forzar un salto de línea —
                  el número nunca desborda porque StatsCard le achica la letra automáticamente según
                  el ancho disponible. En mobile (debajo de sm) sí se apilan una debajo de otra,
                  porque ahí literalmente no entra nada en una sola fila. */}
              <div className="flex flex-wrap sm:flex-nowrap gap-4 mb-6">
                <div className="w-full sm:w-36 flex-shrink-0">
                  <StatsCard
                    title="Terceros agrupados"
                    value={borrador.totalTerceros}
                    icon="groups"
                    borderColor="#004ac6"
                    iconColor="#004ac6"
                  />
                </div>
                {camposFormato.map((c, i) => (
                  <div key={c.key} className="w-full sm:w-auto sm:flex-1">
                    <StatsCard
                      title={c.statTitle}
                      value={borrador[c.totalKey]}
                      decimals={2}
                      decimalSeparator=","
                      thousandSeparator="."
                      icon="payments"
                      borderColor={STAT_COLORS[i % STAT_COLORS.length]}
                      iconColor={STAT_COLORS[i % STAT_COLORS.length]}
                      sub={c.statSub}
                      subColor={STAT_COLORS[i % STAT_COLORS.length]}
                    />
                  </div>
                ))}
              </div>

              <div className="bg-white dark:bg-[#1e2030] rounded-2xl border border-[#e2e4ef] dark:border-[#2e3148] shadow-sm overflow-hidden">
                {/* table-fixed + anchos fijos en todo menos Razón social: así la tabla siempre cabe
                    en el ancho del contenedor sin scroll horizontal, y los nombres largos envuelven
                    en vez de forzar el ancho de la columna (antes con whitespace-nowrap + sticky). */}
                <table className="w-full border-collapse text-sm table-fixed">
                  <thead>
                    <tr>
                      <th className="bg-[#f8f9fe] dark:bg-[#252840] text-[#434655] dark:text-[#c4c8e8] font-semibold border-b border-[#e2e4ef] dark:border-[#2e3148] px-3 py-2.5 text-left">Razón social</th>
                      <th className="w-14 bg-[#f8f9fe] dark:bg-[#252840] text-[#434655] dark:text-[#c4c8e8] font-semibold border-b border-[#e2e4ef] dark:border-[#2e3148] px-2 py-2.5 text-center">TDOC</th>
                      <th className="w-32 bg-[#f8f9fe] dark:bg-[#252840] text-[#434655] dark:text-[#c4c8e8] font-semibold border-b border-[#e2e4ef] dark:border-[#2e3148] px-2 py-2.5 text-left">Identificación</th>
                      <th className="w-10 bg-[#f8f9fe] dark:bg-[#252840] text-[#434655] dark:text-[#c4c8e8] font-semibold border-b border-[#e2e4ef] dark:border-[#2e3148] px-2 py-2.5 text-center">DV</th>
                      {camposFormato.map((c) => (
                        <th key={c.key} className="w-36 bg-[#f8f9fe] dark:bg-[#252840] text-[#434655] dark:text-[#c4c8e8] font-semibold border-b border-[#e2e4ef] dark:border-[#2e3148] px-2 py-2.5 text-right">{c.label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {borrador.registros.map((r, idx) => (
                      <tr key={`${r.tipoDocumento}-${r.identificacion}`} className={idx % 2 === 1 ? 'bg-[#fafbff] dark:bg-[#1a1c2e]' : ''}>
                        <td className="px-3 py-2 border-b border-[#e2e4ef] dark:border-[#2e3148] text-[#191c1e] dark:text-[#e4e6f0] break-words">{r.razonSocial}</td>
                        <td className="px-2 py-2 text-center border-b border-[#e2e4ef] dark:border-[#2e3148] text-[#434655] dark:text-[#c4c8e8]">{r.tipoDocumento}</td>
                        <td className="px-2 py-2 border-b border-[#e2e4ef] dark:border-[#2e3148] text-[#434655] dark:text-[#c4c8e8] break-words">{r.identificacion}</td>
                        <td className="px-2 py-2 text-center border-b border-[#e2e4ef] dark:border-[#2e3148] text-[#434655] dark:text-[#c4c8e8]">{r.digitoVerificacion}</td>
                        {camposFormato.map((c) => (
                          <td key={c.key} className="px-2 py-2 text-right border-b border-[#e2e4ef] dark:border-[#2e3148] text-[#191c1e] dark:text-[#e4e6f0] font-medium break-words">{formatoMoneda(r[c.key])}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td className="px-3 py-2.5 bg-[#f8f9fe] dark:bg-[#252840] border-t-2 border-[#e2e4ef] dark:border-[#2e3148] text-[#191c1e] dark:text-[#e4e6f0] font-bold">
                        Total ({borrador.totalTerceros} terceros)
                      </td>
                      <td className="bg-[#f8f9fe] dark:bg-[#252840] border-t-2 border-[#e2e4ef] dark:border-[#2e3148]" colSpan={3} />
                      {camposFormato.map((c) => (
                        <td key={c.key} className="px-2 py-2.5 text-right bg-[#f8f9fe] dark:bg-[#252840] border-t-2 border-[#e2e4ef] dark:border-[#2e3148] text-[#191c1e] dark:text-[#e4e6f0] font-bold break-words">
                          {formatoMoneda(borrador[c.totalKey])}
                        </td>
                      ))}
                    </tr>
                  </tfoot>
                </table>
              </div>
            </>
          )}

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

            {/* Si solo se analizó 1001, no hay ningún borrador real que generar — ver
                FORMATOS_DISPONIBLES#soloVerificacion. */}
            {formatosAnalizados.length > 0 && (
              <button
                onClick={descargaCombinada ? descargarDeNuevo : generar}
                disabled={generando}
                className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold text-white transition active:scale-[0.97] disabled:opacity-60"
                style={{ background: '#16a34a' }}
              >
                {generando ? (
                  <>
                    <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-30" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                      <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                    </svg>
                    Generando…
                  </>
                ) : descargaCombinada ? (
                  <>
                    <span className="material-symbols-outlined text-base">download</span>
                    Descargar de nuevo
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined text-base">file_download</span>
                    {etiquetaGenerar}
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      )}

      {estado === 'preview' && (
        <button
          onClick={() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' })}
          title="Ir abajo"
          aria-label="Ir abajo"
          className="fixed bottom-6 right-6 z-20 flex items-center justify-center w-11 h-11 rounded-full text-white shadow-lg hover:scale-105 active:scale-95 transition-transform"
          style={{ background: '#004ac6' }}
        >
          <span className="material-symbols-outlined text-xl">arrow_downward</span>
        </button>
      )}
    </div>
  )
}
