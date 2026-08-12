// ─── Shared data module — Empresas Externas ──────────────────────────────────
// La regla de mes vencido es EXACTAMENTE la misma que la de Fondo Emprender
// (mismo DIA_CORTE = 23, duplicada a propósito en el backend contra una
// llamada de red — ver src/data/fondoEmprender.js), así que se reexporta en
// vez de reimplementarla.

export { getMesVencidoHabilitado, resolveMesInicial } from './fondoEmprender'

export const STATUS = {
  pending:     { label: 'Pendiente',  icon: 'radio_button_unchecked', color: '#6b7280', bg: '#f3f4f6' },
  in_progress: { label: 'En proceso', icon: 'timelapse',              color: '#d97706', bg: '#fef9c3' },
  done:        { label: 'Hecho',      icon: 'check_circle',           color: '#16a34a', bg: '#dcfce7' },
  na:          { label: 'N/A',        icon: 'do_not_disturb_on',      color: '#0ea5e9', bg: '#e0f2fe' },
}

export const MONTHS = [
  'Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre',
]
