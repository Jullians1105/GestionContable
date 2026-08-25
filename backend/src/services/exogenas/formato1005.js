// Formato 1005 — IVA descontable. Puerto de exogena_1005_app.py (docs/arqExogena.md).
//
// Reglas de negocio fijas para 1005 (confirmadas por el usuario, no son opciones de UI):
// - Solo Grupo = "Recibido" (las compras que sí aplican ya vienen pre-seleccionadas por el
//   contador en la hoja "COMPRAS" del TOKEN; este filtro es una red de seguridad adicional).
// - Las notas crédito de compras NUNCA se incluyen en el VIMP.
// - Hoja "DEV VENTAS" (opcional): notas crédito sobre VENTAS de la empresa a sus clientes —
//   ahí el tercero está en NIT/Nombre RECEPTOR, no Emisor (el Emisor ahí es la propia
//   empresa, al revés que en COMPRAS). Su IVA alimenta la columna IVADE. Si un mismo NIT
//   aparece en COMPRAS y en DEV VENTAS, se fusiona en una sola fila (un NID no se repite).
const ExcelJS = require('exceljs');
const { normalizeXlsxBuffer } = require('./utils/normalizeXlsx');
const { normalizarTexto, limpiarIdentificacion, calcularDV, inferirTipoDocumento, esNotaCredito, separarNombrePersona, round2 } = require('./utils/dian');
const { getCellText, encontrarFilaYColumnas, copiarEstiloFila } = require('./utils/plantillaExcel');

const HOJA_TOKEN = 'COMPRAS';
const COLUMNAS_TOKEN_REQUERIDAS = ['Tipo de documento', 'NIT Emisor', 'Nombre Emisor', 'IVA', 'Grupo'];

const HOJA_DEV_VENTAS = 'DEV VENTAS';
const COLUMNAS_DEV_VENTAS_REQUERIDAS = ['NIT Receptor', 'Nombre Receptor', 'IVA'];

const HOJA_PLANTILLA = '1005';

// Concepto (CPT) fijo para todo el 1005 — confirmado contra un reporte real ya presentado
// (docs/EXOGENA - GUIA FORMATOS.xlsx, hoja "1005 OK").
const CONCEPTO_1005 = 5555;

// match: substring normalizado a buscar en el encabezado de la plantilla (ver
// encontrarFilaYColumnas). key: nombre corto usado en el resto de este archivo.
const CAMPOS_PLANTILLA = [
  { match: 'CONCEPTO', key: 'CPT' },
  { match: 'TIPO DE DOCUMENTO', key: 'TDOC' },
  { match: 'NUMERO DE IDENTIFICACION', key: 'NID' },
  { match: 'DIGITO DE VERIFICACION', key: 'DV' },
  { match: 'PRIMER APELLIDO DEL INFORMADO', key: 'APL1' },
  { match: 'SEGUNDO APELLIDO DEL INFORMADO', key: 'APL2' },
  { match: 'PRIMER NOMBRE DEL INFORMADO', key: 'NOM1' },
  { match: 'OTROS NOMBRES DEL INFORMADO', key: 'NOM2' },
  { match: 'RAZON SOCIAL DEL INFORMADO', key: 'RAZ' },
  { match: 'IMPUESTO DESCONTABLE', key: 'VIMP' },
  { match: 'IVA RESULTANTE POR DEVOLUCIONES', key: 'IVADE' },
  // IVAVCG deliberadamente fuera de esta lista: no se toca (ni se limpia ni se escribe) —
  // no hay fuente de datos confirmada para esa columna todavía.
];
const HEADERS_PLANTILLA = CAMPOS_PLANTILLA.map((c) => c.match);

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

function obtenerOCrear(acumulador, tipoDocumento, identificacion, razonSocial) {
  const key = `${tipoDocumento}|${identificacion}`;
  let entrada = acumulador.get(key);
  if (!entrada) {
    entrada = { tipoDocumento, identificacion, razonSocial, vimp: 0, ivade: 0 };
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
    throw new Error(`El archivo TOKEN debe tener una hoja llamada "${HOJA_TOKEN}" con las compras ya validadas.`);
  }

  const acumulador = new Map(); // key: `${tipoDocumento}|${identificacion}` -> { identificacion, tipoDocumento, razonSocial, vimp, ivade }

  // --- COMPRAS -> VIMP (proveedores, tercero en Emisor) ---
  {
    const colMap = mapearColumnas(ws, COLUMNAS_TOKEN_REQUERIDAS, HOJA_TOKEN);
    const getStr = (row, nombreCol) => getCellText(row.getCell(colMap[nombreCol])).trim() || null;
    const getNum = (row, nombreCol) => aNumero(row.getCell(colMap[nombreCol]).value);

    ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber === 1) return;

      const grupo = normalizarTexto(getStr(row, 'Grupo'));
      if (grupo !== 'RECIBIDO') return;

      const tipoDocExcel = getStr(row, 'Tipo de documento');
      if (esNotaCredito(tipoDocExcel)) return;

      const identificacion = limpiarIdentificacion(getStr(row, 'NIT Emisor'));
      const nombre = getStr(row, 'Nombre Emisor');
      if (!identificacion || !nombre) return;

      const iva = getNum(row, 'IVA');
      if (iva === 0) return;

      const tipoDocumento = inferirTipoDocumento(identificacion, nombre);
      obtenerOCrear(acumulador, tipoDocumento, identificacion, nombre).vimp += iva;
    });
  }

  // --- DEV VENTAS -> IVADE (clientes, tercero en Receptor) — hoja opcional ---
  const wsDevVentas = encontrarHoja(workbook, HOJA_DEV_VENTAS);
  if (wsDevVentas) {
    const colMap = mapearColumnas(wsDevVentas, COLUMNAS_DEV_VENTAS_REQUERIDAS, HOJA_DEV_VENTAS);
    const getStr = (row, nombreCol) => getCellText(row.getCell(colMap[nombreCol])).trim() || null;
    const getNum = (row, nombreCol) => aNumero(row.getCell(colMap[nombreCol]).value);

    wsDevVentas.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber === 1) return;

      const identificacion = limpiarIdentificacion(getStr(row, 'NIT Receptor'));
      const nombre = getStr(row, 'Nombre Receptor');
      if (!identificacion || !nombre) return;

      const iva = getNum(row, 'IVA');
      if (iva === 0) return;

      const tipoDocumento = inferirTipoDocumento(identificacion, nombre);
      obtenerOCrear(acumulador, tipoDocumento, identificacion, nombre).ivade += iva;
    });
  }

  const registros = Array.from(acumulador.values()).map((r) => ({
    tipoDocumento: r.tipoDocumento,
    identificacion: r.identificacion,
    digitoVerificacion: calcularDV(r.identificacion),
    razonSocial: r.razonSocial,
    vimp: round2(r.vimp),
    ivade: round2(r.ivade),
  }));

  registros.sort((a, b) => {
    const na = normalizarTexto(a.razonSocial);
    const nb = normalizarTexto(b.razonSocial);
    if (na !== nb) return na < nb ? -1 : 1;
    return a.identificacion < b.identificacion ? -1 : a.identificacion > b.identificacion ? 1 : 0;
  });

  return registros;
}

async function llenarPlantilla(bufferPlantilla, registros) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(bufferPlantilla);

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
    // Se re-aplica el estilo de la fila modelo a toda fila de datos (excepto la modelo
    // misma): más simple y seguro que intentar detectar si una fila "ya tenía estilo" (la
    // plantilla real no usa bandas de color alternadas en estas columnas), a diferencia de
    // copiar_estilo_fila en Python que solo lo hacía para filas nuevas o sin estilo previo.
    if (fila !== filaInicio) copiarEstiloFila(ws, filaInicio, fila);

    const row = ws.getRow(fila);
    row.getCell(col.CPT).value  = CONCEPTO_1005;
    row.getCell(col.TDOC).value = registro.tipoDocumento;
    row.getCell(col.NID).value  = Number(registro.identificacion);
    row.getCell(col.DV).value   = registro.digitoVerificacion;

    // Jurídica (31): nombre completo en Razón Social. Natural (13): nombre separado en
    // NOM1/NOM2/APL1/APL2 — ver separarNombrePersona (heurística, no exacta).
    if (registro.tipoDocumento === 31) {
      row.getCell(col.RAZ).value = registro.razonSocial;
    } else {
      const { nom1, nom2, apl1, apl2 } = separarNombrePersona(registro.razonSocial);
      row.getCell(col.NOM1).value = nom1;
      row.getCell(col.NOM2).value = nom2;
      row.getCell(col.APL1).value = apl1;
      row.getCell(col.APL2).value = apl2;
    }

    row.getCell(col.VIMP).value  = registro.vimp;
    row.getCell(col.IVADE).value = registro.ivade;
  });

  return workbook.xlsx.writeBuffer();
}

module.exports = { leerYAgrupar, llenarPlantilla, HOJA_TOKEN, COLUMNAS_TOKEN_REQUERIDAS };
