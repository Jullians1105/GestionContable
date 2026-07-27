const { v4: uuidv4 } = require('uuid');
const path = require('path');
const ExcelJS = require('exceljs');
const JSZip = require('jszip');
const { parse } = require('date-fns');
const db = require('../config/database');
const { SALARY_CONSTANTS } = require('../constants/salaryConstants');

// El portal de la DIAN exporta el .xlsx con las etiquetas de estos dos namespaces
// prefijadas (ej. <x:workbook>, <x:sheets>, <ap:Properties>) — válido según OOXML, pero el
// parser SAX de exceljs compara nombres de etiqueta sin tener en cuenta el prefijo, así que
// nunca reconoce nada y devuelve un modelo vacío (de ahí errores como "Cannot read
// properties of undefined (reading 'sheets'/'company')"). Se quita el prefijo antes de
// pasarlo a ExcelJS. En un .xlsx normal (guardado por Excel real) estos dos namespaces van
// SIN prefijo (xmlns=), así que esto no les afecta — solo entra en juego con el export crudo
// de la DIAN. NO tocar "r:" (relationships), "vt:" (docPropsVTypes) ni "cp:"/"dc:"/"dcterms:"
// (docProps/core.xml) — esos SÍ los espera exceljs literalmente prefijados, incluso en
// archivos normales (ver CoreXform: sus children están mapeados como 'cp:lastModifiedBy',
// no 'lastModifiedBy' — desprefijar esa namespace rompía el core.xml de cualquier archivo
// ya abierto/guardado en Excel real).
const NAMESPACES_A_DESPREFIJAR = [
  'http://schemas.openxmlformats.org/spreadsheetml/2006/main',
  'http://schemas.openxmlformats.org/officeDocument/2006/extended-properties',
];

const stripKnownNamespacePrefixes = (xml) => {
  let out = xml;
  for (const ns of NAMESPACES_A_DESPREFIJAR) {
    const nsMatch = out.match(new RegExp(`xmlns:(\\w+)="${ns.replace(/[/.]/g, '\\$&')}"`));
    if (!nsMatch) continue;
    const prefix = nsMatch[1];
    out = out
      .replace(new RegExp(`</${prefix}:`, 'g'), '</')
      .replace(new RegExp(`<${prefix}:`, 'g'), '<');
  }
  return out;
};

// El mismo exportador escribe los Target de sus .rels como rutas absolutas del paquete
// (ej. Target="/xl/tables/table1.xml") en vez de relativas al part que las contiene (lo que
// Excel genera: "../tables/table1.xml"). exceljs ya tolera esto para workbook→hoja, pero no
// para hoja→tabla — la búsqueda por Target falla en silencio y deja el modelo de tabla
// undefined ("Cannot read properties of undefined (reading 'name')"). Se recalcula el
// Target relativo a la carpeta del part dueño de cada .rels antes de pasarlo a ExcelJS.
const normalizeRelsTargets = (relsPath, xml) => {
  const ownerDir = path.posix.dirname(path.posix.dirname(relsPath));
  return xml.replace(/Target="([^"]+)"/g, (match, target) => {
    if (!target.startsWith('/')) return match;
    const absolute = target.replace(/^\/+/, '');
    const relative = path.posix.relative(ownerDir === '.' ? '' : ownerDir, absolute);
    return `Target="${relative}"`;
  });
};

// exceljs tiene un bug al releer y regrabar (round-trip) el objeto "Tabla" de Excel que
// trae el reporte DIAN original: cuando el archivo fuente omite headerRowCount (implícito
// =1 por el estándar OOXML) y usa totalsRowShown en vez de totalsRowCount, exceljs lo
// parsea como headerRow=false/totalsRow=false y al regrabar escribe headerRowCount="0"
// (contradice que la tabla sí tiene columnas con nombre) y totalsRowShown="1" (contradice
// que el rango de la tabla no reserva fila de totales) — esa contradicción es justo lo que
// dispara el aviso de Excel "hemos encontrado un problema con el contenido". Ninguna celda
// ni dato se altera; solo se corrigen esos dos atributos de metadata de la tabla después de
// generar el archivo final.
const corregirTablaRoundtrip = async (buffer) => {
  const zip = await JSZip.loadAsync(buffer);
  let changed = false;
  await Promise.all(
    Object.keys(zip.files)
      .filter((name) => /^xl\/tables\/table\d+\.xml$/.test(name))
      .map(async (name) => {
        const content = await zip.file(name).async('string');
        const fixed = content
          .replace(/headerRowCount="0"/, 'headerRowCount="1"')
          .replace(/totalsRowShown="1"/, 'totalsRowShown="0"');
        if (fixed !== content) {
          zip.file(name, fixed);
          changed = true;
        }
      })
  );
  return changed ? zip.generateAsync({ type: 'nodebuffer' }) : buffer;
};

const normalizeXlsxBuffer = async (buffer) => {
  const zip = await JSZip.loadAsync(buffer);
  let changed = false;
  await Promise.all(
    Object.keys(zip.files)
      .filter((name) => !zip.files[name].dir && (name.endsWith('.xml') || name.endsWith('.rels')))
      .map(async (name) => {
        const content = await zip.file(name).async('string');
        let normalized = stripKnownNamespacePrefixes(content);
        if (name.endsWith('.rels')) {
          normalized = normalizeRelsTargets(name, normalized);
        }
        if (normalized !== content) {
          zip.file(name, normalized);
          changed = true;
        }
      })
  );
  return changed ? zip.generateAsync({ type: 'nodebuffer' }) : buffer;
};

const REQUIRED_COLS = [
  'Tipo de documento', 'CUFE/CUDE', 'Fecha Emisión',
  'NIT Emisor', 'Nombre Emisor', 'IVA', 'Total', 'Estado', 'Grupo',
];

const FACTURA                  = 'Factura electrónica';
const NOTA_CREDITO             = 'Nota de crédito electrónica';
const NOTA_AJUSTE_CREDITO_DE   = 'Nota de ajuste crédito del documento equivalente';
const DOC_EQUIVALENTE          = 'Documento equivalente - Servicios públicos domiciliarios';
const DOC_TRANSPORTE_AEREO     = 'Documento equivalente - Transporte aéreo de pasajeros';
const DOC_TRANSPORTE_TERRESTRE = 'Documento equivalente - Transporte pasajeros terrestre';
const DOC_SOPORTE_NO_OBLIGADOS = 'Documento soporte con no obligados';
const APPLICATION_RESPONSE     = 'Application response';
const NOMINA_INDIVIDUAL        = 'Nomina Individual';
const RECIBIDO                 = 'Recibido';
const EMITIDO                  = 'Emitido';

// Notas que revierten una operación ya contabilizada: restan del total del grupo al que
// pertenecen (Recibido → devolución en compras, Emitido → devolución en ventas).
// NOTA_AJUSTE_CREDITO_DE es la nota crédito del mundo "documento equivalente" (código 94
// del anexo DIAN); se comporta igual que la nota crédito de factura, solo que referencia
// un documento equivalente en vez de una factura electrónica.
// Falta la nota de ajuste DÉBITO (código 93), que sumaría en vez de restar: todavía no ha
// aparecido en ningún reporte y el texto exacto que usa el portal está sin confirmar, así
// que no se agrega a ciegas — si llega, cae en DOCUMENTOS NO CONTABILIZADOS (visible en la
// hoja METADATOS) en vez de sumar con el signo equivocado.
// Ver docs/dian-tipos-documento.md para el catálogo completo y sus fuentes oficiales.
const TIPOS_NOTA_CREDITO = [NOTA_CREDITO, NOTA_AJUSTE_CREDITO_DE];

// Tipos que se tratan exactamente igual que una Factura electrónica: cuentan como compra
// si Grupo=Recibido y como venta si Grupo=Emitido. A diferencia de DOC_EQUIVALENTE
// (servicios públicos), que solo se ve como compra, el tiquete de transporte aéreo puede
// aparecer en cualquiera de los dos grupos según quién lo emita.
const TIPOS_FACTURA_EQUIVALENTE = [FACTURA, DOC_TRANSPORTE_AEREO];

// Tipos de documento "Recibido" que cuentan como costo deducible ante la DIAN bajo la
// convención normal (Recibido = compra). DOC_SOPORTE_NO_OBLIGADOS NO va acá: su Grupo
// funciona invertido (ver esDocSoporteCompra / calcularAnomalias más abajo).
// DOC_TRANSPORTE_TERRESTRE va acá y no en TIPOS_FACTURA_EQUIVALENTE (donde sí está el
// aéreo) porque el transporte terrestre de pasajeros solo aparece como compra: se lo
// compramos a una empresa transportadora. Además está EXCLUIDO de IVA (Art. 476 ET), así
// que sus filas llegan con IVA=0 y no aportan IVA descontable — igual que los servicios
// públicos domiciliarios, que tampoco están en TIPOS_FACTURA_EQUIVALENTE.
const TIPOS_COMPRA = [...TIPOS_FACTURA_EQUIVALENTE, DOC_EQUIVALENTE, DOC_TRANSPORTE_TERRESTRE];

// Tipos de documento que sí entran en algún cálculo (compras, ventas, notas crédito,
// documento soporte). DOC_SOPORTE_NO_OBLIGADOS se contabiliza condicionalmente por Grupo
// (ver exportarBorrador), por eso igual cuenta como "contabilizado" acá.
const TIPOS_CONTABILIZADOS = new Set([
  FACTURA, ...TIPOS_NOTA_CREDITO, DOC_EQUIVALENTE, DOC_SOPORTE_NO_OBLIGADOS,
  DOC_TRANSPORTE_AEREO, DOC_TRANSPORTE_TERRESTRE,
]);

// Motivos conocidos para documentos que quedan fuera de los cálculos (sección de transparencia)
const MOTIVOS_DOCUMENTOS_EXCLUIDOS = {
  [APPLICATION_RESPONSE]: 'Acuse técnico DIAN sin valor comercial',
  [NOMINA_INDIVIDUAL]:    'Documento de nómina — no se contabiliza como compra (ver hoja NÓMINA)',
};

// Nombres de hoja que exportarBorrador agrega sobre el archivo original (ver esa función).
// Si el archivo que se sube ya trae alguna de estas hojas, es porque es un .xlsx que esta
// misma herramienta ya exportó antes (no un reporte crudo de la DIAN) — subirlo de nuevo
// haría que exportarBorrador reviente más adelante con "Worksheet name already exists" al
// intentar agregar una hoja con un nombre que ya existe. Se rechaza acá, con un mensaje
// claro, en vez de dejar que falle de forma críptica al exportar.
const HOJAS_RESERVADAS = new Set([
  'RESUMEN', 'IMPUESTOS', 'RETENCIONES_POR_PROVEEDOR', 'DETALLE_COMPRAS', 'NOMINA', 'METADATOS', 'REPORTE_DIAN',
]);

const getSalaryConstants = (year) => {
  if (SALARY_CONSTANTS[year]) return SALARY_CONSTANTS[year];
  const fallbackYear = Math.max(...Object.keys(SALARY_CONSTANTS).map(Number));
  console.warn(`[DIAN] Sin SALARY_CONSTANTS para el año ${year}, usando ${fallbackYear}`);
  return SALARY_CONSTANTS[fallbackYear];
};

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
    const bufferNormalizado = await normalizeXlsxBuffer(req.file.buffer);
    await workbook.xlsx.load(bufferNormalizado);

    const worksheet = workbook.worksheets[0];
    if (!worksheet) {
      return res.status(400).json({ error: 'El archivo no contiene hojas de cálculo' });
    }

    const hojaReservada = workbook.worksheets.find((ws) => HOJAS_RESERVADAS.has(ws.name.toUpperCase()));
    if (hojaReservada) {
      return res.status(400).json({
        error: `Este archivo ya parece ser un reporte exportado por esta herramienta (contiene la hoja "${hojaReservada.name}"). ` +
          'Sube el reporte original tal como lo descargaste del portal de la DIAN.',
      });
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

    const esFacturaRecibida  = (r) => r.grupo === RECIBIDO && TIPOS_FACTURA_EQUIVALENTE.includes(r.tipoDocumento);
    // comprasBruto: todos los TIPOS_COMPRA — costos deducibles ante la DIAN bajo la
    // convención normal (Recibido = compra). Ver la definición del conjunto más arriba.
    // "Documento soporte con no obligados" NO entra acá: su Grupo funciona invertido,
    // se resuelve aparte en exportarBorrador (ver esDocSoporteCompra).
    // "Application response" queda fuera a propósito: es un acuse técnico sin valor comercial.
    const esCompraRecibida   = (r) => r.grupo === RECIBIDO && TIPOS_COMPRA.includes(r.tipoDocumento);
    const esNotaRecibida     = (r) => r.grupo === RECIBIDO && TIPOS_NOTA_CREDITO.includes(r.tipoDocumento);
    const esFacturaEmitida   = (r) => r.grupo === EMITIDO  && TIPOS_FACTURA_EQUIVALENTE.includes(r.tipoDocumento);
    const esNotaEmitida      = (r) => r.grupo === EMITIDO  && TIPOS_NOTA_CREDITO.includes(r.tipoDocumento);

    const calculos = {
      comprasBruto:          sumField(esCompraRecibida,  'total'),
      devolucionCompras:     sumField(esNotaRecibida,    'total'),
      ventasBruto:           sumField(esFacturaEmitida,  'total'),
      devolucionVentas:      sumField(esNotaEmitida,     'total'),
      ivaDescontable:        sumField(esFacturaRecibida, 'iva'),
      ivaGenerado:           sumField(esFacturaEmitida,  'iva'),
      ivaDevolucionCompras:  sumField(esNotaRecibida,    'iva'),
      ivaDevolucionVentas:   sumField(esNotaEmitida,     'iva'),
      // INC (Impuesto Nacional al Consumo) — igual que el IVA, no es ingreso real de la
      // empresa (es un impuesto que se recauda y se paga a la DIAN), se resta de Ventas.
      incGenerado:           sumField(esFacturaEmitida,  'inc'),
      incDevolucionVentas:   sumField(esNotaEmitida,     'inc'),
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

    // Persistir borrador con campos de clasificación incluidos (expira en 14 días).
    // Se guarda también el archivo normalizado (solo prefijos XML corregidos, NINGÚN
    // dato/formato tocado) para reutilizarlo tal cual al exportar como primera hoja —
    // evita reconstruir la hoja original desde JSON, que podía perder formato/precisión.
    const id = uuidv4();
    await db.query(
      `INSERT INTO calculo_borradores (id, nombre_archivo, creado_por, datos, archivo_original)
       VALUES ($1, $2, $3, $4, $5)`,
      [id, req.file.originalname, req.user.userId, JSON.stringify({ filas, calculos }), bufferNormalizado]
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

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

// Documentos que no entraron en ningún cálculo (compras/ventas/notas/doc. soporte), para
// mostrar transparencia en el Excel — evita que un tipo de documento desconocido se pierda en silencio.
const calcularDocumentosNoContabilizados = (filas) => {
  const grupos = {};
  for (const f of filas) {
    if (TIPOS_CONTABILIZADOS.has(f.tipoDocumento)) continue;
    const tipo = f.tipoDocumento ?? '(sin tipo de documento)';
    if (!grupos[tipo]) grupos[tipo] = { cantidad: 0, total: 0 };
    grupos[tipo].cantidad += 1;
    grupos[tipo].total += (f.total ?? 0);
  }
  return Object.entries(grupos).map(([tipo, { cantidad, total }]) => ({
    tipo,
    cantidad,
    total: round2(total),
    motivo: MOTIVOS_DOCUMENTOS_EXCLUIDOS[tipo] ?? 'Tipo de documento no reconocido — revisar manualmente',
    esConocido: tipo in MOTIVOS_DOCUMENTOS_EXCLUIDOS,
  }));
};

// Anomalías de calidad de datos en el reporte — no cambian ningún cálculo, solo alertan
// para que el usuario audite antes de confiar en las cifras.
// anomaliasRevisadas: array de `tipo` marcados manualmente como revisados (persistido en
// el borrador). "Revisado" es solo un ack de auditoría — NUNCA cambia ningún cálculo,
// ni siquiera para las anomalías que hoy excluyen filas de un total (Documento Soporte
// con Grupo "Recibido", Grupo con valor inesperado): decisión explícita, no se auto-incluyen.
const calcularAnomalias = (filas, anomaliasRevisadas = []) => {
  const revisadas = new Set(anomaliasRevisadas);
  const anomalias = [];

  const porCufe = {};
  for (const f of filas) {
    if (!f.cufe) continue;
    (porCufe[f.cufe] ??= []).push(f);
  }
  const cufesDuplicados = Object.entries(porCufe).filter(([, grupo]) => grupo.length > 1);
  if (cufesDuplicados.length > 0) {
    const totalFilasDup = cufesDuplicados.reduce((s, [, grupo]) => s + grupo.length, 0);
    anomalias.push({
      tipo: 'CUFE/CUDE duplicado',
      detalle: `${cufesDuplicados.length} CUFE/CUDE distintos aparecen repetidos (${totalFilasDup} filas en total)`,
    });
  }

  // Total negativo ya se reporta como su propia anomalía; excluirlo acá evita el disparo
  // trivial "0 > negativo" para la misma fila.
  const ivaMayorQueTotal = filas.filter((f) => (f.total ?? 0) >= 0 && (f.iva ?? 0) > (f.total ?? 0));
  if (ivaMayorQueTotal.length > 0) {
    anomalias.push({
      tipo: 'IVA mayor que el Total',
      detalle: `${ivaMayorQueTotal.length} fila(s) con IVA superior al Total del documento`,
    });
  }

  const totalNegativoInesperado = filas.filter(
    (f) => (f.total ?? 0) < 0 && !TIPOS_NOTA_CREDITO.includes(f.tipoDocumento)
  );
  if (totalNegativoInesperado.length > 0) {
    anomalias.push({
      tipo: 'Total negativo inesperado',
      detalle: `${totalNegativoInesperado.length} fila(s) con Total negativo que no son nota crédito ` +
        `(${TIPOS_NOTA_CREDITO.map((t) => `"${t}"`).join(', ')})`,
    });
  }

  const grupoInesperado = filas.filter((f) => f.grupo !== RECIBIDO && f.grupo !== EMITIDO);
  if (grupoInesperado.length > 0) {
    const valores = [...new Set(grupoInesperado.map((f) => f.grupo ?? '(vacío)'))].join(', ');
    anomalias.push({
      tipo: 'Grupo con valor inesperado',
      detalle: `${grupoInesperado.length} fila(s) con Grupo distinto de "Emitido"/"Recibido" (valores: ${valores})`,
    });
  }

  // "Documento soporte con no obligados" tiene el Grupo invertido: Emitido = compra
  // nuestra (se contabiliza en Compras Netas). Recibido no tiene contrapartida normal —
  // no se suma a ningún total, se marca como anomalía para revisión manual.
  const docSoporteRecibido = filas.filter(
    (f) => f.tipoDocumento === DOC_SOPORTE_NO_OBLIGADOS && f.grupo === RECIBIDO
  );
  if (docSoporteRecibido.length > 0) {
    const total = round2(docSoporteRecibido.reduce((s, f) => s + (f.total ?? 0), 0));
    anomalias.push({
      tipo: 'Documento soporte con Grupo "Recibido" inesperado',
      detalle: `${docSoporteRecibido.length} fila(s) de "${DOC_SOPORTE_NO_OBLIGADOS}" con Grupo="Recibido" por ` +
        `$${total.toLocaleString('es-CO')} — este tipo normalmente viene como "Emitido" (compra a un no-obligado ` +
        `a facturar). No se incluyó en ningún total; revisar manualmente.`,
    });
  }

  return anomalias.map((a) => ({ ...a, revisada: revisadas.has(a.tipo) }));
};

// ── Helpers de formato Excel ───────────────────────────────────────────────────
const XL_BLUE    = 'FF004AC6';
const XL_TITLE   = 'FF0B1F3A'; // banda de título del documento (empresa/período) — distinta de los headers de sección
const XL_WHITE   = 'FFFFFFFF';
const XL_BLUE_LT = 'FFD6E0F3';
const XL_GRAY    = 'FFE5E7EB';
const XL_ALT     = 'FFF0F4FF';
const XL_RED     = 'FFDC2626';
const XL_GREEN   = 'FF15803D';
const XL_AMBER   = 'FFB45309'; // advertencia — nunca "negativo" (ese significado ya lo tiene el rojo)

const sfill = (argb) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });
const thinBorder = { style: 'thin', color: { argb: 'FFCCD0E0' } };
const xlBorder   = { top: thinBorder, left: thinBorder, bottom: thinBorder, right: thinBorder };

// Banda de sección (header de bloque) que ocupa numCols columnas, con borde y alto uniforme
const sectionBand = (ws, label, numCols, color = XL_BLUE) => {
  const row = ws.addRow([label]);
  for (let c = 1; c <= numCols; c++) {
    const cell = row.getCell(c);
    cell.font   = { bold: true, color: { argb: XL_WHITE }, size: 10 };
    cell.fill   = sfill(color);
    cell.border = xlBorder;
  }
  row.height = 22;
  ws.mergeCells(row.number, 1, row.number, numCols);
  return row;
};

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
  row.height = 22;
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
  row.height = 20;
};

// Congela las primeras `ySplit` filas para que no se pierdan al hacer scroll en reportes largos
const freezeHeaderRowAt = (ws, ySplit = 1) => {
  ws.views = [{ state: 'frozen', ySplit }];
};

// ── Hoja RESUMEN ───────────────────────────────────────────────────────────────
// Separado en Content (solo filas, reutilizable en otras hojas como TODO) + wrapper
// (columnas propias de la hoja standalone RESUMEN).
function buildResumenContent(ws, resumen, nomina, meta, { freeze = true } = {}) {
  const COP  = '"$ "#,##0';
  const COPN = '"$ ("#,##0")"';

  const blank = () => ws.addRow([]);

  // Header de bloque (INGRESOS/COSTOS/IMPUESTOS/NÓMINA) con borde y ancho de las 3 columnas
  const sectionRow = (label) => sectionBand(ws, label, 3);

  const valueRow = (label, val, opts = {}) => {
    const absVal = val !== null && val !== undefined ? Math.abs(val) : null;
    const row = ws.addRow([label, absVal, opts.nota ?? '']);
    const cA  = row.getCell(1);
    const cB  = row.getCell(2);
    const cC  = row.getCell(3);
    cA.alignment = { horizontal: 'left', indent: opts.indent ?? 1 };
    cB.alignment = { horizontal: 'right' };
    cB.numFmt    = opts.isNeg ? COPN : COP;
    cA.border = cB.border = cC.border = xlBorder;
    cC.alignment = { horizontal: 'left', wrapText: true };
    cC.font      = { italic: true, size: 9, color: { argb: 'FF6B7280' } };

    if (opts.isNeg) {
      cB.font = { color: { argb: XL_RED }, bold: !!opts.bold };
    } else if (opts.bold) {
      cA.font = { bold: true };
      cB.font = { bold: true };
    }
    if (opts.subtotal) {
      cA.fill = cB.fill = cC.fill = sfill(XL_BLUE_LT);
      cA.font = { bold: true };
      cB.font = { bold: true };
      row.height = 20;
    }
    if (opts.total) {
      cA.fill = cB.fill = cC.fill = sfill(XL_GRAY);
      cA.font = { bold: true, size: 11 };
      cB.font = { bold: true, size: 11, ...(opts.isNeg ? { color: { argb: XL_RED } } : {}) };
      row.height = 20;
    }
  };

  // ── Título del documento — banda propia, distinta de los headers de sección ──
  const periodoStr = meta.periodoDesde && meta.periodoHasta
    ? `${fechaES(meta.periodoDesde)} — ${fechaES(meta.periodoHasta)}`
    : '—';

  const titleRow = ws.addRow([meta.empresaNombre ?? 'ESTADO DE RESULTADOS']);
  titleRow.getCell(1).font = { bold: true, size: 16, color: { argb: XL_WHITE } };
  titleRow.getCell(1).fill = sfill(XL_TITLE);
  titleRow.getCell(1).alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
  titleRow.height = 30;
  for (let c = 1; c <= 3; c++) titleRow.getCell(c).fill = sfill(XL_TITLE);
  ws.mergeCells(titleRow.number, 1, titleRow.number, 3);

  const subtitleRow = ws.addRow([`Estado de Resultados — Período ${periodoStr}`]);
  subtitleRow.getCell(1).font = { bold: true, size: 11, color: { argb: XL_WHITE } };
  subtitleRow.getCell(1).fill = sfill(XL_TITLE);
  subtitleRow.getCell(1).alignment = { horizontal: 'left', indent: 1 };
  subtitleRow.height = 20;
  for (let c = 1; c <= 3; c++) subtitleRow.getCell(c).fill = sfill(XL_TITLE);
  ws.mergeCells(subtitleRow.number, 1, subtitleRow.number, 3);

  // ── Tarjeta destacada UTILIDAD FINAL — única tarjeta KPI de la hoja ──────────
  // El costo laboral es un GASTO, por eso se RESTA (no se suma) a la utilidad neta.
  const utilFinal = resumen.utilidadNeta - (nomina?.costoTotal ?? 0);
  const kpiRow = ws.addRow([
    'UTILIDAD FINAL DEL PERÍODO',
    Math.abs(utilFinal),
  ]);
  kpiRow.getCell(1).font = { bold: true, size: 12, color: { argb: XL_WHITE } };
  kpiRow.getCell(2).font = { bold: true, size: 16, color: { argb: XL_WHITE } };
  kpiRow.getCell(2).numFmt = utilFinal < 0 ? COPN : COP;
  kpiRow.getCell(1).alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
  kpiRow.getCell(2).alignment = { horizontal: 'right', vertical: 'middle', indent: 1 };
  kpiRow.height = 32;
  const kpiColor = utilFinal < 0 ? XL_RED : XL_GREEN;
  for (let c = 1; c <= 3; c++) kpiRow.getCell(c).fill = sfill(kpiColor);
  blank();

  const docRow = ws.addRow(['Total documentos procesados', meta.totalFilas]);
  docRow.getCell(1).alignment = { horizontal: 'left' };
  docRow.getCell(2).alignment = { horizontal: 'right' };
  blank();

  // Fila de encabezado a congelar en scroll: hasta acá (título + KPI + contador)
  if (freeze) freezeHeaderRowAt(ws, docRow.number + 1);

  // INGRESOS/COSTOS — esta hoja muestra solo las BASES (montos sin IVA ni INC). El IVA
  // correspondiente a cada una de estas bases se cuadra aparte en la hoja IMPUESTOS.
  sectionRow('INGRESOS');
  valueRow('Ventas',                   resumen.ventasBrutoSinIva,      {
    indent: 2,
    nota: 'Todos los valores de esta hoja son BASE (sin IVA ni INC). El IVA de cada línea está en la hoja IMPUESTOS.',
  });
  valueRow('(−) Devolución en ventas', resumen.devolucionVentasSinIva, { isNeg: true, indent: 2 });
  valueRow('Ventas Netas',             resumen.ventasNetas,            { subtotal: true });
  blank();

  // COSTOS
  sectionRow('COSTOS');
  valueRow('Compras',                   resumen.comprasBrutoSinIva,      { indent: 2 });
  valueRow('(−) Devolución en compras', resumen.devolucionComprasSinIva, { isNeg: true, indent: 2 });
  if (resumen.documentoSoporteCompras > 0) {
    valueRow('+ Documento Soporte (compra)', resumen.documentoSoporteComprasSinIva, {
      indent: 2,
      nota: '"Documento soporte con no obligados" con Grupo="Emitido": compra a un no-obligado a facturar. Incluido en Compras Netas.',
    });
  }
  valueRow('Compras Netas',   resumen.comprasNetas,  { subtotal: true });
  valueRow('Costos Totales',  resumen.costosTotales, { subtotal: true });
  blank();

  valueRow('UTILIDAD BRUTA', resumen.utilidadBruta, { total: true, isNeg: resumen.utilidadBruta < 0 });
  blank();

  valueRow('(−) Total retenciones', resumen.totalRetenciones, { isNeg: true, bold: true });
  blank();

  valueRow('UTILIDAD NETA (antes nómina)', resumen.utilidadNeta, { total: true, isNeg: resumen.utilidadNeta < 0 });
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

  // Total de cierre (detalle, para auditar cómo se llegó al número de la tarjeta de arriba)
  valueRow('UTILIDAD FINAL', utilFinal, { total: true, isNeg: utilFinal < 0 });
}

function buildResumen(ws, resumen, nomina, meta) {
  ws.columns = [
    { key: 'a', width: 46 },
    { key: 'b', width: 20 },
    { key: 'c', width: 35 }, // Notas
  ];
  buildResumenContent(ws, resumen, nomina, meta);
}

// ── Hoja IMPUESTOS ─────────────────────────────────────────────────────────────
// El IVA no es ingreso ni costo real de la empresa (es un pasivo que se recauda
// y se paga a la DIAN), por eso vive en su propia hoja separada de RESUMEN en
// vez de mezclarse con el Estado de Resultados.
// Dos bloques lado a lado: izquierda = bases de ingresos/costos (sin IVA, igual
// que RESUMEN); derecha = IVA, agrupado por efecto sobre el IVA a pagar y NO por
// Emitido/Recibido — Devolución en compras sube el IVA a pagar (revierte crédito),
// Devolución en ventas lo baja (revierte el generado). Ver nota en exportarBorrador.
function buildImpuestosContent(ws, resumen, { freeze = true } = {}) {
  const COP = '"$ "#,##0';

  const titleRow = ws.addRow(['IMPUESTOS — IVA']);
  titleRow.getCell(1).font = { bold: true, size: 14, color: { argb: XL_WHITE } };
  titleRow.getCell(1).alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
  titleRow.height = 26;
  for (let c = 1; c <= 5; c++) titleRow.getCell(c).fill = sfill(XL_TITLE);
  ws.mergeCells(titleRow.number, 1, titleRow.number, 5);
  ws.addRow([]);
  if (freeze) freezeHeaderRowAt(ws, titleRow.number + 2);

  const sectionHdr = ws.addRow(['INGRESOS Y COSTOS (base, sin IVA)', '', '', 'IVA', '']);
  for (let c = 1; c <= 5; c++) {
    const cell = sectionHdr.getCell(c);
    cell.font      = { bold: true, color: { argb: XL_WHITE }, size: 10 };
    cell.fill      = sfill(XL_BLUE);
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border    = xlBorder;
  }
  sectionHdr.height = 22;
  ws.mergeCells(sectionHdr.number, 1, sectionHdr.number, 2);
  ws.mergeCells(sectionHdr.number, 4, sectionHdr.number, 5);

  const writeCell = (row, col, label, val, opts = {}) => {
    const cA = row.getCell(col);
    const cB = row.getCell(col + 1);
    cA.value = label;
    cB.value = val !== null && val !== undefined ? Math.abs(val) : null;
    cA.alignment = { horizontal: 'left', indent: opts.indent ?? 1 };
    cB.alignment = { horizontal: 'right' };
    cB.numFmt = COP;
    cA.border = cB.border = xlBorder;
    if (opts.isNeg) {
      cA.font = { color: { argb: XL_RED } };
      cB.font = { color: { argb: XL_RED } };
    }
    if (opts.subtotal) {
      cA.fill = cB.fill = sfill(XL_BLUE_LT);
      cA.font = { bold: true, ...(opts.isNeg ? { color: { argb: XL_RED } } : {}) };
      cB.font = { bold: true, ...(opts.isNeg ? { color: { argb: XL_RED } } : {}) };
      row.height = 20;
    }
    if (opts.total) {
      cA.fill = cB.fill = sfill(XL_GRAY);
      cA.font = { bold: true, size: 11, ...(opts.isNeg ? { color: { argb: XL_RED } } : {}) };
      cB.font = { bold: true, size: 11, ...(opts.isNeg ? { color: { argb: XL_RED } } : {}) };
      row.height = 20;
    }
  };

  // Total compras (sin IVA) acá es solo Compras − Devolución compras — sin el
  // ajuste de Documento Soporte (ese vive únicamente en RESUMEN/Compras Netas).
  const totalIngresoSinIva = resumen.ventasBrutoSinIva  - resumen.devolucionVentasSinIva;
  const totalComprasSinIva = resumen.comprasBrutoSinIva - resumen.devolucionComprasSinIva;

  const ivaNeg = resumen.ivaPagar < 0;

  const left = [
    { label: 'Ingreso (base antes de IVA)',    val: resumen.ventasBrutoSinIva },
    { label: '(−) Dev ventas (notas crédito)', val: resumen.devolucionVentasSinIva, isNeg: true },
    { label: 'Total ingreso (sin IVA)',        val: totalIngresoSinIva, subtotal: true },
    null,
    { label: 'Compras (base antes de IVA)',     val: resumen.comprasBrutoSinIva },
    { label: '(−) Dev compras (notas crédito)', val: resumen.devolucionComprasSinIva, isNeg: true },
    { label: 'Total compras (sin IVA)',         val: totalComprasSinIva, subtotal: true },
  ];

  const right = [
    { label: 'IVA generado (ventas)',       val: resumen.ivaGenerado },
    { label: 'IVA devolución compras',      val: resumen.ivaDevolucionCompras },
    { label: 'Total IVA Ventas',            val: resumen.totalIvaVentas, subtotal: true },
    null,
    { label: 'IVA descontable (compras)',   val: resumen.ivaDescontable },
    { label: 'IVA devolución ventas',       val: resumen.ivaDevolucionVentas },
    { label: 'Total IVA Compras',           val: resumen.totalIvaCompras, subtotal: true },
    null,
    { label: ivaNeg ? 'TOTAL IVA (saldo a FAVOR)' : 'TOTAL IVA', val: resumen.ivaPagar, total: true, isNeg: ivaNeg },
  ];

  const maxLen = Math.max(left.length, right.length);
  for (let i = 0; i < maxLen; i++) {
    const row = ws.addRow([]);
    const l = left[i];
    const r = right[i];
    if (l) writeCell(row, 1, l.label, l.val, l);
    if (r) writeCell(row, 4, r.label, r.val, r);
  }
}

function buildImpuestos(ws, resumen) {
  ws.columns = [
    { key: 'labelL', width: 30 },
    { key: 'valL',   width: 18 },
    { key: 'gap',    width: 4  },
    { key: 'labelR', width: 30 },
    { key: 'valR',   width: 18 },
  ];
  buildImpuestosContent(ws, resumen);
}

// ── Hoja RETENCIONES_POR_PROVEEDOR ─────────────────────────────────────────────
function buildRetencionesContent(ws, retencionesPorProveedor, totalRetenciones, { freeze = true } = {}) {
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

  if (freeze) freezeHeaderRowAt(ws, 1);
}

function buildRetenciones(ws, retencionesPorProveedor, totalRetenciones) {
  ws.columns = [
    { key: 'nit',      width: 16 },
    { key: 'nombre',   width: 40 },
    { key: 'concepto', width: 16 },
    { key: 'tasa',     width: 12 },
    { key: 'total',    width: 20 },
  ];
  buildRetencionesContent(ws, retencionesPorProveedor, totalRetenciones);
}

// ── Hoja DETALLE_COMPRAS ───────────────────────────────────────────────────────
function buildDetalleComprasContent(ws, filasRecibido, { freeze = true } = {}) {
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

  if (freeze) freezeHeaderRowAt(ws, 1);
}

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
  buildDetalleComprasContent(ws, filasRecibido);
}

// ── Hoja NOMINA ────────────────────────────────────────────────────────────────
function buildNominaContent(ws, nomina, salario) {
  const COP   = '"$ "#,##0';
  const COPN  = '"$ ("#,##0")"';
  const blank = () => ws.addRow([]);

  const sectionRow = (label) => sectionBand(ws, label, 2);

  // opts.count: cantidades enteras (empleados, meses) — sin formato de moneda
  // opts.isNeg: se muestra en rojo entre paréntesis (deducciones, restan del total)
  const addRow = (label, val, opts = {}) => {
    const displayVal = opts.isNeg && val !== null && val !== undefined ? Math.abs(val) : val;
    const row = ws.addRow([label, displayVal]);
    const cA  = row.getCell(1);
    const cB  = row.getCell(2);
    cA.alignment = { horizontal: 'left', indent: opts.indent ?? 0 };
    cB.alignment = { horizontal: 'right' };
    cA.border = cB.border = xlBorder;
    if (opts.count) {
      cB.numFmt = '0';
    } else if (val !== null && val !== undefined) {
      cB.numFmt = opts.isNeg ? COPN : COP;
    }
    if (opts.isNeg) {
      cB.font = { color: { argb: XL_RED }, bold: !!opts.subtotal };
    }
    if (opts.subtotal) {
      cA.fill = cB.fill = sfill(XL_BLUE_LT);
      cA.font = { bold: true };
      if (!opts.isNeg) cB.font = { bold: true };
      row.height = 20;
    }
    if (opts.total) {
      cA.fill = cB.fill = sfill(XL_GRAY);
      cA.font = { bold: true, size: 11 };
      cB.font = { bold: true, size: 11 };
      row.height = 20;
    }
  };

  sectionRow('PARÁMETROS DE ENTRADA');
  addRow('Número de empleados',                     nomina.empleados, { indent: 2, count: true });
  addRow('Número de meses',                         nomina.meses,     { indent: 2, count: true });
  addRow(`Salario mensual (SMMLV ${nomina.year})`,  salario,          { indent: 2 });
  addRow(
    `Auxilio de transporte (${nomina.year})${nomina.auxilioAplica ? '' : ' — no aplica (salario > 2 SMMLV)'}`,
    nomina.auxilioAplica ? nomina.auxilioTransporte : 0,
    { indent: 2 }
  );
  blank();

  sectionRow('DEVENGADO (por empleado/mes)');
  addRow('Salario',                                       salario, { indent: 2 });
  addRow('Auxilio de transporte',                         nomina.auxilioAplica ? nomina.auxilioTransporte : 0, { indent: 2 });
  addRow('Vacaciones (4,17% s/ salario)',                  round2(nomina.devengadoDetalle.vacaciones),          { indent: 2 });
  addRow('Prima de Servicios (8,33% s/ salario+auxilio)',  round2(nomina.devengadoDetalle.prima),               { indent: 2 });
  addRow('Cesantías (8,33% s/ salario+auxilio)',           round2(nomina.devengadoDetalle.cesantias),           { indent: 2 });
  addRow('Intereses Cesantías (1% s/ cesantías)',          round2(nomina.devengadoDetalle.interesesCesantias),  { indent: 2 });
  addRow('Total devengado',                                nomina.devengado, { subtotal: true });
  blank();

  sectionRow('DEDUCCIONES (por empleado/mes, sobre salario)');
  // La etiqueta "(12%)" es la tasa oficial que paga el empleador — puramente informativa,
  // el cálculo real sigue usando nomina.tasaPension (4%), no este texto.
  addRow('Pensión (12%)',                                   round2(salario * nomina.tasaPension), { indent: 2, isNeg: true });
  addRow(`Salud (${(nomina.tasaSalud * 100).toFixed(0)}%)`, round2(salario * nomina.tasaSalud),   { indent: 2, isNeg: true });
  addRow('Total deducciones',                               nomina.deducciones, { subtotal: true, isNeg: true });
  blank();

  // ── Tarjeta destacada del costo final — mismo tratamiento visual que UTILIDAD FINAL
  // en RESUMEN (fuente grande, bold, banda de color), en azul: acá no aplica semántica
  // de positivo/negativo como en utilidad, es siempre un costo.
  const kpiRow = ws.addRow([
    `Costo total (${nomina.empleados} emp × ${nomina.meses} meses)`,
    nomina.costoTotal,
  ]);
  kpiRow.getCell(1).font = { bold: true, size: 12, color: { argb: XL_WHITE } };
  kpiRow.getCell(2).font = { bold: true, size: 16, color: { argb: XL_WHITE } };
  kpiRow.getCell(2).numFmt = COP;
  kpiRow.getCell(1).alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
  kpiRow.getCell(2).alignment = { horizontal: 'right', vertical: 'middle', indent: 1 };
  kpiRow.height = 32;
  kpiRow.getCell(1).fill = sfill(XL_TITLE);
  kpiRow.getCell(2).fill = sfill(XL_TITLE);
  blank();

  addRow(
    `Costo por empleado / mes (Devengado − Deducciones) — $${Math.round(nomina.costoMes).toLocaleString('es-CO')}/emp`,
    nomina.costoMes,
    { total: true }
  );
}

function buildNomina(ws, nomina, salario) {
  ws.columns = [{ key: 'a', width: 52 }, { key: 'b', width: 22 }];
  freezeHeaderRowAt(ws, 1);
  buildNominaContent(ws, nomina, salario);
}

// ── Hoja METADATOS ─────────────────────────────────────────────────────────────
function buildMetadatosContent(ws, { totalFilas, periodoDesde, periodoHasta, procesadoEn }, userEmail, filas, documentosNoContabilizados = [], anomalias = [], { freeze = true } = {}) {
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

  // ── Documentos no contabilizados (transparencia) — banda ámbar de advertencia ──
  ws.addRow([]);
  sectionBand(ws, 'DOCUMENTOS NO CONTABILIZADOS', 4, XL_AMBER);

  if (documentosNoContabilizados.length === 0) {
    const row = ws.addRow(['Ningún documento quedó fuera de los cálculos']);
    row.getCell(1).alignment = { horizontal: 'left' };
    applyDataRow(row, 4, false);
  } else {
    const subHdr = ws.addRow(['Tipo de documento', 'Cant.', 'Total', 'Motivo']);
    applyHeaderRow(subHdr, 4);

    documentosNoContabilizados.forEach((doc, i) => {
      const row = ws.addRow([doc.tipo, doc.cantidad, doc.total, doc.motivo]);
      row.getCell(1).alignment = { horizontal: 'left' };
      row.getCell(2).alignment = { horizontal: 'center' };
      row.getCell(3).numFmt    = '"$ "#,##0';
      row.getCell(3).alignment = { horizontal: 'right' };
      row.getCell(4).alignment = { horizontal: 'left' };
      if (!doc.esConocido) row.getCell(4).font = { color: { argb: XL_RED } };
      applyDataRow(row, 4, i % 2 === 1);
    });
  }

  // ── Anomalías detectadas — banda ámbar de advertencia ────────────────────
  ws.addRow([]);
  sectionBand(ws, 'ANOMALÍAS DETECTADAS', 4, XL_AMBER);

  if (anomalias.length === 0) {
    const row = ws.addRow(['No se detectaron anomalías en los datos del reporte']);
    row.getCell(1).alignment = { horizontal: 'left' };
    applyDataRow(row, 4, false);
  } else {
    const subHdr = ws.addRow(['Tipo de anomalía', 'Estado', 'Detalle', '']);
    applyHeaderRow(subHdr, 4);
    ws.mergeCells(subHdr.number, 3, subHdr.number, 4);

    // "Revisado" es solo un ack manual (vía PATCH /borradores/:id/revisar-anomalia) —
    // nunca cambia ningún cálculo, ni para las anomalías que hoy excluyen filas de un total.
    anomalias.forEach((a, i) => {
      const row = ws.addRow([a.tipo, a.revisada ? '✓ Revisado' : 'Pendiente', a.detalle]);
      row.getCell(1).alignment = { horizontal: 'left' };
      row.getCell(1).font      = { bold: true, color: { argb: XL_AMBER } };
      row.getCell(2).alignment = { horizontal: 'center' };
      row.getCell(2).font      = { bold: true, color: { argb: a.revisada ? XL_GREEN : XL_AMBER } };
      row.getCell(3).alignment = { horizontal: 'left', wrapText: true };
      if (a.revisada) row.getCell(3).font = { italic: true, strike: true, color: { argb: 'FF9CA3AF' } };
      ws.mergeCells(row.number, 3, row.number, 4);
      applyDataRow(row, 4, i % 2 === 1);
    });
  }

  if (freeze) freezeHeaderRowAt(ws, 1);
}

function buildMetadatos(ws, meta, userEmail, filas, documentosNoContabilizados = [], anomalias = []) {
  ws.columns = [
    { key: 'campo', width: 34 },
    { key: 'valor', width: 36 },
    { key: 'c',     width: 14 },
    { key: 'd',     width: 50 },
  ];
  buildMetadatosContent(ws, meta, userEmail, filas, documentosNoContabilizados, anomalias);
}

// ── Hoja REPORTE_DIAN ────────────────────────────────────────────────────────────
// Reproduce el reporte DIAN tal cual se subió (mismas columnas, una fila por documento),
// como referencia cruda junto a las hojas de cálculo. No es un resumen ni duplica las
// otras hojas — es la fuente original, sin transformar.
const COLUMNAS_REPORTE_DIAN = [
  { header: 'Tipo de documento', field: 'tipoDocumento', width: 26 },
  { header: 'CUFE/CUDE',         field: 'cufe',           width: 42 },
  { header: 'Folio',             field: 'folio',          width: 10 },
  { header: 'Prefijo',           field: 'prefijo',        width: 10 },
  { header: 'Divisa',            field: 'divisa',         width: 10 },
  { header: 'Forma de Pago',     field: 'formaPago',      width: 14 },
  { header: 'Medio de Pago',     field: 'medioPago',      width: 14 },
  { header: 'Fecha Emisión',     field: 'fechaEmision',   width: 14, isFecha: true },
  { header: 'Fecha Recepción',   field: 'fechaRecepcion', width: 18, isFecha: true },
  { header: 'NIT Emisor',        field: 'nitEmisor',      width: 14 },
  { header: 'Nombre Emisor',     field: 'nombreEmisor',   width: 32 },
  { header: 'NIT Receptor',      field: 'nitReceptor',    width: 14 },
  { header: 'Nombre Receptor',   field: 'nombreReceptor', width: 32 },
  { header: 'IVA',               field: 'iva',            width: 14, isNum: true },
  { header: 'ICA',               field: 'ica',            width: 12, isNum: true },
  { header: 'IC',                field: 'ic',             width: 12, isNum: true },
  { header: 'INC',               field: 'inc',            width: 12, isNum: true },
  { header: 'Timbre',            field: 'timbre',         width: 12, isNum: true },
  { header: 'INC Bolsas',        field: 'incBolsas',      width: 12, isNum: true },
  { header: 'IN Carbono',        field: 'inCarbono',      width: 12, isNum: true },
  { header: 'IN Combustibles',   field: 'inCombustibles', width: 14, isNum: true },
  { header: 'IC Datos',          field: 'icDatos',        width: 12, isNum: true },
  { header: 'ICL',               field: 'icl',            width: 12, isNum: true },
  { header: 'INPP',              field: 'inpp',           width: 12, isNum: true },
  { header: 'IBUA',              field: 'ibua',           width: 12, isNum: true },
  { header: 'ICUI',              field: 'icui',           width: 12, isNum: true },
  { header: 'Rete IVA',          field: 'reteIva',        width: 12, isNum: true },
  { header: 'Rete Renta',        field: 'reteRenta',      width: 12, isNum: true },
  { header: 'Rete ICA',          field: 'reteIca',        width: 12, isNum: true },
  { header: 'Total',             field: 'total',          width: 16, isNum: true },
  { header: 'Estado',            field: 'estado',         width: 22 },
  { header: 'Grupo',             field: 'grupo',          width: 12 },
];

// Convierte de vuelta a dd/mm/aaaa cuando el valor se pudo parsear a ISO (yyyy-MM-dd);
// si vino con hora o no se pudo parsear, se deja tal cual llegó del archivo original.
const fechaOriginal = (val) => (/^\d{4}-\d{2}-\d{2}$/.test(val ?? '') ? fechaES(val) : (val ?? ''));

function buildReporteDian(ws, filas) {
  const numCols = COLUMNAS_REPORTE_DIAN.length;
  ws.columns = COLUMNAS_REPORTE_DIAN.map((c, i) => ({ key: `c${i}`, width: c.width }));

  const hdr = ws.addRow(COLUMNAS_REPORTE_DIAN.map((c) => c.header));
  applyHeaderRow(hdr, numCols);

  filas.forEach((f, i) => {
    const row = ws.addRow(COLUMNAS_REPORTE_DIAN.map((c) =>
      c.isFecha ? fechaOriginal(f[c.field]) : (f[c.field] ?? '')
    ));
    COLUMNAS_REPORTE_DIAN.forEach((c, colIdx) => {
      const cell = row.getCell(colIdx + 1);
      if (c.isNum) {
        cell.numFmt = '"$ "#,##0';
        cell.alignment = { horizontal: 'right' };
      } else if (c.isFecha) {
        cell.alignment = { horizontal: 'center' };
      } else {
        cell.alignment = { horizontal: 'left' };
      }
    });
    applyDataRow(row, numCols, i % 2 === 1);
  });

  freezeHeaderRowAt(ws, 1);
}

const exportarBorrador = async (req, res, next) => {
  try {
    const { id } = req.params;
    const empleados = parseInt(req.body.empleados ?? 0, 10) || 0;
    const meses     = parseInt(req.body.meses     ?? 0, 10) || 0;

    // ── 1. Leer borrador y verificar propiedad ─────────────────────────────
    const { rows } = await db.query(
      `SELECT datos, archivo_original FROM calculo_borradores WHERE id = $1 AND creado_por = $2`,
      [id, req.user.userId]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Borrador no encontrado' });
    }

    const { filas, calculos, anomaliasRevisadas = [] } = rows[0].datos;
    const archivoOriginal = rows[0].archivo_original;

    // ── 2. Filas Recibido no-nómina, sin acuses técnicos ────────────────────
    // "Application response" es un acuse técnico DIAN sin valor comercial (ver
    // MOTIVOS_DOCUMENTOS_EXCLUIDOS) — no se le pide clasificación de retención ni
    // entra a DETALLE_COMPRAS ni a los totales retenidos.
    const filasRecibido = filas.filter(
      (f) => f.grupo === RECIBIDO && f.tipoDocumento !== NOMINA_INDIVIDUAL && f.tipoDocumento !== APPLICATION_RESPONSE
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
    // Agrupado por efecto sobre el IVA a pagar, no por Emitido/Recibido:
    // - Devolución en COMPRAS revierte crédito de IVA descontable → sube el IVA
    //   a pagar, igual que IVA Generado (grupo "IVA Ventas").
    // - Devolución en VENTAS revierte el IVA generado en esa venta → baja el IVA
    //   a pagar, igual que IVA Descontable (grupo "IVA Compras").
    // Total IVA = (IVA Generado + IVA devolución compras) − (IVA Descontable + IVA devolución ventas)
    const ivaGenerado          = calculos.ivaGenerado          ?? 0;
    const ivaDescontable       = calculos.ivaDescontable       ?? 0;
    const ivaDevolucionCompras = calculos.ivaDevolucionCompras ?? 0;
    const ivaDevolucionVentas  = calculos.ivaDevolucionVentas  ?? 0;
    const totalIvaVentas       = ivaGenerado    + ivaDevolucionCompras;
    const totalIvaCompras      = ivaDescontable + ivaDevolucionVentas;
    const ivaPagar             = round2(totalIvaVentas - totalIvaCompras);

    // ── 5. Estado de resultados ────────────────────────────────────────────
    // Ventas/Compras Netas (y por lo tanto Utilidad Bruta) se calculan SIN IVA ni INC:
    // el "Total" del reporte DIAN incluye ambos impuestos, pero ninguno es ingreso ni
    // costo real de la empresa — son pasivos que se recaudan y se pagan a la DIAN. Se
    // muestran ambas versiones (con/sin impuestos) en el Excel para poder auditar.
    const incGenerado          = calculos.incGenerado         ?? 0;
    const incDevolucionVentas  = calculos.incDevolucionVentas ?? 0;

    const ventasBrutoConIva      = calculos.ventasBruto       ?? 0;
    const ventasBrutoSinIva      = ventasBrutoConIva - ivaGenerado - incGenerado;
    const devolucionVentasConIva = calculos.devolucionVentas  ?? 0;
    const devolucionVentasSinIva = devolucionVentasConIva - ivaDevolucionVentas - incDevolucionVentas;
    const ventasNetas            = ventasBrutoSinIva - devolucionVentasSinIva;

    const comprasBrutoConIva      = calculos.comprasBruto      ?? 0;
    const comprasBrutoSinIva      = comprasBrutoConIva - ivaDescontable;
    const devolucionComprasConIva = calculos.devolucionCompras ?? 0;
    const devolucionComprasSinIva = devolucionComprasConIva - ivaDevolucionCompras;

    // "Documento soporte con no obligados" tiene el Grupo invertido respecto a la
    // convención normal: Grupo="Emitido" es una COMPRA nuestra (se lo emitimos a alguien
    // no obligado a facturar que nos vendió). Se suma directo a Compras Netas, no a
    // Costos Totales por separado — Grupo="Recibido" no tiene contrapartida normal acá
    // y se reporta como anomalía (ver calcularAnomalias), sin sumar a ningún total.
    const esDocSoporteCompra = (f) => f.tipoDocumento === DOC_SOPORTE_NO_OBLIGADOS && f.grupo === EMITIDO;
    const documentoSoporteComprasFilas = filas.filter(esDocSoporteCompra);
    const documentoSoporteCompras    = documentoSoporteComprasFilas.reduce((s, f) => s + (f.total ?? 0), 0);
    const ivaDocumentoSoporteCompras = documentoSoporteComprasFilas.reduce((s, f) => s + (f.iva ?? 0), 0);
    const documentoSoporteComprasSinIva = documentoSoporteCompras - ivaDocumentoSoporteCompras;

    const comprasNetas   = comprasBrutoSinIva - devolucionComprasSinIva + documentoSoporteComprasSinIva;
    const costosTotales  = comprasNetas;
    const utilidadBruta  = ventasNetas - costosTotales;
    const utilidadNeta   = round2(utilidadBruta - totalRetenciones);

    // ── 6. Período (se calcula antes de nómina para saber qué año de SMMLV usar) ──
    const fechas       = filas.map((f) => f.fechaEmision).filter(Boolean).sort();
    const periodoDesde = fechas[0] ?? null;
    const periodoHasta = fechas[fechas.length - 1] ?? null;
    const procesadoEn  = new Date().toISOString();
    const totalFilas   = filas.length;

    // Nombre de la empresa: emisor en facturas emitidas, o receptor en facturas recibidas
    const filaEmitida   = filas.find((f) => f.grupo === EMITIDO);
    const filaRecibida  = filas.find((f) => f.grupo === RECIBIDO);
    const empresaNombre = filaEmitida?.nombreEmisor ?? filaRecibida?.nombreReceptor ?? 'EMPRESA';

    const anioPeriodo  = periodoDesde ? parseInt(periodoDesde.slice(0, 4), 10) : new Date().getFullYear();
    const salaryConsts = getSalaryConstants(anioPeriodo);
    const salario       = parseFloat(req.body.salario ?? salaryConsts.smmlv) || salaryConsts.smmlv;

    // ── 7. Nómina ──────────────────────────────────────────────────────────
    // Fórmula compartida con el preview de frontend (shared/calcularNomina.js) — evita que
    // backend y frontend vuelvan a desincronizarse, como pasó antes con el SMMLV hardcodeado.
    const { calcularNomina, calcularCostoTotal, TASA_PENSION, TASA_SALUD } =
      await import('../../../shared/calcularNomina.js');

    let nominaCalc = null;
    let costoNominaTotal = 0;
    if (empleados > 0 && meses > 0) {
      nominaCalc = calcularNomina({
        salario,
        smmlv: salaryConsts.smmlv,
        auxilioTransporte: salaryConsts.auxilioTransporte,
      });
      costoNominaTotal = calcularCostoTotal({ empleados, meses, costoMes: nominaCalc.costoMes });
    }

    // ── 8. Documentos no contabilizados y anomalías (transparencia) ─────────
    const documentosNoContabilizados = calcularDocumentosNoContabilizados(filas);
    const anomalias                  = calcularAnomalias(filas, anomaliasRevisadas);

    const resumen = {
      ventasBrutoSinIva:            round2(ventasBrutoSinIva),
      devolucionVentasSinIva:       round2(devolucionVentasSinIva),
      ventasNetas:                  round2(ventasNetas),
      comprasBrutoSinIva:           round2(comprasBrutoSinIva),
      devolucionComprasSinIva:      round2(devolucionComprasSinIva),
      comprasNetas:                 round2(comprasNetas),
      documentoSoporteCompras:      round2(documentoSoporteCompras),
      documentoSoporteComprasSinIva: round2(documentoSoporteComprasSinIva),
      costosTotales:                round2(costosTotales),
      utilidadBruta:                round2(utilidadBruta),
      ivaGenerado:                  round2(ivaGenerado),
      ivaDescontable:               round2(ivaDescontable),
      ivaDevolucionCompras:         round2(ivaDevolucionCompras),
      ivaDevolucionVentas:          round2(ivaDevolucionVentas),
      totalIvaVentas:               round2(totalIvaVentas),
      totalIvaCompras:              round2(totalIvaCompras),
      ivaPagar,
      totalRetenciones,
      utilidadNeta,
    };

    const nominaData = nominaCalc
      ? {
          empleados, meses,
          year:              anioPeriodo,
          salario:           round2(salario),
          smmlv:             salaryConsts.smmlv,
          auxilioTransporte: salaryConsts.auxilioTransporte,
          auxilioAplica:     nominaCalc.auxilioAplica,
          devengadoDetalle:  nominaCalc.devengadoDetalle,
          devengado:         nominaCalc.devengado,
          deducciones:       nominaCalc.deducciones,
          costoMes:          nominaCalc.costoMes,
          costoTotal:        costoNominaTotal,
          tasaPension:       TASA_PENSION,
          tasaSalud:         TASA_SALUD,
        }
      : null;

    // ── 9. Email del usuario para metadatos ────────────────────────────────
    const userRow   = await db.query('SELECT email FROM users WHERE id = $1', [req.user.userId]);
    const userEmail = userRow.rows[0]?.email ?? 'usuario';

    // ── 10. Generar workbook ───────────────────────────────────────────────
    // Partimos del archivo original tal cual se subió (mismo buffer normalizado que se
    // guardó en el upload — solo prefijos XML corregidos, ningún dato/formato tocado) y le
    // agregamos las hojas de cálculo encima. La hoja original queda 100% intacta: cero
    // riesgo de perder formato/precisión al reconstruirla desde JSON.
    const wb = new ExcelJS.Workbook();
    if (archivoOriginal) {
      await wb.xlsx.load(archivoOriginal);
    } else {
      // Borradores previos a esta migración no tienen el archivo guardado — se reconstruye
      // la hoja desde los datos parseados como respaldo.
      buildReporteDian(wb.addWorksheet('REPORTE_DIAN'), filas);
    }
    wb.creator = userEmail;
    wb.created = new Date();

    const meta = { totalFilas, periodoDesde, periodoHasta, procesadoEn, empresaNombre };

    buildResumen(wb.addWorksheet('RESUMEN'), resumen, nominaData, meta);
    buildImpuestos(wb.addWorksheet('IMPUESTOS'), resumen);
    buildRetenciones(wb.addWorksheet('RETENCIONES_POR_PROVEEDOR'), retencionesPorProveedor, totalRetenciones);
    buildDetalleCompras(wb.addWorksheet('DETALLE_COMPRAS'), filasRecibido);
    if (nominaData) buildNomina(wb.addWorksheet('NOMINA'), nominaData, nominaData.salario);
    buildMetadatos(wb.addWorksheet('METADATOS'), meta, userEmail, filas, documentosNoContabilizados, anomalias);

    // ── 9. Escribir buffer y enviar ────────────────────────────────────────
    const buffer = await corregirTablaRoundtrip(await wb.xlsx.writeBuffer());

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
    // Solo filas que realmente requieren clasificación de retención (Recibido, no-nómina,
    // sin acuses técnicos) — "Application response" nunca se clasifica, no cuenta para nada.
    const requiereClasificacion = (f) =>
      f.grupo === RECIBIDO && f.tipoDocumento !== NOMINA_INDIVIDUAL && f.tipoDocumento !== APPLICATION_RESPONSE;
    const sinClasificar = filas.filter((f) => requiereClasificacion(f) && f.clasificacionRetencion == null);

    if (sinClasificar.length === 0) {
      return res.json({ filasActualizadas: 0, filasRestanteSinClasificar: 0, mensaje: 'No hay filas sin clasificar' });
    }

    const nuevaTasa = clasificacionRetencion === 'N/A' ? null : (tasaRetencion ?? null);
    const nuevasFilas = filas.map((f) =>
      requiereClasificacion(f) && f.clasificacionRetencion == null
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

// Marca un tipo de anomalía como revisado manualmente — solo silencia la alerta en el
// Excel exportado (aparece tachada / con nota "revisado"), NUNCA cambia ningún cálculo.
// Decisión explícita: ni siquiera las anomalías que hoy excluyen filas de un total
// (Documento Soporte Recibido, Grupo inesperado) se auto-incluyen al revisar.
const marcarAnomaliaRevisada = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { tipo } = req.body;

    if (!tipo || typeof tipo !== 'string') {
      return res.status(400).json({ error: '"tipo" es requerido' });
    }

    const check = await db.query(
      `SELECT datos FROM calculo_borradores WHERE id = $1 AND creado_por = $2`,
      [id, req.user.userId]
    );
    if (check.rows.length === 0) return res.status(404).json({ error: 'Borrador no encontrado' });

    const revisadas = new Set(check.rows[0].datos.anomaliasRevisadas ?? []);
    revisadas.add(tipo);

    await db.query(
      `UPDATE calculo_borradores SET datos = jsonb_set(datos, '{anomaliasRevisadas}', $1::jsonb) WHERE id = $2 AND creado_por = $3`,
      [JSON.stringify([...revisadas]), id, req.user.userId]
    );

    res.json({ success: true, anomaliasRevisadas: [...revisadas] });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  uploadDian, patchBorrador, exportarBorrador, aplicarClasificacionRapida, marcarAnomaliaRevisada,
  // Funciones puras (no tocan DB ni request). Se exportan para poder testear directamente
  // las reglas contables sin montar un borrador completo — ver tests/unit/dianController.test.js
  calcularAnomalias, calcularDocumentosNoContabilizados,
};
