import { useEffect, useMemo, useState } from "react"
import { Link } from "react-router-dom"
import { format } from "date-fns"
import { es } from "date-fns/locale"
import { normalizeAssignedTo } from "../utils/helpers"
import { useTasks } from "../hooks/useTasks"
import { useAuth } from "../context/AuthContext"
import { useToast } from "../context/ToastContext"
import { api } from "../services/api"
import { DIAN_NAV, FONDO_NAV } from "../config/navigation"
import TaskModal from "./TaskModal"

const PRIORITY_COLORS = { high: "#EF4444", medium: "#FBBF24", low: "#10B981" }
const MONO = { fontFamily: "'IBM Plex Mono', monospace" }

const PROGRESS_SEGMENTS = [
  { key: "pending", label: "Pendientes" },
  { key: "in_progress", label: "En progreso" },
  { key: "completed", label: "Completadas" },
]

// Accesos curados — no la lista completa de rutas (esa vive en el buscador del Header). Texto
// en verbo de acción ("Sube...", "Revisa...", "Registra..."), no solo el nombre del módulo —
// referencia: pantalla de bienvenida de Siigo (docs/guiaSiigo.png), donde cada acceso dice qué
// hacer, no dónde está. Todos con exactamente el mismo tamaño/tratamiento.
// Orden pedido explícitamente (2 columnas): fila por fila, Fondo | Externas, Sube reporte |
// Token, Nómina | Consolidado.
const ACCESOS = [
  { to: FONDO_NAV[0].to, icon: "table_chart", label: "Seguimiento mensual Fondo", desc: "Fondo Emprender · procesos contables", bg: "#fef3e2", accent: "#b45309" },
  { to: DIAN_NAV[5].to, icon: "domain", label: "Seguimiento mensual Externas", desc: "Empresas Externas · procesos contables", bg: "#eef3ff", accent: "#004ac6" },
  { to: DIAN_NAV[0].to, icon: "upload_file", label: "Sube tu reporte DIAN", desc: "Contabilidad · clasifica movimientos", bg: "#eef3ff", accent: "#004ac6" },
  { to: "/empresas", icon: "vpn_key", label: "Generar token Dian", desc: "Listado empresas", bg: "#e6f6f6", accent: "#0e7490" },
  { to: DIAN_NAV[6].to, icon: "badge", label: "Seguimiento Nómina Electrónica", desc: "Plazos y presentación mensual", bg: "#eef3ff", accent: "#004ac6" },
  { to: DIAN_NAV[1].to, icon: "query_stats", label: "Consulta el consolidado", desc: "Contabilidad · resumen mensual de ventas y gastos", bg: "#eef3ff", accent: "#004ac6" },
  { to: FONDO_NAV[2].to, icon: "payments", label: "Seguimiento pagos", desc: "Fondo Emprender · Pagos contador", bg: "#fef3e2", accent: "#b45309" },
  { to: DIAN_NAV[4].to, icon: "person_search", label: "Consulta Tercero", desc: "Contabilidad · busca información por NIT", bg: "#eef3ff", accent: "#004ac6" },
]

// Encabezado de tarjeta — sentence-case bold normal, igual que el resto de la app.
function LedgerHeading({ children, action }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <h2 className="text-base font-bold text-[#191c1e]">{children}</h2>
      {action}
    </div>
  )
}

export default function Dashboard() {
  const { tasks } = useTasks()
  const { user, isAdmin, isLeader, hasPermission } = useAuth()
  const { addToast } = useToast()

  // Mismo modal que ya usa Sidebar.jsx para "Nueva Tarea" — no uno nuevo. Mismo chequeo de
  // permiso (canCreateTask) y mismo mensaje de error si no lo tiene.
  const [showTaskModal, setShowTaskModal] = useState(false)
  const handleNewTask = () => {
    if (hasPermission("canCreateTask")) setShowTaskModal(true)
    else addToast("No tienes permiso para crear tareas", "error")
  }

  // Efecto de tarjetas apiladas (dash-stack) — controlado por estado en vez de :hover puro de
  // CSS: con :hover, la sombra se quedaba "pegada" en su posición desplazada después de pasar
  // el mouse varias veces (bug de CSS/navegador, no se resolvía ni con will-change ni con
  // backface-visibility). Con onMouseEnter/Leave + este estado, la posición de cada tarjeta
  // depende directamente de si React cree que está hovereada — no puede quedar desincronizada.
  const [hoveredCard, setHoveredCard] = useState(null)

  const [quickNote, setQuickNote] = useState("")
  const [savingNote, setSavingNote] = useState(false)

  const handleQuickNote = async () => {
    const text = quickNote.trim()
    if (!text || savingNote) return
    setSavingNote(true)
    try {
      // createPersonalNote solo acepta title (POST /personal-notes ignora content en el
      // backend) — el cuerpo de la nota se setea en un segundo paso con updatePersonalNote,
      // igual que hace el editor real al guardar el primer cambio.
      const created = await api.createPersonalNote({
        title: text.length > 60 ? `${text.slice(0, 60)}…` : text,
      })
      await api.updatePersonalNote(created.id, {
        content: [{ type: "paragraph", content: text }],
      })
      setQuickNote("")
      addToast("Nota guardada en Mis Notas", "success")
    } catch {
      addToast("No se pudo guardar la nota", "error")
    } finally {
      setSavingNote(false)
    }
  }

  const [quickPending, setQuickPending] = useState("")
  const [savingPending, setSavingPending] = useState(false)
  const [pendingTasks, setPendingTasks] = useState([])

  useEffect(() => {
    api.getPersonalTasks()
      .then((data) => setPendingTasks(Array.isArray(data) ? data.slice(0, 5) : []))
      .catch(() => {})
  }, [])

  const handleQuickPending = async () => {
    const text = quickPending.trim()
    if (!text || savingPending) return
    setSavingPending(true)
    try {
      const created = await api.createPersonalTask({ title: text })
      setPendingTasks((prev) => [created, ...prev].slice(0, 5))
      setQuickPending("")
      addToast("Pendiente guardado en Mis Pendientes", "success")
    } catch {
      addToast("No se pudo guardar el pendiente", "error")
    } finally {
      setSavingPending(false)
    }
  }

  const handleTogglePending = async (task) => {
    const nextCompleted = !task.completed
    setPendingTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, completed: nextCompleted } : t)))
    try {
      await api.updatePersonalTask(task.id, { completed: nextCompleted })
    } catch {
      setPendingTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, completed: !nextCompleted } : t)))
      addToast("No se pudo actualizar el pendiente", "error")
    }
  }

  const visibleTasks = (isAdmin() || isLeader())
    ? tasks
    : tasks.filter((t) => normalizeAssignedTo(t.assignedTo).includes(user?.id) || t.createdBy === user?.id)

  const stats = useMemo(() => ({
    total: visibleTasks.length,
    pending: visibleTasks.filter((t) => t.status === "pending").length,
    in_progress: visibleTasks.filter((t) => t.status === "in_progress").length,
    completed: visibleTasks.filter((t) => t.status === "completed").length,
  }), [visibleTasks])

  const completionPct = stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0

  const barData = useMemo(() => [
    { name: "Alta", value: visibleTasks.filter((t) => t.priority === "high").length, fill: PRIORITY_COLORS.high },
    { name: "Media", value: visibleTasks.filter((t) => t.priority === "medium").length, fill: PRIORITY_COLORS.medium },
    { name: "Baja", value: visibleTasks.filter((t) => t.priority === "low").length, fill: PRIORITY_COLORS.low },
  ], [visibleTasks])

  const primerNombre = user?.name?.split(" ")[0] || user?.name || ""
  const fechaHoy = (() => {
    const s = format(new Date(), "EEEE, d 'de' MMMM", { locale: es })
    return s.charAt(0).toUpperCase() + s.slice(1)
  })()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#191c1e]">
          {primerNombre ? `Hola, ${primerNombre}` : "Hola"}
        </h1>
        <p className="text-sm text-[#434655] mt-1">{fechaHoy}</p>
      </div>

      {/* Mismo lenguaje visual que el resto de la app (rounded-2xl, texto sentence-case). Quedan
          los números en IBM Plex Mono y el efecto de tarjetas apiladas + animación de entrada. */}
      <style>{`
        @keyframes dashCardIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        .dash-stack { animation: dashCardIn 480ms cubic-bezier(0.16, 1, 0.3, 1) both; isolation: isolate; }
        .dash-stack-shadow { transition: transform 320ms cubic-bezier(0.16, 1, 0.3, 1); }
        .dash-stack-front { transition: transform 320ms cubic-bezier(0.16, 1, 0.3, 1); }
      `}</style>
      <div className="grid grid-cols-1 lg:grid-cols-[1.25fr_0.85fr_260px] gap-5 items-start">
        <div className="flex flex-col gap-5">
          {/* ── Accesos directos ── */}
          <div
            className="dash-stack relative"
            style={{ animationDelay: "0ms" }}
            onMouseEnter={() => setHoveredCard("accesos")}
            onMouseLeave={() => setHoveredCard(null)}
          >
            <div
              className="dash-stack-shadow absolute inset-0 rounded-2xl"
              style={{ background: "#7FB8AE", transform: hoveredCard === "accesos" ? "translate3d(0.875rem, 0.875rem, 0)" : "translate3d(0.625rem, 0.625rem, 0)" }}
              aria-hidden="true"
            />
            <div
              className="dash-stack-front relative bg-white rounded-2xl border border-[#e2e4ef] p-5"
              style={{ transform: hoveredCard === "accesos" ? "translate3d(0, -2px, 0)" : "translate3d(0, 0, 0)" }}
            >
              <LedgerHeading>Accesos directos</LedgerHeading>
              {/* Filas tipo "índice", sin tarjeta ni ícono flotante. El número de referencia se
                  cambió por una flecha — el número no comunicaba nada (no hay un orden real
                  entre los accesos), la flecha sí dice "ir a". Aparece siempre, no solo en
                  hover, para no perder la pista visual de que la fila es clickeable. */}
              <div className="grid grid-cols-1 sm:grid-cols-2">
                {ACCESOS.map((item) => (
                  <Link
                    key={item.to}
                    to={item.to}
                    className="group flex items-center gap-3.5 py-6 border-b border-[#e2e4ef] sm:odd:pr-4 sm:even:pl-4 sm:odd:border-r sm:[&:nth-last-child(-n+2)]:border-b-0 hover:bg-[#E3EEEE] transition-colors"
                  >
                    <span className="w-11 h-11 rounded-md flex items-center justify-center flex-shrink-0" style={{ background: item.bg }}>
                      <span className="material-symbols-outlined text-xl" style={{ color: item.accent }}>{item.icon}</span>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-bold leading-snug text-[#191c1e]">{item.label}</span>
                      <span className="block text-xs text-[#6b7280] mt-0.5 leading-snug">{item.desc}</span>
                    </span>
                    <span
                      className="material-symbols-outlined flex-shrink-0 transition-transform group-hover:translate-x-0.5"
                      style={{ fontSize: 18, color: item.accent }}
                    >
                      arrow_forward
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-5">
          {/* ── Nueva tarea ── mismo modal que ya abre el "+" del Sidebar (TaskModal), no uno
              nuevo — mismo chequeo de permiso canCreateTask. Arriba de "Tu progreso", más alta
              para que tenga presencia propia y no se sienta como un botón perdido. */}
          <div
            className="dash-stack relative"
            style={{ animationDelay: "90ms" }}
            onMouseEnter={() => setHoveredCard("nuevaTarea")}
            onMouseLeave={() => setHoveredCard(null)}
          >
            <div
              className="dash-stack-shadow absolute inset-0 rounded-2xl"
              style={{ background: "#6FA89E", transform: hoveredCard === "nuevaTarea" ? "translate3d(0.875rem, 0.875rem, 0)" : "translate3d(0.625rem, 0.625rem, 0)" }}
              aria-hidden="true"
            />
            <button
              onClick={handleNewTask}
              className="dash-stack-front relative w-full flex items-center justify-center gap-3 bg-white rounded-2xl border border-[#e2e4ef] py-8 hover:bg-[#E3EEEE] transition-colors"
              style={{ transform: hoveredCard === "nuevaTarea" ? "translate3d(0, -2px, 0)" : "translate3d(0, 0, 0)" }}
            >
              <span className="material-symbols-outlined text-2xl" style={{ color: "#003B43" }}>add_circle</span>
              <span className="text-base font-bold text-[#191c1e]">Nueva tarea</span>
            </button>
          </div>

          {/* ── Tu progreso ── fusionada con "Por prioridad" en una sola tarjeta. */}
          <div
            className="dash-stack relative"
            style={{ animationDelay: "150ms" }}
            onMouseEnter={() => setHoveredCard("progreso")}
            onMouseLeave={() => setHoveredCard(null)}
          >
            <div
              className="dash-stack-shadow absolute inset-0 rounded-2xl"
              style={{ background: "#7FB8AE", transform: hoveredCard === "progreso" ? "translate3d(0.875rem, 0.875rem, 0)" : "translate3d(0.625rem, 0.625rem, 0)" }}
              aria-hidden="true"
            />
            <div
              className="dash-stack-front relative bg-white rounded-2xl border border-[#e2e4ef] p-6"
              style={{ transform: hoveredCard === "progreso" ? "translate3d(0, -2px, 0)" : "translate3d(0, 0, 0)" }}
            >
              <LedgerHeading
                action={
                  <Link to="/tasks" className="text-xs font-semibold text-[#003B43] hover:opacity-80 flex items-center gap-1 transition-opacity">
                    Ver tareas
                    <span className="material-symbols-outlined" style={{ fontSize: 14 }}>arrow_forward</span>
                  </Link>
                }
              >
                Tu progreso
              </LedgerHeading>

              <div className="flex items-baseline gap-2.5">
                <span className="text-[42px] font-bold leading-none text-[#191c1e]" style={MONO}>
                  {completionPct}%
                </span>
                <span className="text-sm text-[#6b7280]">
                  {stats.total > 0 ? `${stats.completed} de ${stats.total} tareas completadas` : "Sin tareas todavía"}
                </span>
              </div>
              <div className="h-2 rounded-sm bg-[#f0f2f8] overflow-hidden mt-3">
                <div className="h-full rounded-sm transition-all" style={{ width: `${completionPct}%`, background: "#16a34a" }} />
              </div>

              <div className="grid grid-cols-3 gap-2.5 mt-4">
                {PROGRESS_SEGMENTS.map((seg) => (
                  <div key={seg.key} className="rounded-lg border border-[#e2e4ef] bg-[#E3EEEE] px-3 py-2.5">
                    <span className="block text-lg font-bold leading-tight text-[#191c1e]" style={MONO}>
                      {stats[seg.key]}
                    </span>
                    <span className="block text-[11px] text-[#6b7280] truncate">{seg.label}</span>
                  </div>
                ))}
              </div>

              <p className="text-xs font-semibold text-[#8890b5] uppercase tracking-wide mt-5 mb-2">Por prioridad</p>
              <div className="space-y-3">
                {barData.map((entry) => {
                  const max = Math.max(...barData.map((d) => d.value), 1)
                  const pct = (entry.value / max) * 100
                  return (
                    <div key={entry.name} className="flex items-center gap-3">
                      <span className="text-xs text-[#434655] w-12 flex-shrink-0">{entry.name}</span>
                      <span className="flex-1 h-1.5 rounded-sm bg-[#f0f2f8] overflow-hidden">
                        <span className="block h-full rounded-sm" style={{ width: `${pct}%`, background: entry.fill }} />
                      </span>
                      <span className="text-sm font-bold text-[#191c1e] w-5 text-right flex-shrink-0" style={MONO}>
                        {entry.value}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-5">
          {/* ── Notas rápidas ── */}
          <div
            className="dash-stack relative"
            style={{ animationDelay: "160ms" }}
            onMouseEnter={() => setHoveredCard("notas")}
            onMouseLeave={() => setHoveredCard(null)}
          >
            <div
              className="dash-stack-shadow absolute inset-0 rounded-2xl"
              style={{ background: "#A9C9C3", transform: hoveredCard === "notas" ? "translate3d(0.875rem, 0.875rem, 0)" : "translate3d(0.625rem, 0.625rem, 0)" }}
              aria-hidden="true"
            />
            <div
              className="dash-stack-front relative bg-white rounded-2xl border border-[#e2e4ef] p-5"
              style={{ transform: hoveredCard === "notas" ? "translate3d(0, -2px, 0)" : "translate3d(0, 0, 0)" }}
            >
              <LedgerHeading>Notas rápidas</LedgerHeading>
              <textarea
                value={quickNote}
                onChange={(e) => setQuickNote(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault()
                    handleQuickNote()
                  }
                }}
                placeholder="Escribe algo para guardarlo en Mis Notas…"
                rows={3}
                className="w-full resize-none rounded-lg bg-[#E3EEEE] border border-[#e2e4ef] focus:border-[#8890b5] outline-none p-3 text-sm text-[#191c1e] placeholder:text-[#8890b5] transition-colors"
              />
              <div className="flex items-center justify-between mt-3">
                <Link to="/notas" className="text-xs font-semibold text-[#003B43] hover:opacity-80 flex items-center gap-1 transition-opacity">
                  Ver Mis Notas
                  <span className="material-symbols-outlined" style={{ fontSize: 14 }}>arrow_forward</span>
                </Link>
                <button
                  onClick={handleQuickNote}
                  disabled={!quickNote.trim() || savingNote}
                  className="h-8 px-3.5 rounded-lg text-xs font-semibold text-white transition disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90"
                  style={{ background: "#003B43" }}
                >
                  {savingNote ? "Guardando…" : "Guardar"}
                </button>
              </div>
            </div>
          </div>

          {/* ── Pendientes rápidos ── mismo patrón exacto que "Notas rápidas", pero crea una
              tarea personal (api.createPersonalTask) en vez de una nota — acá sí en un solo
              paso, el backend de personal-tasks ya acepta el título directo en el POST. */}
          <div
            className="dash-stack relative"
            style={{ animationDelay: "230ms" }}
            onMouseEnter={() => setHoveredCard("pendientes")}
            onMouseLeave={() => setHoveredCard(null)}
          >
            <div
              className="dash-stack-shadow absolute inset-0 rounded-2xl"
              style={{ background: "#4E8F84", transform: hoveredCard === "pendientes" ? "translate3d(0.875rem, 0.875rem, 0)" : "translate3d(0.625rem, 0.625rem, 0)" }}
              aria-hidden="true"
            />
            <div
              className="dash-stack-front relative bg-white rounded-2xl border border-[#e2e4ef] p-5"
              style={{ transform: hoveredCard === "pendientes" ? "translate3d(0, -2px, 0)" : "translate3d(0, 0, 0)" }}
            >
              <LedgerHeading>Pendientes rápidos</LedgerHeading>
              <textarea
                value={quickPending}
                onChange={(e) => setQuickPending(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault()
                    handleQuickPending()
                  }
                }}
                placeholder="Escribe un pendiente para guardarlo en Mis Pendientes…"
                rows={3}
                className="w-full resize-none rounded-lg bg-[#E3EEEE] border border-[#e2e4ef] focus:border-[#8890b5] outline-none p-3 text-sm text-[#191c1e] placeholder:text-[#8890b5] transition-colors"
              />

              {/* Si ya hay pendientes guardados, se listan acá mismo — con checkbox para
                  marcarlos sin salir del Dashboard. */}
              {pendingTasks.length > 0 && (
                <div className="mt-3">
                  {pendingTasks.map((task) => (
                    <button
                      key={task.id}
                      onClick={() => handleTogglePending(task)}
                      className="w-full flex items-center gap-2.5 py-2 border-b border-[#e2e4ef] last:border-b-0 text-left"
                    >
                      <span
                        className="material-symbols-outlined flex-shrink-0"
                        style={{ fontSize: 18, color: task.completed ? "#0f9d6e" : "#c3c6d7" }}
                      >
                        {task.completed ? "check_circle" : "radio_button_unchecked"}
                      </span>
                      <span className={`text-sm min-w-0 flex-1 truncate ${task.completed ? "line-through text-[#8890b5]" : "text-[#191c1e]"}`}>
                        {task.title}
                      </span>
                    </button>
                  ))}
                </div>
              )}

              <div className="flex items-center justify-between mt-3">
                <Link to="/pendientes" className="text-xs font-semibold text-[#003B43] hover:opacity-80 flex items-center gap-1 transition-opacity">
                  Ver Mis Pendientes
                  <span className="material-symbols-outlined" style={{ fontSize: 14 }}>arrow_forward</span>
                </Link>
                <button
                  onClick={handleQuickPending}
                  disabled={!quickPending.trim() || savingPending}
                  className="h-8 px-3.5 rounded-lg text-xs font-semibold text-white transition disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90"
                  style={{ background: "#003B43" }}
                >
                  {savingPending ? "Guardando…" : "Guardar"}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {showTaskModal && <TaskModal onClose={() => setShowTaskModal(false)} />}
    </div>
  )
}
