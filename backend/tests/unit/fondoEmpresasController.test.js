jest.mock('../../src/config/database');
jest.mock('uuid', () => ({ v4: () => 'mock-uuid' }));

const db = require('../../src/config/database');
const { createEmpresa, updateEmpresa } = require('../../src/controllers/fondoEmpresasController');

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

// El código Siigo es dato maestro de la empresa: lo mantiene solo el admin,
// aunque el resto de campos los pueda editar quien tenga fondoEmprender.canEditar
// (la ruta es la misma para ambos casos, por eso el chequeo va en el controller).
describe('codigo Siigo — solo el admin lo edita', () => {
  test('un no-admin que manda codigoSiigo recibe 403 y no escribe nada', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ id: 'empresa-1' }] }); // existing

    const req = baseReq({
      body: { codigoSiigo: '0042' },
      user: { userId: 'user-2', role: 'user' },
    });
    const res = mockRes();
    await updateEmpresa(req, res, mockNext);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(db.query).toHaveBeenCalledTimes(1); // solo el SELECT de existencia
  });

  test('un no-admin sí puede editar los demás campos', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ id: 'empresa-1' }] }) // existing
      .mockResolvedValueOnce({ rows: [{ id: 'empresa-1', name: 'NUEVA' }] }) // update
      .mockResolvedValueOnce({ rows: [] }); // audit

    const req = baseReq({
      body: { name: 'nueva' },
      user: { userId: 'user-2', role: 'user' },
    });
    const res = mockRes();
    await updateEmpresa(req, res, mockNext);

    expect(res.status).not.toHaveBeenCalledWith(403);
    // [name, categoria, monthlyFee, codigoSiigoProvided, codigoSiigo, id]
    expect(db.query.mock.calls[1][1][3]).toBe(false);
  });

  test('createEmpresa también bloquea codigoSiigo a un no-admin', async () => {
    const req = baseReq({
      body: { name: 'nueva', codigoSiigo: '0042' },
      user: { userId: 'user-2', role: 'user' },
    });
    const res = mockRes();
    await createEmpresa(req, res, mockNext);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(db.query).not.toHaveBeenCalled();
  });
});

// codigo_siigo no puede usar COALESCE como el resto de campos: dejar la celda
// vacía es una edición válida y con COALESCE un NULL explícito se leería como
// "no lo toques" — mismo patrón que grupoId en fondoProcesosController.
describe('updateEmpresa — manejo de codigoSiigo', () => {
  test('ausente del body no toca el código actual', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ id: 'empresa-1', codigo_siigo: '0042' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'empresa-1', codigo_siigo: '0042' }] })
      .mockResolvedValueOnce({ rows: [] });

    const req = baseReq({ body: { name: 'otra' } });
    const res = mockRes();
    await updateEmpresa(req, res, mockNext);

    expect(db.query.mock.calls[1][1][3]).toBe(false);
  });

  test('enviado en null borra el código', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ id: 'empresa-1', codigo_siigo: '0042' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'empresa-1', codigo_siigo: null }] })
      .mockResolvedValueOnce({ rows: [] });

    const req = baseReq({ body: { codigoSiigo: null } });
    const res = mockRes();
    await updateEmpresa(req, res, mockNext);

    const params = db.query.mock.calls[1][1];
    expect(params[3]).toBe(true);
    expect(params[4]).toBeNull();
  });

  test('string vacío se guarda como NULL, no como cadena vacía', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ id: 'empresa-1', codigo_siigo: '0042' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'empresa-1', codigo_siigo: null }] })
      .mockResolvedValueOnce({ rows: [] });

    const req = baseReq({ body: { codigoSiigo: '   ' } });
    const res = mockRes();
    await updateEmpresa(req, res, mockNext);

    const params = db.query.mock.calls[1][1];
    expect(params[3]).toBe(true);
    expect(params[4]).toBeNull();
  });

  test('se normaliza a mayúsculas sin espacios sobrantes', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ id: 'empresa-1', codigo_siigo: null }] })
      .mockResolvedValueOnce({ rows: [{ id: 'empresa-1', codigo_siigo: 'A-42' }] })
      .mockResolvedValueOnce({ rows: [] });

    const req = baseReq({ body: { codigoSiigo: ' a-42 ' } });
    const res = mockRes();
    await updateEmpresa(req, res, mockNext);

    expect(db.query.mock.calls[1][1][4]).toBe('A-42');
  });
});
