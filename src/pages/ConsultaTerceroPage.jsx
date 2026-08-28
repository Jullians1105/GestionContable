import { useState, useCallback } from 'react'
import { api } from '../services/api'
import { useToast } from '../context/ToastContext'

// Campo simple de la tarjeta de resultado: etiqueta + valor, con "—" si no hay dato (puede pasar
// si el PDF no traía ese campo, o si el tercero se guardó antes de la migración 043).
// `copiable`: agrega un botón para copiar el valor al portapapeles (Dirección/Teléfono/Correo,
// los que el usuario más pega en otro lado) — no tiene sentido para valores cortos como
// Municipio/Departamento que ya se leen de un vistazo.
function Campo({ icon, label, value, copiable }) {
  const { addToast } = useToast()
  const [copiado, setCopiado] = useState(false)

  const copiar = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(value)
      setCopiado(true)
      addToast('Copiado al portapapeles', 'success', 1800)
      setTimeout(() => setCopiado(false), 1500)
    } catch {
      addToast('No se pudo copiar', 'error')
    }
  }, [value, addToast])

  return (
    <div className="flex items-start gap-3 py-3">
      <span className="material-symbols-outlined text-lg text-[#9ca3af] mt-0.5">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-[#9ca3af] dark:text-[#6b7280]">{label}</p>
        <div className="flex items-center gap-2">
          <p className="text-sm text-[#191c1e] dark:text-[#e4e6f0] break-words">{value || '—'}</p>
          {copiable && value && (
            <button
              type="button"
              onClick={copiar}
              aria-label={`Copiar ${label.toLowerCase()}`}
              title={`Copiar ${label.toLowerCase()}`}
              className="flex-shrink-0 text-[#9ca3af] hover:text-[#004ac6] transition active:scale-90"
            >
              <span className="material-symbols-outlined text-base">
                {copiado ? 'check' : 'content_copy'}
              </span>
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default function ConsultaTerceroPage() {
  const [documento, setDocumento] = useState('')
  const [estado, setEstado] = useState('idle') // idle | buscando | encontrado | no-encontrado | error
  const [tercero, setTercero] = useState(null)
  const [errorMsg, setErrorMsg] = useState('')

  const consultar = useCallback(async (e) => {
    e.preventDefault()
    if (!documento.trim()) return
    setEstado('buscando')
    setErrorMsg('')
    try {
      const data = await api.consultarTercero(documento.trim())
      setTercero(data)
      setEstado('encontrado')
    } catch (err) {
      if (err.status === 404) {
        setTercero(null)
        setEstado('no-encontrado')
      } else {
        setErrorMsg(err.message || 'Error al consultar el documento')
        setEstado('error')
      }
    }
  }, [documento])

  return (
    <div className="max-w-[760px] mx-auto mt-8 mb-16">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <span className="material-symbols-outlined text-3xl text-[#004ac6]">person_search</span>
          <h1 className="text-2xl font-bold text-[#191c1e] dark:text-[#e4e6f0]">Consulta Tercero</h1>
        </div>
        <p className="text-sm text-[#6b7280] dark:text-[#8890b5]">
          Busca por NIT o documento entre los terceros ya guardados a partir de facturas electrónicas
          subidas en &ldquo;Importar Terceros&rdquo;.
        </p>
      </div>

      <form onSubmit={consultar} className="bg-white dark:bg-[#1e2030] rounded-2xl border border-[#e2e4ef] dark:border-[#2e3148] shadow-sm p-6 mb-6">
        <label htmlFor="documento" className="block text-sm font-bold text-[#191c1e] dark:text-[#e4e6f0] mb-2">
          NIT o documento
        </label>
        <div className="flex gap-3">
          <div className="relative flex-1">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-lg text-[#9ca3af]">badge</span>
            <input
              id="documento"
              type="text"
              inputMode="numeric"
              value={documento}
              onChange={(e) => setDocumento(e.target.value)}
              placeholder="Ej. 901939874"
              className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-[#d1d5db] dark:border-[#3a3e5c] bg-white dark:bg-[#181a2e] text-sm text-[#191c1e] dark:text-[#e4e6f0] focus:outline-none focus:ring-2 focus:ring-[#004ac6]/30 focus:border-[#004ac6]"
            />
          </div>
          <button
            type="submit"
            disabled={!documento.trim() || estado === 'buscando'}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white transition active:scale-[0.97] disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: '#004ac6' }}
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
        <div className="flex items-start gap-3 p-4 rounded-xl bg-[#f0f2f8] dark:bg-[#252840] border border-[#e2e4ef] dark:border-[#2e3148]">
          <span className="material-symbols-outlined text-[#9ca3af] text-xl flex-shrink-0 mt-0.5">search_off</span>
          <p className="text-sm text-[#6b7280] dark:text-[#8890b5]">
            No hay ningún tercero guardado con ese documento. Solo aparecen terceros ya extraídos de
            facturas subidas en &ldquo;Datos de Terceros&rdquo;.
          </p>
        </div>
      )}

      {estado === 'error' && errorMsg && (
        <div className="flex items-start gap-3 p-4 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
          <span className="material-symbols-outlined text-red-500 text-xl flex-shrink-0 mt-0.5">error</span>
          <p className="text-sm font-semibold text-red-700 dark:text-red-400">{errorMsg}</p>
        </div>
      )}

      {estado === 'encontrado' && tercero && (
        <div>
          <div className="bg-white dark:bg-[#1e2030] rounded-2xl border border-[#e2e4ef] dark:border-[#2e3148] shadow-sm p-6 mb-4">
            <div className="flex items-start gap-3 pb-4 mb-1 border-b border-[#e2e4ef] dark:border-[#2e3148]">
              <span className="material-symbols-outlined text-2xl text-[#004ac6] mt-0.5">corporate_fare</span>
              <div>
                <p className="text-base font-bold text-[#191c1e] dark:text-[#e4e6f0]">{tercero.razon_social}</p>
                <p className="text-xs text-[#6b7280] dark:text-[#8890b5]">NIT {tercero.nit}</p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8">
              <div className="divide-y divide-[#e2e4ef] dark:divide-[#2e3148]">
                <Campo icon="public" label="Departamento" value={tercero.departamento} />
                <Campo icon="map" label="Municipio" value={tercero.municipio} />
                <Campo icon="location_on" label="Dirección" value={tercero.direccion} copiable />
                <Campo icon="call" label="Teléfono" value={tercero.telefono} copiable />
              </div>
              <div className="divide-y divide-[#e2e4ef] dark:divide-[#2e3148]">
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
            </div>
          </div>

          <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
            <span className="material-symbols-outlined text-amber-600 dark:text-amber-400 text-xl flex-shrink-0 mt-0.5">info</span>
            <p className="text-xs text-amber-800 dark:text-amber-400">
              Estos datos fueron extraídos de facturas electrónicas, no de un RUT verificado — pueden
              no reflejar la información tributaria más reciente o correcta del tercero.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
