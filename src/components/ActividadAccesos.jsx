import { useCallback, useEffect, useState } from 'react'
import { api } from '../services/api'
import Cargando from './Cargando'
import { getInitials, getAvatarColor } from '../utils/helpers'

// Pestaña "Accesos" de Actividad: cómo usa el equipo la aplicación (quién entra, cuándo y cuánto),
// más los intentos de inicio de sesión fallidos. Lee /api/actividad/accesos. Los tiempos son
// estimaciones: "horas conectadas" cuenta las horas distintas en las que hubo alguna señal de uso
// (inicio de sesión, sesión renovada o algo guardado), no cuánto estuvo abierta la pestaña.

const ZONA = 'America/Bogota'
const PERIODOS = [
  { dias: 1, label: 'Un día' },
  { dias: 7, label: '7 días' },
  { dias: 30, label: '30 días' },
]

const hoyBogota = () => new Intl.DateTimeFormat('en-CA', { timeZone: ZONA }).format(new Date())
const fmtHora = (iso) => new Intl.DateTimeFormat('es-CO', { timeZone: ZONA, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso))
const fmtDiaHora = (iso) => new Intl.DateTimeFormat('es-CO', { timeZone: ZONA, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso))
const fmtFechaCorta = (fecha) => {
  const [a, m, d] = fecha.split('-').map(Number)
  return new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(a, m - 1, d)))
}

function Kpi({ titulo, valor, detalle, color = '#003B43' }) {
  return (
    <div className="bg-white rounded-2xl border border-[#e2e4ef] shadow-sm px-5 py-4">
      <p className="text-xs font-semibold text-[#6b7280]">{titulo}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums" style={{ color }}>{valor}</p>
      {detalle && <p className="mt-0.5 text-xs text-[#6b7280]">{detalle}</p>}
    </div>
  )
}

function Barras({ datos, etiqueta, maximo }) {
  return (
    <div className="flex items-end gap-1 h-28">
      {datos.map((d) => (
        <div key={d.clave} className="flex-1 min-w-0 flex flex-col items-center justify-end h-full" title={`${d.titulo}: ${d.valor}`}>
          <span className="text-[10px] tabular-nums text-[#6b7280] mb-0.5">{d.valor || ''}</span>
          <div
            className="w-full rounded-t"
            style={{ height: `${maximo ? Math.max((d.valor / maximo) * 100, d.valor ? 6 : 0) : 0}%`, background: '#003B43', opacity: d.valor ? 1 : 0.15, minHeight: d.valor ? 3 : 1 }}
          />
          <span className="text-[10px] text-[#9ca3af] mt-1 h-3">{etiqueta(d)}</span>
        </div>
      ))}
    </div>
  )
}

export default function ActividadAccesos() {
  const hoy = hoyBogota()
  const [dias, setDias] = useState(7)
  const [hasta, setHasta] = useState(hoy)
  const [datos, setDatos] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')

  const cargar = useCallback(async () => {
    setCargando(true)
    setError('')
    try {
      setDatos(await api.getActividadAccesos({ hasta, dias }))
    } catch (err) {
      setDatos(null)
      setError(err.message || 'No se pudo cargar la información de accesos')
    } finally {
      setCargando(false)
    }
  }, [hasta, dias])

  useEffect(() => { cargar() }, [cargar])

  const periodoTxt = datos
    ? (datos.dias === 1 ? fmtFechaCorta(datos.hasta) : `${fmtFechaCorta(datos.desde)} – ${fmtFechaCorta(datos.hasta)}`)
    : ''

  const horas = datos ? Array.from({ length: 24 }, (_, h) => {
    const f = datos.porHora.find((x) => x.hora === h)
    return { clave: h, titulo: `${String(h).padStart(2, '0')}:00`, valor: f ? f.personas : 0 }
  }) : []
  // Solo el tramo de horas donde hubo uso (con un margen), para que las barras sean legibles.
  const conUso = horas.filter((h) => h.valor > 0).map((h) => h.clave)
  const hIni = conUso.length ? Math.max(Math.min(...conUso) - 1, 0) : 6
  const hFin = conUso.length ? Math.min(Math.max(...conUso) + 1, 23) : 20
  const horasVisibles = horas.filter((h) => h.clave >= hIni && h.clave <= hFin)
  const maxHora = Math.max(0, ...horasVisibles.map((h) => h.valor))
  const maxHorasPersona = datos ? Math.max(1, ...datos.personas.map((p) => p.horasConectadas)) : 1
  const hayIp = datos?.fallidos.some((f) => f.ip)

  return (
    <div>
      <div className="flex items-center gap-2 flex-wrap mb-5">
        <div className="inline-flex rounded-lg border border-[#d1d5db] bg-white overflow-hidden" role="group" aria-label="Período">
          {PERIODOS.map((p) => (
            <button
              key={p.dias}
              onClick={() => setDias(p.dias)}
              aria-pressed={dias === p.dias}
              className={`h-9 px-3.5 text-sm font-semibold transition ${dias === p.dias ? 'bg-[#003B43] text-white' : 'text-[#434655] hover:bg-[#f3f4f6]'}`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-sm text-[#434655]">
          {dias === 1 ? 'Día' : 'Hasta'}
          <input
            type="date"
            value={hasta}
            max={hoy}
            onChange={(e) => e.target.value && setHasta(e.target.value)}
            className="h-9 px-3 rounded-lg border border-[#d1d5db] bg-white text-sm text-[#191c1e]"
          />
        </label>
        {hasta !== hoy && (
          <button onClick={() => setHasta(hoy)} className="h-9 px-3 rounded-lg text-xs font-semibold text-[#003B43] hover:bg-[#E3EEEE] transition">Hoy</button>
        )}
        <button
          onClick={cargar}
          disabled={cargando}
          title="Actualizar"
          aria-label="Actualizar"
          className="w-9 h-9 rounded-lg border border-[#d1d5db] bg-white flex items-center justify-center hover:bg-[#f3f4f6] transition disabled:opacity-50 ml-auto"
        >
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>refresh</span>
        </button>
      </div>

      {cargando ? (
        <Cargando texto="Cargando accesos…" />
      ) : error ? (
        <div className="rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3">{error}</div>
      ) : datos && (
        <div className="flex flex-col gap-5">
          <p className="text-sm font-semibold text-[#434655]">{periodoTxt}</p>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Kpi titulo="Personas que entraron" valor={`${datos.resumen.personasActivas} de ${datos.resumen.personasTotal}`}
              detalle={datos.resumen.personasTotal - datos.resumen.personasActivas > 0 ? `${datos.resumen.personasTotal - datos.resumen.personasActivas} sin actividad` : 'Todas entraron'} />
            <Kpi titulo="Inicios de sesión" valor={datos.resumen.inicios} />
            <Kpi titulo="Intentos fallidos" valor={datos.resumen.fallidos}
              color={datos.resumen.fallidos > 0 ? '#b45309' : '#003B43'}
              detalle={datos.resumen.fallidosCorreoDesconocido > 0 ? `${datos.resumen.fallidosCorreoDesconocido} con un correo que no existe` : 'Todos de usuarios registrados'} />
            <Kpi titulo="Horas conectadas (suma)" valor={datos.personas.reduce((t, p) => t + p.horasConectadas, 0)} detalle="Estimado entre todo el equipo" />
          </div>

          <section className="bg-white rounded-2xl border border-[#e2e4ef] shadow-sm overflow-hidden">
            <h2 className="px-5 py-3.5 text-sm font-bold text-[#191c1e] border-b border-[#e2e4ef]">Uso por persona</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] font-bold text-[#434655] uppercase tracking-wide bg-[#f8f9fc]">
                    <th className="px-5 py-2.5">Persona</th>
                    {datos.dias > 1 && <th className="px-3 py-2.5">Días activos</th>}
                    <th className="px-3 py-2.5">Horas conectadas</th>
                    <th className="px-3 py-2.5">Inicios</th>
                    <th className="px-3 py-2.5">Acciones</th>
                    <th className="px-3 py-2.5">{datos.dias === 1 ? 'Primer acceso' : 'Primera vez'}</th>
                    <th className="px-3 py-2.5">Última vez</th>
                    <th className="px-3 py-2.5">Fallidos</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f1f2f6]">
                  {datos.personas.map((p) => {
                    const sin = p.horasConectadas === 0
                    return (
                      <tr key={p.userId} className={sin ? 'text-[#9ca3af]' : 'text-[#191c1e]'}>
                        <td className="px-5 py-2.5">
                          <div className="flex items-center gap-2.5">
                            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0 ${getAvatarColor(p.nombre)} ${sin ? 'opacity-40' : ''}`}>{getInitials(p.nombre)}</div>
                            <span className="font-semibold">{p.nombre}</span>
                          </div>
                        </td>
                        {datos.dias > 1 && <td className="px-3 py-2.5 tabular-nums">{p.diasActivos} de {datos.dias}</td>}
                        <td className="px-3 py-2.5">
                          {sin ? <span className="text-xs italic">Sin actividad</span> : (
                            <div className="flex items-center gap-2">
                              <span className="tabular-nums w-6">{p.horasConectadas}</span>
                              <div className="h-1.5 w-20 rounded-full bg-[#eef0f6] overflow-hidden"><div className="h-full rounded-full" style={{ width: `${(p.horasConectadas / maxHorasPersona) * 100}%`, background: '#003B43' }} /></div>
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2.5 tabular-nums">{p.iniciosSesion}</td>
                        <td className="px-3 py-2.5 tabular-nums">{p.acciones}</td>
                        <td className="px-3 py-2.5 tabular-nums">{p.primerAcceso ? (datos.dias === 1 ? fmtHora(p.primerAcceso) : fmtDiaHora(p.primerAcceso)) : '—'}</td>
                        <td className="px-3 py-2.5 tabular-nums">{p.ultimoAcceso ? (datos.dias === 1 ? fmtHora(p.ultimoAcceso) : fmtDiaHora(p.ultimoAcceso)) : '—'}</td>
                        <td className={`px-3 py-2.5 tabular-nums ${p.fallidos > 0 ? 'text-amber-700 font-semibold' : ''}`}>{p.fallidos || '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <div className={`grid gap-5 ${datos.dias > 1 ? 'lg:grid-cols-2' : ''}`}>
            <section className="bg-white rounded-2xl border border-[#e2e4ef] shadow-sm px-5 py-4">
              <h2 className="text-sm font-bold text-[#191c1e]">A qué horas se usa</h2>
              <p className="text-xs text-[#6b7280] mb-3">{datos.dias === 1 ? 'Personas conectadas en cada hora.' : 'Suma de personas conectadas en cada hora, de todos los días del período.'}</p>
              {maxHora === 0 ? <p className="text-sm text-[#9ca3af] italic py-6 text-center">Sin actividad en este período.</p> : (
                <Barras datos={horasVisibles} maximo={maxHora} etiqueta={(d) => (d.clave % 2 === 0 ? d.clave : '')} />
              )}
            </section>
            {datos.dias > 1 && (
              <section className="bg-white rounded-2xl border border-[#e2e4ef] shadow-sm px-5 py-4">
                <h2 className="text-sm font-bold text-[#191c1e]">Personas activas por día</h2>
                <p className="text-xs text-[#6b7280] mb-3">Cuántas personas usaron la aplicación cada día.</p>
                <Barras
                  datos={Array.from({ length: datos.dias }, (_, i) => {
                    const [a, m, d] = datos.desde.split('-').map(Number)
                    const f = new Date(Date.UTC(a, m - 1, d + i)).toISOString().slice(0, 10)
                    return { clave: f, titulo: fmtFechaCorta(f), valor: datos.porDia.find((x) => x.fecha === f)?.personas ?? 0 }
                  })}
                  maximo={Math.max(1, datos.resumen.personasTotal)}
                  etiqueta={(d) => (datos.dias <= 7 || Number(d.clave.slice(8)) % 5 === 1 ? Number(d.clave.slice(8)) : '')}
                />
              </section>
            )}
          </div>

          <section className="bg-white rounded-2xl border border-[#e2e4ef] shadow-sm overflow-hidden">
            <h2 className="px-5 py-3.5 text-sm font-bold text-[#191c1e] border-b border-[#e2e4ef]">Intentos de inicio de sesión fallidos</h2>
            {datos.fallidos.length === 0 ? (
              <p className="px-5 py-8 text-sm text-[#9ca3af] italic text-center">Ningún intento fallido en este período.</p>
            ) : (
              <ul className="divide-y divide-[#f1f2f6]">
                {datos.fallidos.map((f) => (
                  <li key={`${f.cuando}-${f.correo}`} className="flex items-center gap-3 px-5 py-2.5 text-sm flex-wrap">
                    <span className="text-xs tabular-nums text-[#6b7280] w-24 flex-shrink-0">{fmtDiaHora(f.cuando)}</span>
                    <span className="text-[#191c1e] min-w-0 break-all">{f.correo}</span>
                    {f.nombre
                      ? <span className="text-xs text-[#6b7280]">({f.nombre} — contraseña incorrecta)</span>
                      : <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">Correo que no existe</span>}
                    {hayIp && f.ip && <span className="ml-auto text-xs tabular-nums text-[#9ca3af]">{f.ip}</span>}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <p className="text-xs text-[#9ca3af]">
            «Horas conectadas» es una estimación: cuenta las horas distintas en las que hubo alguna señal de uso (inicio de sesión, sesión renovada o algo guardado).
            No mide cuánto tiempo estuvo abierta la pestaña sin usarse. Los fallidos con un correo que no existe suelen ser errores de escritura, pero muchos seguidos pueden indicar alguien probando correos.
          </p>
        </div>
      )}
    </div>
  )
}
