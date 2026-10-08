import { useMemo, useState } from 'react'
import { getInitials, getAvatarColor } from '../utils/helpers'

// Tabla general del día: TODAS las acciones de todas las personas (o de la persona elegida) en orden
// de hora, la más reciente primero — Cuándo, Quién, Qué. Se arma con lo que ya trae /api/actividad.

const POR_PAGINA = 40

const AREA_COLOR = {
  'Fondo Emprender': { bg: '#E3EEEE', fg: '#003B43' },
  'Empresas Externas': { bg: '#fef3c7', fg: '#92400e' },
  'Nómina Electrónica': { bg: '#dbe1ff', fg: '#2563eb' },
  'Claves DIAN': { bg: '#ffdad6', fg: '#93000a' },
  'Deudas DIAN': { bg: '#ffedd5', fg: '#9a3412' },
  Pagos: { bg: '#dcfce7', fg: '#166534' },
  Contabilidad: { bg: '#cffafe', fg: '#155e75' },
  'Exógenas': { bg: '#fae8ff', fg: '#86198f' },
  Terceros: { bg: '#ecfccb', fg: '#3f6212' },
  Consolidado: { bg: '#e0f2fe', fg: '#075985' },
  Directorio: { bg: '#e0e7ff', fg: '#3730a3' },
  Tareas: { bg: '#f3f4f6', fg: '#374151' },
}

export default function LineaDelDia({ usuarios }) {
  const [mostrar, setMostrar] = useState(POR_PAGINA)

  const filas = useMemo(() => {
    const todas = usuarios.flatMap((u) => u.eventos.map((e, i) => ({ ...e, nombre: u.nombre, orden: i })))
    // "HH:mm" del mismo día ordena bien como texto; dentro del mismo minuto se respeta el orden del servidor.
    return todas.sort((a, b) => (a.hora < b.hora ? 1 : a.hora > b.hora ? -1 : a.orden - b.orden))
  }, [usuarios])

  if (!filas.length) return null
  const visibles = filas.slice(0, mostrar)

  return (
    <section className="bg-white rounded-2xl border border-[#e2e4ef] shadow-sm overflow-hidden mb-4">
      <div className="px-5 py-3.5 border-b border-[#e2e4ef]">
        <h2 className="text-sm font-bold text-[#191c1e]">Todas las acciones del día</h2>
        <p className="text-xs text-[#6b7280] mt-0.5">{filas.length} {filas.length === 1 ? 'acción' : 'acciones'} en orden de hora, la más reciente primero.</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] font-bold text-[#434655] uppercase tracking-wide bg-[#f8f9fc]">
              <th className="px-5 py-2.5 w-20">Cuándo</th>
              <th className="px-3 py-2.5 w-48">Quién</th>
              <th className="px-3 py-2.5">Qué</th>
              <th className="px-3 py-2.5 hidden md:table-cell">Área</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#f1f2f6]">
            {visibles.map((f) => {
              const c = AREA_COLOR[f.area] ?? { bg: '#f3f4f6', fg: '#374151' }
              return (
                <tr key={f.id}>
                  <td className="px-5 py-2 text-xs tabular-nums text-[#6b7280] whitespace-nowrap">{f.hora}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold text-white flex-shrink-0 ${getAvatarColor(f.nombre)}`}>{getInitials(f.nombre)}</div>
                      <span className="font-semibold text-[#191c1e] truncate">{f.nombre}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-[#191c1e] break-words">{f.texto}</td>
                  <td className="px-3 py-2 hidden md:table-cell whitespace-nowrap">
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full" style={{ background: c.bg, color: c.fg }}>{f.area}</span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {filas.length > mostrar && (
        <button
          onClick={() => setMostrar((m) => m + POR_PAGINA)}
          className="w-full py-2.5 text-xs font-semibold text-[#003B43] hover:bg-[#f8f9fc] border-t border-[#e2e4ef] transition"
        >
          Mostrar más ({filas.length - mostrar} restantes)
        </button>
      )}
    </section>
  )
}
