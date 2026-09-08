// ─── Shared data module — Nómina Electrónica ─────────────────────────────────
// Regla de mes habilitado PROPIA de este módulo — a diferencia de Fondo
// Emprender/Empresas Externas (día 23 de corte, ver src/data/fondoEmprender.js),
// acá el mes habilitado es siempre el mes calendario anterior y cambia justo
// el día 1 (el 1 de octubre se habilita septiembre). Duplicado a propósito
// contra backend/src/utils/mesVencidoNominaElectronica.js (mismo criterio que
// el resto de la app: evitar una llamada de red solo para esto).
export function getMesHabilitadoNE(now = new Date()) {
  const mesActual  = now.getMonth() + 1 // 1-12
  const anioActual = now.getFullYear()
  if (mesActual === 1) return { anio: anioActual - 1, mes: 12 }
  return { anio: anioActual, mes: mesActual - 1 }
}

// Traducción de cómo se llevaba en el Excel — el estado real tiene 4 colores,
// no 3: por defecto una empresa está SIN MARCAR (blanco, nadie ha avisado
// nada); se pone en ROJO cuando avisan que ya se puede presentar (sigue
// pendiente, solo que ahora es urgente); VERDE cuando ya se presentó; GRIS
// cuando no aplica (bloqueada / ya no se le hace / no envía información).
// "Ya se puede presentar" es un flag aparte (`autorizada` en ne_meses,
// migración 048) independiente del estado — mismo patrón que
// fondo_pagos.autorizado. Mismo shape que STATUS en
// src/data/empresasExternas.js (label/icon/color/bg) a propósito — la celda y
// el dropdown de edición son el mismo componente visual que usa Seguimiento
// Mensual, solo con esta paleta en vez de la de ahí.
// bg más saturado que el pastel estándar del resto de la app a propósito —
// acá SON la fila entera (no un ícono chiquito), así que un tinte casi blanco
// se sentía "sin vida"/plano. no_aplica en particular usa un gris más oscuro
// (gray-300, no gray-100) para que se note contra sin_marcar (blanco puro).
export const ESTADOS_VISUAL = {
  sin_marcar: { label: 'Sin marcar',            icon: 'radio_button_unchecked', color: '#9ca3af', bg: '#ffffff' },
  autorizada: { label: 'Ya se puede presentar', icon: 'priority_high',          color: '#dc2626', bg: '#fecaca' },
  presentada: { label: 'Presentada',            icon: 'check_circle',          color: '#15803d', bg: '#bbf7d0' },
  no_aplica:  { label: 'Revisar',               icon: 'do_not_disturb_on',     color: '#4b5563', bg: '#d1d5db' },
}

// Resuelve cuál de los 4 colores de arriba le corresponde a una fila
// (estado + autorizada) — usarlo siempre en vez de leer `row.estado` directo
// para pintar, así la regla queda en un solo lugar.
export function resolveEstadoVisual(row) {
  if (row.estado === 'presentada') return 'presentada'
  if (row.estado === 'no_aplica') return 'no_aplica'
  return row.autorizada ? 'autorizada' : 'sin_marcar'
}

// Los tres bloques del Excel original (columnas MARITZA/DIANA/EXTERNAS) —
// ver ne_empresas.origen, migración 047. Es solo agrupación visual, no
// implica quién presenta la nómina (eso es responsable_id, aparte).
export const ORIGEN_LABELS = {
  maritza:  'Maritza',
  diana:    'Diana',
  externas: 'Externas',
}

// Un acento de color por columna para diferenciarlas de un vistazo — a
// propósito NINGUNO de estos colores se reutiliza de ESTADOS_VISUAL (ese rojo/
// verde/gris/gris-claro ya significa otra cosa acá, mezclarlos confundiría).
export const ORIGEN_ACCENTS = {
  maritza:  '#004ac6', // azul primario de la app
  diana:    '#7c3aed', // violeta
  externas: '#0891b2', // teal
  otras:    '#6b7280', // gris neutro — solo aparece si algún día hay empresas sin grupo
}

export const MONTHS = [
  'Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre',
]

// Primer nombre de un nombre completo — mismo criterio que firstName en
// src/data/empresasExternas.js, para mostrar solo el nombre del responsable
// en la grilla.
export function firstName(fullName) {
  if (!fullName) return ''
  return fullName.trim().split(/\s+/)[0]
}

// "2026-10-10" → "10 de octubre de 2026", para el aviso del plazo. new
// Date('YYYY-MM-DD') se interpretaría en UTC y podría mostrar el día
// anterior según la zona horaria del navegador — se parsea a mano para que
// siempre sea el día calendario exacto que se guardó.
export function formatFechaLimite(isoDate) {
  if (!isoDate) return null
  const [y, m, d] = isoDate.split('-').map(Number)
  const fecha = new Date(y, m - 1, d)
  return fecha.toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' })
}

// ── color del aviso de plazo — degradado verde→amarillo→rojo según cuántos
// días faltan, no 3 colores fijos a saltos. PLAZO_VENTANA_DIAS es "a partir
// de cuántos días antes del límite empieza a preocupar" — con 10 días
// (mismo orden de magnitud que los "primeros 10 días hábiles" reales de la
// DIAN) el primer día del mes arranca en verde y llega a rojo puro justo el
// día del límite (o después, si ya se venció). Es solo aritmética de fechas
// sobre un valor ya cargado — se recalcula en cada render, no hace falta
// temporizador ni nada corriendo en segundo plano.
//
// Colores vivos, elegidos con el usuario probando un comparativo aparte
// (verde/amarillo/rojo puros, sin naranjas ni rosados — ver historial de la
// sesión). La mezcla se hace en HSL, no en RGB: interpolar RGB directo entre
// verde y amarillo pasa por un tono oliva apagado a mitad de camino (el rojo
// y el azul bajan a ritmos distintos); en HSL el tono gira derecho de un
// color al otro sin ese punto muerto.
const PLAZO_VENTANA_DIAS = 10
const PLAZO_VERDE    = [34, 197, 94]  // #22c55e
const PLAZO_AMARILLO = [250, 204, 21] // #facc15
const PLAZO_ROJO     = [239, 68, 68]  // #ef4444

function rgbToHsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  let h, s
  const l = (max + min) / 2
  if (max === min) {
    h = s = 0
  } else {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break
      case g: h = (b - r) / d + 2; break
      default: h = (r - g) / d + 4
    }
    h /= 6
  }
  return [h * 360, s, l]
}

function hslToRgb([h, s, l]) {
  h /= 360
  if (s === 0) { const v = Math.round(l * 255); return [v, v, v] }
  const hue2rgb = (p, q, t) => {
    if (t < 0) t += 1
    if (t > 1) t -= 1
    if (t < 1 / 6) return p + (q - p) * 6 * t
    if (t < 1 / 2) return q
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
    return p
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  return [
    Math.round(hue2rgb(p, q, h + 1 / 3) * 255),
    Math.round(hue2rgb(p, q, h) * 255),
    Math.round(hue2rgb(p, q, h - 1 / 3) * 255),
  ]
}

function lerpHsl(aRgb, bRgb, t) {
  const a = rgbToHsl(aRgb), b = rgbToHsl(bRgb)
  return hslToRgb([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t])
}

// Devuelve null cuando no hay fecha configurada (el aviso usa un color
// neutro aparte en ese caso) o cuando la fecha es inválida.
export function getPlazoColor(isoDate, now = new Date()) {
  if (!isoDate) return null
  const [y, m, d] = isoDate.split('-').map(Number)
  const limite = new Date(y, m - 1, d)
  if (Number.isNaN(limite.getTime())) return null

  const hoy = new Date(now)
  hoy.setHours(0, 0, 0, 0)
  limite.setHours(0, 0, 0, 0)

  const diasFaltantes = Math.round((limite - hoy) / 86400000)
  const t = Math.min(1, Math.max(0, 1 - diasFaltantes / PLAZO_VENTANA_DIAS))
  const [r, g, b] = t <= 0.5
    ? lerpHsl(PLAZO_VERDE, PLAZO_AMARILLO, t / 0.5)
    : lerpHsl(PLAZO_AMARILLO, PLAZO_ROJO, (t - 0.5) / 0.5)

  // El texto NO usa este color — con el amarillo intermedio quedaba casi
  // ilegible sobre su propio fondo (mismo tono, solo con alfa distinto). El
  // color queda solo en el borde/fondo (decorativos, no necesitan contraste
  // de texto); el párrafo usa un gris fijo (ver NominaElectronicaPage.jsx).
  //
  // El ícono tampoco usa este rgb continuo — el amarillo de en medio es
  // intrínsecamente claro (alta luminosidad) y se perdía sobre el fondo
  // pálido del propio aviso, sin importar cuánto se oscureciera a mano.
  // `zone` da 3 tramos discretos que el frontend mapea a un par de clases
  // Tailwind ya pensadas para contraste en claro/oscuro (text-*-600/400),
  // en vez de intentar arreglar un continuo con matices de por medio.
  const zone = t < 1 / 3 ? 'verde' : t < 2 / 3 ? 'amarillo' : 'rojo'

  return {
    diasFaltantes,
    zone,
    text:   `rgb(${r},${g},${b})`,
    border: `rgba(${r},${g},${b},0.78)`,
    bg:     `rgba(${r},${g},${b},0.22)`,
  }
}
