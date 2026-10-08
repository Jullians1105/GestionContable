import { getInitials, getAvatarColor } from '../utils/helpers'

// Tabla de resumen de la pestaña Acciones, pensada para sacar conclusiones de un vistazo:
//  · "Todas las personas": una fila por persona y una columna por área, con el color más fuerte donde
//    hubo más trabajo.
//  · Una persona: una fila por proceso, con en cuántas empresas quedó Realizado / En proceso / No aplica /
//    Pendiente (según como quedó cada casilla al final del día) y cuántos cambios hizo.
// Los datos vienen de /api/actividad (usuarios[].areas y usuarios[].resumen).

const ESTADOS = [
  { clave: 'hecho', label: 'Realizado', bg: '#dcfce7', fg: '#166534' },
  { clave: 'proceso', label: 'En proceso', bg: '#dbe1ff', fg: '#2563eb' },
  { clave: 'noaplica', label: 'No aplica', bg: '#e5e7eb', fg: '#374151' },
  { clave: 'pendiente', label: 'Pendiente', bg: '#fef3c7', fg: '#92400e' },
]

const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`

function Pastilla({ valor, estado }) {
  if (!valor) return <span className="text-[#d1d5db]">·</span>
  return (
    <span className="inline-block min-w-[1.75rem] px-2 py-0.5 rounded-full text-xs font-bold tabular-nums" style={{ background: estado.bg, color: estado.fg }}>
      {valor}
    </span>
  )
}

function Avatar({ nombre }) {
  return (
    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0 ${getAvatarColor(nombre)}`}>
      {getInitials(nombre)}
    </div>
  )
}

function ResumenEquipo({ usuarios }) {
  const areas = Object.entries(
    usuarios.reduce((acc, u) => { Object.entries(u.areas).forEach(([a, n]) => { acc[a] = (acc[a] || 0) + n }); return acc }, {})
  ).sort((a, b) => b[1] - a[1]).map(([a]) => a)
  const totalCambios = usuarios.reduce((t, u) => t + u.total, 0)
  const maximo = Math.max(1, ...usuarios.flatMap((u) => Object.values(u.areas)))
  const masActiva = usuarios[0]
  const empresasTotal = usuarios.reduce((t, u) => t + (u.resumen?.empresas ?? 0), 0)

  return (
    <section className="bg-white rounded-2xl border border-[#e2e4ef] shadow-sm overflow-hidden mb-4">
      <div className="px-5 py-3.5 border-b border-[#e2e4ef]">
        <h2 className="text-sm font-bold text-[#191c1e]">Resumen del equipo</h2>
        <p className="text-xs text-[#6b7280] mt-0.5">
          {plural(usuarios.length, 'persona hizo', 'personas hicieron')} {plural(totalCambios, 'cambio', 'cambios')}
          {usuarios.length > 1 && masActiva ? `. La que más: ${masActiva.nombre} (${masActiva.total}).` : '.'}
          {empresasTotal > 0 && ' Los números de cada celda son cambios guardados.'}
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] font-bold text-[#434655] uppercase tracking-wide bg-[#f8f9fc]">
              <th className="px-5 py-2.5">Persona</th>
              <th className="px-3 py-2.5 text-center">Total</th>
              <th className="px-3 py-2.5 text-center">Empresas</th>
              {areas.map((a) => <th key={a} className="px-2 py-2.5 text-center">{a}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#f1f2f6]">
            {usuarios.map((u) => (
              <tr key={u.userId ?? 'sistema'}>
                <td className="px-5 py-2.5">
                  <div className="flex items-center gap-2.5"><Avatar nombre={u.nombre} /><span className="font-semibold text-[#191c1e]">{u.nombre}</span></div>
                </td>
                <td className="px-3 py-2.5 text-center tabular-nums font-bold text-[#191c1e]">{u.total}</td>
                <td className="px-3 py-2.5 text-center tabular-nums text-[#434655]">{u.resumen?.empresas || '·'}</td>
                {areas.map((a) => {
                  const n = u.areas[a] || 0
                  return (
                    <td key={a} className="px-2 py-2.5 text-center tabular-nums">
                      {n ? <span className="inline-block min-w-[2rem] px-2 py-1 rounded-md font-semibold text-[#003B43]" style={{ background: `rgba(0,59,67,${0.08 + (n / maximo) * 0.32})` }}>{n}</span> : <span className="text-[#d1d5db]">·</span>}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
          {usuarios.length > 1 && (
            <tfoot>
              <tr className="bg-[#f8f9fc] font-bold text-[#191c1e]">
                <td className="px-5 py-2.5">Total del equipo</td>
                <td className="px-3 py-2.5 text-center tabular-nums">{totalCambios}</td>
                <td className="px-3 py-2.5" />
                {areas.map((a) => <td key={a} className="px-2 py-2.5 text-center tabular-nums">{usuarios.reduce((t, u) => t + (u.areas[a] || 0), 0)}</td>)}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </section>
  )
}

function ResumenPersona({ persona }) {
  const r = persona.resumen
  if (!r) return null
  const conEstado = ESTADOS.filter((e) => r[e.clave] > 0)
  const frase = conEstado.length
    ? `${plural(r.hecho + r.proceso + r.noaplica + r.pendiente, 'casilla quedó', 'casillas quedaron')}: ${conEstado.map((e) => `${r[e.clave]} ${e.label}`).join(', ')}.`
    : 'No marcó procesos con estado este día.'
  // Agrupa las filas por área, en el orden en que llegan (ya vienen ordenadas por área).
  const porArea = r.items.reduce((acc, it) => { (acc[it.area] ||= []).push(it); return acc }, {})

  return (
    <section className="bg-white rounded-2xl border border-[#e2e4ef] shadow-sm overflow-hidden mb-4">
      <div className="px-5 py-3.5 border-b border-[#e2e4ef]">
        <h2 className="text-sm font-bold text-[#191c1e]">Resumen de {persona.nombre}</h2>
        <p className="text-xs text-[#6b7280] mt-0.5">
          {plural(r.cambios, 'cambio guardado', 'cambios guardados')}{r.empresas > 0 ? ` en ${plural(r.empresas, 'empresa', 'empresas')}` : ''}. {frase}
        </p>
      </div>
      <div className="flex flex-wrap gap-2 px-5 py-3 border-b border-[#f1f2f6]">
        {ESTADOS.map((e) => (
          <div key={e.clave} className="flex items-center gap-2 px-3 py-1.5 rounded-lg" style={{ background: e.bg, color: e.fg, opacity: r[e.clave] ? 1 : 0.45 }}>
            <span className="text-lg font-bold tabular-nums leading-none">{r[e.clave]}</span>
            <span className="text-xs font-semibold">{e.label}</span>
          </div>
        ))}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] font-bold text-[#434655] uppercase tracking-wide bg-[#f8f9fc]">
              <th className="px-5 py-2.5">Proceso</th>
              {ESTADOS.map((e) => <th key={e.clave} className="px-3 py-2.5 text-center whitespace-nowrap">{e.label}</th>)}
              <th className="px-3 py-2.5 text-center">Empresas</th>
              <th className="px-3 py-2.5 text-center">Cambios</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(porArea).map(([area, filas]) => (
              <FragmentoArea key={area} area={area} filas={filas} />
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-[#f8f9fc] font-bold text-[#191c1e]">
              <td className="px-5 py-2.5">Total</td>
              {ESTADOS.map((e) => <td key={e.clave} className="px-3 py-2.5 text-center tabular-nums">{r[e.clave]}</td>)}
              <td className="px-3 py-2.5 text-center tabular-nums">{r.empresas || '·'}</td>
              <td className="px-3 py-2.5 text-center tabular-nums">{r.cambios}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="px-5 py-3 text-[11px] text-[#9ca3af] border-t border-[#f1f2f6]">
        Los estados cuentan empresas según cómo quedó cada casilla al final del día. «Cambios» cuenta todas las veces que se guardó: si es mayor que las empresas, hubo correcciones.
      </p>
    </section>
  )
}

function FragmentoArea({ area, filas }) {
  return (
    <>
      <tr className="bg-[#fbfbfd]"><td colSpan={7} className="px-5 pt-3 pb-1 text-[11px] font-bold uppercase tracking-wide text-[#6b7280]">{area}</td></tr>
      {filas.map((f) => (
        <tr key={`${area}-${f.item}`} className="border-t border-[#f1f2f6]">
          <td className="px-5 py-2 text-[#191c1e]">{f.item}</td>
          {ESTADOS.map((e) => <td key={e.clave} className="px-3 py-2 text-center"><Pastilla valor={f[e.clave]} estado={e} /></td>)}
          <td className="px-3 py-2 text-center tabular-nums text-[#434655]">{f.empresas || '·'}</td>
          <td className="px-3 py-2 text-center tabular-nums font-semibold text-[#191c1e]">{f.cambios}</td>
        </tr>
      ))}
    </>
  )
}

export default function ResumenActividad({ usuarios, persona }) {
  if (!usuarios.length) return null
  if (persona === 'todas') return <ResumenEquipo usuarios={usuarios} />
  const p = usuarios.find((u) => (u.userId ?? 'sistema') === persona)
  return p ? <ResumenPersona persona={p} /> : null
}
