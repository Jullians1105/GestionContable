jest.mock('../../src/config/database');
jest.mock('../../src/utils/auditLog', () => jest.fn().mockResolvedValue(undefined));

const db = require('../../src/config/database');
const auditLog = require('../../src/utils/auditLog');
const {
  getEmpresas, getEmpresa, updateEmpresa, deleteEmpresa,
} = require('../../src/controllers/contabEmpresasController');

function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.end = jest.fn().mockReturnValue(res);
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

describe('getEmpresas', () => {
  test('lista las empresas ordenadas, normalizadas', async () => {
    db.query.mockResolvedValueOnce({
      rows: [{ id: 'e1', name: 'ACME', nit: '900123456', activa: true, vigente_hasta_anio: null, vigente_hasta_mes: null }],
    });

    const req = baseReq();
    const res = mockRes();
    await getEmpresas(req, res, mockNext);

    expect(db.query.mock.calls[0][0]).toMatch(/ORDER BY name ASC/);
    expect(res.json).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'e1', name: 'ACME', nit: '900123456', vigenteHastaAnio: null, vigenteHastaMes: null }),
    ]);
  });
});

describe('getEmpresa', () => {
  test('404 si no existe', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    const res = mockRes();
    await getEmpresa(baseReq(), res, mockNext);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  test('devuelve la empresa normalizada si existe', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ id: 'empresa-1', name: 'ACME', nit: null, activa: true }] });
    const res = mockRes();
    await getEmpresa(baseReq(), res, mockNext);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ id: 'empresa-1', name: 'ACME' }));
  });
});

// nit no puede usar COALESCE como name/activa: desasignarlo (null explícito) es una edición
// válida y con COALESCE se leería como "no lo toques" — mismo patrón que responsableId en
// extEmpresasController.js. vigenteHastaAnio/Mes viajan como par con el mismo criterio.
describe('updateEmpresa — manejo de nit y vigencia (flag de presencia)', () => {
  test('empresa inexistente devuelve 404 sin escribir', async () => {
    db.query.mockResolvedValueOnce({ rows: [] }); // existing → no encontrada

    const req = baseReq({ body: { name: 'otra' } });
    const res = mockRes();
    await updateEmpresa(req, res, mockNext);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(db.query).toHaveBeenCalledTimes(1);
  });

  test('nit ausente del body no toca el nit actual', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ id: 'empresa-1' }] }) // existing
      .mockResolvedValueOnce({ rows: [{ id: 'empresa-1', nit: '900111222' }] }); // update

    const req = baseReq({ body: { name: 'otra' } });
    const res = mockRes();
    await updateEmpresa(req, res, mockNext);

    // [name, activa, nitProvided, nit, id, vigenciaProvided, vigenteHastaAnio, vigenteHastaMes]
    const params = db.query.mock.calls[1][1];
    expect(params[2]).toBe(false);
    expect(auditLog).toHaveBeenCalled();
  });

  test('nit enviado en null lo desasigna', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ id: 'empresa-1' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'empresa-1', nit: null }] });

    const req = baseReq({ body: { nit: null } });
    const res = mockRes();
    await updateEmpresa(req, res, mockNext);

    const params = db.query.mock.calls[1][1];
    expect(params[2]).toBe(true);
    expect(params[3]).toBeNull();
  });

  test('nit enviado con un valor lo asigna (recortado)', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ id: 'empresa-1' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'empresa-1', nit: '900333444' }] });

    const req = baseReq({ body: { nit: '  900333444  ' } });
    const res = mockRes();
    await updateEmpresa(req, res, mockNext);

    const params = db.query.mock.calls[1][1];
    expect(params[2]).toBe(true);
    expect(params[3]).toBe('900333444');
  });

  test('vigenteHastaAnio/Mes ausentes del body no tocan la vigencia actual', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ id: 'empresa-1' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'empresa-1' }] });

    const req = baseReq({ body: { name: 'otra' } });
    const res = mockRes();
    await updateEmpresa(req, res, mockNext);

    const params = db.query.mock.calls[1][1];
    expect(params[5]).toBe(false);
  });

  test('vigenteHastaAnio/Mes enviados como par se guardan juntos', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ id: 'empresa-1' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'empresa-1' }] });

    const req = baseReq({ body: { vigenteHastaAnio: 2026, vigenteHastaMes: 12 } });
    const res = mockRes();
    await updateEmpresa(req, res, mockNext);

    const params = db.query.mock.calls[1][1];
    expect(params[5]).toBe(true);
    expect(params[6]).toBe(2026);
    expect(params[7]).toBe(12);
  });

  test('emite contabilidad:updated tras guardar', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ id: 'empresa-1' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'empresa-1' }] });

    const req = baseReq({ body: { name: 'otra' } });
    const res = mockRes();
    await updateEmpresa(req, res, mockNext);

    expect(req.io.emit).toHaveBeenCalledWith('contabilidad:updated', { empresaId: 'empresa-1', tipo: 'empresa' });
  });
});

describe('deleteEmpresa', () => {
  test('404 si no existe', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    const res = mockRes();
    await deleteEmpresa(baseReq(), res, mockNext);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(db.query).toHaveBeenCalledTimes(1);
  });

  test('borra, audita y emite el evento — responde 204', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ id: 'empresa-1' }] }) // existing
      .mockResolvedValueOnce({ rows: [] }); // delete

    const req = baseReq();
    const res = mockRes();
    await deleteEmpresa(req, res, mockNext);

    expect(db.query.mock.calls[1][0]).toMatch(/DELETE FROM contab_empresas WHERE id = \$1/);
    expect(auditLog).toHaveBeenCalledWith('user-1', 'DELETE', 'contab_empresas', 'empresa-1', {});
    expect(req.io.emit).toHaveBeenCalledWith('contabilidad:updated', { empresaId: 'empresa-1', tipo: 'empresa' });
    expect(res.status).toHaveBeenCalledWith(204);
  });
});

describe('manejo de errores', () => {
  test('un error de base de datos llama a next(err) en vez de tumbar el request', async () => {
    const boom = new Error('conexión perdida');
    db.query.mockRejectedValueOnce(boom);

    const res = mockRes();
    await getEmpresas(baseReq(), res, mockNext);

    expect(mockNext).toHaveBeenCalledWith(boom);
  });
});
