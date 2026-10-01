const { requireNEPlazoAdmin } = require('../../src/middleware/nominaElectronicaAccess');

function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

describe('requireNEPlazoAdmin', () => {
  test('deja pasar a las cuentas responsables (julliansadmin y diegonova), aunque no sean admin de rol', () => {
    const req = { user: { userId: 'f2a82148-64d0-44a2-a0ac-37462ed43138', role: 'leader' } };
    const res = mockRes();
    const next = jest.fn();
    requireNEPlazoAdmin(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  test('deja pasar también a la segunda cuenta responsable (diegonova)', () => {
    const req = { user: { userId: '5e0ee191-e15b-482f-a7ff-463f8dcfea38', role: 'member' } };
    const res = mockRes();
    const next = jest.fn();
    requireNEPlazoAdmin(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  test('rechaza a cualquier otro usuario, incluido un admin de rol', () => {
    const req = { user: { userId: 'otro-usuario', role: 'admin' } };
    const res = mockRes();
    const next = jest.fn();
    requireNEPlazoAdmin(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });

  test('401 sin usuario autenticado', () => {
    const req = {};
    const res = mockRes();
    const next = jest.fn();
    requireNEPlazoAdmin(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });
});
