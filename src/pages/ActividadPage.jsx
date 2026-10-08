import { useCallback, useEffect, useMemo, useState } from 'react'
import { api } from '../services/api'
import { useAuth } from '../context/AuthContext'
import Cargando from '../components/Cargando'
import { getInitials, getAvatarColor } from '../utils/helpers'
import { puedeVerActividad } from '../utils/permissions'
import ActividadAccesos from '../components/ActividadAccesos'
import ResumenActividad from '../components/ResumenActividad'
import LineaDelDia from '../components/LineaDelDia'

// Registro de actividad del equipo: qué hizo cada persona en un día. Lee /api/actividad (que ya
// viene traducido a frases) y lo agrupa por persona. Solo lectura. Acceso: admin, o quien tenga el
// permiso "Ver registro de actividad" (Usuarios → Permisos).

const ZONA = 'America/Bogota'
const EVENTOS_VISIBLES = 8 // por persona, antes de "Ver todas"

const hoyBogota = () => new Intl.DateTimeFormat('en-CA', { timeZone: ZONA }).format(new Date())

// Suma o resta días a una fecha AAAA-MM-DD sin pasar por zonas horarias.
function moverDia(fecha, dias) {
  const [a, m, d] = fecha.split('-').map(Number)
  const f = new Date(Date.UTC(a, m - 1, d + dias))
  return f.toISOString().slice(0, 10)
}

function fechaLarga(fecha) {
  const [a, m, d] = fecha.split('-').map(Number)
  const txt = new Intl.DateTimeFormat('es-CO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(Date.UTC(a, m - 1, d)))
  return txt.charAt(0).toUpperCase() + txt.slice(1)
}

const AREA_COLOR = {
  'Fondo Emprender': { bg: '#E3EEEE', fg: '#003B43' },
  'Empresas Externas': { bg: '#fef3c7', fg: '#92400e' },
  'Nómina Electrónica': { bg: '#dbe1ff', fg: '#2563eb' },
  'Claves DIAN': { bg: '#ffdad6', fg: '#93000a' },
  'Deudas DIAN': { bg: '#ffedd5', fg: '#9a3412' },
  Pagos: { bg: '#dcfce7', fg: '#166534' },
  Directorio: { bg: '#e0e7ff', fg: '#3730a3' },
  Tareas: { bg: '#f3f4f6', fg: '#374151' },
}
const colorArea = (area) => AREA_COLOR[area] ?? { bg: '#f3f4f6', fg: '#374151' }

function ChipArea({ area, cantidad }) {
  const c = colorArea(area)
  return (
    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap" style={{ background: c.bg, color: c.fg }}>
      {area}{cantidad != null ? ` · ${cantidad}` : ''}
    </span>
  )
}

function TarjetaPersona({ persona }) {
  const [verTodas, setVerTodas] = useState(false)
  const eventos = verTodas ? persona.eventos : persona.eventos.slice(0, EVENTOS_VISIBLES)
  const restantes = persona.eventos.length - EVENTOS_VISIBLES

  return (
    <section className="bg-white rounded-2xl border border-[#e2e4ef] shadow-sm overflow-hidden">
      <header className="flex items-center gap-3 px-5 py-4 border-b border-[#e2e4ef] flex-wrap">
        <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0 ${getAvatarColor(persona.nombre)}`}>
          {getInitials(persona.nombre)}
        </div>
        <div className="min-w-0">
          <h2 className="text-sm font-bold text-[#191c1e] truncate">{persona.nombre}</h2>
          <p className="text-xs text-[#6b7280]">{persona.total} {persona.total === 1 ? 'acción' : 'acciones'}</p>
        </div>
        <div className="flex flex-wrap gap-1.5 ml-auto">
          {Object.entries(persona.areas).sort((a, b) => b[1] - a[1]).map(([area, cantidad]) => (
            <ChipArea key={area} area={area} cantidad={cantidad} />
          ))}
        </div>
      </header>
      <ul className="divide-y divide-[#f1f2f6]">
        {eventos.map((e) => (
          <li key={e.id} className="flex items-start gap-3 px-5 py-2.5">
            <span className="text-xs tabular-nums text-[#6b7280] w-11 flex-shrink-0 pt-0.5">{e.hora}</span>
            <span className="text-sm text-[#191c1e] flex-1 min-w-0 break-words">{e.texto}</span>
            <span className="hidden sm:block flex-shrink-0"><ChipArea area={e.area} /></span>
          </li>
        ))}
      </ul>
      {restantes > 0 && (
        <button
          onClick={() => setVerTodas((v) => !v)}
          className="w-full py-2.5 text-xs font-semibold text-[#003B43] hover:bg-[#f8f9fc] border-t border-[#e2e4ef] transition"
        >
          {verTodas ? 'Ver menos' : `Ver todas (${persona.eventos.length})`}
        </button>
      )}
    </section>
  )
}

function AccionesDelDia() {
  const hoy = hoyBogota()
  const [fecha, setFecha] = useState(hoy)
  const [datos, setDatos] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [persona, setPersona] = useState('todas')

  const cargar = useCallback(async () => {
    setCargando(true)
    setError('')
    try {
      setDatos(await api.getActividad({ fecha }))
    } catch (err) {
      setDatos(null)
      setError(err.message || 'No se pudo cargar la actividad')
    } finally {
      setCargando(false)
    }
  }, [fecha])

  useEffect(() => { cargar() }, [cargar])
  useEffect(() => { setPersona('todas') }, [fecha])

  const personas = useMemo(() => datos?.usuarios ?? [], [datos])
  const visibles = persona === 'todas' ? personas : personas.filter((p) => (p.userId ?? 'sistema') === persona)

  return (
    <div>
      <div className="flex items-center gap-2 flex-wrap mb-5">
        <button
          onClick={() => setFecha((f) => moverDia(f, -1))}
          title="Día anterior"
          aria-label="Día anterior"
          className="w-9 h-9 rounded-lg border border-[#d1d5db] bg-white flex items-center justify-center hover:bg-[#f3f4f6] transition"
        >
          <span className="material-symbols-outlined" style={{ fontSize: 20 }}>chevron_left</span>
        </button>
        <input
          type="date"
          value={fecha}
          max={hoy}
          onChange={(e) => e.target.value && setFecha(e.target.value)}
          aria-label="Fecha"
          className="h-9 px-3 rounded-lg border border-[#d1d5db] bg-white text-sm text-[#191c1e]"
        />
        <button
          onClick={() => setFecha((f) => moverDia(f, 1))}
          disabled={fecha >= hoy}
          title="Día siguiente"
          aria-label="Día siguiente"
          className="w-9 h-9 rounded-lg border border-[#d1d5db] bg-white flex items-center justify-center hover:bg-[#f3f4f6] transition disabled:opacity-40 disabled:hover:bg-white"
        >
          <span className="material-symbols-outlined" style={{ fontSize: 20 }}>chevron_right</span>
        </button>
        {fecha !== hoy && (
          <button onClick={() => setFecha(hoy)} className="h-9 px-3 rounded-lg text-xs font-semibold text-[#003B43] hover:bg-[#E3EEEE] transition">
            Hoy
          </button>
        )}
        <select
          value={persona}
          onChange={(e) => setPersona(e.target.value)}
          aria-label="Persona"
          className="h-9 px-3 rounded-lg border border-[#d1d5db] bg-white text-sm text-[#191c1e]"
        >
          <option value="todas">Todas las personas</option>
          {personas.map((p) => <option key={p.userId ?? 'sistema'} value={p.userId ?? 'sistema'}>{p.nombre}</option>)}
        </select>
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

      <p className="text-sm font-semibold text-[#434655] mb-3">
        {fechaLarga(fecha)}
        {datos && <span className="font-normal text-[#6b7280]"> · {datos.total} {datos.total === 1 ? 'acción' : 'acciones'} de {personas.length} {personas.length === 1 ? 'persona' : 'personas'}</span>}
      </p>

      {cargando ? (
        <Cargando texto="Cargando actividad…" />
      ) : error ? (
        <div className="rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3">{error}</div>
      ) : visibles.length === 0 ? (
        <div className="bg-white rounded-2xl border border-[#e2e4ef] py-14 text-center">
          <span className="material-symbols-outlined text-[#9ca3af]" style={{ fontSize: 40 }}>event_busy</span>
          <p className="mt-2 text-sm text-[#6b7280]">Sin actividad registrada este día.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {datos?.truncado && (
            <p className="text-xs text-amber-700">Hay muchas acciones este día; se muestran las más recientes.</p>
          )}
          <ResumenActividad usuarios={personas} persona={persona} />
          <LineaDelDia usuarios={visibles} />
          <h2 className="text-sm font-bold text-[#434655] mt-2">Detalle por persona</h2>
          {visibles.map((p) => <TarjetaPersona key={p.userId ?? 'sistema'} persona={p} />)}
        </div>
      )}
    </div>
  )
}

const VISTAS = [
  { id: 'acciones', label: 'Acciones', icon: 'history', texto: 'Qué hizo cada persona, día por día.' },
  { id: 'accesos', label: 'Accesos', icon: 'login', texto: 'Cómo usa el equipo la aplicación: quién entra, cuándo y cuánto.' },
]

export default function ActividadPage() {
  const { user } = useAuth()
  const [vista, setVista] = useState('acciones')

  if (!puedeVerActividad(user)) {
    return (
      <div className="max-w-md mx-auto mt-24 text-center">
        <span className="material-symbols-outlined text-[#9ca3af]" style={{ fontSize: 48 }}>lock</span>
        <h1 className="mt-3 text-lg font-bold text-[#191c1e]">No tienes acceso a esta sección</h1>
        <p className="mt-1 text-sm text-[#6b7280]">Pídele al administrador el permiso «Ver registro de actividad».</p>
      </div>
    )
  }

  const actual = VISTAS.find((v) => v.id === vista)
  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-4">
        <h1 className="text-xl font-bold text-[#191c1e]">Actividad del equipo</h1>
        <p className="text-sm text-[#6b7280]">{actual.texto}</p>
      </div>
      <div className="flex items-center gap-6 mb-5 border-b border-[#e2e4ef]" role="tablist">
        {VISTAS.map((v) => (
          <button
            key={v.id}
            role="tab"
            aria-selected={vista === v.id}
            onClick={() => setVista(v.id)}
            className={`relative pb-3 text-sm flex items-center gap-1.5 transition ${vista === v.id ? 'font-bold text-[#003B43]' : 'font-semibold text-[#9ca3af] hover:text-[#434655]'}`}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>{v.icon}</span>
            {v.label}
            {vista === v.id && <span className="absolute left-0 right-0 -bottom-px h-[2.5px] rounded-full" style={{ background: '#E5A70C' }} />}
          </button>
        ))}
      </div>
      {vista === 'acciones' ? <AccionesDelDia /> : <ActividadAccesos />}
    </div>
  )
}
