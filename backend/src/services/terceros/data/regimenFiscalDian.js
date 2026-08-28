// Catálogo de "Régimen Fiscal" tal como lo imprime la representación gráfica de la factura
// electrónica DIAN. A diferencia de "Responsabilidad tributaria" (que ya trae código + descripción
// juntos, ej. "01 - IVA"), este campo solo trae el código pelado (ej. "Régimen Fiscal:R-99-PN",
// ver factura de muestra en terceros.test.js) — de ahí la necesidad de esta tabla para mostrar
// algo legible en Consulta Tercero.
// Lista dada directamente por el usuario (2026-08-28), no sale de un PDF oficial subido a este
// proyecto (a diferencia de los catálogos DANE en departamentosDane.js/municipiosDane.js).
const REGIMEN_FISCAL_DIAN = {
  'O-13': 'Gran contribuyente',
  'O-15': 'Autorretenedor',
  'O-23': 'Agente de retención IVA',
  'O-47': 'Régimen simple de tributación',
  'R-99-PN': 'No responsable',
};

module.exports = { REGIMEN_FISCAL_DIAN };
