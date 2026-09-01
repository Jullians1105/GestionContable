// Traduce el estado de Nómina Electrónica (pendiente/presentada/no_aplica) al
// vocabulario pending/in_progress/done/na que usan los checklists de Fondo
// Emprender y Empresas Externas — usado por fondoChecklistController,
// extChecklistController y fondoDetalleController para que la celda "Nómina
// electrónica" de esos dos seguimientos refleje en vivo lo marcado acá (ver
// migración 045_nomina_electronica.sql). No hay equivalente de in_progress
// del lado de Nómina Electrónica, así que nunca se produce ese valor.
const ESTADO_NE_A_CHECKLIST = {
  pendiente:  'pending',
  presentada: 'done',
  no_aplica:  'na',
};

function mapEstadoNEaChecklist(estadoNE) {
  return ESTADO_NE_A_CHECKLIST[estadoNE] ?? 'pending';
}

module.exports = { mapEstadoNEaChecklist };
