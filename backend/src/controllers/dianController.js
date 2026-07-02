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
    let indice = 0;
    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;

      const tipoDocumento = getStr(row, 'Tipo de documento');
      const grupo         = getStr(row, 'Grupo');
      if (!tipoDocumento && !grupo) return; // fila vacía al final del archivo

      filas.push({
        indice: indice++,
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
        clasificacionRetencion: null,
        tasaRetencion:          null,
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

    // Proyección para la respuesta: campos de clasificación + solo columnas presentes en el archivo
    const filasParaClasificar = filas.map((f) => {
      const out = {
        indice:                 f.indice,
        cufe:                   f.cufe,
        tipoDocumento:          f.tipoDocumento,
        fechaEmision:           f.fechaEmision,
        nombreEmisor:           f.nombreEmisor,
        nitEmisor:              f.nitEmisor,
        total:                  f.total,
        iva:                    f.iva,
        grupo:                  f.grupo,
        estado:                 f.estado,
        clasificacionRetencion: null,
        tasaRetencion:          null,
      };
      if (colMap['Folio'])   out.folio   = f.folio;
      if (colMap['Prefijo']) out.prefijo = f.prefijo;
      return out;
    });

    // Persistir borrador con campos de clasificación incluidos (expira en 14 días)
    const id = uuidv4();
    await db.query(
      `INSERT INTO calculo_borradores (id, nombre_archivo, creado_por, datos)
       VALUES ($1, $2, $3, $4)`,
      [id, req.file.originalname, req.user.userId, JSON.stringify({ filas, calculos })]
    );

    res.status(201).json({ id, calculos, totalFilas: filas.length, filasParaClasificar });
  } catch (err) {
    next(err);
  }
};

const patchBorrador = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { indice, clasificacionRetencion, tasaRetencion } = req.body;

    if (indice === undefined || indice === null) {
      return res.status(400).json({ error: '"indice" es requerido' });
    }

    // Verificar existencia y propiedad
    const check = await db.query(
      `SELECT datos->'filas' AS filas FROM calculo_borradores
       WHERE id = $1 AND creado_por = $2`,
      [id, req.user.userId]
    );
    if (check.rows.length === 0) {
      return res.status(404).json({ error: 'Borrador no encontrado' });
    }

    const filas = check.rows[0].filas;
    if (!Array.isArray(filas) || !filas.some((f) => f.indice === indice)) {
      return res.status(400).json({ error: `No existe fila con índice ${indice}` });
    }

    // Actualizar el elemento del array JSONB in-place
    await db.query(
      `UPDATE calculo_borradores
       SET datos = jsonb_set(
         datos,
         '{filas}',
         (SELECT jsonb_agg(
            CASE WHEN (f->>'indice')::int = $2
              THEN f || jsonb_build_object(
                'clasificacionRetencion', $3::text,
                'tasaRetencion',          $4::float8
              )
              ELSE f
            END
          ) FROM jsonb_array_elements(datos->'filas') f)
       )
       WHERE id = $1`,
      [id, indice, clasificacionRetencion ?? null, tasaRetencion ?? null]
    );

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
};

// ── Tasas de nómina (sincronizadas con DianNominaPage.jsx) ─────────────────────
const TASA_APORTES     = 0.12 + 0.0052 + 0.04;        // 16,52 %
const TASA_PROVISIONES = 0.0833 + 0.0833 + 0.01 + 0.0417; // 21,83 %

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

// ── Helpers de formato Excel ───────────────────────────────────────────────────
const XL_BLUE    = 'FF004AC6';
const XL_WHITE   = 'FFFFFFFF';
const XL_BLUE_LT = 'FFD6E0F3';
const XL_GRAY    = 'FFE5E7EB';
const XL_ALT     = 'FFF0F4FF';
const XL_RED     = 'FFDC2626';

const sfill = (argb) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });
const thinBorder = { style: 'thin', color: { argb: 'FFCCD0E0' } };
const xlBorder   = { top: thinBorder, left: thinBorder, bottom: thinBorder, right: thinBorder };

const fechaES = (iso) => {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
};

const applyHeaderRow = (row, numCols) => {
  for (let c = 1; c <= numCols; c++) {
    const cell = row.getCell(c);
    cell.font      = { bold: true, color: { argb: XL_WHITE }, size: 10 };
    cell.fill      = sfill(XL_BLUE);
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border    = xlBorder;
  }
  row.height = 20;
};

const applyDataRow = (row, numCols, isAlt) => {
  for (let c = 1; c <= numCols; c++) {
    const cell = row.getCell(c);
    cell.fill   = sfill(isAlt ? XL_ALT : XL_WHITE);
    cell.border = xlBorder;
  }
};

const applyTotalRow = (row, numCols) => {
  for (let c = 1; c <= numCols; c++) {
    row.getCell(c).fill   = sfill(XL_BLUE_LT);
    row.getCell(c).border = xlBorder;
    row.getCell(c).font   = { bold: true };
  }
};

// ── Hoja RESUMEN ───────────────────────────────────────────────────────────────
function buildResumen(ws, resumen, nomina, meta) {
  ws.columns = [{ key: 'a', width: 46 }, { key: 'b', width: 22 }];

  const COP  = '"$ "#,##0';
  const COPN = '"$ ("#,##0")"';

  const blank = () => ws.addRow([]);

  const sectionRow = (label) => {
    const row = ws.addRow([label]);
    row.getCell(1).font  = { bold: true, color: { argb: XL_WHITE }, size: 10 };
    row.getCell(1).fill  = sfill(XL_BLUE);
    row.height = 20;
  };

  const valueRow = (label, val, opts = {}) => {
    const absVal = val !== null && val !== undefined ? Math.abs(val) : null;
    const row = ws.addRow([label, absVal]);
    const cA  = row.getCell(1);
    const cB  = row.getCell(2);
    cA.alignment = { horizontal: 'left', indent: opts.indent ?? 1 };
    cB.alignment = { horizontal: 'right' };
    cB.numFmt    = opts.isNeg ? COPN : COP;

    if (opts.isNeg) {
      cB.font = { color: { argb: XL_RED }, bold: !!opts.bold };
    } else if (opts.bold) {
      cA.font = { bold: true };
      cB.font = { bold: true };
    }
    if (opts.subtotal) {
      cA.fill = sfill(XL_BLUE_LT);
      cB.fill = sfill(XL_BLUE_LT);
      cA.font = { bold: true };
      cB.font = { bold: true };
    }
    if (opts.total) {
      cA.fill = sfill(XL_GRAY);
      cB.fill = sfill(XL_GRAY);
      cA.font = { bold: true, size: 11 };
      cB.font = { bold: true, size: 11, ...(opts.isNeg ? { color: { argb: XL_RED } } : {}) };
    }
  };

  // Encabezado
  const periodoStr = meta.periodoDesde && meta.periodoHasta
    ? `${fechaES(meta.periodoDesde)} — ${fechaES(meta.periodoHasta)}`
    : '—';

  const titleRow = ws.addRow([`ESTADO DE RESULTADOS — PERÍODO ${periodoStr}`]);
  titleRow.getCell(1).font   = { bold: true, size: 12 };
  titleRow.height            = 26;

  const docRow = ws.addRow(['Total documentos procesados', meta.totalFilas]);
  docRow.getCell(1).alignment = { horizontal: 'left' };
  docRow.getCell(2).alignment = { horizontal: 'right' };
  blank();

  // INGRESOS
  sectionRow('INGRESOS');
  valueRow('Ventas (bruto)',           resumen.ventasBruto,      { indent: 2 });
  valueRow('(−) Devolución en ventas', resumen.devolucionVentas, { isNeg: true, indent: 2 });
  valueRow('Ventas Netas',             resumen.ventasNetas,      { subtotal: true });
  blank();

  // COSTOS
  sectionRow('COSTOS');
  valueRow('Compras (bruto)',             resumen.comprasBruto,      { indent: 2 });
  valueRow('(−) Devolución en compras',   resumen.devolucionCompras, { isNeg: true, indent: 2 });
  valueRow('Compras Netas',               resumen.comprasNetas,      { subtotal: true });
  if (resumen.documentoSoporte > 0) {
    valueRow('Documento Soporte Emitido', resumen.documentoSoporte,  { indent: 2 });
  }
  valueRow('Costos Totales',              resumen.costosTotales,     { subtotal: true });
  blank();

  valueRow('UTILIDAD BRUTA', resumen.utilidadBruta, { total: true });
  blank();

  // IMPUESTOS
  sectionRow('IMPUESTOS');
  valueRow('IVA Generado',          resumen.ivaGenerado,     { indent: 2 });
  valueRow('(−) IVA Descontable',   resumen.ivaDescontable,  { isNeg: true, indent: 2 });
  valueRow('(−) IVA Devoluciones',  resumen.ivaDevoluciones, { isNeg: true, indent: 2 });
  const ivaNeg = resumen.ivaPagar < 0;
  valueRow(
    ivaNeg ? 'IVA a pagar (saldo a FAVOR)' : 'IVA a pagar',
    resumen.ivaPagar,
    { subtotal: true, isNeg: ivaNeg }
  );
  blank();

  valueRow('(−) Total retenciones', resumen.totalRetenciones, { isNeg: true, bold: true });
  blank();

  valueRow('UTILIDAD NETA (antes nómina)', resumen.utilidadNeta, { total: true });
  blank();

  // NÓMINA
  if (nomina) {
    sectionRow('NÓMINA');
    valueRow(
      `Costo laboral (${nomina.empleados} empleados × ${nomina.meses} meses)`,
      nomina.costoTotal,
      { isNeg: true, indent: 2 }
    );
    blank();
  }

  // UTILIDAD FINAL
  const utilFinal = resumen.utilidadNeta - (nomina?.costoTotal ?? 0);
  valueRow('UTILIDAD FINAL', utilFinal, { total: true, isNeg: utilFinal < 0 });
}

// ── Hoja RETENCIONES_POR_PROVEEDOR ─────────────────────────────────────────────
function buildRetenciones(ws, retencionesPorProveedor, totalRetenciones) {
  ws.columns = [
    { key: 'nit',      width: 16 },
    { key: 'nombre',   width: 40 },
    { key: 'concepto', width: 16 },
    { key: 'tasa',     width: 12 },
    { key: 'total',    width: 20 },
  ];

  const hdr = ws.addRow(['NIT Emisor', 'Nombre Emisor', 'Concepto', 'Tasa (%)', 'Total Retenido']);
  applyHeaderRow(hdr, 5);

  let i = 0;
  for (const [nit, prv] of Object.entries(retencionesPorProveedor)) {
    for (const [concepto, det] of Object.entries(prv.retenciones)) {
      const row = ws.addRow([nit, prv.nombreEmisor, concepto, det.tasa, det.totalRetenido]);
      row.getCell(1).alignment = { horizontal: 'right' };
      row.getCell(2).alignment = { horizontal: 'left' };
      row.getCell(3).alignment = { horizontal: 'center' };
      row.getCell(4).numFmt    = '0.00';
      row.getCell(4).alignment = { horizontal: 'center' };
      row.getCell(5).numFmt    = '"$ "#,##0';
      row.getCell(5).alignment = { horizontal: 'right' };
      applyDataRow(row, 5, i % 2 === 1);
      i++;
    }
  }

  const totalRow = ws.addRow(['TOTAL', '', '', '', totalRetenciones]);
  totalRow.getCell(1).alignment = { horizontal: 'left' };
  totalRow.getCell(5).numFmt    = '"$ "#,##0';
  totalRow.getCell(5).alignment = { horizontal: 'right' };
  applyTotalRow(totalRow, 5);
}

// ── Hoja DETALLE_COMPRAS ───────────────────────────────────────────────────────
function buildDetalleCompras(ws, filasRecibido) {
  ws.columns = [
    { key: 'fecha',     width: 14 },
    { key: 'folio',     width: 10 },
    { key: 'nombre',    width: 36 },
    { key: 'nit',       width: 15 },
    { key: 'total',     width: 18 },
    { key: 'clasi',     width: 16 },
    { key: 'tasa',      width: 12 },
    { key: 'retencion', width: 18 },
  ];

  const hdr = ws.addRow([
    'Fecha Emisión', 'Folio', 'Nombre Emisor', 'NIT Emisor',
    'Total', 'Clasificación', 'Tasa (%)', 'Retención',
  ]);
  applyHeaderRow(hdr, 8);

  filasRecibido.forEach((fila, i) => {
    const retencion = round2(fila.total * ((fila.tasaRetencion ?? 0) / 100));
    const row = ws.addRow([
      fechaES(fila.fechaEmision),
      fila.folio   ?? '',
      fila.nombreEmisor ?? '',
      fila.nitEmisor    ?? '',
      fila.total   ?? 0,
      fila.clasificacionRetencion ?? '',
      fila.tasaRetencion ?? 0,
      retencion,
    ]);
    row.getCell(1).alignment = { horizontal: 'center' };
    row.getCell(2).alignment = { horizontal: 'center' };
    row.getCell(3).alignment = { horizontal: 'left' };
    row.getCell(4).alignment = { horizontal: 'right' };
    row.getCell(5).numFmt    = '"$ "#,##0';
    row.getCell(5).alignment = { horizontal: 'right' };
    row.getCell(6).alignment = { horizontal: 'center' };
    row.getCell(7).numFmt    = '0.00';
    row.getCell(7).alignment = { horizontal: 'center' };
    row.getCell(8).numFmt    = '"$ "#,##0';
    row.getCell(8).alignment = { horizontal: 'right' };
    applyDataRow(row, 8, i % 2 === 1);
  });
}

// ── Hoja NOMINA ────────────────────────────────────────────────────────────────
function buildNomina(ws, nomina, salario) {
  ws.columns = [{ key: 'a', width: 52 }, { key: 'b', width: 22 }];

  const COP   = '"$ "#,##0';
  const blank = () => ws.addRow([]);

  const sectionRow = (label) => {
    const row = ws.addRow([label]);
    row.getCell(1).font  = { bold: true, color: { argb: XL_WHITE }, size: 10 };
    row.getCell(1).fill  = sfill(XL_BLUE);
    row.height = 20;
  };

  const addRow = (label, val, opts = {}) => {
    const row = ws.addRow([label, val]);
    const cA  = row.getCell(1);
    const cB  = row.getCell(2);
    cA.alignment = { horizontal: 'left', indent: opts.indent ?? 0 };
    cB.alignment = { horizontal: 'right' };
    if (val !== null && val !== undefined) cB.numFmt = COP;
    if (opts.subtotal) {
      cA.fill = sfill(XL_BLUE_LT);
      cB.fill = sfill(XL_BLUE_LT);
      cA.font = { bold: true };
      cB.font = { bold: true };
    }
    if (opts.total) {
      cA.fill = sfill(XL_GRAY);
      cB.fill = sfill(XL_GRAY);
      cA.font = { bold: true, size: 11 };
      cB.font = { bold: true, size: 11 };
    }
  };

  sectionRow('PARÁMETROS DE ENTRADA');
  addRow('Número de empleados',           nomina.empleados, { indent: 2 });
  addRow('Número de meses',               nomina.meses,     { indent: 2 });
  addRow('Salario mensual (SMMLV 2026)',  salario,          { indent: 2 });
  blank();

  sectionRow('APORTES EMPRESA (por empleado/mes)');
  addRow('Pensión (12%)',               round2(salario * 0.12),   { indent: 2 });
  addRow('ARL Clase I (0,52%)',         round2(salario * 0.0052), { indent: 2 });
  addRow('Caja de Compensación (4%)',   round2(salario * 0.04),   { indent: 2 });
  addRow('Total aportes (16,52%)',      round2(salario * TASA_APORTES), { subtotal: true });
  blank();

  sectionRow('PROVISIONES (por empleado/mes)');
  addRow('Prima de Servicios (8,33%)', round2(salario * 0.0833), { indent: 2 });
  addRow('Cesantías (8,33%)',          round2(salario * 0.0833), { indent: 2 });
  addRow('Intereses Cesantías (1%)',   round2(salario * 0.01),   { indent: 2 });
  addRow('Vacaciones (4,17%)',         round2(salario * 0.0417), { indent: 2 });
  addRow('Total provisiones (21,83%)',round2(salario * TASA_PROVISIONES), { subtotal: true });
  blank();

  addRow(
    'Costo por empleado / mes (Salario + Aportes + Provisiones)',
    nomina.costoMes,
    { total: true }
  );
  blank();
  addRow(
    `Costo total (${nomina.empleados} emp × ${nomina.meses} meses × $${Math.round(nomina.costoMes).toLocaleString('es-CO')}/emp)`,
    nomina.costoTotal,
    { total: true }
  );
}

// ── Hoja METADATOS ─────────────────────────────────────────────────────────────
function buildMetadatos(ws, { totalFilas, periodoDesde, periodoHasta, procesadoEn }, userEmail, filas) {
  ws.columns = [{ key: 'campo', width: 34 }, { key: 'valor', width: 36 }];

  const emitido  = filas.filter((f) => f.grupo === EMITIDO).length;
  const recibido = filas.filter((f) => f.grupo === RECIBIDO).length;

  const d = new Date(procesadoEn);
  const fechaProc = `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()} ` +
                    `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}`;

  const hdr = ws.addRow(['Campo', 'Valor']);
  applyHeaderRow(hdr, 2);
  hdr.getCell(1).alignment = { horizontal: 'left' };
  hdr.getCell(2).alignment = { horizontal: 'left' };

  const rows = [
    ['Procesado por',            userEmail],
    ['Fecha de procesamiento',   fechaProc],
    ['Período del reporte DIAN',
      periodoDesde && periodoHasta ? `${fechaES(periodoDesde)} — ${fechaES(periodoHasta)}` : '—'],
    ['Total documentos',         totalFilas],
    ['Documentos Emitido',       emitido],
    ['Documentos Recibido',      recibido],
    ['Versión del cálculo',      '1.0'],
  ];

  rows.forEach(([campo, valor], i) => {
    const row = ws.addRow([campo, valor]);
    row.getCell(1).alignment = { horizontal: 'left' };
    row.getCell(2).alignment = { horizontal: 'left' };
    applyDataRow(row, 2, i % 2 === 1);
  });
}

const exportarBorrador = async (req, res, next) => {
  try {
    const { id } = req.params;
    const empleados = parseInt(req.body.empleados ?? 0, 10) || 0;
    const meses     = parseInt(req.body.meses     ?? 0, 10) || 0;
    const salario   = parseFloat(req.body.salario ?? 1423500) || 1423500;

    // ── 1. Leer borrador y verificar propiedad ─────────────────────────────
    const { rows } = await db.query(
      `SELECT datos FROM calculo_borradores WHERE id = $1 AND creado_por = $2`,
      [id, req.user.userId]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Borrador no encontrado' });
    }

    const { filas, calculos } = rows[0].datos;

    // ── 2. Filas Recibido no-nómina ─────────────────────────────────────────
    const filasRecibido = filas.filter(
      (f) => f.grupo === RECIBIDO && f.tipoDocumento !== 'Nomina Individual'
    );

    const sinClasificar = filasRecibido.filter((f) => f.clasificacionRetencion == null);
    if (sinClasificar.length > 0) {
      return res.status(400).json({
        error: `${sinClasificar.length} fila(s) sin clasificar. Clasifica todas antes de exportar.`,
      });
    }

    // ── 3. Retenciones agrupadas ───────────────────────────────────────────
    const retencionesPorProveedor = {};
    let totalRetenciones = 0;
    for (const fila of filasRecibido) {
      const { nitEmisor, nombreEmisor, total, clasificacionRetencion, tasaRetencion } = fila;
      const retencion = total * ((tasaRetencion ?? 0) / 100);
      totalRetenciones += retencion;
      const key = nitEmisor ?? 'SIN_NIT';
      if (!retencionesPorProveedor[key]) {
        retencionesPorProveedor[key] = { nombreEmisor: nombreEmisor ?? '', retenciones: {}, totalProveedorRetenido: 0 };
      }
      const prv = retencionesPorProveedor[key];
      if (!prv.retenciones[clasificacionRetencion]) {
        prv.retenciones[clasificacionRetencion] = { tasa: tasaRetencion, totalRetenido: 0 };
      }
      prv.retenciones[clasificacionRetencion].totalRetenido = round2(prv.retenciones[clasificacionRetencion].totalRetenido + retencion);
      prv.totalProveedorRetenido = round2(prv.totalProveedorRetenido + retencion);
    }
    totalRetenciones = round2(totalRetenciones);

    // ── 4. IVA ─────────────────────────────────────────────────────────────
    const ivaGenerado          = calculos.ivaGenerado          ?? 0;
    const ivaDescontable       = calculos.ivaDescontable       ?? 0;
    const ivaDevolucionCompras = calculos.ivaDevolucionCompras ?? 0;
    const ivaDevolucionVentas  = calculos.ivaDevolucionVentas  ?? 0;
    const ivaDevoluciones      = ivaDevolucionCompras + ivaDevolucionVentas;
    const ivaPagar             = round2(ivaGenerado - ivaDescontable - ivaDevoluciones);

    // ── 5. Estado de resultados ────────────────────────────────────────────
    const comprasBruto      = calculos.comprasBruto      ?? 0;
    const devolucionCompras = calculos.devolucionCompras ?? 0;
    const ventasBruto       = calculos.ventasBruto       ?? 0;
    const devolucionVentas  = calculos.devolucionVentas  ?? 0;
    const comprasNetas      = comprasBruto - devolucionCompras;
    const ventasNetas       = ventasBruto  - devolucionVentas;
    const documentoSoporte  = filas.filter((f) => f.tipoDocumento === 'Documento Soporte').reduce((s, f) => s + (f.total ?? 0), 0);
    const costosTotales     = comprasNetas + documentoSoporte;
    const utilidadBruta     = ventasNetas - costosTotales;
    const utilidadNeta      = round2(utilidadBruta - totalRetenciones);

    // ── 6. Nómina ──────────────────────────────────────────────────────────
    let costoMes = 0;
    let costoNominaTotal = 0;
    if (empleados > 0 && meses > 0) {
      costoMes         = salario * (1 + TASA_APORTES + TASA_PROVISIONES);
      costoNominaTotal = round2(empleados * meses * costoMes);
    }

    // Período
    const fechas       = filas.map((f) => f.fechaEmision).filter(Boolean).sort();
    const periodoDesde = fechas[0] ?? null;
    const periodoHasta = fechas[fechas.length - 1] ?? null;
    const procesadoEn  = new Date().toISOString();
    const totalFilas   = filas.length;

    const resumen = {
      ventasBruto:          round2(ventasBruto),
      devolucionVentas:     round2(devolucionVentas),
      ventasNetas:          round2(ventasNetas),
      comprasBruto:         round2(comprasBruto),
      devolucionCompras:    round2(devolucionCompras),
      comprasNetas:         round2(comprasNetas),
      documentoSoporte:     round2(documentoSoporte),
      costosTotales:        round2(costosTotales),
      utilidadBruta:        round2(utilidadBruta),
      ivaGenerado:          round2(ivaGenerado),
      ivaDescontable:       round2(ivaDescontable),
      ivaDevolucionCompras: round2(ivaDevolucionCompras),
      ivaDevolucionVentas:  round2(ivaDevolucionVentas),
      ivaDevoluciones:      round2(ivaDevoluciones),
      ivaPagar,
      totalRetenciones,
      utilidadNeta,
    };

    const nominaData = empleados > 0 && meses > 0
      ? { empleados, meses, salario: round2(salario), costoMes: round2(costoMes), costoTotal: costoNominaTotal }
      : null;

    // ── 7. Email del usuario para metadatos ────────────────────────────────
    const userRow   = await db.query('SELECT email FROM users WHERE id = $1', [req.user.userId]);
    const userEmail = userRow.rows[0]?.email ?? 'usuario';

    // ── 8. Generar workbook ────────────────────────────────────────────────
    const wb = new ExcelJS.Workbook();
    wb.creator = userEmail;
    wb.created = new Date();

    const meta = { totalFilas, periodoDesde, periodoHasta, procesadoEn };

    buildResumen(wb.addWorksheet('RESUMEN'), resumen, nominaData, meta);
    buildRetenciones(wb.addWorksheet('RETENCIONES_POR_PROVEEDOR'), retencionesPorProveedor, totalRetenciones);
    buildDetalleCompras(wb.addWorksheet('DETALLE_COMPRAS'), filasRecibido);
    if (nominaData) buildNomina(wb.addWorksheet('NOMINA'), nominaData, salario);
    buildMetadatos(wb.addWorksheet('METADATOS'), meta, userEmail, filas);

    // ── 9. Escribir buffer y enviar ────────────────────────────────────────
    const buffer = await wb.xlsx.writeBuffer();

    // Nombre de la empresa: emisor en facturas emitidas, o receptor en facturas recibidas
    const filaEmitida   = filas.find((f) => f.grupo === EMITIDO);
    const filaRecibida  = filas.find((f) => f.grupo === RECIBIDO);
    const empresaNombre = filaEmitida?.nombreEmisor ?? filaRecibida?.nombreReceptor ?? 'EMPRESA';
    const mesAnio       = periodoDesde ? periodoDesde.slice(0, 7) : new Date().toISOString().slice(0, 7);
    const nombreSan     = empresaNombre.replace(/[^A-Za-z0-9]/g, '_').replace(/_+/g, '_').replace(/_$/, '').slice(0, 20);
    const filename      = `ContabilidadDIAN_${nombreSan}_${mesAnio}.xlsx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);

    // ── 10. Eliminar borrador tras envío ───────────────────────────────────
    await db.query('DELETE FROM calculo_borradores WHERE id = $1 AND creado_por = $2', [id, req.user.userId]);
    console.log(`[DIAN] Borrador ${id} eliminado tras exportación exitosa`);

  } catch (err) {
    next(err);
  }
};

const CLASES_VALIDAS = ['Compras', 'Servicios', 'Arrendamiento', 'Honorarios', 'N/A'];

const aplicarClasificacionRapida = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { clasificacionRetencion, tasaRetencion } = req.body;

    if (!CLASES_VALIDAS.includes(clasificacionRetencion)) {
      return res.status(400).json({ error: `clasificacionRetencion inválido. Valores permitidos: ${CLASES_VALIDAS.join(', ')}` });
    }

    const check = await db.query(
      `SELECT datos->'filas' AS filas FROM calculo_borradores WHERE id = $1 AND creado_por = $2`,
      [id, req.user.userId]
    );
    if (check.rows.length === 0) return res.status(404).json({ error: 'Borrador no encontrado' });

    const filas = check.rows[0].filas;
    const sinClasificar = filas.filter((f) => f.clasificacionRetencion == null);

    if (sinClasificar.length === 0) {
      return res.json({ filasActualizadas: 0, filasRestanteSinClasificar: 0, mensaje: 'No hay filas sin clasificar' });
    }

    const nuevaTasa = clasificacionRetencion === 'N/A' ? null : (tasaRetencion ?? null);
    const nuevasFilas = filas.map((f) =>
      f.clasificacionRetencion == null
        ? { ...f, clasificacionRetencion, tasaRetencion: nuevaTasa }
        : f
    );

    await db.query(
      `UPDATE calculo_borradores SET datos = jsonb_set(datos, '{filas}', $1::jsonb) WHERE id = $2 AND creado_por = $3`,
      [JSON.stringify(nuevasFilas), id, req.user.userId]
    );

    res.json({ filasActualizadas: sinClasificar.length, filasRestanteSinClasificar: 0 });
  } catch (err) {
    next(err);
  }
};

module.exports = { uploadDian, patchBorrador, exportarBorrador, aplicarClasificacionRapida };
