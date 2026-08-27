const ExcelJS = require('exceljs');
const formato1005 = require('./formato1005');
const formato1006 = require('./formato1006');

// Cada formato implementa:
//   leerYAgrupar(bufferToken) -> registros[]
//   llenarHoja(workbook, registros)          — llena su propia hoja sobre un workbook compartido
//   llenarPlantilla(bufferPlantilla, registros) -> Buffer — atajo de un solo formato (carga+llena+serializa)
// 1001 y 1007 se agregan acá cuando lleguen sus fases, sin tocar 1005/1006.
const ESTRATEGIAS = {
  1005: formato1005,
  1006: formato1006,
};

function getEstrategia(formato) {
  const estrategia = ESTRATEGIAS[formato];
  if (!estrategia) {
    throw new Error(`Formato de Exógena no soportado: "${formato}". Disponibles: ${Object.keys(ESTRATEGIAS).join(', ')}.`);
  }
  return estrategia;
}

// Genera UN solo archivo con la hoja de cada formato marcado ya llena, a partir de la MISMA
// plantilla SIIGO (el usuario la sube una sola vez para todos los formatos que analizó juntos).
// registrosPorFormato: { [formato]: registros[] }.
async function llenarPlantillaCombinada(bufferPlantilla, registrosPorFormato) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(bufferPlantilla);

  for (const [formato, registros] of Object.entries(registrosPorFormato)) {
    getEstrategia(formato).llenarHoja(workbook, registros);
  }

  return workbook.xlsx.writeBuffer();
}

module.exports = { getEstrategia, llenarPlantillaCombinada };
