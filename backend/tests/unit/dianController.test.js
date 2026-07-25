jest.mock('../../src/config/database');

const ExcelJS = require('exceljs');
const db = require('../../src/config/database');
const {
  uploadDian,
  calcularAnomalias,
  calcularDocumentosNoContabilizados,
} = require('../../src/controllers/dianController');

// Textos EXACTOS como los exporta el portal de la DIAN. No son los nombres oficiales del
// anexo técnico (el anexo dice "Tiquete de transporte de pasajeros Terrestre", el portal
// dice "Documento equivalente - Transporte pasajeros terrestre") — si estas constantes se
// desincronizan del controller, la fila cae en DOCUMENTOS NO CONTABILIZADOS sin avisar.
// Catálogo completo y códigos DIAN en docs/dian-tipos-documento.md
const FACTURA              = 'Factura electrónica';
const NOTA_CREDITO         = 'Nota de crédito electrónica';
const NOTA_AJUSTE_CREDITO  = 'Nota de ajuste crédito del documento equivalente';
const SERVICIOS_PUBLICOS   = 'Documento equivalente - Servicios públicos domiciliarios';
const TRANSPORTE_AEREO     = 'Documento equivalente - Transporte aéreo de pasajeros';
const TRANSPORTE_TERRESTRE = 'Documento equivalente - Transporte pasajeros terrestre';
const DOC_SOPORTE          = 'Documento soporte con no obligados';
const APPLICATION_RESPONSE = 'Application response';
const NOMINA_INDIVIDUAL    = 'Nomina Individual';

const COLUMNAS = [
  'Tipo de documento', 'CUFE/CUDE', 'Fecha Emisión', 'NIT Emisor',
  'Nombre Emisor', 'IVA', 'INC', 'Total', 'Estado', 'Grupo',
];

// Construye un .xlsx en memoria con la forma del reporte DIAN. `filas` usa nombres cortos
// para que cada test se lea como la regla contable que verifica, no como manejo de Excel.
async function construirReporte(filas) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Rp_Doc_Test');
  ws.addRow(COLUMNAS);
  filas.forEach((f, i) => {
    ws.addRow([
      f.tipo,
      f.cufe ?? `CUFE-${i}`,
      f.fecha ?? '15-07-2026',
      f.nit ?? '900123456',
      f.emisor ?? 'PROVEEDOR SAS',
      f.iva ?? 0,
      f.inc ?? 0,
      f.total ?? 0,
      'Autorizado',
      f.grupo,
    ]);
  });
  return Buffer.from(await wb.xlsx.writeBuffer());
}

// Ejecuta uploadDian con la DB mockeada y devuelve el objeto `calculos` que produjo.
async function calcular(filas) {
  const req = {
    file: { buffer: await construirReporte(filas), originalname: 'reporte.xlsx' },
    user: { userId: 'usuario-de-prueba' },
  };
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
  const next = jest.fn();

  await uploadDian(req, res, next);

  if (next.mock.calls.length > 0) throw next.mock.calls[0][0];
  expect(res.status).toHaveBeenCalledWith(201);
  return res.json.mock.calls[0][0].calculos;
}

beforeEach(() => {
  jest.clearAllMocks();
  db.query.mockResolvedValue({ rows: [] });
});

describe('uploadDian — qué cuenta como compra', () => {
  test('la factura electrónica recibida suma a compras y aporta IVA descontable', async () => {
    const calculos = await calcular([
      { tipo: FACTURA, grupo: 'Recibido', total: 119000, iva: 19000 },
    ]);

    expect(calculos.comprasBruto).toBe(119000);
    expect(calculos.ivaDescontable).toBe(19000);
  });

  // Regresión: el transporte terrestre existía en los reportes pero no estaba parametrizado,
  // así que sus filas quedaban fuera de Compras Netas (subestimando el costo). Ver
  // docs/dian-tipos-documento.md §3.1
  test('el transporte terrestre recibido suma a compras', async () => {
    const calculos = await calcular([
      { tipo: TRANSPORTE_TERRESTRE, grupo: 'Recibido', total: 47000, iva: 0 },
    ]);

    expect(calculos.comprasBruto).toBe(47000);
  });

  // Está EXCLUIDO de IVA (Art. 476 ET): aunque llegara con IVA, no genera crédito
  // descontable. Por eso vive en TIPOS_COMPRA y no en TIPOS_FACTURA_EQUIVALENTE.
  test('el transporte terrestre no aporta IVA descontable', async () => {
    const calculos = await calcular([
      { tipo: TRANSPORTE_TERRESTRE, grupo: 'Recibido', total: 47000, iva: 8930 },
    ]);

    expect(calculos.comprasBruto).toBe(47000);
    expect(calculos.ivaDescontable).toBe(0);
  });

  test('los servicios públicos domiciliarios suman a compras sin aportar IVA descontable', async () => {
    const calculos = await calcular([
      { tipo: SERVICIOS_PUBLICOS, grupo: 'Recibido', total: 331507, iva: 0 },
    ]);

    expect(calculos.comprasBruto).toBe(331507);
    expect(calculos.ivaDescontable).toBe(0);
  });

  // El aéreo SÍ puede ser venta (lo distingue del terrestre): está en
  // TIPOS_FACTURA_EQUIVALENTE, así que cambia de lado según el Grupo.
  test('el transporte aéreo cuenta como venta cuando el Grupo es Emitido', async () => {
    const calculos = await calcular([
      { tipo: TRANSPORTE_AEREO, grupo: 'Emitido', total: 500000, iva: 95000 },
    ]);

    expect(calculos.ventasBruto).toBe(500000);
    expect(calculos.ivaGenerado).toBe(95000);
    expect(calculos.comprasBruto).toBe(0);
  });

  // El documento soporte tiene el Grupo INVERTIDO (Emitido = compra nuestra) y se resuelve
  // aparte, en la exportación. Nunca debe entrar a comprasBruto por la vía normal.
  test('el documento soporte con no obligados no entra en comprasBruto', async () => {
    const calculos = await calcular([
      { tipo: DOC_SOPORTE, grupo: 'Emitido',  total: 50000 },
      { tipo: DOC_SOPORTE, grupo: 'Recibido', total: 12821 },
    ]);

    expect(calculos.comprasBruto).toBe(0);
    expect(calculos.ventasBruto).toBe(0);
  });
});

describe('uploadDian — devoluciones', () => {
  test('la nota crédito recibida resta como devolución en compras', async () => {
    const calculos = await calcular([
      { tipo: FACTURA,      grupo: 'Recibido', total: 119000, iva: 19000 },
      { tipo: NOTA_CREDITO, grupo: 'Recibido', total: 11900,  iva: 1900 },
    ]);

    expect(calculos.comprasBruto).toBe(119000);
    expect(calculos.devolucionCompras).toBe(11900);
    expect(calculos.ivaDevolucionCompras).toBe(1900);
  });

  // Regresión: la nota de ajuste crédito (código 94) es la nota crédito del mundo
  // "documento equivalente". Antes no estaba parametrizada y no restaba de nada.
  test('la nota de ajuste crédito del documento equivalente resta como devolución en compras', async () => {
    const calculos = await calcular([
      { tipo: SERVICIOS_PUBLICOS,  grupo: 'Recibido', total: 331507 },
      { tipo: NOTA_AJUSTE_CREDITO, grupo: 'Recibido', total: 111840 },
    ]);

    expect(calculos.comprasBruto).toBe(331507);
    expect(calculos.devolucionCompras).toBe(111840);
  });

  test('ambos tipos de nota crédito se acumulan en la misma devolución', async () => {
    const calculos = await calcular([
      { tipo: NOTA_CREDITO,        grupo: 'Recibido', total: 11900 },
      { tipo: NOTA_AJUSTE_CREDITO, grupo: 'Recibido', total: 111840 },
    ]);

    expect(calculos.devolucionCompras).toBe(123740);
  });

  test('la nota crédito emitida resta de ventas, no de compras', async () => {
    const calculos = await calcular([
      { tipo: FACTURA,      grupo: 'Emitido', total: 238000, iva: 38000 },
      { tipo: NOTA_CREDITO, grupo: 'Emitido', total: 11900,  iva: 1900 },
    ]);

    expect(calculos.devolucionVentas).toBe(11900);
    expect(calculos.ivaDevolucionVentas).toBe(1900);
    expect(calculos.devolucionCompras).toBe(0);
  });
});

describe('uploadDian — documentos que no se contabilizan', () => {
  test('el Application response no entra en ningún total', async () => {
    const calculos = await calcular([
      { tipo: FACTURA,              grupo: 'Recibido', total: 119000, iva: 19000 },
      { tipo: APPLICATION_RESPONSE, grupo: 'Recibido', total: 999999, iva: 99999 },
    ]);

    expect(calculos.comprasBruto).toBe(119000);
    expect(calculos.ivaDescontable).toBe(19000);
  });

  // El costo laboral entra al Estado de Resultados por el cálculo de nómina, no sumando
  // estas filas. Contarlas sería duplicar el mismo gasto.
  test('la nómina individual no cuenta como compra', async () => {
    const calculos = await calcular([
      { tipo: NOMINA_INDIVIDUAL, grupo: 'Emitido', total: 15890197 },
    ]);

    expect(calculos.comprasBruto).toBe(0);
    expect(calculos.ventasBruto).toBe(0);
  });

  // Red de seguridad: ante un tipo nuevo el módulo NO adivina. Lo deja fuera de los totales
  // (queda visible en DOCUMENTOS NO CONTABILIZADOS) en vez de sumarlo con el signo errado.
  test('un tipo de documento desconocido no altera ningún total', async () => {
    const calculos = await calcular([
      { tipo: FACTURA,                    grupo: 'Recibido', total: 119000, iva: 19000 },
      { tipo: 'Documento equivalente - Peajes', grupo: 'Recibido', total: 800000, iva: 0 },
    ]);

    expect(calculos.comprasBruto).toBe(119000);
  });
});

describe('calcularDocumentosNoContabilizados', () => {
  test('reporta el tipo desconocido con su monto y lo marca para revisión manual', () => {
    const resultado = calcularDocumentosNoContabilizados([
      { tipoDocumento: FACTURA,                           grupo: 'Recibido', total: 119000 },
      { tipoDocumento: 'Documento equivalente - Peajes',  grupo: 'Recibido', total: 800000 },
      { tipoDocumento: 'Documento equivalente - Peajes',  grupo: 'Recibido', total: 200000 },
    ]);

    expect(resultado).toEqual([
      expect.objectContaining({
        tipo: 'Documento equivalente - Peajes',
        cantidad: 2,
        total: 1000000,
        esConocido: false,
      }),
    ]);
  });

  test('los tipos excluidos a propósito llevan su motivo y se marcan como conocidos', () => {
    const resultado = calcularDocumentosNoContabilizados([
      { tipoDocumento: APPLICATION_RESPONSE, grupo: 'Recibido', total: 0 },
    ]);

    expect(resultado[0].esConocido).toBe(true);
    expect(resultado[0].motivo).toMatch(/acuse técnico/i);
  });

  test('los tipos ya parametrizados no aparecen como no contabilizados', () => {
    const resultado = calcularDocumentosNoContabilizados([
      { tipoDocumento: FACTURA,              grupo: 'Recibido', total: 119000 },
      { tipoDocumento: TRANSPORTE_TERRESTRE, grupo: 'Recibido', total: 47000 },
      { tipoDocumento: NOTA_AJUSTE_CREDITO,  grupo: 'Recibido', total: 111840 },
    ]);

    expect(resultado).toEqual([]);
  });
});

describe('calcularAnomalias', () => {
  // Una nota crédito con Total negativo es normal (revierte una operación). Si las notas de
  // ajuste no estuvieran contempladas acá, dispararían una anomalía falsa.
  test('un total negativo en cualquier nota crédito no es anomalía', () => {
    const anomalias = calcularAnomalias([
      { tipoDocumento: NOTA_CREDITO,        grupo: 'Recibido', total: -11900,  iva: 0, cufe: 'A' },
      { tipoDocumento: NOTA_AJUSTE_CREDITO, grupo: 'Recibido', total: -111840, iva: 0, cufe: 'B' },
    ]);

    expect(anomalias.find((a) => a.tipo === 'Total negativo inesperado')).toBeUndefined();
  });

  test('un total negativo en una factura sí es anomalía', () => {
    const anomalias = calcularAnomalias([
      { tipoDocumento: FACTURA, grupo: 'Recibido', total: -50000, iva: 0, cufe: 'A' },
    ]);

    expect(anomalias.find((a) => a.tipo === 'Total negativo inesperado')).toBeDefined();
  });

  test('detecta CUFE duplicado', () => {
    const anomalias = calcularAnomalias([
      { tipoDocumento: FACTURA, grupo: 'Recibido', total: 1000, iva: 0, cufe: 'REPETIDO' },
      { tipoDocumento: FACTURA, grupo: 'Recibido', total: 1000, iva: 0, cufe: 'REPETIDO' },
    ]);

    expect(anomalias.find((a) => a.tipo === 'CUFE/CUDE duplicado')).toBeDefined();
  });

  // El documento soporte se le emite a un no-obligado a facturar; recibirlo no tiene
  // contrapartida en este modelo. No se suma a ningún total y se marca para revisar.
  test('el documento soporte con Grupo Recibido se reporta como anomalía', () => {
    const anomalias = calcularAnomalias([
      { tipoDocumento: DOC_SOPORTE, grupo: 'Recibido', total: 12821, iva: 0, cufe: 'A' },
    ]);

    expect(anomalias.find((a) => a.tipo.includes('Documento soporte'))).toBeDefined();
  });

  test('marcar una anomalía como revisada no la elimina, solo la señala', () => {
    const filas = [{ tipoDocumento: FACTURA, grupo: 'Recibido', total: -50000, iva: 0, cufe: 'A' }];

    const anomalias = calcularAnomalias(filas, ['Total negativo inesperado']);

    expect(anomalias.find((a) => a.tipo === 'Total negativo inesperado').revisada).toBe(true);
  });

  test('un reporte limpio no produce anomalías', () => {
    const anomalias = calcularAnomalias([
      { tipoDocumento: FACTURA, grupo: 'Recibido', total: 119000, iva: 19000, cufe: 'A' },
      { tipoDocumento: FACTURA, grupo: 'Emitido',  total: 238000, iva: 38000, cufe: 'B' },
    ]);

    expect(anomalias).toEqual([]);
  });
});
