jest.mock('../../src/config/database');
jest.mock('bcrypt');
jest.mock('uuid', () => ({ v4: () => 'mock-uuid' }));
jest.mock('../../src/utils/jwt');
jest.mock('../../src/utils/logger', () => ({ info: jest.fn(), error: jest.fn(), warn: jest.fn() }));
jest.mock('../../src/config/env', () => ({
  JWT_SECRET: 'test-secret',
  JWT_EXPIRES_IN: '1h',
  JWT_REFRESH_SECRET: 'test-refresh-secret',
  JWT_REFRESH_EXPIRES_IN: '7d',
  SHOW_RESET_TOKEN: false,
}));

const bcrypt = require('bcrypt');
const db = require('../../src/config/database');
const jwtUtils = require('../../src/utils/jwt');
const { login, refresh, logout, me, updateMe } = require('../../src/controllers/authController');

function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

const mockNext = jest.fn();

const baseUser = {
  id: 'mock-uuid',
  email: 'test@test.com',
  name: 'Test User',
  role: 'member',
  password_hash: 'hashed',
  is_active: true,
  permissions: null,
  created_at: new Date(),
};

beforeEach(() => {
  jest.clearAllMocks();
  jwtUtils.sign.mockReturnValue('mock-token');
  jwtUtils.signRefresh.mockReturnValue('mock-refresh-token');
  jwtUtils.verify.mockReturnValue({ userId: 'mock-uuid', email: 'test@test.com', role: 'member' });
  jwtUtils.verifyRefresh.mockReturnValue({ userId: 'mock-uuid' });
});

describe('login', () => {
  // login ahora llama isLockedOut() primero → 1 query COUNT por email (ip es undefined en tests)
  // luego SELECT user, luego recordLoginAttempt (non-fatal, puede recibir undefined) y refresh_tokens insert

  test('retorna 200 con token para credenciales válidas', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ count: '0' }] }) // isLockedOut: intentos fallidos por email
      .mockResolvedValueOnce({ rows: [baseUser] });       // SELECT user
    bcrypt.compare.mockResolvedValue(true);

    const req = { body: { email: 'test@test.com', password: 'password123' } };
    const res = mockRes();
    await login(req, res, mockNext);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ token: 'mock-token' }));
  });

  test('retorna 401 si el usuario no existe', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ count: '0' }] }) // isLockedOut: no bloqueado
      .mockResolvedValueOnce({ rows: [] });               // SELECT user → vacío

    const req = { body: { email: 'noexiste@test.com', password: 'password123' } };
    const res = mockRes();
    await login(req, res, mockNext);

    expect(res.status).toHaveBeenCalledWith(401);
  });

  test('retorna 401 si la contraseña es incorrecta', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ count: '0' }] }) // isLockedOut: no bloqueado
      .mockResolvedValueOnce({ rows: [baseUser] });       // SELECT user
    bcrypt.compare.mockResolvedValue(false);

    const req = { body: { email: 'test@test.com', password: 'wrong' } };
    const res = mockRes();
    await login(req, res, mockNext);

    expect(res.status).toHaveBeenCalledWith(401);
  });

  test('retorna 429 si la cuenta está bloqueada por demasiados intentos', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ count: '5' }] }); // isLockedOut: bloqueado

    const req = { body: { email: 'test@test.com', password: 'password123' } };
    const res = mockRes();
    await login(req, res, mockNext);

    expect(res.status).toHaveBeenCalledWith(429);
  });

  test('llama a next en caso de error', async () => {
    db.query.mockRejectedValueOnce(new Error('DB error'));

    const req = { body: { email: 'test@test.com', password: 'password123' } };
    const res = mockRes();
    await login(req, res, mockNext);

    expect(mockNext).toHaveBeenCalled();
  });
});

describe('refresh', () => {
  test('retorna nuevo token con refresh token válido', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ user_id: 'mock-uuid' }] })
      .mockResolvedValueOnce({ rows: [baseUser] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const req = { body: { refreshToken: 'valid-refresh-token' } };
    const res = mockRes();
    await refresh(req, res, mockNext);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ token: 'mock-token' }));
  });

  test('retorna 400 si no se proporciona refreshToken', async () => {
    const req = { body: {} };
    const res = mockRes();
    await refresh(req, res, mockNext);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('retorna 401 si el refresh token no está en BD', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });

    const req = { body: { refreshToken: 'invalid-token' } };
    const res = mockRes();
    await refresh(req, res, mockNext);

    expect(res.status).toHaveBeenCalledWith(401);
  });

  test('retorna 401 si el usuario no existe tras el refresh token', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ user_id: 'mock-uuid' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const req = { body: { refreshToken: 'valid-refresh-token' } };
    const res = mockRes();
    await refresh(req, res, mockNext);

    expect(res.status).toHaveBeenCalledWith(401);
  });
});

describe('logout', () => {
  test('invalida el token y retorna success', async () => {
    db.query.mockResolvedValue({ rows: [] });

    const req = { body: {}, user: { userId: 'mock-uuid' }, token: 'mock-token' };
    const res = mockRes();
    await logout(req, res, mockNext);

    expect(res.json).toHaveBeenCalledWith({ success: true });
  });

  test('revoca el refreshToken si se provee', async () => {
    db.query.mockResolvedValue({ rows: [] });

    const req = { body: { refreshToken: 'old-refresh' }, user: { userId: 'mock-uuid' }, token: 'mock-token' };
    const res = mockRes();
    await logout(req, res, mockNext);

    expect(db.query).toHaveBeenCalledTimes(2);
  });

  test('llama a next en caso de error', async () => {
    db.query.mockRejectedValueOnce(new Error('DB error'));

    const req = { body: {}, user: { userId: 'mock-uuid' }, token: 'mock-token' };
    const res = mockRes();
    await logout(req, res, mockNext);

    expect(mockNext).toHaveBeenCalled();
  });
});

describe('me', () => {
  test('retorna el usuario autenticado', async () => {
    db.query.mockResolvedValueOnce({ rows: [baseUser] });

    const req = { user: { userId: 'mock-uuid' } };
    const res = mockRes();
    await me(req, res, mockNext);

    expect(res.json).toHaveBeenCalledWith({ user: baseUser });
  });

  test('retorna 404 si el usuario no existe', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });

    const req = { user: { userId: 'nonexistent' } };
    const res = mockRes();
    await me(req, res, mockNext);

    expect(res.status).toHaveBeenCalledWith(404);
  });
});

describe('updateMe', () => {
  test('actualiza nombre correctamente', async () => {
    const updatedUser = { ...baseUser, name: 'New Name' };
    db.query
      .mockResolvedValueOnce({ rows: [baseUser] })
      .mockResolvedValueOnce({ rows: [updatedUser] });

    const req = { body: { name: 'New Name' }, user: { userId: 'mock-uuid' } };
    const res = mockRes();
    await updateMe(req, res, mockNext);

    expect(res.json).toHaveBeenCalledWith({ user: updatedUser });
  });

  test('retorna 404 si el usuario no existe', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });

    const req = { body: { name: 'New Name' }, user: { userId: 'bad-id' } };
    const res = mockRes();
    await updateMe(req, res, mockNext);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  test('retorna 409 si el nuevo email ya existe', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [baseUser] })
      .mockResolvedValueOnce({ rows: [{ id: 'other-id' }] });

    const req = { body: { email: 'taken@test.com' }, user: { userId: 'mock-uuid' } };
    const res = mockRes();
    await updateMe(req, res, mockNext);

    expect(res.status).toHaveBeenCalledWith(409);
  });

  test('retorna 400 si newPassword se envía sin currentPassword', async () => {
    db.query.mockResolvedValueOnce({ rows: [baseUser] });

    const req = { body: { newPassword: 'newpass123' }, user: { userId: 'mock-uuid' } };
    const res = mockRes();
    await updateMe(req, res, mockNext);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('retorna 401 si currentPassword es incorrecta', async () => {
    db.query.mockResolvedValueOnce({ rows: [baseUser] });
    bcrypt.compare.mockResolvedValue(false);

    const req = { body: { currentPassword: 'wrong', newPassword: 'newpass123' }, user: { userId: 'mock-uuid' } };
    const res = mockRes();
    await updateMe(req, res, mockNext);

    expect(res.status).toHaveBeenCalledWith(401);
  });

  test('actualiza contraseña correctamente', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [baseUser] })
      .mockResolvedValueOnce({ rows: [baseUser] });
    bcrypt.compare.mockResolvedValue(true);
    bcrypt.hash.mockResolvedValue('new-hashed');

    const req = { body: { currentPassword: 'correct', newPassword: 'newpass123' }, user: { userId: 'mock-uuid' } };
    const res = mockRes();
    await updateMe(req, res, mockNext);

    expect(res.json).toHaveBeenCalledWith({ user: baseUser });
  });
});
