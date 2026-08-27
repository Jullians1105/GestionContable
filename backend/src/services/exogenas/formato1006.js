// Formato 1006 — IVA generado + Impuesto nacional al consumo (INC). Espejo de formato1005.js,
// pero del lado de VENTAS en vez de COMPRAS.
//
// Reglas de negocio fijas para 1006 (confirmadas por el usuario contra el autoFilter real del
// TOKEN de prueba, no solo por el texto de la columna Grupo):
// - Hoja "VENTAS": solo Grupo = "Emitido" y Tipo de documento distinto de nota crédito (la
//   empresa es quien emite la venta) — mismo patrón que Grupo="Recibido" en COMPRAS para 1005.
//   El IVA de esas filas alimenta IMP (impuesto generado); el INC de esas mismas filas alimenta
//   ICON (impuesto nacional al consumo generado).
// - Hoja "DEV COMPRAS" (opcional): notas crédito que la empresa RECIBIÓ de sus proveedores
//   (devolución de compras) — ahí el tercero está en NIT/Nombre EMISOR (el proveedor que emite
//   la nota), y solo cuentan filas con Grupo = "Recibido" y Tipo de documento = nota crédito
//   (a diferencia de VENTAS/COMPRAS, acá SÍ se filtra por nota crédito porque es justamente lo
//   que se busca, no lo que se excluye). Su IVA alimenta la columna de salida "IVA" (recuperado
//   en devoluciones en compras anuladas/rescindidas/resueltas).
const ExcelJS = require('exceljs');
const { normalizeXlsxBuffer } = require('./utils/normalizeXlsx');
const { normalizarTexto, limpiarIdentificacion, calcularDV, inferirTipoDocumento, esNotaCredito, separarNombrePersona, round2 } = require('./utils/dian');
const { getCellText, encontrarFilaYColumnas, copiarEstiloFila } = require('./utils/plantillaExcel');

const HOJA_TOKEN = 'VENTAS';
const COLUMNAS_TOKEN_REQUERIDAS = ['Tipo de documento', 'NIT Receptor', 'Nombre Receptor', 'IVA', 'INC', 'Grupo'];

const HOJA_DEV_COMPRAS = 'DEV COMPRAS';
const COLUMNAS_DEV_COMPRAS_REQUERIDAS = ['Tipo de documento', 'NIT Emisor', 'Nombre Emisor', 'IVA', 'Grupo'];

const HOJA_PLANTILLA = '1006';

// Concepto (CPT) fijo para todo el 1006 — confirmado contra la guía oficial
// (docs/EXOGENA - GUIA FORMATOS.xlsx, hoja "1006 OK").
const CONCEPTO_1006 = 6666;

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
  { match: 'IMPUESTO GENERADO', key: 'IMP' },
  { match: 'IVA RECUPERADO EN DEVOLUCIONES', key: 'IVA' },
  { match: 'IMPUESTO NACIONAL AL CONSUMO', key: 'ICON' },
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
    entrada = { tipoDocumento, identificacion, razonSocial, imp: 0, iva: 0, icon: 0 };
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

  const acumulador = new Map(); // key: `${tipoDocumento}|${identificacion}` -> { identificacion, tipoDocumento, razonSocial, imp, iva, icon }

  // --- VENTAS -> IMP + ICON (clientes, tercero en Receptor) ---
  {
    const colMap = mapearColumnas(ws, COLUMNAS_TOKEN_REQUERIDAS, HOJA_TOKEN);
    const getStr = (row, nombreCol) => getCellText(row.getCell(colMap[nombreCol])).trim() || null;
    const getNum = (row, nombreCol) => aNumero(row.getCell(colMap[nombreCol]).value);

    ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber === 1) return;

      const grupo = normalizarTexto(getStr(row, 'Grupo'));
      if (grupo !== 'EMITIDO') return;

      const tipoDocExcel = getStr(row, 'Tipo de documento');
      if (esNotaCredito(tipoDocExcel)) return;

      const identificacion = limpiarIdentificacion(getStr(row, 'NIT Receptor'));
      const nombre = getStr(row, 'Nombre Receptor');
      if (!identificacion || !nombre) return;

      const iva = getNum(row, 'IVA');
      const inc = getNum(row, 'INC');
      if (iva === 0 && inc === 0) return;

      const tipoDocumento = inferirTipoDocumento(identificacion, nombre);
      const entrada = obtenerOCrear(acumulador, tipoDocumento, identificacion, nombre);
      entrada.imp += iva;
      entrada.icon += inc;
    });
  }

  // --- DEV COMPRAS -> IVA (proveedores, tercero en Emisor) — hoja opcional ---
  const wsDevCompras = encontrarHoja(workbook, HOJA_DEV_COMPRAS);
  if (wsDevCompras) {
    const colMap = mapearColumnas(wsDevCompras, COLUMNAS_DEV_COMPRAS_REQUERIDAS, HOJA_DEV_COMPRAS);
    const getStr = (row, nombreCol) => getCellText(row.getCell(colMap[nombreCol])).trim() || null;
    const getNum = (row, nombreCol) => aNumero(row.getCell(colMap[nombreCol]).value);

    wsDevCompras.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber === 1) return;

      const grupo = normalizarTexto(getStr(row, 'Grupo'));
      if (grupo !== 'RECIBIDO') return;

      const tipoDocExcel = getStr(row, 'Tipo de documento');
      if (!esNotaCredito(tipoDocExcel)) return;

      const identificacion = limpiarIdentificacion(getStr(row, 'NIT Emisor'));
      const nombre = getStr(row, 'Nombre Emisor');
      if (!identificacion || !nombre) return;

      const iva = getNum(row, 'IVA');
      if (iva === 0) return;

      const tipoDocumento = inferirTipoDocumento(identificacion, nombre);
      obtenerOCrear(acumulador, tipoDocumento, identificacion, nombre).iva += iva;
    });
  }

  const registros = Array.from(acumulador.values()).map((r) => ({
    tipoDocumento: r.tipoDocumento,
    identificacion: r.identificacion,
    digitoVerificacion: calcularDV(r.identificacion),
    razonSocial: r.razonSocial,
    imp: round2(r.imp),
    iva: round2(r.iva),
    icon: round2(r.icon),
  }));

  registros.sort((a, b) => {
    const na = normalizarTexto(a.razonSocial);
    const nb = normalizarTexto(b.razonSocial);
    if (na !== nb) return na < nb ? -1 : 1;
    return a.identificacion < b.identificacion ? -1 : a.identificacion > b.identificacion ? 1 : 0;
  });

  return registros;
}

// Llena la hoja "1006" de un workbook ya cargado en memoria, sin cargarlo ni guardarlo — así
// varios formatos pueden escribir cada uno su propia hoja sobre el MISMO workbook antes de
// serializarlo una sola vez (ver services/exogenas/index.js#llenarPlantillaCombinada).
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
    row.getCell(col.CPT).value  = CONCEPTO_1006;
    row.getCell(col.TDOC).value = registro.tipoDocumento;
    row.getCell(col.NID).value  = Number(registro.identificacion);
    row.getCell(col.DV).value   = registro.digitoVerificacion;

    if (registro.tipoDocumento === 31) {
      row.getCell(col.RAZ).value = registro.razonSocial;
    } else {
      const { nom1, nom2, apl1, apl2 } = separarNombrePersona(registro.razonSocial);
      row.getCell(col.NOM1).value = nom1;
      row.getCell(col.NOM2).value = nom2;
      row.getCell(col.APL1).value = apl1;
      row.getCell(col.APL2).value = apl2;
    }

    row.getCell(col.IMP).value  = registro.imp;
    row.getCell(col.IVA).value  = registro.iva;
    row.getCell(col.ICON).value = registro.icon;
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

module.exports = { leerYAgrupar, llenarHoja, llenarPlantilla };
