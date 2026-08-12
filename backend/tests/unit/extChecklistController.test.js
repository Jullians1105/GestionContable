jest.mock('../../src/config/database');
jest.mock('uuid', () => ({ v4: () => 'mock-uuid' }));

const db = require('../../src/config/database');
const { updateChecklistItem } = require('../../src/controllers/extChecklistController');
const { getMesVencidoHabilitado } = require('../../src/utils/mesVencido');

function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

const mockNext = jest.fn();

// El mes habilitado es siempre "mes vencido" — se calcula en cada test en vez
// de hardcodear una fecha para que la suite no falle sola al pasar el mes.
const { anio: mesHabilitadoAnio, mes: mesHabilitadoMes } = getMesVencidoHabilitado();

function baseReq(overrides = {}) {
  return {
    params: { empresaId: 'empresa-1', procesoId: 'proceso-1' },
    query: { anio: String(mesHabilitadoAnio), mes: String(mesHabilitadoMes) },
    body: {},
    user: { userId: 'user-1' },
    io: { emit: jest.fn() },
    ...overrides,
  };
}

// Encola las tres queries que corren antes del upsert: crear el mes si no
// existe, seleccionar su id, y el upsert propiamente dicho. La 4ta (audit_log)
// queda a cargo de cada test.
function queueUpsert(resultRow) {
  db.query
    .mockResolvedValueOnce({ rows: [] })                 // INSERT ... DO NOTHING
    .mockResolvedValueOnce({ rows: [{ id: 'mes-1' }] })   // SELECT mes id
    .mockResolvedValueOnce({ rows: [resultRow] })         // INSERT ... DO UPDATE ... RETURNING *
    .mockResolvedValueOnce({ rows: [] });                 // audit_log insert
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('updateChecklistItem — manejo de nota', () => {
  test('estado-only: no envía nota en el body y no pisa la nota existente (notaProvided=false)', async () => {
    queueUpsert({ id: 'item-1', mes_id: 'mes-1', proceso_id: 'proceso-1', estado: 'done', nota: 'nota vieja', updated_at: new Date() });

    const req = baseReq({ body: { estado: 'done' } });
    const res = mockRes();
    await updateChecklistItem(req, res, mockNext);

    const upsertCall = db.query.mock.calls[2];
    const params = upsertCall[1];
    // [id, mesId, procesoId, estado, notaToSave, notaProvided]
    expect(params[4]).toBeNull();
    expect(params[5]).toBe(false);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ nota: 'nota vieja' }));
  });

  test('nota de solo espacios se guarda como NULL, no como el string en blanco', async () => {
    queueUpsert({ id: 'item-1', mes_id: 'mes-1', proceso_id: 'proceso-1', estado: 'pending', nota: null, updated_at: new Date() });

    const req = baseReq({ body: { nota: '   ' } });
    const res = mockRes();
    await updateChecklistItem(req, res, mockNext);

    const params = db.query.mock.calls[2][1];
    expect(params[4]).toBeNull();
    expect(params[5]).toBe(true);
  });

  test('nota vacía explícita (borrar) persiste NULL y sí pisa la nota anterior', async () => {
    queueUpsert({ id: 'item-1', mes_id: 'mes-1', proceso_id: 'proceso-1', estado: 'pending', nota: null, updated_at: new Date() });

    const req = baseReq({ body: { nota: null } });
    const res = mockRes();
    await updateChecklistItem(req, res, mockNext);

    const params = db.query.mock.calls[2][1];
    expect(params[4]).toBeNull();
    expect(params[5]).toBe(true);
  });

  test('nota con espacios al borde se guarda recortada (trim)', async () => {
    queueUpsert({ id: 'item-1', mes_id: 'mes-1', proceso_id: 'proceso-1', estado: 'pending', nota: 'reunión con el contador', updated_at: new Date() });

    const req = baseReq({ body: { nota: '  reunión con el contador  ' } });
    const res = mockRes();
    await updateChecklistItem(req, res, mockNext);

    const params = db.query.mock.calls[2][1];
    expect(params[4]).toBe('reunión con el contador');
    expect(params[5]).toBe(true);
  });
});

describe('updateChecklistItem — mes vencido', () => {
  test('rechaza con 403 un mes posterior al mes habilitado, sin tocar la base de datos', async () => {
    const mesFuturo = mesHabilitadoMes === 12 ? 1 : mesHabilitadoMes + 1;
    const anioFuturo = mesHabilitadoMes === 12 ? mesHabilitadoAnio + 1 : mesHabilitadoAnio;

    const req = baseReq({ query: { anio: String(anioFuturo), mes: String(mesFuturo) }, body: { estado: 'done' } });
    const res = mockRes();
    await updateChecklistItem(req, res, mockNext);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(db.query).not.toHaveBeenCalled();
  });
});
