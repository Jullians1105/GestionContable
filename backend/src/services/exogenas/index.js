const ExcelJS = require('exceljs');
const formato1001 = require('./formato1001');
const formato1005 = require('./formato1005');
const formato1006 = require('./formato1006');
const formato1007 = require('./formato1007');

// Cada formato implementa:
//   leerYAgrupar(bufferToken) -> registros[]
//   llenarHoja(workbook, registros)          — llena su propia hoja sobre un workbook compartido
//   llenarPlantilla(bufferPlantilla, registros) -> Buffer — atajo de un solo formato (carga+llena+serializa)
// 1001 y 1007 dejan CPT (y algunas otras columnas de 1001) en blanco hasta que se definan esas
// reglas de negocio — ver formato1001.js / formato1007.js.
const ESTRATEGIAS = {
  1001: formato1001,
  1005: formato1005,
  1006: formato1006,
  1007: formato1007,
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
