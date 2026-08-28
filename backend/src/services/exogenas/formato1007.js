// Formato 1007 — Ingresos. FASE 1 (parcial): calcula ingresos brutos (IBRU) y devoluciones/
// rebajas/descuentos (DEV) por tercero, a partir de la hoja VENTAS (+ DEV VENTAS opcional) del
// TOKEN. El concepto (CPT) queda pendiente de definir con el usuario — no se inventa, así que
// este módulo NO implementa llenarHoja/llenarPlantilla ni se registra en
// services/exogenas/index.js#ESTRATEGIAS todavía. Solo expone `leerYAgrupar`, usado por
// exogenasController#verificarIngresos1007 para previsualizar IBRU/DEV antes de que el 1007 se
// pueda generar de verdad.
//
// IBRU/DEV = "Total" de cada fila MENOS todos los impuestos que traiga esa fila — la lista de
// impuestos posibles (confirmada por el usuario mirando las columnas ocultas del TOKEN real) es
// fija, pero cada columna es OPCIONAL: si una empresa no maneja, por ejemplo, "IN Carbono", esa
// columna ni siquiera aparece en su reporte, y eso no debe tronar el proceso.
const ExcelJS = require('exceljs');
const { normalizeXlsxBuffer } = require('./utils/normalizeXlsx');
const { normalizarTexto, limpiarIdentificacion, calcularDV, inferirTipoDocumento, esNotaCredito, round2 } = require('./utils/dian');
const { getCellText } = require('./utils/plantillaExcel');

const HOJA_TOKEN = 'VENTAS';
const COLUMNAS_TOKEN_REQUERIDAS = ['Tipo de documento', 'NIT Receptor', 'Nombre Receptor', 'Total', 'Grupo'];

const HOJA_DEV_VENTAS = 'DEV VENTAS';
const COLUMNAS_DEV_VENTAS_REQUERIDAS = ['NIT Receptor', 'Nombre Receptor', 'Total'];

// Impuestos que se restan del "Total" para llegar al valor sin impuestos — todos opcionales
// (ver cabecera del archivo): si alguno no está en el reporte de una empresa, simplemente no
// resta nada, no debe tronar el proceso.
const COLUMNAS_IMPUESTOS = [
  'IVA', 'ICA', 'IC', 'INC', 'Timbre', 'INC Bolsas', 'IN Carbono', 'IN Combustibles',
  'IC Datos', 'ICL', 'INPP', 'IBUA', 'ICUI',
];

function aNumero(raw) {
  if (raw === null || raw === undefined) return 0;
  if (typeof raw === 'number') return raw;
  if (typeof raw === 'object') {
    if ('result' in raw) return aNumero(raw.result);
    if (raw.richText) return aNumero(raw.richText.map((r) => r.text).join(''));
  }
  const limpio = String(raw).trim().replace(/[^0-9.-]/g, '');
  const num = parseFloat(limpio);
  return Number.isNaN(num) ? 0 : num;
}

function encontrarHoja(workbook, nombreExacto) {
  return workbook.worksheets.find((ws) => ws.name.trim().toUpperCase() === nombreExacto.toUpperCase());
}

function mapearColumnas(ws, columnasRequeridas, nombreHoja) {
  const colMap = {};
  ws.getRow(1).eachCell({ includeEmpty: false }, (cell, colNumber) => {
    const nombre = getCellText(cell).trim();
    if (nombre) colMap[nombre] = colNumber;
  });
  const faltantes = columnasRequeridas.filter((c) => !(c in colMap));
  if (faltantes.length > 0) {
    throw new Error(`A la hoja "${nombreHoja}" le faltan columnas requeridas: ${faltantes.join(', ')}.`);
  }
  return colMap;
}

// Total de la fila menos cada impuesto que SÍ esté presente en el archivo (colMap[nombre]
// truthy) — un impuesto ausente de la hoja no resta nada, no es un error.
function calcularSinImpuestos(row, colMap) {
  const total = aNumero(row.getCell(colMap['Total']).value);
  const impuestos = COLUMNAS_IMPUESTOS.reduce((acc, nombre) => {
    const col = colMap[nombre];
    return col ? acc + aNumero(row.getCell(col).value) : acc;
  }, 0);
  return total - impuestos;
}

function obtenerOCrear(acumulador, tipoDocumento, identificacion, razonSocial) {
  const key = `${tipoDocumento}|${identificacion}`;
  let entrada = acumulador.get(key);
  if (!entrada) {
    entrada = { tipoDocumento, identificacion, razonSocial, ibru: 0, dev: 0 };
    acumulador.set(key, entrada);
  } else if (razonSocial.length > entrada.razonSocial.length) {
    entrada.razonSocial = razonSocial;
  }
  return entrada;
}

async function leerYAgrupar(bufferToken) {
  const bufferNormalizado = await normalizeXlsxBuffer(bufferToken);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(bufferNormalizado);

  const ws = encontrarHoja(workbook, HOJA_TOKEN);
  if (!ws) {
    throw new Error(`El archivo TOKEN debe tener una hoja llamada "${HOJA_TOKEN}" con las ventas ya validadas.`);
  }

  const acumulador = new Map(); // key: `${tipoDocumento}|${identificacion}` -> { identificacion, tipoDocumento, razonSocial, ibru, dev }

  // --- VENTAS -> IBRU (clientes, tercero en Receptor) ---
  {
    const colMap = mapearColumnas(ws, COLUMNAS_TOKEN_REQUERIDAS, HOJA_TOKEN);
    const getStr = (row, nombreCol) => getCellText(row.getCell(colMap[nombreCol])).trim() || null;

    ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber === 1) return;

      const grupo = normalizarTexto(getStr(row, 'Grupo'));
      if (grupo !== 'EMITIDO') return;

      const tipoDocExcel = getStr(row, 'Tipo de documento');
      if (esNotaCredito(tipoDocExcel)) return;

      const identificacion = limpiarIdentificacion(getStr(row, 'NIT Receptor'));
      const nombre = getStr(row, 'Nombre Receptor');
      if (!identificacion || !nombre) return;

      const sinImpuestos = calcularSinImpuestos(row, colMap);
      if (sinImpuestos === 0) return;

      const tipoDocumento = inferirTipoDocumento(identificacion, nombre);
      obtenerOCrear(acumulador, tipoDocumento, identificacion, nombre).ibru += sinImpuestos;
    });
  }

  // --- DEV VENTAS -> DEV (clientes, tercero en Receptor) — hoja opcional ---
  const wsDevVentas = encontrarHoja(workbook, HOJA_DEV_VENTAS);
  if (wsDevVentas) {
    const colMap = mapearColumnas(wsDevVentas, COLUMNAS_DEV_VENTAS_REQUERIDAS, HOJA_DEV_VENTAS);
    const getStr = (row, nombreCol) => getCellText(row.getCell(colMap[nombreCol])).trim() || null;

    wsDevVentas.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber === 1) return;

      const identificacion = limpiarIdentificacion(getStr(row, 'NIT Receptor'));
      const nombre = getStr(row, 'Nombre Receptor');
      if (!identificacion || !nombre) return;

      const sinImpuestos = calcularSinImpuestos(row, colMap);
      if (sinImpuestos === 0) return;

      const tipoDocumento = inferirTipoDocumento(identificacion, nombre);
      obtenerOCrear(acumulador, tipoDocumento, identificacion, nombre).dev += sinImpuestos;
    });
  }

  const registros = Array.from(acumulador.values()).map((r) => ({
    tipoDocumento: r.tipoDocumento,
    identificacion: r.identificacion,
    digitoVerificacion: calcularDV(r.identificacion),
    razonSocial: r.razonSocial,
    ibru: round2(r.ibru),
    dev: round2(r.dev),
  }));

  registros.sort((a, b) => {
    const na = normalizarTexto(a.razonSocial);
    const nb = normalizarTexto(b.razonSocial);
    if (na !== nb) return na < nb ? -1 : 1;
    return a.identificacion < b.identificacion ? -1 : a.identificacion > b.identificacion ? 1 : 0;
  });

  return registros;
}

module.exports = { leerYAgrupar, HOJA_TOKEN, COLUMNAS_TOKEN_REQUERIDAS, COLUMNAS_IMPUESTOS };
