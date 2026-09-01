// ─── Shared data module — Nómina Electrónica ─────────────────────────────────
// La regla de mes vencido es la misma que usan Fondo Emprender y Empresas
// Externas (mismo DIA_CORTE = 23), así que se reexporta en vez de
// reimplementarla — ver el comentario largo en src/data/fondoEmprender.js.

export { getMesVencidoHabilitado, resolveMesInicial } from './fondoEmprender'

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
  no_aplica:  { label: 'No aplica',             icon: 'do_not_disturb_on',     color: '#4b5563', bg: '#d1d5db' },
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
