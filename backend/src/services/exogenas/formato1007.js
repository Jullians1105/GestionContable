// Formato 1007 — Ingresos. FASE 1 (parcial): calcula ingresos brutos (IBRU) y devoluciones/
// rebajas/descuentos (DEV) por tercero, a partir de la hoja VENTAS (+ DEV VENTAS opcional) del
// TOKEN, y ya genera la hoja "1007" de la plantilla con todo lo que está confirmado. Dos cosas
// quedan pendientes de definir con el usuario — no se inventan, así que esas columnas se dejan
// en blanco en el Excel generado:
// - CPT (concepto): varía según el tipo de ingreso (operacional, no operacional, rendimientos
//   financieros...), sin regla confirmada todavía.
// - PAIS (país de residencia/domicilio del tercero): se toma de `terceros` (mismo dato que
//   alimenta "Consulta Tercero" en el 1001) vía `enriquecerConPais` — si el NIT del cliente
//   todavía no tiene una factura importada en "Importar Terceros", no hay de dónde sacarlo y
//   queda en blanco.
//
// IBRU/DEV = "Total" de cada fila MENOS todos los impuestos que traiga esa fila — la lista de
// impuestos posibles (confirmada por el usuario mirando las columnas ocultas del TOKEN real) es
// fija, pero cada columna es OPCIONAL: si una empresa no maneja, por ejemplo, "IN Carbono", esa
// columna ni siquiera aparece en su reporte, y eso no debe tronar el proceso.
const ExcelJS = require('exceljs');
const db = require('../../config/database');
const { normalizeXlsxBuffer } = require('./utils/normalizeXlsx');
const { normalizarTexto, limpiarIdentificacion, calcularDV, inferirTipoDocumento, esNotaCredito, separarNombrePersona, round2 } = require('./utils/dian');
const { getCellText, encontrarFilaYColumnas, copiarEstiloFila } = require('./utils/plantillaExcel');

const HOJA_TOKEN = 'VENTAS';
const COLUMNAS_TOKEN_REQUERIDAS = ['Tipo de documento', 'NIT Receptor', 'Nombre Receptor', 'Total', 'Grupo'];

const HOJA_DEV_VENTAS = 'DEV VENTAS';
const COLUMNAS_DEV_VENTAS_REQUERIDAS = ['Tipo de documento', 'NIT Receptor', 'Nombre Receptor', 'Total'];

const HOJA_PLANTILLA = '1007';

// Headers reales de la hoja "1007" de la plantilla SIIGO — sacados de
// docs/EXOGENA - GUIA FORMATOS.xlsx (hoja "1007 OK"), no inventados. A diferencia de 1005/1006,
// el 1007 NO tiene columna de Dígito de Verificación (DV), y sí trae PAIS (que ellos no tienen).
// CONCEPTO se incluye en el mapeo (para poder limpiar la columna en cada corrida) pero
// deliberadamente no se le escribe ningún valor — ver cabecera del archivo.
const CAMPOS_PLANTILLA = [
  { match: 'CONCEPTO', key: 'CPT' },
  { match: 'TIPO DE DOCUMENTO', key: 'TDOC' },
  { match: 'NUMERO DE IDENTIFICACION', key: 'NID' },
  { match: 'PRIMER APELLIDO DEL INFORMADO', key: 'APL1' },
  { match: 'SEGUNDO APELLIDO DEL INFORMADO', key: 'APL2' },
  { match: 'PRIMER NOMBRE DEL INFORMADO', key: 'NOM1' },
  { match: 'OTROS NOMBRES DEL INFORMADO', key: 'NOM2' },
  { match: 'RAZON SOCIAL DEL INFORMADO', key: 'RAZ' },
  { match: 'PAIS DE RESIDENCIA O DOMICILIO', key: 'PAIS' },
  { match: 'INGRESOS BRUTOS RECIBIDOS', key: 'IBRU' },
  { match: 'DEVOLUCIONES REBAJAS Y DESCUENTOS', key: 'DEV' },
];
const HEADERS_PLANTILLA = CAMPOS_PLANTILLA.map((c) => c.match);

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
      if (row.hidden) return; // fila oculta por el AutoFilter del TOKEN (ej. filtrada por el usuario antes de exportar) — no se debe contar

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

  // --- DEV VENTAS -> DEV (clientes, tercero en Receptor) — hoja opcional. Solo cuentan las
  // filas que son nota crédito ("Nota de crédito electrónica"): la hoja puede traer otros
  // tipos de documento que no son devoluciones y no deben sumarse a DEV.
  const wsDevVentas = encontrarHoja(workbook, HOJA_DEV_VENTAS);
  if (wsDevVentas) {
    const colMap = mapearColumnas(wsDevVentas, COLUMNAS_DEV_VENTAS_REQUERIDAS, HOJA_DEV_VENTAS);
    const getStr = (row, nombreCol) => getCellText(row.getCell(colMap[nombreCol])).trim() || null;

    wsDevVentas.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber === 1) return;
      if (row.hidden) return; // fila oculta por el AutoFilter del TOKEN — no se debe contar

      const tipoDocExcel = getStr(row, 'Tipo de documento');
      if (!esNotaCredito(tipoDocExcel)) return;

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

// Cruza cada registro contra `terceros` por NIT para obtener el país (mismo dato que ya usa
// "Consulta Tercero" en el 1001) — a diferencia de 1001#enriquecerConTerceros, acá solo importa
// el país (dirección/municipio no aplican a un formato de ingresos). `tienePais` distingue "el
// tercero existe pero no tiene país guardado" de "no hay ningún dato de este tercero todavía".
async function enriquecerConPais(registros) {
  if (registros.length === 0) return [];

  const nits = registros.map((r) => r.identificacion);
  const { rows } = await db.query(
    `SELECT nit, pais, codigo_pais_dian FROM terceros WHERE nit = ANY($1)`,
    [nits]
  );
  const porNit = new Map(rows.map((t) => [t.nit, t]));

  return registros.map((r) => {
    const t = porNit.get(r.identificacion) ?? null;
    return {
      ...r,
      pais: t?.pais ?? null,
      codigoPaisDian: t?.codigo_pais_dian ?? null,
      tienePais: !!t?.codigo_pais_dian,
    };
  });
}

// Llena la hoja "1007" de un workbook ya cargado en memoria — mismo patrón que 1005/1006 (ver
// services/exogenas/index.js#llenarPlantillaCombinada). CPT no se escribe (ver cabecera del
// archivo): la limpieza de la columna sí corre, así que queda en blanco y no con un valor de
// una corrida anterior.
function llenarHoja(workbook, registros) {
  const ws = encontrarHoja(workbook, HOJA_PLANTILLA);
  if (!ws) {
    throw new Error(`La plantilla SIIGO debe tener una hoja llamada "${HOJA_PLANTILLA}".`);
  }

  const { filaDatos: filaInicio, columnas } = encontrarFilaYColumnas(ws, HEADERS_PLANTILLA, 40);
  const col = {};
  for (const { match, key } of CAMPOS_PLANTILLA) col[key] = columnas[match];

  const maxRowOriginal = ws.rowCount;
  const filaFinLimpieza = Math.max(maxRowOriginal, filaInicio + registros.length + 50);
  const colsObjetivo = Object.values(col);

  for (let fila = filaInicio; fila <= filaFinLimpieza; fila++) {
    for (const c of colsObjetivo) {
      ws.getRow(fila).getCell(c).value = null;
    }
  }

  registros.forEach((registro, i) => {
    const fila = filaInicio + i;
    if (fila !== filaInicio) copiarEstiloFila(ws, filaInicio, fila);

    const row = ws.getRow(fila);
    row.getCell(col.TDOC).value = registro.tipoDocumento;
    row.getCell(col.NID).value  = Number(registro.identificacion);

    if (registro.tipoDocumento === 31) {
      row.getCell(col.RAZ).value = registro.razonSocial;
    } else {
      const { nom1, nom2, apl1, apl2 } = separarNombrePersona(registro.razonSocial);
      row.getCell(col.NOM1).value = nom1;
      row.getCell(col.NOM2).value = nom2;
      row.getCell(col.APL1).value = apl1;
      row.getCell(col.APL2).value = apl2;
    }

    // Solo se escribe si enriquecerConPais ya encontró el código en `terceros` — si no, queda
    // en blanco (limpiado arriba) hasta que se suba la factura de ese cliente.
    if (registro.codigoPaisDian) {
      row.getCell(col.PAIS).value = Number(registro.codigoPaisDian);
    }

    row.getCell(col.IBRU).value = registro.ibru;
    row.getCell(col.DEV).value  = registro.dev;
  });
}

// Uso individual (un solo formato): carga la plantilla, llena la hoja y devuelve el archivo ya
// serializado. La generación combinada de varios formatos no pasa por acá — ver
// services/exogenas/index.js#llenarPlantillaCombinada.
async function llenarPlantilla(bufferPlantilla, registros) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(bufferPlantilla);
  llenarHoja(workbook, registros);
  return workbook.xlsx.writeBuffer();
}

module.exports = {
  leerYAgrupar, enriquecerConPais, llenarHoja, llenarPlantilla,
  HOJA_TOKEN, COLUMNAS_TOKEN_REQUERIDAS, COLUMNAS_IMPUESTOS,
};
