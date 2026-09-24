import { useState, useRef, useEffect } from 'react'

// Combobox liviano: input con filtro en vivo + lista desplegable, en vez de un <select> plano
// con decenas de empresas sin buscador. Solo permite elegir entre empresas existentes — crear
// una empresa nueva vive únicamente en el directorio maestro (/empresas), para no seguir
// generando duplicados desde cada módulo (ver docs/ESTADO_EMPRESAS_DIRECTORIO.md).
export default function EmpresaCombobox({ empresas, value, onChange }) {
  const [query, setQuery]   = useState('')
  const [open, setOpen]     = useState(false)
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

  const seleccionar = (empresa) => {
    onChange(empresa.id)
    setQuery('')
    setOpen(false)
  }

  return (
    <div ref={wrapRef} className="relative">
      {empresaSeleccionada && !open ? (
        <button
          type="button"
          onClick={() => { setOpen(true); setQuery('') }}
          className="w-full flex items-center gap-3 pl-2 pr-3.5 py-2 rounded-2xl border border-[#cfe3e1] bg-[#E3EEEE] text-sm transition hover:border-[#003B43]/60 hover:shadow-sm"
        >
          <span className="w-8 h-8 rounded-xl bg-white shadow-sm flex items-center justify-center flex-shrink-0">
            <span className="material-symbols-outlined text-[#003B43] text-lg">business</span>
          </span>
          <span className="flex flex-col items-start min-w-0 flex-1">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-[#5a8f8a] leading-none mb-0.5">
              Empresa
            </span>
            <span className="truncate font-semibold text-[#191c1e] leading-tight">{empresaSeleccionada.name}</span>
          </span>
          <span className="material-symbols-outlined text-[#8890b5] text-lg flex-shrink-0">unfold_more</span>
        </button>
      ) : (
        <div className="relative">
          <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-[#9ca3af] text-lg pointer-events-none">
            search
          </span>
          <input
            autoFocus={open}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setOpen(true)}
            placeholder="Buscar empresa…"
            className="w-full pl-10 pr-3.5 py-2.5 rounded-2xl border border-[#d1d5db] bg-white text-sm text-[#191c1e] focus:outline-none focus:ring-2 focus:ring-[#003B43]/30 focus:border-[#003B43]"
          />
        </div>
      )}

      {open && (
        <div className="absolute z-20 mt-1.5 w-full bg-white border border-[#e2e4ef] rounded-2xl shadow-lg overflow-hidden">
          <div className="max-h-56 overflow-y-auto scrollbar-styled">
            {filtradas.length === 0 ? (
              <p className="px-3.5 py-3 text-sm text-[#9ca3af] italic">Ninguna empresa coincide</p>
            ) : (
              filtradas.map((e) => (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => seleccionar(e)}
                  className="w-full text-left px-3.5 py-2.5 text-sm text-[#191c1e] hover:bg-[#eef3ff] transition-colors flex items-center gap-2"
                >
                  <span className="material-symbols-outlined text-[#8890b5] text-base flex-shrink-0">business</span>
                  <span className="truncate">{e.name}</span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
