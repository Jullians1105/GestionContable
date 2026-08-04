jest.mock('../../src/config/database');

const ExcelJS = require('exceljs');
const db = require('../../src/config/database');
const {
  uploadDian,
  calcularAnomalias,
  calcularDocumentosNoContabilizados,
  exportarBorrador,
  aplicarClasificacionRapida,
  marcarAnomaliaRevisada,
  calcularResumenPeriodo,
  agruparPorMes,
} = require('../../src/controllers/dianController');

// Textos EXACTOS como los exporta el portal de la DIAN. No son los nombres oficiales del
// anexo técnico (el anexo dice "Tiquete de transporte de pasajeros Terrestre", el portal
// dice "Documento equivalente - Transporte pasajeros terrestre") — si estas constantes se
// desincronizan del controller, la fila cae en DOCUMENTOS NO CONTABILIZADOS sin avisar.
// Catálogo completo y códigos DIAN en docs/dian-tipos-documento.md
const FACTURA              = 'Factura electrónica';
const FACTURA_CONTINGENCIA = 'Factura electrónica de contingencia';
const DOC_EQUIVALENTE_POS  = 'Documento equivalente POS';
const CONTINGENCIA_DOC_EQ  = 'Contingencia Documentos Equivalentes';
const NOTA_CREDITO         = 'Nota de crédito electrónica';
const NOTA_AJUSTE_CREDITO  = 'Nota de ajuste crédito del documento equivalente';
const NOTA_AJUSTE_DOC_SOP  = 'Nota de ajuste del documento soporte'; // a propósito SIN parametrizar, ver el test más abajo
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

// Los tres primeros salieron de un reporte real de 10.349 filas (año completo) que antes
// caían en DOCUMENTOS NO CONTABILIZADOS — se tratan igual que una Factura electrónica
// normal (compra o venta según Grupo, con su IVA), confirmado con el usuario para
// CONTINGENCIA_DOC_EQ en vez de asumirlo por el patrón de un solo emisor en esos datos.
describe('uploadDian — tipos de contingencia y POS (igual que Factura electrónica)', () => {
  test('factura electrónica de contingencia cuenta como compra o venta según Grupo, con su IVA', async () => {
    const calculos = await calcular([
      { tipo: FACTURA_CONTINGENCIA, grupo: 'Recibido', total: 166300, iva: 9532 },
    ]);

    expect(calculos.comprasBruto).toBe(166300);
    expect(calculos.ivaDescontable).toBe(9532);
  });

  test('documento equivalente POS cuenta como compra o venta según Grupo, con su IVA', async () => {
    const calculos = await calcular([
      { tipo: DOC_EQUIVALENTE_POS, grupo: 'Emitido', total: 98000, iva: 15647 },
    ]);

    expect(calculos.ventasBruto).toBe(98000);
    expect(calculos.ivaGenerado).toBe(15647);
  });

  test('contingencia documentos equivalentes cuenta como compra o venta según Grupo, no solo como servicios públicos', async () => {
    // A diferencia de servicios públicos (siempre compra, sin IVA), este SÍ puede ser venta
    // y SÍ trae IVA — es la corrección que pidió el usuario sobre mi propuesta inicial.
    const calculos = await calcular([
      { tipo: CONTINGENCIA_DOC_EQ, grupo: 'Emitido', total: 238000, iva: 38000 },
    ]);

    expect(calculos.ventasBruto).toBe(238000);
    expect(calculos.ivaGenerado).toBe(38000);
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
      { tipoDocumento: FACTURA_CONTINGENCIA, grupo: 'Recibido', total: 166300 },
      { tipoDocumento: DOC_EQUIVALENTE_POS,  grupo: 'Emitido',  total: 98000 },
      { tipoDocumento: CONTINGENCIA_DOC_EQ,  grupo: 'Recibido', total: 5300274 },
    ]);

    expect(resultado).toEqual([]);
  });

  // Ver el comentario junto a TIPOS_NOTA_CREDITO en dianController.js: el anexo de la DIAN
  // confirma que existen ajustes crédito Y débito para el documento soporte, pero el portal
  // usa un único texto genérico sin distinguirlos — con un solo caso visto en un reporte
  // real no alcanza para confirmar el signo, así que se deja sin parametrizar a propósito
  // (no es un tipo olvidado, es una decisión deliberada hasta ver más casos).
  test('nota de ajuste del documento soporte queda sin parametrizar a propósito (signo sin confirmar)', () => {
    const resultado = calcularDocumentosNoContabilizados([
      { tipoDocumento: NOTA_AJUSTE_DOC_SOP, grupo: 'Recibido', total: 379000 },
    ]);

    expect(resultado).toEqual([
      expect.objectContaining({ tipo: NOTA_AJUSTE_DOC_SOP, cantidad: 1, total: 379000, esConocido: false }),
    ]);
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

// exportarBorrador arma el .xlsx completo (RESUMEN, IVA, RETENCIONES_POR_PROVEEDOR,
// DETALLE_COMPRAS, NOMINA, METADATOS), pero en el camino feliz hace
// `await import('../../../shared/calcularNomina.js')` — ese archivo es ESM real (lo
// consume también el frontend), y Jest no puede interceptar un import() nativo sin
// --experimental-vm-modules (falla con "A dynamic import callback was invoked without
// --experimental-vm-modules", no es un error de este test). Por eso no se puede unit-testear
// el camino feliz acá sin tocar la configuración global de Jest — ver la exclusión de
// dianController.js en jest.config.js, mismo criterio que ya se usa para fondo*/servicios de
// infraestructura. Sí se puede testear todo lo que retorna ANTES de llegar a esa línea.
describe('exportarBorrador — validaciones que retornan antes del import ESM', () => {
  function mockRes() {
    return { setHeader: jest.fn(), send: jest.fn(), status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
  }

  test('rechaza si hay filas Recibido sin clasificar', async () => {
    db.query.mockResolvedValueOnce({
      rows: [{
        datos: {
          filas: [{ tipoDocumento: FACTURA, grupo: 'Recibido', total: 119000, iva: 19000, clasificacionRetencion: null }],
          calculos: {},
          anomaliasRevisadas: [],
        },
        archivo_original: null,
      }],
    });
    const req = { params: { id: 'borrador-1' }, user: { userId: 'usuario-de-prueba' }, body: {} };
    const res = mockRes();

    await exportarBorrador(req, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.stringContaining('sin clasificar') }));
  });

  test('borrador inexistente devuelve 404', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    const res = mockRes();

    await exportarBorrador({ params: { id: 'x' }, user: { userId: 'u' }, body: {} }, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(404);
  });
});

describe('aplicarClasificacionRapida', () => {
  test('clasifica en bloque todas las filas Recibido sin clasificar', async () => {
    const filas = [
      { tipoDocumento: FACTURA, grupo: 'Recibido', total: 119000, clasificacionRetencion: null },
      { tipoDocumento: FACTURA, grupo: 'Recibido', total: 50000, clasificacionRetencion: null },
      { tipoDocumento: FACTURA, grupo: 'Emitido', total: 200000 }, // no aplica, no es Recibido
    ];
    db.query
      .mockResolvedValueOnce({ rows: [{ filas }] }) // SELECT
      .mockResolvedValueOnce({ rows: [] });         // UPDATE

    const req = { params: { id: 'b1' }, user: { userId: 'u1' }, body: { clasificacionRetencion: 'Servicios', tasaRetencion: 4 } };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };

    await aplicarClasificacionRapida(req, res, jest.fn());

    expect(res.json).toHaveBeenCalledWith({ filasActualizadas: 2, filasRestanteSinClasificar: 0 });
    const nuevasFilas = JSON.parse(db.query.mock.calls[1][1][0]);
    expect(nuevasFilas.filter((f) => f.grupo === 'Recibido').every((f) => f.clasificacionRetencion === 'Servicios')).toBe(true);
  });

  test('clasificación "N/A" no guarda tasa de retención', async () => {
    const filas = [{ tipoDocumento: FACTURA, grupo: 'Recibido', total: 119000, clasificacionRetencion: null }];
    db.query.mockResolvedValueOnce({ rows: [{ filas }] }).mockResolvedValueOnce({ rows: [] });

    const req = { params: { id: 'b1' }, user: { userId: 'u1' }, body: { clasificacionRetencion: 'N/A', tasaRetencion: 4 } };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };

    await aplicarClasificacionRapida(req, res, jest.fn());

    const nuevasFilas = JSON.parse(db.query.mock.calls[1][1][0]);
    expect(nuevasFilas[0].tasaRetencion).toBeNull();
  });

  test('rechaza una clasificación fuera del catálogo permitido', async () => {
    const req = { params: { id: 'b1' }, user: { userId: 'u1' }, body: { clasificacionRetencion: 'Lo que sea' } };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };

    await aplicarClasificacionRapida(req, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(400);
    expect(db.query).not.toHaveBeenCalled();
  });

  test('borrador inexistente devuelve 404', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    const req = { params: { id: 'x' }, user: { userId: 'u1' }, body: { clasificacionRetencion: 'Compras' } };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };

    await aplicarClasificacionRapida(req, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(404);
  });
});

describe('marcarAnomaliaRevisada', () => {
  test('agrega el tipo a anomaliasRevisadas sin duplicar ni tocar cálculos', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ datos: { anomaliasRevisadas: ['Total negativo inesperado'] } }] }) // SELECT
      .mockResolvedValueOnce({ rows: [] }); // UPDATE

    const req = { params: { id: 'b1' }, user: { userId: 'u1' }, body: { tipo: 'CUFE/CUDE duplicado' } };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };

    await marcarAnomaliaRevisada(req, res, jest.fn());

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      anomaliasRevisadas: expect.arrayContaining(['Total negativo inesperado', 'CUFE/CUDE duplicado']),
    });
  });

  test('rechaza sin "tipo" en el body', async () => {
    const req = { params: { id: 'b1' }, user: { userId: 'u1' }, body: {} };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };

    await marcarAnomaliaRevisada(req, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(400);
    expect(db.query).not.toHaveBeenCalled();
  });

  test('borrador inexistente devuelve 404', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    const req = { params: { id: 'x' }, user: { userId: 'u1' }, body: { tipo: 'algo' } };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };

    await marcarAnomaliaRevisada(req, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(404);
  });
});

// calcularResumenPeriodo es la función que exportarBorrador usa tanto para el Estado de
// Resultados general (sobre todas las filas) como para el desglose de RESUMEN_MENSUAL
// (una vez por mes) — se factorizó a propósito para que ambos casos compartan la misma
// fórmula. A diferencia de exportarBorrador (bloqueado por el import ESM, ver arriba),
// esta función es pura y sí se puede testear directo.
describe('calcularResumenPeriodo', () => {
  test('ventas/compras netas quedan sin IVA ni INC; retención no se resta de la utilidad', () => {
    const resumen = calcularResumenPeriodo([
      { tipoDocumento: FACTURA, grupo: 'Emitido', total: 119000, iva: 19000 },
      {
        tipoDocumento: FACTURA, grupo: 'Recibido', total: 59500, iva: 9500,
        clasificacionRetencion: 'Compras', tasaRetencion: 2.5,
      },
    ]);

    expect(resumen.ventasNetas).toBe(100000);
    expect(resumen.comprasNetas).toBe(50000);
    expect(resumen.utilidadBruta).toBe(50000);
    expect(resumen.ivaPagar).toBe(9500); // 19000 generado − 9500 descontable
    expect(resumen.totalRetenciones).toBe(1250); // (59500 − 9500) × 2.5% — retención sobre subtotal sin IVA
    expect(resumen.utilidadNeta).toBe(50000); // la retención no es un costo de la empresa, no se resta
  });

  test('sin filas, todo da cero (no revienta con listas vacías)', () => {
    const resumen = calcularResumenPeriodo([]);

    expect(resumen.ventasNetas).toBe(0);
    expect(resumen.utilidadNeta).toBe(0);
    expect(resumen.totalRetenciones).toBe(0);
  });

  test('documento soporte con no obligados (Grupo invertido) suma a Compras Netas', () => {
    const resumen = calcularResumenPeriodo([
      { tipoDocumento: DOC_SOPORTE, grupo: 'Emitido', total: 12821, iva: 0 },
    ]);

    expect(resumen.documentoSoporteCompras).toBe(12821);
    expect(resumen.comprasNetas).toBe(12821);
  });
});

// agruparPorMes alimenta el desglose de RESUMEN_MENSUAL en exportarBorrador — un solo mes
// no agrega la hoja (ver exportarBorrador: "mesesConDatos.length > 1"), así que lo que
// importa acá es que agrupe bien por YYYY-MM y en orden cronológico.
describe('agruparPorMes', () => {
  test('agrupa por año-mes y devuelve los grupos en orden cronológico', () => {
    const grupos = agruparPorMes([
      { fechaEmision: '2026-03-05', total: 1 },
      { fechaEmision: '2026-01-10', total: 2 },
      { fechaEmision: '2026-01-20', total: 3 },
      { fechaEmision: '2026-02-01', total: 4 },
    ]);

    expect(grupos.map(([ym]) => ym)).toEqual(['2026-01', '2026-02', '2026-03']);
    expect(grupos.find(([ym]) => ym === '2026-01')[1]).toHaveLength(2);
  });

  test('un solo mes en los datos da un solo grupo', () => {
    const grupos = agruparPorMes([
      { fechaEmision: '2026-05-01' },
      { fechaEmision: '2026-05-31' },
    ]);

    expect(grupos).toHaveLength(1);
  });

  test('filas sin fechaEmision quedan afuera de los grupos', () => {
    const grupos = agruparPorMes([
      { fechaEmision: '2026-01-10' },
      { fechaEmision: null },
    ]);

    expect(grupos).toHaveLength(1);
    expect(grupos[0][1]).toHaveLength(1);
  });
});
