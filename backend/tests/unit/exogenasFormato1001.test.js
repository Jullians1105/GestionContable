jest.mock('../../src/config/database');

const ExcelJS = require('exceljs');
const db = require('../../src/config/database');
const { leerYAgrupar, enriquecerConTerceros } = require('../../src/services/exogenas/formato1001');
const { verificarTerceros1001 } = require('../../src/controllers/exogenasController');

const COLUMNAS_TOKEN = ['Tipo de documento', 'NIT Emisor', 'Nombre Emisor', 'Grupo'];

async function construirToken(filas, { nombreHoja = 'COMPRAS' } = {}) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(nombreHoja);
  ws.addRow(COLUMNAS_TOKEN);
  filas.forEach((f) => {
    ws.addRow([f.tipo ?? 'Factura electrónica', f.nit, f.nombre, f.grupo ?? 'Recibido']);
  });
  return Buffer.from(await wb.xlsx.writeBuffer());
}

describe('formato1001 — leerYAgrupar', () => {
  test('agrupa por NIT, ignora filas sin Grupo=Recibido y deduplica', async () => {
    const buffer = await construirToken([
      { nit: '900123456', nombre: 'PROVEEDOR UNO SAS' },
      { nit: '900123456', nombre: 'PROVEEDOR UNO SAS' }, // duplicado, no debe repetirse
      { nit: '800654321', nombre: 'PROVEEDOR DOS SAS' },
      { nit: '111111111', nombre: 'NO CUENTA', grupo: 'Emitido' }, // no es compra
    ]);

    const registros = await leerYAgrupar(buffer);

    expect(registros).toHaveLength(2);
    expect(registros.map((r) => r.identificacion).sort()).toEqual(['800654321', '900123456']);
  });

  test('incluye notas crédito (a diferencia de 1005) — acá solo interesa quién podría aparecer', async () => {
    const buffer = await construirToken([
      { nit: '900123456', nombre: 'PROVEEDOR UNO SAS', tipo: 'Nota de crédito electrónica' },
    ]);
    const registros = await leerYAgrupar(buffer);
    expect(registros).toHaveLength(1);
  });

  test('lanza error si falta la hoja COMPRAS', async () => {
    const buffer = await construirToken([{ nit: '1', nombre: 'X' }], { nombreHoja: 'OTRA' });
    await expect(leerYAgrupar(buffer)).rejects.toThrow(/COMPRAS/);
  });
});

describe('formato1001 — enriquecerConTerceros', () => {
  beforeEach(() => db.query.mockReset());

  test('marca completo un tercero con direccion + ambos codigos DANE', async () => {
    db.query.mockResolvedValue({
      rows: [{
        nit: '900123456', direccion: 'CL 1 2 3', municipio: 'BOGOTA', codigo_municipio_dane: '11001',
        departamento: 'BOGOTA D.C.', codigo_departamento_dane: '11', pais: 'COLOMBIA', codigo_pais_dian: '169',
      }],
    });

    const [r] = await enriquecerConTerceros([{ tipoDocumento: 31, identificacion: '900123456', razonSocial: 'X' }]);

    expect(r.tieneTercero).toBe(true);
    expect(r.tieneDatosCompletos).toBe(true);
    expect(r.direccion).toBe('CL 1 2 3');
    expect(r.codigoPaisDian).toBe('169');
  });

  test('marca incompleto un tercero guardado pero sin codigo de municipio', async () => {
    db.query.mockResolvedValue({
      rows: [{ nit: '900123456', direccion: 'CL 1 2 3', codigo_municipio_dane: null, codigo_departamento_dane: null }],
    });
    const [r] = await enriquecerConTerceros([{ tipoDocumento: 31, identificacion: '900123456', razonSocial: 'X' }]);
    expect(r.tieneTercero).toBe(true);
    expect(r.tieneDatosCompletos).toBe(false);
  });

  test('marca sin tercero un NIT que no existe en la tabla', async () => {
    db.query.mockResolvedValue({ rows: [] });
    const [r] = await enriquecerConTerceros([{ tipoDocumento: 31, identificacion: '999999999', razonSocial: 'X' }]);
    expect(r.tieneTercero).toBe(false);
    expect(r.tieneDatosCompletos).toBe(false);
  });

  test('sin registros no consulta la base', async () => {
    const resultado = await enriquecerConTerceros([]);
    expect(resultado).toEqual([]);
    expect(db.query).not.toHaveBeenCalled();
  });
});

function mockRes() {
  return { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
}

describe('verificarTerceros1001 (controller)', () => {
  beforeEach(() => db.query.mockReset());

  test('rechaza si no se envió el archivo TOKEN', async () => {
    const req = { file: null };
    const res = mockRes();
    await verificarTerceros1001(req, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('devuelve el resumen completos/faltantes cruzando contra terceros', async () => {
    const buffer = await construirToken([
      { nit: '900123456', nombre: 'CON DATOS SAS' },
      { nit: '800654321', nombre: 'SIN DATOS SAS' },
    ]);
    db.query.mockResolvedValue({
      rows: [{
        nit: '900123456', direccion: 'CL 1 2 3', codigo_municipio_dane: '11001', codigo_departamento_dane: '11',
      }],
    });

    const req = { file: { buffer } };
    const res = mockRes();
    await verificarTerceros1001(req, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0];
    expect(body.totalTerceros).toBe(2);
    expect(body.completos).toBe(1);
    expect(body.faltantes).toBe(1);
  });
});
