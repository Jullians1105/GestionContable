import { useState, useRef, useCallback, useEffect } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { useNotifications } from '../context/NotificationContext'
import TaskModal from './TaskModal'
import logoBlanco from '../assets/logo-icono-blanco.png'
import { navItems, modules, MODULE_TITLES, DIAN_NAV, EMPRESAS_MAESTRO_NAV, FONDO_NAV, moduleForPath } from '../config/navigation'

export default function Sidebar({ open, onClose }) {
  const { isAdmin, isLeader, hasPermission } = useAuth()
  const { addToast } = useToast()
  const { unreadCount } = useNotifications()
  const location = useLocation()
  const [showModal, setShowModal] = useState(false)
  const [activeModule, setActiveModule] = useState(() => moduleForPath(location.pathname))

  // Re-sincroniza cuando la ruta cambia por fuera de un clic en el ícono de
  // módulo (F5, link externo al sidebar, atrás/adelante). Un clic en el
  // ícono de módulo no navega, así que no dispara este efecto — sigue
  // pudiéndose "previsualizar" el sub-nav de otro módulo sin salir de la
  // página actual.
  useEffect(() => {
    setActiveModule(moduleForPath(location.pathname))
  }, [location.pathname])

  // Disparador de expandir la Columna 2 — a propósito NO es un `:hover` CSS en toda la
  // columna: esa columna, colapsada, sigue ocupando la franja del header (invisible ahí,
  // pero el hitbox del mouse seguía "vivo"), así que pasar el mouse rápido sobre el
  // wordmark del Header (que invade ese hueco) disparaba la expansión sin querer — se
  // veía como una línea blanca moviéndose sobre el logo. Con este estado, el listener de
  // mouse solo vive en la franja de abajo (los íconos de navegación reales), donde sí
  // tiene sentido que pasar el mouse abra el panel. Ya no hay opción de "fijar" (pin) —
  // el botón se quitó porque vivía en la franja de arriba, fuera de esa zona de trigger,
  // así que quedaba inalcanzable (aparecía y desaparecía antes de poder hacer clic).
  const [navHover, setNavHover] = useState(false)
  const expandido = navHover

  const visible = navItems.filter(item => {
    if (item.leaderOnly && !isAdmin() && !isLeader()) return false
    if (item.to === '/reports' && !isAdmin() && !isLeader()) return false
    if (item.to === '/workload' && !isAdmin() && !isLeader()) return false
    if (item.to === '/groups' && !isAdmin() && !isLeader()) return false
    if (item.to === '/usuarios' && !isAdmin()) return false
    return true
  })

  const activeModuleMeta = modules.find(m => m.id === activeModule)

  const navForModule =
    activeModule === 'tasks'    ? visible       :
    activeModule === 'fondo'    ? FONDO_NAV     :
    activeModule === 'dian'     ? DIAN_NAV      :
    activeModule === 'empresas-directorio' ? EMPRESAS_MAESTRO_NAV :
    []

  const hasNav = navForModule.length > 0

  // Sin scrollbar visible (ver scrollbar-hide en index.css) el único indicio
  // de que el nav tiene más ítems ocultos es un degradado arriba/abajo, como
  // el "scroll shadow" de apps nativas — visible solo si de verdad hay algo
  // que scrollear en esa dirección, no un adorno fijo. Solo importa en la
  // práctica para el admin, que ve bastantes más ítems que un usuario normal.
  const navRef = useRef(null)
  const [scrollShadow, setScrollShadow] = useState({ top: false, bottom: false })

  const updateScrollShadow = useCallback(() => {
    const el = navRef.current
    if (!el) { setScrollShadow({ top: false, bottom: false }); return }
    setScrollShadow({
      top: el.scrollTop > 1,
      bottom: el.scrollTop + el.clientHeight < el.scrollHeight - 1,
    })
  }, [])

  // Recalcula al cambiar de módulo (la cantidad de ítems cambia) y al
  // redimensionar la ventana o cambiar el zoom (cambia clientHeight) — el
  // mismo tipo de ajuste de zoom que causaba el scroll horizontal.
  useEffect(() => {
    updateScrollShadow()
    window.addEventListener('resize', updateScrollShadow)
    return () => window.removeEventListener('resize', updateScrollShadow)
  }, [activeModule, hasNav, updateScrollShadow])

  // Shared label class: hidden when collapsed, revealed on hover
  const labelCls = expandido
    ? 'max-w-[180px] opacity-100'
    : 'max-w-0 opacity-0'

  return (
    <>
      <aside
        className={`fixed left-0 top-0 h-full z-50 flex transition-transform duration-300 ease-in-out ${
          open ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        {/* Column 1 – module icons (always 64 px) */}
        <div
          className="w-16 h-full flex flex-col items-center py-4 gap-1 flex-shrink-0 overflow-hidden bg-[#06272E]"
        >
          {/* Logo — navega al inicio */}
          <NavLink to="/" className="w-10 h-10 flex items-center justify-center mb-3 flex-shrink-0 -mt-0.5">
            <img
              src={logoBlanco}
              alt="Logo"
              className="w-9 h-9 object-contain"
            />
          </NavLink>
          {modules.map(({ id, label, icon }) => (
            <button
              key={id}
              onClick={() => setActiveModule(id)}
              title={label}
              className={`w-10 h-10 rounded-lg flex items-center justify-center transition-all ${
                activeModule === id
                  ? 'bg-[#E5A70C] text-[#20160A]'
                  : 'text-[#9fb4b3] hover:bg-[#0e3a42] hover:text-[#f3f1ea]'
              }`}
            >
              <span className="material-symbols-outlined text-xl">{icon}</span>
            </button>
          ))}
        </div>

        {/* Column 2 – nav content (collapses to 48 px, expands on hover). Sigue exactamente
            igual que siempre (h-full, desde arriba) — lo único que cambia es que colapsada NO
            tiene borde ni sombra propios (border-r-0 shadow-none), así queda invisible/mezclada
            con el blanco de atrás y el header se ve como una sola pieza sin línea divisoria. El
            borde y la sombra vuelven solos al pasar el mouse por los íconos de abajo (navHover)
            — ya no por CSS `:hover` en toda la columna, ver `expandido` más arriba: esta franja
            de aquí (el header interno) invade el hueco del wordmark de Header.jsx, y un `:hover`
            en toda la columna disparaba la expansión con solo pasar el mouse sobre el logo, sin
            querer. */}
        <div
          className={`sidebar-nav-expand h-full flex flex-col ${
            expandido
              ? 'w-[250px] bg-white border-r border-[#e3e0d8] shadow-[2px_0_12px_rgba(0,0,0,0.07)]'
              : 'w-12 bg-transparent border-r-0 shadow-none'
          }`}
        >
          {/* Header row — el fondo blanco sigue siendo del propio wrapper de arriba, no
              de acá: mismo criterio de "transparente colapsada" que la columna entera, para
              que el logo del Header (que invade este hueco, ver Header.jsx) se vea completo
              en reposo. El borde inferior también queda condicionado, si no se notaría como
              una línea suelta aunque el resto esté transparente. pointer-events-none mientras
              está colapsada: por las dudas, para que el mouse literalmente no pueda interactuar
              con esta franja (ni disparar nada) mientras el logo la está usando — el clic/hover
              cae directo al buscador del Header, que está detrás. */}
          <div
            className={`flex items-center gap-1 pl-3 pr-2 h-16 flex-shrink-0 border-b transition-colors duration-200 ${
              expandido ? 'border-[#e3e0d8] pointer-events-auto' : 'border-transparent pointer-events-none'
            }`}
          >
            <div
              className={`sidebar-title-reveal flex items-center gap-2.5 overflow-hidden ${
                expandido ? 'max-w-[210px] opacity-100' : 'max-w-0 opacity-0'
              }`}
            >
              <span className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 bg-[#E3EEEE]">
                <span className="material-symbols-outlined text-lg text-[#E5A70C]">
                  {modules.find((m) => m.id === activeModule)?.icon}
                </span>
              </span>
              <span className="text-[15px] font-bold tracking-tight text-[#191c1e] whitespace-nowrap">
                {MODULE_TITLES[activeModule]}
              </span>
            </div>
            {/* spacer that only exists when expanded */}
            <span
              className={`transition-[flex] duration-200 ${expandido ? 'flex-1' : ''}`}
            />
            <button
              onClick={onClose}
              className="lg:hidden flex-shrink-0 p-1.5 rounded-lg hover:bg-[#edeef0] text-[#434655] transition"
            >
              <span className="material-symbols-outlined text-xl">close</span>
            </button>
          </div>

          {/* Nav links — envuelto en su propio fondo blanco opaco (a diferencia de la
              columna que lo contiene, que ahora va transparente colapsada, ver arriba):
              acá sí hay contenido siempre visible (los íconos de cada NavLink, incluso
              colapsado, sin su etiqueta) y necesita quedar contra blanco de verdad, no
              transparente sobre lo que sea que haya detrás en la página. Por eso este
              pedazo SÍ conserva el border-r y la sombra fijos de siempre (a diferencia de
              la franja del header, que va sin ninguno de los dos) — sigue diferenciando
              dónde termina el sidebar del contenido principal, como antes. También es acá
              (y solo acá, no en la franja del header) donde vive el onMouseEnter/Leave que
              dispara navHover — ver el comentario junto a `expandido` más arriba. */}
          <div
            onMouseEnter={() => setNavHover(true)}
            onMouseLeave={() => setNavHover(false)}
            className="flex-1 flex flex-col overflow-hidden bg-white border-r border-[#e3e0d8] shadow-[2px_0_12px_rgba(0,0,0,0.07)]"
          >
          {hasNav ? (
            <>
              {/* overflow-x-hidden explícito: si solo se fija overflow-y-auto,
                  la spec de CSS obliga a que el otro eje (que por default
                  queda en `visible`) también pase a `auto` — cualquier
                  desborde de subpíxel (típico en flex + gap + los max-width
                  que transicionan con el hover) dispara entonces una barra
                  horizontal aunque no haya contenido real que la justifique.
                  Pasa siempre que el navegador tenga scrollbars clásicos (no
                  overlay), independiente del nivel de zoom — no es un tema de
                  zoom, es este eje quedando en auto por accidente.

                  scrollbar-hide (ver index.css): el scroll vertical solo
                  aparece con muchos ítems de menú (el caso del admin, que ve
                  bastantes más que un usuario normal) y el scrollbar clásico
                  de Windows con flechitas se ve mal en una columna angosta.
                  Se oculta la barra pero el scroll sigue andando con la rueda
                  del mouse/trackpad, colapsado o expandido. En su lugar, un
                  degradado arriba/abajo (ver scrollShadow) avisa cuando hay
                  más ítems ocultos para scrollear.

                  min-h-0 en el wrapper: sin esto un hijo flex con contenido
                  que desborda puede terminar más alto que el contenedor,
                  ignorando el overflow-y-auto de adentro — el bug clásico de
                  flexbox + scroll. */}
              <div className="relative flex-1 min-h-0">
                <nav
                  ref={navRef}
                  onScroll={updateScrollShadow}
                  className="h-full flex flex-col gap-0.5 overflow-y-auto overflow-x-hidden scrollbar-hide py-2 px-2"
                >
                  {navForModule.map(({ to, label, icon, end }) => (
                    <NavLink
                      key={to}
                      to={to}
                      end={end}
                      onClick={onClose}
                      className={({ isActive }) =>
                        `flex items-center gap-3 py-2 rounded-lg text-xs font-semibold transition-all duration-150 ${
                          isActive
                            ? 'bg-[#FBEAC0] text-[#003B43]'
                            : 'text-[#434655] hover:bg-[#edeef0]'
                        }`
                      }
                    >
                      <span className="relative w-8 flex items-center justify-center flex-shrink-0">
                        <span className="material-symbols-outlined text-xl text-[#003B43]">{icon}</span>
                        {to === '/notifications' && unreadCount > 0 && (
                          <span
                            className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-1 rounded-full flex items-center justify-center text-[9px] font-bold text-white"
                            style={{ background: '#EF4444' }}
                          >
                            {unreadCount > 9 ? '9+' : unreadCount}
                          </span>
                        )}
                      </span>
                      <span
                        className={`whitespace-nowrap overflow-hidden transition-[max-width,opacity] duration-150 ${labelCls}`}
                      >
                        {label}
                      </span>
                    </NavLink>
                  ))}
                </nav>

                {/* pointer-events-none: son puramente decorativos, un clic
                    ahí debe llegar al nav de abajo (para poder seguir
                    scrolleando arrastrando, o para no bloquear el último
                    ítem visible bajo el degradado inferior). */}
                {scrollShadow.top && (
                  <div className="pointer-events-none absolute top-0 inset-x-0 h-4 bg-gradient-to-b from-white to-transparent" />
                )}
                {scrollShadow.bottom && (
                  <div className="pointer-events-none absolute bottom-0 inset-x-0 h-4 bg-gradient-to-t from-white to-transparent" />
                )}
              </div>

              {activeModule === 'tasks' && (
                <div className="px-2 pb-4 flex-shrink-0">
                  <button
                    onClick={() => {
                      if (hasPermission('canCreateTask')) setShowModal(true)
                      else addToast('No tienes permiso para crear tareas', 'error')
                    }}
                    className="w-full h-10 rounded-lg text-xs font-semibold flex items-center gap-3 hover:opacity-90 transition active:scale-[0.97] overflow-hidden"
                    style={{ background: '#E5A70C', color: '#20160A' }}
                  >
                    {/* Mismo slot w-8 que el ícono de los NavLink de arriba (línea
                        ~205) en vez de centrar todo el contenido con
                        justify-center: con justify-center el "+" se corría al
                        pasar el mouse, porque el centro del bloque ícono+texto
                        se mueve cuando el texto pasa de 0 a "Nueva Tarea" — con
                        un slot fijo el ícono queda anclado en la misma posición
                        colapsado y expandido. */}
                    <span className="w-8 flex items-center justify-center flex-shrink-0">
                      <span className="material-symbols-outlined text-lg">add</span>
                    </span>
                    <span
                      className={`whitespace-nowrap overflow-hidden transition-[max-width,opacity] duration-150 ${labelCls}`}
                    >
                      Nueva Tarea
                    </span>
                  </button>
                </div>
              )}
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 overflow-hidden px-2">
              <span className="material-symbols-outlined text-5xl text-white/20 flex-shrink-0">
                {activeModuleMeta?.icon}
              </span>
              <span
                className={`text-xs text-center font-semibold text-[#cfe3e1] whitespace-nowrap overflow-hidden transition-[max-width,opacity] duration-150 ${labelCls}`}
              >
                Próximamente
              </span>
            </div>
          )}
          </div>
        </div>

      </aside>

      {showModal && <TaskModal onClose={() => setShowModal(false)} />}
    </>
  )
}
