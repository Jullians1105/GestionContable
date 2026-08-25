jest.mock('../../src/config/database');

const ExcelJS = require('exceljs');
const db = require('../../src/config/database');
const { uploadExogenas, getExogenasBorrador, generarExogenas } = require('../../src/controllers/exogenasController');

const COLUMNAS_TOKEN = ['Tipo de documento', 'NIT Emisor', 'Nombre Emisor', 'IVA', 'Grupo'];

async function construirToken(filas, { nombreHoja = 'COMPRAS' } = {}) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(nombreHoja);
  ws.addRow(COLUMNAS_TOKEN);
  filas.forEach((f) => ws.addRow([f.tipo ?? 'Factura electrónica', f.nit, f.nombre, f.iva ?? 0, f.grupo ?? 'Recibido']));
  return Buffer.from(await wb.xlsx.writeBuffer());
}

const HEADERS_1005 = [
  'Concepto (CPT)', 'Tipo de Documento (TDOC)', 'Número de Identificacion (NID)',
  'Dígito de Verificación (DV)', 'Primer Apellido del informado (APL1)',
  'Segundo Apellido del informado (APL2)', 'Primer Nombre del informado (NOM1)',
  'Otros Nombres del informado (NOM2)', 'Razón Social del Informado (RAZ)',
  'Impuesto descontable (VIMP)', 'IVA resultante por devoluciones en ventas anuladas (IVADE)',
];

async function construirPlantilla({ nombreHoja = '1005' } = {}) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(nombreHoja);
  for (let i = 1; i < 7; i++) ws.addRow([]);
  ws.addRow(HEADERS_1005);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

function mockRes() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    setHeader: jest.fn(),
    send: jest.fn(),
  };
}

beforeEach(() => {
  db.query.mockReset();
  db.query.mockResolvedValue({ rows: [] });
});

describe('uploadExogenas', () => {
  const baseReq = (overrides = {}) => ({
    body: { formato: '1005' },
    user: { userId: 'usuario-1' },
    files: {},
    ...overrides,
  });

  test('rechaza un formato no soportado', async () => {
    const req = baseReq({ body: { formato: '9999' } });
    const res = mockRes();
    await uploadExogenas(req, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].error).toMatch(/no soportado/i);
  });

  test('exige el archivo TOKEN', async () => {
    const req = baseReq({ files: { plantilla: [{ buffer: Buffer.from(''), originalname: 'p.xlsx' }] } });
    const res = mockRes();
    await uploadExogenas(req, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].error).toMatch(/TOKEN/);
  });

  test('exige la plantilla', async () => {
    const token = await construirToken([{ nit: '1', nombre: 'X', iva: 1 }]);
    const req = baseReq({ files: { token: [{ buffer: token, originalname: 't.xlsx' }] } });
    const res = mockRes();
    await uploadExogenas(req, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].error).toMatch(/plantilla/i);
  });

  test('devuelve 400 con el mensaje de negocio si el TOKEN no tiene hoja COMPRAS', async () => {
    const token = await construirToken([{ nit: '1', nombre: 'X', iva: 1 }], { nombreHoja: 'OTRA' });
    const req = baseReq({
      files: {
        token: [{ buffer: token, originalname: 't.xlsx' }],
        plantilla: [{ buffer: Buffer.from(''), originalname: 'p.xlsx' }],
      },
    });
    const res = mockRes();
    await uploadExogenas(req, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].error).toMatch(/COMPRAS/);
  });

  test('400 si no queda ningún registro válido tras filtrar', async () => {
    const token = await construirToken([{ nit: '1', nombre: 'X', iva: 0 }]);
    const req = baseReq({
      files: {
        token: [{ buffer: token, originalname: 't.xlsx' }],
        plantilla: [{ buffer: Buffer.from(''), originalname: 'p.xlsx' }],
      },
    });
    const res = mockRes();
    await uploadExogenas(req, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].error).toMatch(/registros válidos/i);
  });

  test('éxito: guarda el borrador y responde 201 con el resumen', async () => {
    const token = await construirToken([{ nit: '900123456', nombre: 'ACME SAS', iva: 100 }]);
    const plantilla = await construirPlantilla();
    db.query.mockResolvedValueOnce({ rows: [{ id: 'borrador-1' }] });

    const req = baseReq({
      files: {
        token: [{ buffer: token, originalname: 't.xlsx' }],
        plantilla: [{ buffer: plantilla, originalname: 'p.xlsx' }],
      },
    });
    const res = mockRes();
    const next = jest.fn();
    await uploadExogenas(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(201);
    const body = res.json.mock.calls[0][0];
    expect(body).toMatchObject({ id: 'borrador-1', formato: '1005', totalTerceros: 1, totalVimp: 100 });

    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toMatch(/INSERT INTO exogenas_borradores/);
    expect(params[3]).toBe('usuario-1'); // creado_por
  });
});

describe('getExogenasBorrador', () => {
  test('404 si no existe o no es del usuario', async () => {
    const req = { params: { id: 'x' }, user: { userId: 'u1' } };
    const res = mockRes();
    await getExogenasBorrador(req, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(404);
  });

  test('200 con totales recalculados a partir de los registros guardados', async () => {
    db.query.mockResolvedValueOnce({
      rows: [{ id: 'b1', formato: '1005', registros: [{ vimp: 10 }, { vimp: 5.5 }] }],
    });
    const req = { params: { id: 'b1' }, user: { userId: 'u1' } };
    const res = mockRes();
    await getExogenasBorrador(req, res, jest.fn());
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ totalTerceros: 2, totalVimp: 15.5 }));
  });
});

describe('generarExogenas', () => {
  test('404 si no existe o no es del usuario', async () => {
    const req = { params: { id: 'x' }, user: { userId: 'u1' } };
    const res = mockRes();
    await generarExogenas(req, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(404);
  });

  test('400 con el mensaje de negocio si la plantilla guardada no tiene hoja 1005', async () => {
    const plantillaMala = await construirPlantilla({ nombreHoja: 'OTRA' });
    db.query.mockResolvedValueOnce({
      rows: [{ formato: '1005', registros: [], plantilla_original: plantillaMala, nombre_plantilla: 'p.xlsx' }],
    });
    const req = { params: { id: 'b1' }, user: { userId: 'u1' } };
    const res = mockRes();
    await generarExogenas(req, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].error).toMatch(/"1005"/);
  });

  test('éxito: genera el Excel, lo envía y borra el borrador', async () => {
    const plantilla = await construirPlantilla();
    const registros = [{ tipoDocumento: 31, identificacion: '900123456', digitoVerificacion: 8, razonSocial: 'ACME SAS', vimp: 100, ivade: 0 }];
    db.query
      .mockResolvedValueOnce({ rows: [{ formato: '1005', registros, plantilla_original: plantilla, nombre_plantilla: 'Plantilla Cliente.xlsx' }] })
      .mockResolvedValueOnce({ rows: [] });

    const req = { params: { id: 'b1' }, user: { userId: 'u1' } };
    const res = mockRes();
    const next = jest.fn();
    await generarExogenas(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.setHeader).toHaveBeenCalledWith('Content-Disposition', expect.stringContaining('1005 GENERADO.xlsx'));
    expect(res.send).toHaveBeenCalledWith(expect.any(Buffer));

    const deleteCall = db.query.mock.calls[1];
    expect(deleteCall[0]).toMatch(/DELETE FROM exogenas_borradores/);
    expect(deleteCall[1]).toEqual(['b1', 'u1']);
  });
});
