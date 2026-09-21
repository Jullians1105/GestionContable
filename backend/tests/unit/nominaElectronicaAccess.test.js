const { requireNEPlazoAdmin } = require('../../src/middleware/nominaElectronicaAccess');

function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

describe('requireNEPlazoAdmin', () => {
  test('deja pasar solo a la cuenta responsable (julliansadmin), aunque sea admin de rol', () => {
    const req = { user: { userId: 'f2a82148-64d0-44a2-a0ac-37462ed43138', role: 'leader' } };
    const res = mockRes();
    const next = jest.fn();
    requireNEPlazoAdmin(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
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
