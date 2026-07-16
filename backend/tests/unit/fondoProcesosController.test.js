jest.mock('../../src/config/database');
jest.mock('uuid', () => ({ v4: () => 'mock-uuid' }));

const db = require('../../src/config/database');
const { updateProceso } = require('../../src/controllers/fondoProcesosController');

function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

const mockNext = jest.fn();

function baseReq(overrides = {}) {
  return {
    params: { id: 'proceso-1' },
    body: {},
    user: { userId: 'user-1' },
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

// grupoId necesita distinguir "no vino en el body" (no tocar el grupo actual)
// de "vino explícitamente en null" (sacar el proceso de su grupo) — mismo
// patrón que las notas de fondoChecklistController.
describe('updateProceso — manejo de grupoId', () => {
  test('grupoId ausente del body no toca el grupo actual', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ id: 'proceso-1', grupo_id: 'grupo-viejo' }] }) // existing
      .mockResolvedValueOnce({ rows: [{ id: 'proceso-1', grupo_id: 'grupo-viejo' }] }) // update
      .mockResolvedValueOnce({ rows: [] }); // audit

    const req = baseReq({ body: { name: 'Renombrado' } });
    const res = mockRes();
    await updateProceso(req, res, mockNext);

    const updateCall = db.query.mock.calls[1];
    const params = updateCall[1];
    // [name, orden, activo, grupoIdProvided, grupoId, id]
    expect(params[3]).toBe(false);
  });

  test('grupoId enviado en null saca el proceso de su grupo', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ id: 'proceso-1', grupo_id: 'grupo-viejo' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'proceso-1', grupo_id: null }] })
      .mockResolvedValueOnce({ rows: [] });

    const req = baseReq({ body: { grupoId: null } });
    const res = mockRes();
    await updateProceso(req, res, mockNext);

    const params = db.query.mock.calls[1][1];
    expect(params[3]).toBe(true);
    expect(params[4]).toBeNull();
  });

  test('grupoId enviado con un id mueve el proceso a ese grupo', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ id: 'proceso-1', grupo_id: null }] })
      .mockResolvedValueOnce({ rows: [{ id: 'proceso-1', grupo_id: 'grupo-nuevo' }] })
      .mockResolvedValueOnce({ rows: [] });

    const req = baseReq({ body: { grupoId: 'grupo-nuevo' } });
    const res = mockRes();
    await updateProceso(req, res, mockNext);

    const params = db.query.mock.calls[1][1];
    expect(params[3]).toBe(true);
    expect(params[4]).toBe('grupo-nuevo');
  });

  test('404 si el proceso no existe', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    const req = baseReq({ body: { grupoId: 'grupo-nuevo' } });
    const res = mockRes();
    await updateProceso(req, res, mockNext);
    expect(res.status).toHaveBeenCalledWith(404);
  });
});
