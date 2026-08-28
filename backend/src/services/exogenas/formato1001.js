// Formato 1001 — Pagos o abonos en cuenta y retenciones practicadas. FASE 1 (parcial): solo
// identifica los terceros involucrados y cruza su ubicación (dirección/municipio/departamento/
// país) contra la tabla `terceros` — ver docs/PLANEACION_EXTRACCION_DATOS_FACTURAS.md.
//
// Lo que este archivo NO hace todavía (pendiente de reglas de negocio, no inventar):
// - Concepto (CPT): depende de qué se compró en cada factura (servicios, arrendamientos,
//   honorarios...), pendiente de definir con el usuario.
// - Columnas de dinero (PAGO, PNDED, IDED, INDED, RETP, RETA, COMUN, NDOM): fuente sin
//   confirmar todavía.
// Por eso este módulo NO implementa `llenarHoja`/`llenarPlantilla` ni se registra en
// `services/exogenas/index.js#ESTRATEGIAS` — no genera ningún Excel de 1001 real. Solo expone
// `leerYAgrupar` + `enriquecerConTerceros`, usados por exogenasController#verificarTerceros1001
// para el chequeo previo ("¿a quién le falta la dirección antes de generar la exógena?").
const ExcelJS = require('exceljs');
const db = require('../../config/database');
const { normalizeXlsxBuffer } = require('./utils/normalizeXlsx');
const { normalizarTexto, limpiarIdentificacion, calcularDV, inferirTipoDocumento } = require('./utils/dian');
const { getCellText } = require('./utils/plantillaExcel');

const HOJA_TOKEN = 'COMPRAS';
const COLUMNAS_TOKEN_REQUERIDAS = ['Tipo de documento', 'NIT Emisor', 'Nombre Emisor', 'Grupo'];

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

module.exports = { leerYAgrupar, enriquecerConTerceros, HOJA_TOKEN, COLUMNAS_TOKEN_REQUERIDAS };
