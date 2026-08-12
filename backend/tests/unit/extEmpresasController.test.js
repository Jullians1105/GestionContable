jest.mock('../../src/config/database');
jest.mock('uuid', () => ({ v4: () => 'mock-uuid' }));

const db = require('../../src/config/database');
const { createEmpresa, updateEmpresa } = require('../../src/controllers/extEmpresasController');

function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

const mockNext = jest.fn();

function baseReq(overrides = {}) {
  return {
    params: { id: 'empresa-1' },
    body: {},
    user: { userId: 'user-1', role: 'admin' },
    io: { emit: jest.fn() },
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

// responsableId no puede usar COALESCE como name/activa: desasignar el
// responsable (null explícito) es una edición válida y con COALESCE se
// leería como "no lo toques" — mismo patrón que codigoSiigo en
// fondoEmpresasController y grupoId en fondoProcesosController.
describe('updateEmpresa — manejo de responsableId', () => {
  test('ausente del body no toca el responsable actual', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ id: 'empresa-1' }] }) // existing
      .mockResolvedValueOnce({ rows: [{ id: 'empresa-1', responsable_id: 'user-9' }] }) // update
      .mockResolvedValueOnce({ rows: [] }); // audit

    const req = baseReq({ body: { name: 'otra' } });
    const res = mockRes();
    await updateEmpresa(req, res, mockNext);

    // [name, activa, responsableIdProvided, responsableId, id]
    const params = db.query.mock.calls[1][1];
    expect(params[2]).toBe(false);
  });

  test('enviado en null desasigna el responsable', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ id: 'empresa-1' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'empresa-1', responsable_id: null }] })
      .mockResolvedValueOnce({ rows: [] });

    const req = baseReq({ body: { responsableId: null } });
    const res = mockRes();
    await updateEmpresa(req, res, mockNext);

    const params = db.query.mock.calls[1][1];
    expect(params[2]).toBe(true);
    expect(params[3]).toBeNull();
  });

  test('enviado con un UUID asigna ese responsable', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ id: 'empresa-1' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'empresa-1', responsable_id: 'user-9' }] })
      .mockResolvedValueOnce({ rows: [] });

    const req = baseReq({ body: { responsableId: 'user-9' } });
    const res = mockRes();
    await updateEmpresa(req, res, mockNext);

    const params = db.query.mock.calls[1][1];
    expect(params[2]).toBe(true);
    expect(params[3]).toBe('user-9');
  });

  test('empresa inexistente devuelve 404 sin escribir', async () => {
    db.query.mockResolvedValueOnce({ rows: [] }); // existing → no encontrada

    const req = baseReq({ body: { name: 'otra' } });
    const res = mockRes();
    await updateEmpresa(req, res, mockNext);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(db.query).toHaveBeenCalledTimes(1);
  });
});

describe('createEmpresa', () => {
  test('normaliza el nombre a mayúsculas sin espacios sobrantes', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ id: 'empresa-1', name: 'NUEVA EMPRESA' }] }) // insert
      .mockResolvedValueOnce({ rows: [] }); // audit

    const req = baseReq({ body: { name: '  nueva empresa  ' } });
    const res = mockRes();
    await createEmpresa(req, res, mockNext);

    const params = db.query.mock.calls[0][1];
    // [id, name, responsableId]
    expect(params[1]).toBe('NUEVA EMPRESA');
    expect(res.status).toHaveBeenCalledWith(201);
  });

  test('sin responsableId en el body, se crea sin asignar (null)', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ id: 'empresa-1', name: 'NUEVA' }] })
      .mockResolvedValueOnce({ rows: [] });

    const req = baseReq({ body: { name: 'nueva' } });
    const res = mockRes();
    await createEmpresa(req, res, mockNext);

    const params = db.query.mock.calls[0][1];
    expect(params[2]).toBeNull();
  });
});
