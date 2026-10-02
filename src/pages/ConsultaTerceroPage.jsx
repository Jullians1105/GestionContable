import { useState, useCallback } from 'react'
import { api } from '../services/api'
import { useToast } from '../context/ToastContext'

// Estilos de cada tipo de aviso (mismos colores de estado que el resto de la app).
const ESTILOS_ALERTA = {
  rojo: { caja: 'bg-red-50 border-red-200', texto: 'text-red-700', icono: 'error' },
  ambar: { caja: 'bg-amber-50 border-amber-200', texto: 'text-amber-800', icono: 'warning' },
  gris: { caja: 'bg-[#f0f2f8] border-[#e2e4ef]', texto: 'text-[#6b7280]', icono: 'info' },
}

const TEXTO_ORIGEN = {
  ambos: 'Factura + RUES',
  pdf: 'Solo factura',
  rues: 'Solo RUES (sin factura)',
}

// Fila compacta de la tarjeta: ícono + etiqueta + valor en una sola línea (para que la tarjeta
// entre en pantalla sin scroll), con "—" si no hay dato.
// `copiable`: agrega un botón para copiar el valor (Dirección/Teléfono/Correo, los que más se
// pegan en otro lado). `valorCopia`: lo que se copia cuando difiere de lo que se muestra (ej. el
// documento del representante se muestra con su tipo, pero se copia solo el número).
function Campo({ icon, label, value, copiable, valorCopia }) {
  const { addToast } = useToast()
  const [copiado, setCopiado] = useState(false)

  const copiar = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(valorCopia ?? value)
      setCopiado(true)
      addToast('Copiado al portapapeles', 'success', 1800)
      setTimeout(() => setCopiado(false), 1500)
    } catch {
      addToast('No se pudo copiar', 'error')
    }
  }, [value, valorCopia, addToast])

  return (
    <div className="grid grid-cols-[18px_120px_1fr_auto] items-center gap-x-2 py-1.5">
      <span className="material-symbols-outlined text-base text-[#9ca3af]">{icon}</span>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-[#9ca3af] leading-tight">{label}</p>
      <p className="text-sm text-[#191c1e] break-words min-w-0">{value || '—'}</p>
      {copiable && value ? (
        <button
          type="button"
          onClick={copiar}
          aria-label={`Copiar ${label.toLowerCase()}`}
          title={`Copiar ${label.toLowerCase()}`}
          className="text-[#9ca3af] hover:text-[#003B43] transition active:scale-90"
        >
          <span className="material-symbols-outlined text-base">{copiado ? 'check' : 'content_copy'}</span>
        </button>
      ) : <span />}
    </div>
  )
}

// Ícono de información: al pasar el mouse (o enfocarlo con el teclado) muestra `texto` al instante.
// El tooltip nativo (title) tarda ~1 s en salir y no se puede estilizar.
function IconoInfo({ texto }) {
  const [pos, setPos] = useState(null) // { top, left } | null
  const mostrar = (e) => {
    const r = e.currentTarget.getBoundingClientRect()
    setPos({ top: r.bottom + 8, left: Math.max(8, Math.min(r.left - 8, window.innerWidth - 408)) })
  }
  return (
    <>
      <button
        type="button"
        onMouseEnter={mostrar}
        onMouseLeave={() => setPos(null)}
        onFocus={mostrar}
        onBlur={() => setPos(null)}
        aria-label={texto}
        className="w-5 h-5 -ml-1 rounded-full flex items-center justify-center text-[#9ca3af] hover:text-[#003B43] focus:text-[#003B43] focus:outline-none transition"
      >
        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>info</span>
      </button>
      {pos && (
        <div
          role="tooltip"
          style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 50 }}
          className="pointer-events-none max-w-[400px] px-3 py-2 rounded-lg bg-[#06272E] text-white text-xs leading-snug shadow-lg font-medium"
        >
          {texto}
        </div>
      )}
    </>
  )
}

// Una de las dos columnas de la tarjeta: (ícono de información opcional) + título + etiqueta de fuente.
// `subtitulo` es una línea fija debajo del título; `info` va como tooltip del ícono a la izquierda.
function Columna({ titulo, chip, chipClases, subtitulo, info, children }) {
  return (
    <div className="min-w-0">
      <div className="flex items-start justify-between gap-3 mb-1 pb-2 border-b border-[#e2e4ef]">
        <div>
          <div className="flex items-center gap-2">
            {info && <IconoInfo texto={info} />}
            <h2 className="text-sm font-bold text-[#191c1e]">{titulo}</h2>
            <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold tracking-wide uppercase ${chipClases}`}>{chip}</span>
          </div>
          {subtitulo && <p className="text-[11px] text-[#9ca3af] mt-0.5">{subtitulo}</p>}
        </div>
      </div>
      {children}
    </div>
  )
}

function Vacio({ icon, children }) {
  return (
    <div className="flex items-start gap-2 py-4 text-xs text-[#9ca3af]">
      <span className="material-symbols-outlined text-base flex-shrink-0">{icon}</span>
      <p>{children}</p>
    </div>
  )
}

export default function ConsultaTerceroPage() {
  const [documento, setDocumento] = useState('')
  const [estado, setEstado] = useState('idle') // idle | buscando | encontrado | no-encontrado | error
  const [tercero, setTercero] = useState(null)
  const [errorMsg, setErrorMsg] = useState('')
  const [ruesNoDisponible, setRuesNoDisponible] = useState(false)

  const consultar = useCallback(async (e) => {
    e.preventDefault()
    if (!documento.trim()) return
    setEstado('buscando')
    setErrorMsg('')
    setRuesNoDisponible(false)
    try {
      const data = await api.consultarTercero(documento.trim())
      setTercero(data)
      setEstado('encontrado')
    } catch (err) {
      if (err.status === 404) {
        setTercero(null)
        setRuesNoDisponible(err.ruesNoDisponible === true)
        setEstado('no-encontrado')
      } else {
        setErrorMsg(err.message || 'Error al consultar el documento')
        setEstado('error')
      }
    }
  }, [documento])

  const hayFactura = tercero ? tercero.origen !== 'rues' : false
  const hayRues = tercero ? tercero.rues_consulta === 'encontrado' : false
  // Fecha de la última "foto" de los datos del RUES (el dato NO es de hoy: Confecámaras lo publica de
  // vez en cuando). Se muestra para que "consultado ahora" no se confunda con "dato de ahora".
  const fechaFuente = tercero?.ruesFuenteActualizadaAl
    ? new Date(tercero.ruesFuenteActualizadaAl).toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : null
  const fechaRues = tercero?.rues_consultado_at
    ? new Date(tercero.rues_consultado_at).toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : null
  // Cada búsqueda consulta el RUES; si no respondió, se muestra lo último guardado y se avisa.
  const alertas = tercero
    ? [
      ...(tercero.alertas ?? []),
      ...(tercero.ruesDesactualizado ? [{
        codigo: 'rues_desactualizado',
        nivel: 'ambar',
        mensaje: `No se pudo consultar el RUES en este momento. Los datos del RUES son los de la última verificación${fechaRues ? ` (${fechaRues})` : ''} y pueden estar desactualizados.`,
      }] : []),
    ]
    : []

  return (
    <div className="max-w-[1000px] mx-auto mt-4 mb-6">
      <div className="mb-3 flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-2xl text-[#003B43]">person_search</span>
          <h1 className="text-xl font-bold text-[#191c1e]">Consulta Tercero</h1>
        </div>
        <p className="text-xs text-[#6b7280]">
          Busca por NIT o documento entre los terceros guardados (facturas y RUES). Si no está guardado, lo busca en el RUES.
        </p>
      </div>

      <form onSubmit={consultar} className="bg-white rounded-2xl border border-[#e2e4ef] shadow-sm p-3 mb-4">
        <label htmlFor="documento" className="sr-only">NIT o documento</label>
        <div className="flex gap-3">
          <div className="relative flex-1">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-lg text-[#9ca3af]">badge</span>
            <input
              id="documento"
              type="text"
              inputMode="numeric"
              value={documento}
              onChange={(e) => setDocumento(e.target.value)}
              placeholder="NIT o documento. Ej. 901939874"
              className="w-full pl-9 pr-3 py-2 rounded-xl border-2 border-[#d1d5db] bg-white text-sm text-[#191c1e] focus:outline-none focus:border-[#003B43]"
            />
          </div>
          <button
            type="submit"
            disabled={!documento.trim() || estado === 'buscando'}
            className="flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-semibold text-white transition active:scale-[0.97] disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: '#003B43' }}
          >
            {estado === 'buscando' ? (
              <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-30" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
              </svg>
            ) : (
              <span className="material-symbols-outlined text-base">search</span>
            )}
            Consultar
          </button>
        </div>
      </form>

      {estado === 'no-encontrado' && (
        <div className="flex items-start gap-3 p-4 rounded-xl bg-[#f0f2f8] border border-[#e2e4ef]">
          <span className="material-symbols-outlined text-[#9ca3af] text-xl flex-shrink-0 mt-0.5">search_off</span>
          <p className="text-sm text-[#6b7280]">
            {ruesNoDisponible
              ? 'No hay ningún tercero guardado con ese documento y el RUES no respondió en este momento. Intenta de nuevo en unos minutos.'
              : 'No hay ningún tercero guardado con ese documento y tampoco aparece en el RUES (puede ser una persona natural sin matrícula mercantil o un extranjero). Aparecerá aquí cuando se suba una factura suya en "Datos de Terceros".'}
          </p>
        </div>
      )}

      {estado === 'error' && errorMsg && (
        <div className="flex items-start gap-3 p-4 rounded-xl bg-red-50 border border-red-200">
          <span className="material-symbols-outlined text-red-500 text-xl flex-shrink-0 mt-0.5">error</span>
          <p className="text-sm font-semibold text-red-700">{errorMsg}</p>
        </div>
      )}

      {estado === 'encontrado' && tercero && (
        <div className="bg-white rounded-2xl border border-[#e2e4ef] shadow-sm p-5">
          {/* Arriba: el nombre */}
          <div className="flex items-start gap-3 pb-3">
            <span className="material-symbols-outlined text-2xl text-[#003B43] mt-0.5">corporate_fare</span>
            <div className="min-w-0 flex-1">
              <p className="text-lg font-bold text-[#191c1e] leading-tight break-words">{tercero.razon_social_oficial}</p>
              <p className="text-xs text-[#6b7280] mt-0.5">
                NIT {tercero.nit}
                {tercero.razon_social_factura && tercero.razon_social_factura !== tercero.razon_social_oficial && (
                  <span> · En la factura: <span className="font-semibold">{tercero.razon_social_factura}</span></span>
                )}
              </p>
            </div>
            <span
              title="De dónde salen los datos de este tercero"
              className="flex-shrink-0 px-2.5 py-1 rounded-full text-[11px] font-bold bg-[#E3EEEE] text-[#003B43]"
            >
              {TEXTO_ORIGEN[tercero.origen] ?? 'Solo factura'}
            </span>
          </div>

          {alertas.length > 0 && (
            <div className="flex flex-wrap gap-2 pb-3">
              {alertas.map((alerta) => {
                const estilo = ESTILOS_ALERTA[alerta.nivel] ?? ESTILOS_ALERTA.gris
                return (
                  <div key={alerta.codigo} className={`flex items-start gap-2 px-3 py-2 rounded-xl border ${estilo.caja} flex-1 min-w-[260px]`}>
                    <span className={`material-symbols-outlined text-base flex-shrink-0 ${estilo.texto}`}>{estilo.icono}</span>
                    <p className={`text-xs font-semibold ${estilo.texto}`}>{alerta.mensaje}</p>
                  </div>
                )
              })}
            </div>
          )}

          {/* Abajo: izquierda = facturas, derecha = RUES */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-5 pt-3 border-t border-[#e2e4ef]">
            <Columna
              titulo="Datos de las facturas"
              chip="Factura"
              chipClases="bg-[#f0f2f8] text-[#6b7280]"
              subtitulo="Extraídos de facturas electrónicas, no de un RUT verificado"
            >
              {hayFactura ? (
                <div className="divide-y divide-[#f0f2f8]">
                  <Campo icon="public" label="Departamento" value={tercero.departamento} />
                  <Campo icon="map" label="Municipio" value={tercero.municipio} />
                  <Campo icon="location_on" label="Dirección" value={tercero.direccion} copiable />
                  <Campo icon="call" label="Teléfono" value={tercero.telefono} copiable />
                  <Campo icon="mail" label="Correo" value={tercero.correo} copiable />
                  <Campo
                    icon="gavel"
                    label="Régimen fiscal"
                    value={tercero.regimen_fiscal && (
                      tercero.regimen_fiscal_descripcion
                        ? `${tercero.regimen_fiscal} — ${tercero.regimen_fiscal_descripcion}`
                        : tercero.regimen_fiscal
                    )}
                  />
                  <Campo icon="account_balance" label="Responsabilidad tributaria" value={tercero.responsabilidad_tributaria} />
                </div>
              ) : (
                <Vacio icon="receipt_long">
                  Sin factura. La dirección, el teléfono y los datos tributarios aparecerán cuando se suba una factura de este tercero en &ldquo;Datos de Terceros&rdquo;.
                </Vacio>
              )}
            </Columna>

            <Columna
              titulo="Datos del RUES"
              chip="RUES"
              chipClases="bg-[#E3EEEE] text-[#003B43]"
              info={tercero.guardado === false
                ? (fechaFuente ? `Datos del RUES al ${fechaFuente}` : 'Consulta en vivo')
                : (tercero.ruesDesactualizado
                  ? `Última verificación: ${fechaRues ?? 'nunca'}${fechaFuente ? ` · datos del RUES al ${fechaFuente}` : ''}`
                  : (fechaFuente
                    ? `Datos del RUES al ${fechaFuente} · consultado ahora`
                    : 'Consultado ahora en el registro mercantil (RUES)'))}
            >
              {hayRues ? (
                <div className="divide-y divide-[#f0f2f8]">
                  <Campo icon="verified" label="Matrícula" value={tercero.rues_estado} />
                  <Campo icon="event_available" label="Última renovación" value={tercero.rues_ultimo_ano_renovado && String(tercero.rues_ultimo_ano_renovado)} />
                  <Campo icon="work" label="Actividad (CIIU)" value={tercero.rues_ciiu} />
                  <Campo icon="person" label="Representante legal" value={tercero.rues_representante_legal} />
                  <Campo
                    icon="badge"
                    label="Doc. representante"
                    value={tercero.rues_representante_documento && (
                      tercero.rues_representante_tipo_documento
                        ? `${tercero.rues_representante_tipo_documento} ${tercero.rues_representante_documento}`
                        : tercero.rues_representante_documento
                    )}
                    valorCopia={tercero.rues_representante_documento ?? undefined}
                    copiable
                  />
                </div>
              ) : (
                <Vacio icon={tercero.rues_consulta === 'no_encontrado' ? 'search_off' : 'help'}>
                  {tercero.rues_consulta === 'no_encontrado'
                    ? 'No aparece en el RUES (puede ser persona natural sin matrícula mercantil o extranjero).'
                    : 'No se pudo consultar el RUES para este documento.'}
                </Vacio>
              )}
            </Columna>
          </div>
        </div>
      )}
    </div>
  )
}
