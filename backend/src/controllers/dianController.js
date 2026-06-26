const { v4: uuidv4 } = require('uuid');
const ExcelJS = require('exceljs');
const { parse } = require('date-fns');
const db = require('../config/database');

const REQUIRED_COLS = [
  'Tipo de documento', 'CUFE/CUDE', 'Fecha Emisión',
  'NIT Emisor', 'Nombre Emisor', 'IVA', 'Total', 'Estado', 'Grupo',
];

const FACTURA     = 'Factura electrónica';
const NOTA_CREDITO = 'Nota de crédito electrónica';
const RECIBIDO    = 'Recibido';
const EMITIDO     = 'Emitido';

// Extrae el valor primitivo de una celda de exceljs (maneja fórmulas y texto enriquecido)
const getCellRawValue = (cell) => {
  const val = cell.value;
  if (val === null || val === undefined) return null;
  if (typeof val === 'object' && 'result' in val) return val.result;
  if (typeof val === 'object' && val.richText) {
    return val.richText.map((r) => r.text).join('');
  }
  return val;
};

const uploadDian = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Se requiere un archivo Excel (.xlsx)' });
    }

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(req.file.buffer);

    const worksheet = workbook.worksheets[0];
    if (!worksheet) {
      return res.status(400).json({ error: 'El archivo no contiene hojas de cálculo' });
    }

    // Construir mapa nombre → número de columna a partir de la fila 1
    const colMap = {};
    worksheet.getRow(1).eachCell((cell, colNumber) => {
      const name = String(getCellRawValue(cell) ?? '').trim();
      if (name) colMap[name] = colNumber;
    });

    // Validar columnas obligatorias
    for (const col of REQUIRED_COLS) {
      if (!(col in colMap)) {
        return res.status(400).json({ error: `Columna requerida ausente en el archivo: "${col}"` });
      }
    }

    const getStr = (row, name) => {
      const idx = colMap[name];
      if (!idx) return null;
      const raw = getCellRawValue(row.getCell(idx));
      if (raw === null || raw === undefined) return null;
      const s = String(raw).trim();
      return s || null;
    };

    const getNum = (row, name) => {
      const idx = colMap[name];
      if (!idx) return 0;
      const raw = getCellRawValue(row.getCell(idx));
      if (raw === null || raw === undefined) return 0;
      if (typeof raw === 'number') return raw;
      const num = parseFloat(String(raw).trim());
      return isNaN(num) ? 0 : num;
    };

    const parseDate = (raw) => {
      if (!raw) return null;
      const parsed = parse(raw, 'dd-MM-yyyy', new Date());
      return isNaN(parsed.getTime()) ? raw : parsed.toISOString().split('T')[0];
    };

    // Parsear filas de datos (desde la fila 2)
    const filas = [];
    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;

      const tipoDocumento = getStr(row, 'Tipo de documento');
      const grupo         = getStr(row, 'Grupo');
      if (!tipoDocumento && !grupo) return; // fila vacía al final del archivo

      filas.push({
        tipoDocumento,
        cufe:           getStr(row, 'CUFE/CUDE'),
        folio:          getStr(row, 'Folio'),
        prefijo:        getStr(row, 'Prefijo'),
        divisa:         getStr(row, 'Divisa'),
        formaPago:      getStr(row, 'Forma de Pago'),
        medioPago:      getStr(row, 'Medio de Pago'),
        fechaEmision:   parseDate(getStr(row, 'Fecha Emisión')),
        fechaRecepcion: parseDate(getStr(row, 'Fecha Recepción')),
        nitEmisor:      getStr(row, 'NIT Emisor'),    // siempre texto
        nombreEmisor:   getStr(row, 'Nombre Emisor'),
        nitReceptor:    getStr(row, 'NIT Receptor'),  // siempre texto
        nombreReceptor: getStr(row, 'Nombre Receptor'),
        iva:            getNum(row, 'IVA'),
        ica:            colMap['ICA']             ? getNum(row, 'ICA')             : null,
        ic:             colMap['IC']              ? getNum(row, 'IC')              : null,
        inc:            colMap['INC']             ? getNum(row, 'INC')             : null,
        timbre:         colMap['Timbre']          ? getNum(row, 'Timbre')          : null,
        incBolsas:      colMap['INC Bolsas']      ? getNum(row, 'INC Bolsas')      : null,
        inCarbono:      colMap['IN Carbono']      ? getNum(row, 'IN Carbono')      : null,
        inCombustibles: colMap['IN Combustibles'] ? getNum(row, 'IN Combustibles') : null,
        icDatos:        colMap['IC Datos']        ? getNum(row, 'IC Datos')        : null,
        icl:            colMap['ICL']             ? getNum(row, 'ICL')             : null,
        inpp:           colMap['INPP']            ? getNum(row, 'INPP')            : null,
        ibua:           colMap['IBUA']            ? getNum(row, 'IBUA')            : null,
        icui:           colMap['ICUI']            ? getNum(row, 'ICUI')            : null,
        reteIva:        colMap['Rete IVA']        ? getNum(row, 'Rete IVA')        : null,
        reteRenta:      colMap['Rete Renta']      ? getNum(row, 'Rete Renta')      : null,
        reteIca:        colMap['Rete ICA']        ? getNum(row, 'Rete ICA')        : null,
        total: getNum(row, 'Total'),
        estado: getStr(row, 'Estado'),
        grupo,
      });
    });

    if (filas.length === 0) {
      return res.status(400).json({ error: 'El archivo no contiene filas de datos' });
    }

    // Cálculo base — comparación exacta de texto, sin coincidencia parcial
    const sumField = (pred, field) =>
      filas.filter(pred).reduce((acc, r) => acc + (r[field] ?? 0), 0);

    const esFacturaRecibida  = (r) => r.grupo === RECIBIDO && r.tipoDocumento === FACTURA;
    const esNotaRecibida     = (r) => r.grupo === RECIBIDO && r.tipoDocumento === NOTA_CREDITO;
    const esFacturaEmitida   = (r) => r.grupo === EMITIDO  && r.tipoDocumento === FACTURA;
    const esNotaEmitida      = (r) => r.grupo === EMITIDO  && r.tipoDocumento === NOTA_CREDITO;

    const calculos = {
      comprasBruto:          sumField(esFacturaRecibida, 'total'),
      devolucionCompras:     sumField(esNotaRecibida,    'total'),
      ventasBruto:           sumField(esFacturaEmitida,  'total'),
      devolucionVentas:      sumField(esNotaEmitida,     'total'),
      ivaDescontable:        sumField(esFacturaRecibida, 'iva'),
      ivaGenerado:           sumField(esFacturaEmitida,  'iva'),
      ivaDevolucionCompras:  sumField(esNotaRecibida,    'iva'),
      ivaDevolucionVentas:   sumField(esNotaEmitida,     'iva'),
    };

    // Persistir borrador (expira en 14 días por DEFAULT en la tabla)
    const id = uuidv4();
    await db.query(
      `INSERT INTO calculo_borradores (id, nombre_archivo, creado_por, datos)
       VALUES ($1, $2, $3, $4)`,
      [id, req.file.originalname, req.user.userId, JSON.stringify({ filas, calculos })]
    );

    res.status(201).json({ id, calculos, totalFilas: filas.length });
  } catch (err) {
    next(err);
  }
};

module.exports = { uploadDian };
