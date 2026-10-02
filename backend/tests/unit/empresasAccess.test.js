jest.mock('../../src/config/database');
jest.mock('../../src/utils/logger', () => ({ warn: jest.fn(), info: jest.fn(), error: jest.fn(), debug: jest.fn() }));

const db = require('../../src/config/database');
const { requireEmpresasMatricula } = require('../../src/middleware/empresasAccess');

const mockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};
const req = (role, userId = 'u1') => ({ user: { userId, role }, path: '/verificar-matricula', method: 'POST' });

beforeEach(() => {
  db.query.mockReset();
});

describe('requireEmpresasMatricula', () => {
  test('sin sesión responde 401', async () => {
    const res = mockRes();
    const next = jest.fn();
    await requireEmpresasMatricula({}, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  test('el administrador siempre puede, sin consultar la base de datos', async () => {
    const next = jest.fn();
    await requireEmpresasMatricula(req('admin'), mockRes(), next);
    expect(next).toHaveBeenCalledWith();
    expect(db.query).not.toHaveBeenCalled();
  });

  test('un viewer no puede aunque tuviera el permiso guardado', async () => {
    const res = mockRes();
    const next = jest.fn();
    await requireEmpresasMatricula(req('viewer'), res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
    expect(db.query).not.toHaveBeenCalled();
  });

  test('un líder o miembro con el permiso activado puede', async () => {
    for (const role of ['leader', 'member']) {
      db.query.mockResolvedValueOnce({ rows: [{ permissions: { modulos: { empresas: { canActualizarMatricula: true } } } }] });
      const next = jest.fn();
      await requireEmpresasMatricula(req(role), mockRes(), next);
      expect(next).toHaveBeenCalledWith();
    }
  });

  test('sin el permiso (o con otro módulo activado) responde 403', async () => {
    for (const permissions of [null, {}, { modulos: {} }, { modulos: { empresas: {} } },
      { modulos: { empresas: { canActualizarMatricula: false } } },
      { modulos: { fondoEmprender: { canEditar: true } } },
      { modulos: { empresas: { canActualizarMatricula: 'true' } } }]) { // solo el booleano true cuenta
      db.query.mockResolvedValueOnce({ rows: [{ permissions }] });
      const res = mockRes();
      const next = jest.fn();
      await requireEmpresasMatricula(req('leader'), res, next);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(next).not.toHaveBeenCalled();
    }
  });

  test('un usuario que ya no existe en la base responde 403', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    const res = mockRes();
    await requireEmpresasMatricula(req('member'), res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(403);
  });

  test('un error de base de datos pasa al manejador global', async () => {
    const boom = new Error('boom');
    db.query.mockRejectedValueOnce(boom);
    const next = jest.fn();
    await requireEmpresasMatricula(req('member'), mockRes(), next);
    expect(next).toHaveBeenCalledWith(boom);
  });
});
