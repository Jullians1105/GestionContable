// Consulta y exportación de lo ya guardado en contab_documentos/contab_periodos — la
// contraparte de "consulta" del guardado permanente que hace dianController.js#exportarBorrador.
// Mensual/cuatrimestral/anual son la misma consulta con distinto conjunto de meses; no hay tres
// tablas ni tres cálculos separados.
const ExcelJS = require('exceljs');
const db = require('../config/database');
const { limpiarIdentificacion } = require('../services/exogenas/utils/dian');
const { enriquecerConTerceros } = require('../services/exogenas/formato1001');

const CUATRIMESTRES = { 1: [1, 2, 3, 4], 2: [5, 6, 7, 8], 3: [9, 10, 11, 12] };
const MESES_ES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

// A partir de los query params decide si la consulta es mensual, cuatrimestral o anual — las
// tres son la misma consulta, solo cambia qué meses del año entran.
const resolverMeses = (query) => {
  if (query.mes) {
    const mes = parseInt(query.mes, 10);
    return { tipo: 'mensual', meses: [mes] };
  }
  if (query.cuatrimestre) {
    const cuatrimestre = parseInt(query.cuatrimestre, 10);
    return { tipo: 'cuatrimestral', meses: CUATRIMESTRES[cuatrimestre] ?? [] };
  }
  return { tipo: 'anual', meses: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] };
};

const normalizeDocumento = (d) => ({
  id: d.id,
  cufe: d.cufe,
  tipoDocumento: d.tipo_documento,
  grupo: d.grupo,
  fechaEmision: d.fecha_emision,
  folio: d.folio,
  prefijo: d.prefijo,
  nitTercero: d.nit_tercero,
  nombreTercero: d.nombre_tercero,
  subtotal: Number(d.subtotal ?? 0),
  total: Number(d.total ?? 0),
  iva: Number(d.iva ?? 0),
  ic: d.ic != null ? Number(d.ic) : null,
  inc: d.inc != null ? Number(d.inc) : null,
  clasificacionRetencion: d.clasificacion_retencion,
  tasaRetencion: d.tasa_retencion != null ? Number(d.tasa_retencion) : null,
  valorRetencion: d.valor_retencion != null ? Number(d.valor_retencion) : null,
  clasificacionIva: d.clasificacion_iva,
  concepto: d.concepto,
  anio: d.anio,
  mes: d.mes,
});

// Cruza el NIT del proveedor/cliente contra `terceros` (mismo patrón que
// formato1001.js#enriquecerConTerceros — reutilizado, no reescrito) para traer dirección,
// municipio y departamento. Solo tiene sentido para compras: para ventas el "tercero" es un
// cliente, no un proveedor a quien haya que ubicar para la exógena.
async function enriquecerDireccion(documentos) {
  const paraEnriquecer = documentos.map((d) => ({ identificacion: limpiarIdentificacion(d.nitTercero) }));
  const enriquecidos = await enriquecerConTerceros(paraEnriquecer);
  return documentos.map((d, i) => ({
    ...d,
    direccion: d.grupo === 'Recibido' ? enriquecidos[i].direccion : null,
    municipio: d.grupo === 'Recibido' ? enriquecidos[i].municipio : null,
    departamento: d.grupo === 'Recibido' ? enriquecidos[i].departamento : null,
    tieneDatosCompletos: d.grupo === 'Recibido' ? enriquecidos[i].tieneDatosCompletos : null,
  }));
}

const sumar = (arr, campo) => arr.reduce((s, d) => s + Number(d[campo] ?? 0), 0);

const agruparPor = (compras, campo) => {
  const grupos = new Map();
  for (const d of compras) {
    const key = d[campo] ?? 'Sin clasificar';
    if (!grupos.has(key)) grupos.set(key, { cantidad: 0, base: 0, iva: 0, total: 0 });
    const g = grupos.get(key);
    g.cantidad += 1;
    g.base += Number(d.subtotal ?? 0);
    g.iva += Number(d.iva ?? 0);
    g.total += Number(d.total ?? 0);
  }
  return [...grupos.entries()].map(([nombre, v]) => ({
    nombre, cantidad: v.cantidad, base: round2(v.base), iva: round2(v.iva), total: round2(v.total),
  }));
};

// Núcleo de la consulta — usado tanto por getConsolidado (JSON) como por exportarConsolidado
// (Excel), para que ambos muestren siempre los mismos números.
async function calcularConsolidado({ empresaId, anio, meses }) {
  const { rows: docsRaw } = await db.query(
    `SELECT * FROM contab_documentos WHERE empresa_id = $1 AND anio = $2 AND mes = ANY($3)
     ORDER BY fecha_emision, mes`,
    [empresaId, anio, meses]
  );
  const { rows: periodosRows } = await db.query(
    'SELECT mes, total_documentos FROM contab_periodos WHERE empresa_id = $1 AND anio = $2 AND mes = ANY($3)',
    [empresaId, anio, meses]
  );
  const mesesDisponibles = periodosRows.map((r) => r.mes).sort((a, b) => a - b);
  const mesesFaltantes = meses.filter((m) => !mesesDisponibles.includes(m));

  const documentos = docsRaw.map(normalizeDocumento);
  const compras = documentos.filter((d) => d.grupo === 'Recibido');
  const ventas = documentos.filter((d) => d.grupo === 'Emitido');

  const totales = {
    compras: { cantidad: compras.length, base: round2(sumar(compras, 'subtotal')), iva: round2(sumar(compras, 'iva')), inc: round2(sumar(compras, 'inc')), total: round2(sumar(compras, 'total')) },
    ventas: { cantidad: ventas.length, base: round2(sumar(ventas, 'subtotal')), iva: round2(sumar(ventas, 'iva')), inc: round2(sumar(ventas, 'inc')), total: round2(sumar(ventas, 'total')) },
    retenciones: round2(sumar(compras, 'valorRetencion')),
  };

  return {
    mesesDisponibles,
    mesesFaltantes,
    totales,
    porConcepto: agruparPor(compras, 'concepto'),
    porClasificacionIva: agruparPor(compras, 'clasificacionIva'),
    documentos,
  };
}

// GET /api/contabilidad/periodos?empresaId — qué meses ya están guardados, para que la
// pantalla de consulta sepa qué se puede mostrar/exportar sin adivinar.
const getPeriodos = async (req, res, next) => {
  try {
    const { empresaId } = req.query;
    const { rows } = await db.query(
      'SELECT anio, mes, total_documentos, updated_at FROM contab_periodos WHERE empresa_id = $1 ORDER BY anio DESC, mes DESC',
      [empresaId]
    );
    res.json(rows.map((r) => ({ anio: r.anio, mes: r.mes, totalDocumentos: r.total_documentos, actualizadoEn: r.updated_at })));
  } catch (err) {
    next(err);
  }
};

// GET /api/contabilidad/consolidado?empresaId&anio&(mes|cuatrimestre|—)
const getConsolidado = async (req, res, next) => {
  try {
    const { empresaId } = req.query;
    const anio = parseInt(req.query.anio, 10);
    if (!empresaId || !anio) {
      return res.status(400).json({ error: 'empresaId y anio son requeridos' });
    }

    const empresaRow = await db.query('SELECT id, name FROM contab_empresas WHERE id = $1', [empresaId]);
    if (empresaRow.rows.length === 0) return res.status(404).json({ error: 'Empresa no encontrada' });

    const { tipo, meses } = resolverMeses(req.query);
    if (meses.length === 0) {
      return res.status(400).json({ error: 'cuatrimestre inválido. Usa 1, 2 o 3.' });
    }

    const resultado = await calcularConsolidado({ empresaId, anio, meses });
    const documentos = await enriquecerDireccion(resultado.documentos);

    res.json({
      empresaId,
      empresaNombre: empresaRow.rows[0].name,
      periodo: {
        tipo, anio,
        mes: req.query.mes ? parseInt(req.query.mes, 10) : null,
        cuatrimestre: req.query.cuatrimestre ? parseInt(req.query.cuatrimestre, 10) : null,
        meses,
      },
      mesesDisponibles: resultado.mesesDisponibles,
      mesesFaltantes: resultado.mesesFaltantes,
      totales: resultado.totales,
      porConcepto: resultado.porConcepto,
      porClasificacionIva: resultado.porClasificacionIva,
      documentos,
    });
  } catch (err) {
    next(err);
  }
};

// ── Excel del consolidado ────────────────────────────────────────────────────────
// Estilo propio (no reutiliza los helpers de dianController.js — viven como consts de
// archivo, no exportadas) pero con la misma paleta de la app para que se sienta consistente.
const XL_BLUE = 'FF004AC6', XL_WHITE = 'FFFFFFFF', XL_ALT = 'FFF0F4FF', XL_GRAY = 'FFE5E7EB';
const COP = '"$ "#,##0';
const sfill = (argb) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });
const thinBorder = { style: 'thin', color: { argb: 'FFCCD0E0' } };
const xlBorder = { top: thinBorder, left: thinBorder, bottom: thinBorder, right: thinBorder };

const headerRow = (ws, valores) => {
  const row = ws.addRow(valores);
  row.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: XL_WHITE }, size: 10 };
    cell.fill = sfill(XL_BLUE);
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = xlBorder;
  });
  row.height = 22;
  return row;
};

const dataRow = (ws, valores, isAlt) => {
  const row = ws.addRow(valores);
  row.eachCell((cell) => { cell.fill = sfill(isAlt ? XL_ALT : XL_WHITE); cell.border = xlBorder; });
  return row;
};

const totalRow = (ws, valores) => {
  const row = ws.addRow(valores);
  row.eachCell((cell) => { cell.fill = sfill(XL_GRAY); cell.border = xlBorder; cell.font = { bold: true }; });
  row.height = 20;
  return row;
};

const nombrePeriodo = (periodo) => {
  if (periodo.tipo === 'mensual') return `${MESES_ES[periodo.mes - 1]} ${periodo.anio}`;
  if (periodo.tipo === 'cuatrimestral') {
    const [ini, , , fin] = periodo.meses;
    return `${MESES_ES[ini - 1]}-${MESES_ES[fin - 1]} ${periodo.anio}`;
  }
  return `Año ${periodo.anio}`;
};

function buildResumenConsolidado(ws, { empresaNombre, periodo, totales, mesesFaltantes }) {
  ws.columns = [{ width: 30 }, { width: 20 }];
  const titleRow = ws.addRow([`${empresaNombre} — ${nombrePeriodo(periodo)}`]);
  titleRow.getCell(1).font = { bold: true, size: 14 };
  ws.mergeCells(titleRow.number, 1, titleRow.number, 2);
  ws.addRow([]);

  if (mesesFaltantes.length > 0) {
    const aviso = ws.addRow([`Meses sin datos guardados: ${mesesFaltantes.map((m) => MESES_ES[m - 1]).join(', ')}`]);
    aviso.getCell(1).font = { italic: true, color: { argb: 'FFB45309' } };
    ws.mergeCells(aviso.number, 1, aviso.number, 2);
    ws.addRow([]);
  }

  const fila = (label, val, fmt) => {
    const row = ws.addRow([label, val]);
    if (fmt) { row.getCell(2).numFmt = fmt; }
    row.getCell(2).alignment = { horizontal: 'right' };
    return row;
  };
  fila('Compras — # facturas', totales.compras.cantidad);
  fila('Compras — base (sin IVA)', totales.compras.base, COP);
  fila('Compras — IVA descontable', totales.compras.iva, COP);
  if (totales.compras.inc !== 0) fila('Compras — INC (no descontable)', totales.compras.inc, COP);
  fila('Compras — total', totales.compras.total, COP);
  ws.addRow([]);
  fila('Ventas — # facturas', totales.ventas.cantidad);
  fila('Ventas — base (sin IVA)', totales.ventas.base, COP);
  fila('Ventas — IVA generado', totales.ventas.iva, COP);
  if (totales.ventas.inc !== 0) fila('Ventas — INC generado', totales.ventas.inc, COP);
  fila('Ventas — total', totales.ventas.total, COP);
  ws.addRow([]);
  fila('Total retenciones (compras)', totales.retenciones, COP);
}

function buildAgrupadoSheet(ws, titulo, grupos) {
  ws.columns = [{ width: 26 }, { width: 12 }, { width: 18 }, { width: 18 }, { width: 18 }];
  const t = ws.addRow([titulo]); t.getCell(1).font = { bold: true, size: 12 };
  ws.mergeCells(t.number, 1, t.number, 5);
  headerRow(ws, ['', '# Facturas', 'Base', 'IVA', 'Total']);
  let totCant = 0, totBase = 0, totIva = 0, totTotal = 0;
  grupos.forEach((g, i) => {
    const row = dataRow(ws, [g.nombre, g.cantidad, g.base, g.iva, g.total], i % 2 === 1);
    row.getCell(3).numFmt = COP; row.getCell(4).numFmt = COP; row.getCell(5).numFmt = COP;
    totCant += g.cantidad; totBase += g.base; totIva += g.iva; totTotal += g.total;
  });
  const tr = totalRow(ws, ['TOTAL', totCant, round2(totBase), round2(totIva), round2(totTotal)]);
  tr.getCell(3).numFmt = COP; tr.getCell(4).numFmt = COP; tr.getCell(5).numFmt = COP;
}

function buildDetalleSheet(ws, documentos) {
  // CUFE primero — es la llave real de la factura (así ya se usa para
  // deduplicar re-subidas, ver dianController.js), pero angosta por defecto:
  // a 96 caracteres no vale la pena mostrarla completa de entrada, el valor
  // real sigue ahí para quien la necesite (barra de fórmulas / ensanchar).
  ws.columns = [
    { width: 20 },
    { width: 12 }, { width: 10 }, { width: 10 }, { width: 32 }, { width: 15 }, { width: 30 },
    { width: 16 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 18 },
  ];
  headerRow(ws, [
    'CUFE', 'Fecha', 'Grupo', 'Folio', 'Tercero', 'NIT', 'Dirección',
    'Subtotal', 'Total', 'IVA', 'INC', 'Retención', 'Clasificación IVA', 'Concepto',
  ]);
  documentos.forEach((d, i) => {
    const row = dataRow(ws, [
      d.cufe ?? '',
      d.fechaEmision, d.grupo, d.folio ?? '', d.nombreTercero ?? '', d.nitTercero ?? '', d.direccion ?? '',
      d.subtotal, d.total, d.iva, d.inc ?? 0, d.valorRetencion ?? 0, d.clasificacionIva ?? '', d.concepto ?? '',
    ], i % 2 === 1);
    row.getCell(8).numFmt = COP; row.getCell(9).numFmt = COP;
    row.getCell(10).numFmt = COP; row.getCell(11).numFmt = COP; row.getCell(12).numFmt = COP;
  });
}

// GET /api/contabilidad/consolidado/exportar?empresaId&anio&(mes|cuatrimestre|—)
const exportarConsolidado = async (req, res, next) => {
  try {
    const { empresaId } = req.query;
    const anio = parseInt(req.query.anio, 10);
    if (!empresaId || !anio) return res.status(400).json({ error: 'empresaId y anio son requeridos' });

    const empresaRow = await db.query('SELECT id, name FROM contab_empresas WHERE id = $1', [empresaId]);
    if (empresaRow.rows.length === 0) return res.status(404).json({ error: 'Empresa no encontrada' });

    const { tipo, meses } = resolverMeses(req.query);
    if (meses.length === 0) return res.status(400).json({ error: 'cuatrimestre inválido. Usa 1, 2 o 3.' });

    const periodo = {
      tipo, anio,
      mes: req.query.mes ? parseInt(req.query.mes, 10) : null,
      cuatrimestre: req.query.cuatrimestre ? parseInt(req.query.cuatrimestre, 10) : null,
      meses,
    };
    const resultado = await calcularConsolidado({ empresaId, anio, meses });
    const documentos = await enriquecerDireccion(resultado.documentos);

    const wb = new ExcelJS.Workbook();
    buildResumenConsolidado(wb.addWorksheet('RESUMEN'), {
      empresaNombre: empresaRow.rows[0].name, periodo, totales: resultado.totales, mesesFaltantes: resultado.mesesFaltantes,
    });
    buildAgrupadoSheet(wb.addWorksheet('CONCEPTOS'), 'COMPRAS POR CONCEPTO', resultado.porConcepto);
    buildAgrupadoSheet(wb.addWorksheet('CLASIFICACION_IVA'), 'COMPRAS POR CLASIFICACIÓN DE IVA', resultado.porClasificacionIva);
    buildDetalleSheet(wb.addWorksheet('DETALLE'), documentos);

    const buffer = await wb.xlsx.writeBuffer();
    const nombreSan = empresaRow.rows[0].name.replace(/[^A-Za-z0-9]/g, '_').replace(/_+/g, '_').slice(0, 20);
    const nombrePeriodoArchivo = tipo === 'mensual'
      ? `${anio}-${String(periodo.mes).padStart(2, '0')}`
      : tipo === 'cuatrimestral' ? `${anio}-C${periodo.cuatrimestre}` : `${anio}`;
    const filename = `Consolidado_${nombreSan}_${nombrePeriodoArchivo}.xlsx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(Buffer.from(buffer));
  } catch (err) {
    next(err);
  }
};

module.exports = { getPeriodos, getConsolidado, exportarConsolidado };
