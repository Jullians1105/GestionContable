jest.mock('../../src/config/database');
jest.mock('uuid', () => ({ v4: () => 'mock-uuid' }));

const db = require('../../src/config/database');
const { updateChecklistItem } = require('../../src/controllers/fondoChecklistController');

function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

const mockNext = jest.fn();

function baseReq(overrides = {}) {
  return {
    params: { empresaId: 'empresa-1', procesoId: 'proceso-1' },
    query: { anio: '2026', mes: '7' },
    body: {},
    user: { userId: 'user-1' },
    io: { emit: jest.fn() },
    ...overrides,
  };
}

// Queues the three db.query calls that happen before the upsert result is
// asserted: create-month-if-missing, select-month-id, then the upsert itself.
// The 4th call (audit_log insert) is left for the caller to append.
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

    const upsertCall = db.query.mock.calls[2];
    const params = upsertCall[1];
    expect(params[4]).toBeNull();
    expect(params[5]).toBe(true);
  });

  test('nota vacía explícita (borrar) persiste NULL y sí pisa la nota anterior', async () => {
    queueUpsert({ id: 'item-1', mes_id: 'mes-1', proceso_id: 'proceso-1', estado: 'pending', nota: null, updated_at: new Date() });

    const req = baseReq({ body: { nota: null } });
    const res = mockRes();
    await updateChecklistItem(req, res, mockNext);

    const upsertCall = db.query.mock.calls[2];
    const params = upsertCall[1];
    expect(params[4]).toBeNull();
    expect(params[5]).toBe(true);
  });

  test('nota con espacios al borde se guarda recortada (trim)', async () => {
    queueUpsert({ id: 'item-1', mes_id: 'mes-1', proceso_id: 'proceso-1', estado: 'pending', nota: 'reunión con el contador', updated_at: new Date() });

    const req = baseReq({ body: { nota: '  reunión con el contador  ' } });
    const res = mockRes();
    await updateChecklistItem(req, res, mockNext);

    const upsertCall = db.query.mock.calls[2];
    const params = upsertCall[1];
    expect(params[4]).toBe('reunión con el contador');
    expect(params[5]).toBe(true);
  });
});
