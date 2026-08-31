// Formato 1001 — Pagos o abonos en cuenta y retenciones practicadas. Identifica los terceros
// involucrados, cruza su ubicación (dirección/municipio/departamento/país) contra la tabla
// `terceros` (ver docs/PLANEACION_EXTRACCION_DATOS_FACTURAS.md) y ya genera la hoja "1001" de
// la plantilla con todo lo confirmado. Dos cosas quedan pendientes de definir con el usuario —
// no se inventan, así que esas columnas se dejan en blanco en el Excel generado:
// - CPT (concepto): depende de qué se compró en cada factura (servicios, arrendamientos,
//   honorarios...), pendiente de definir con el usuario.
// - Columnas de dinero (PAGO, PNDED, IDED, INDED, RETP, RETA, COMUN, NDOM): fuente sin
//   confirmar todavía (hoy es un cálculo manual, según el usuario).
const ExcelJS = require('exceljs');
const db = require('../../config/database');
const { normalizeXlsxBuffer } = require('./utils/normalizeXlsx');
const { normalizarTexto, limpiarIdentificacion, calcularDV, inferirTipoDocumento, separarNombrePersona } = require('./utils/dian');
const { getCellText, encontrarFilaYColumnas, copiarEstiloFila } = require('./utils/plantillaExcel');

const HOJA_TOKEN = 'COMPRAS';
const COLUMNAS_TOKEN_REQUERIDAS = ['Tipo de documento', 'NIT Emisor', 'Nombre Emisor', 'Grupo'];

const HOJA_PLANTILLA = '1001';

// Headers reales de la hoja "1001" de la plantilla SIIGO — sacados de
// docs/EXOGENA - GUIA FORMATOS.xlsx (hoja "1001 OK"), no inventados. Igual que 1007, el 1001 NO
// tiene columna de Dígito de Verificación (DV), y sí trae DIR/DPTO/MUN/PAIS. RETP y RETA
// comparten literalmente el mismo texto descriptivo en la plantilla real ("Retención en la
// fuente practicada Renta") — el match incluye el sufijo "(RETP)"/"(RETA)" para no confundirlas.
// CONCEPTO y las columnas de dinero se incluyen en el mapeo (para poder limpiarlas en cada
// corrida) pero deliberadamente no se les escribe ningún valor — ver cabecera del archivo.
const CAMPOS_PLANTILLA = [
  { match: 'CONCEPTO', key: 'CPT' },
  { match: 'TIPO DE DOCUMENTO', key: 'TDOC' },
  { match: 'NUMERO DE IDENTIFICACION', key: 'NID' },
  { match: 'PRIMER APELLIDO DEL INFORMADO', key: 'APL1' },
  { match: 'SEGUNDO APELLIDO DEL INFORMADO', key: 'APL2' },
  { match: 'PRIMER NOMBRE DEL INFORMADO', key: 'NOM1' },
  { match: 'OTROS NOMBRES DEL INFORMADO', key: 'NOM2' },
  { match: 'RAZON SOCIAL DEL INFORMADO', key: 'RAZ' },
  { match: 'DIRECCION (DIR)', key: 'DIR' },
  { match: 'CODIGO DEL DEPARTAMENTO', key: 'DPTO' },
  { match: 'CODIGO DEL MUNICIPIO', key: 'MUN' },
  { match: 'PAIS DE RESIDENCIA O DOMICILIO', key: 'PAIS' },
  { match: 'PAGO O ABONO EN CUENTA (PAGO)', key: 'PAGO' },
  { match: 'PAGO O ABONO EN CUENTA NO DEDUCIBLE', key: 'PNDED' },
  { match: 'IVA MAYOR VALOR DEL COSTO O GASTO DEDUCIBLE', key: 'IDED' },
  { match: 'IVA MAYOR VALOR DEL COSTO O GASTO NO DEDUCIBLE', key: 'INDED' },
  { match: 'RETENCION EN LA FUENTE PRACTICADA RENTA (RETP)', key: 'RETP' },
  { match: 'RETENCION EN LA FUENTE PRACTICADA RENTA (RETA)', key: 'RETA' },
  { match: 'RETENCION EN LA FUENTE PRACTICADA IVA A RESPONSABLES', key: 'COMUN' },
  { match: 'RETENCION EN LA FUENTE PRACTICADA IVA A NO RESIDENTES', key: 'NDOM' },
];
const HEADERS_PLANTILLA = CAMPOS_PLANTILLA.map((c) => c.match);

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
    entrada = { tipoDocumento, identificacion, razonSocial };
    acumulador.set(key, entrada);
  } else if (razonSocial.length > entrada.razonSocial.length) {
    entrada.razonSocial = razonSocial;
  }
  return entrada;
}

// Lee la hoja COMPRAS y devuelve la lista de terceros involucrados (deduplicados por NIT),
// sin concepto ni montos. A diferencia de 1005, NO excluye notas crédito: acá solo interesa
// "quién podría aparecer en el 1001", no sumar un valor — de sobra incluir un NIT de más no
// hace daño, mientras que excluirlo de menos sí dejaría a alguien sin chequear.
async function leerYAgrupar(bufferToken) {
  const bufferNormalizado = await normalizeXlsxBuffer(bufferToken);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(bufferNormalizado);

  const ws = encontrarHoja(workbook, HOJA_TOKEN);
  if (!ws) {
    throw new Error(`El archivo TOKEN debe tener una hoja llamada "${HOJA_TOKEN}" con las compras ya validadas.`);
  }

  const colMap = mapearColumnas(ws, COLUMNAS_TOKEN_REQUERIDAS, HOJA_TOKEN);
  const getStr = (row, nombreCol) => getCellText(row.getCell(colMap[nombreCol])).trim() || null;

  const acumulador = new Map();
  ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    if (row.hidden) return; // fila oculta por el AutoFilter del TOKEN (el contador copia el TOKEN completo y filtra a lo que necesita esa hoja) — no se debe contar

    const grupo = normalizarTexto(getStr(row, 'Grupo'));
    if (grupo !== 'RECIBIDO') return;

    const identificacion = limpiarIdentificacion(getStr(row, 'NIT Emisor'));
    const nombre = getStr(row, 'Nombre Emisor');
    if (!identificacion || !nombre) return;

    const tipoDocumento = inferirTipoDocumento(identificacion, nombre);
    obtenerOCrear(acumulador, tipoDocumento, identificacion, nombre);
  });

  const registros = Array.from(acumulador.values()).map((r) => ({
    tipoDocumento: r.tipoDocumento,
    identificacion: r.identificacion,
    digitoVerificacion: calcularDV(r.identificacion),
    razonSocial: r.razonSocial,
  }));

  registros.sort((a, b) => {
    const na = normalizarTexto(a.razonSocial);
    const nb = normalizarTexto(b.razonSocial);
    if (na !== nb) return na < nb ? -1 : 1;
    return a.identificacion < b.identificacion ? -1 : a.identificacion > b.identificacion ? 1 : 0;
  });

  return registros;
}

// Cruza cada registro contra `terceros` por NIT. `tieneDatosCompletos` exige dirección +
// código de municipio + código de departamento (lo mínimo que pide la plantilla 1001 en
// DIR/DPTO/MUN) — un tercero guardado pero sin esos 3 campos cuenta como incompleto, no como
// completo a medias.
async function enriquecerConTerceros(registros) {
  if (registros.length === 0) return [];

  const nits = registros.map((r) => r.identificacion);
  const { rows } = await db.query(
    `SELECT nit, direccion, municipio, codigo_municipio_dane, departamento, codigo_departamento_dane,
            pais, codigo_pais_dian
     FROM terceros WHERE nit = ANY($1)`,
    [nits]
  );
  const porNit = new Map(rows.map((t) => [t.nit, t]));

  return registros.map((r) => {
    const t = porNit.get(r.identificacion) ?? null;
    const tieneDatosCompletos = !!(t?.direccion && t?.codigo_municipio_dane && t?.codigo_departamento_dane);
    return {
      ...r,
      direccion: t?.direccion ?? null,
      municipio: t?.municipio ?? null,
      codigoMunicipioDane: t?.codigo_municipio_dane ?? null,
      departamento: t?.departamento ?? null,
      codigoDepartamentoDane: t?.codigo_departamento_dane ?? null,
      pais: t?.pais ?? null,
      codigoPaisDian: t?.codigo_pais_dian ?? null,
      tieneTercero: !!t,
      tieneDatosCompletos,
    };
  });
}

// Llena la hoja "1001" de un workbook ya cargado en memoria — mismo patrón que 1007 (ver
// services/exogenas/index.js#llenarPlantillaCombinada). CPT y las columnas de dinero no se
// escriben (ver cabecera del archivo): la limpieza de esas columnas sí corre, así que quedan en
// blanco y no con un valor de una corrida anterior. DIR/DPTO/MUN/PAIS solo se escriben si
// `enriquecerConTerceros` ya los encontró en `terceros` — si no, quedan en blanco hasta que se
// suba la factura de ese tercero.
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

    if (registro.direccion) row.getCell(col.DIR).value = registro.direccion;
    if (registro.codigoDepartamentoDane) row.getCell(col.DPTO).value = registro.codigoDepartamentoDane;
    // MUN pide solo los 3 dígitos de municipio dentro del departamento (no el código DANE
    // completo de 5) — confirmado contra la guía real: fila de ejemplo con DPTO=15, MUN=001
    // para un código DANE completo terminado en "001".
    if (registro.codigoMunicipioDane) row.getCell(col.MUN).value = registro.codigoMunicipioDane.slice(-3);
    if (registro.codigoPaisDian) row.getCell(col.PAIS).value = Number(registro.codigoPaisDian);
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
  leerYAgrupar, enriquecerConTerceros, llenarHoja, llenarPlantilla,
  HOJA_TOKEN, COLUMNAS_TOKEN_REQUERIDAS,
};
