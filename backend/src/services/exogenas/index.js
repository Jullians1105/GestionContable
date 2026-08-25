const formato1005 = require('./formato1005');

// Cada formato implementa { leerYAgrupar(bufferToken) -> registros[], llenarPlantilla(bufferPlantilla, registros) -> Buffer }.
// 1001, 1006 y 1007 se agregan acá cuando lleguen sus fases, sin tocar 1005.
const ESTRATEGIAS = {
  1005: formato1005,
};

function getEstrategia(formato) {
  const estrategia = ESTRATEGIAS[formato];
  if (!estrategia) {
    throw new Error(`Formato de Exógena no soportado: "${formato}". Disponibles: ${Object.keys(ESTRATEGIAS).join(', ')}.`);
  }
  return estrategia;
}

module.exports = { getEstrategia };
