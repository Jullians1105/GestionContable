jest.mock('../../src/config/database');
jest.mock('../../src/utils/jwt');
jest.mock('../../src/utils/logger', () => ({ info: jest.fn(), error: jest.fn() }));

const db = require('../../src/config/database');
const jwtUtils = require('../../src/utils/jwt');
const { authMiddleware, roleMiddleware, canEdit } = require('../../src/middleware/auth');
const { errorHandler, notFound } = require('../../src/middleware/errorHandler');
const { validate } = require('../../src/middleware/validation');

function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

const mockNext = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
});

describe('authMiddleware', () => {
  test('retorna 401 si no hay header Authorization', async () => {
    const req = { headers: {} };
    const res = mockRes();
    await authMiddleware(req, res, mockNext);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  test('retorna 401 si el header no empieza con Bearer', async () => {
    const req = { headers: { authorization: 'Basic abc' } };
    const res = mockRes();
    await authMiddleware(req, res, mockNext);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  test('retorna 401 si el token está en blacklist', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ 1: 1 }] });
    jwtUtils.verify.mockReturnValue({ userId: 'u1', role: 'member' });

    const req = { headers: { authorization: 'Bearer blacklisted-token' } };
    const res = mockRes();
    await authMiddleware(req, res, mockNext);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  test('llama a next con token válido no en blacklist', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    jwtUtils.verify.mockReturnValue({ userId: 'u1', email: 'test@test.com', role: 'member' });

    const req = { headers: { authorization: 'Bearer valid-token' } };
    const res = mockRes();
    await authMiddleware(req, res, mockNext);

    expect(mockNext).toHaveBeenCalledWith();
    expect(req.user).toEqual({ userId: 'u1', email: 'test@test.com', role: 'member' });
    expect(req.token).toBe('valid-token');
  });

  test('retorna 401 si el token es inválido', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    jwtUtils.verify.mockImplementation(() => { throw new Error('invalid'); });

    const req = { headers: { authorization: 'Bearer bad-token' } };
    const res = mockRes();
    await authMiddleware(req, res, mockNext);
    expect(res.status).toHaveBeenCalledWith(401);
  });
});

describe('roleMiddleware', () => {
  test('retorna 401 si no hay usuario', () => {
    const middleware = roleMiddleware('admin');
    const req = {};
    const res = mockRes();
    middleware(req, res, mockNext);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  test('retorna 403 si el rol no está permitido', () => {
    const middleware = roleMiddleware('admin');
    const req = { user: { role: 'member' } };
    const res = mockRes();
    middleware(req, res, mockNext);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  test('llama a next si el rol está permitido', () => {
    const middleware = roleMiddleware('admin', 'leader');
    const req = { user: { role: 'leader' } };
    const res = mockRes();
    middleware(req, res, mockNext);
    expect(mockNext).toHaveBeenCalledWith();
  });
});

describe('canEdit', () => {
  test('retorna 401 si no hay usuario', () => {
    const req = {};
    const res = mockRes();
    canEdit(req, res, mockNext);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  test('retorna 403 si el rol es viewer', () => {
    const req = { user: { role: 'viewer' } };
    const res = mockRes();
    canEdit(req, res, mockNext);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  test('llama a next si no es viewer', () => {
    const req = { user: { role: 'member' } };
    const res = mockRes();
    canEdit(req, res, mockNext);
    expect(mockNext).toHaveBeenCalledWith();
  });
});

describe('errorHandler', () => {
  test('maneja ValidationError con 400', () => {
    const err = { name: 'ValidationError', message: 'Invalid', details: [] };
    const req = { url: '/', method: 'GET' };
    const res = mockRes();
    errorHandler(err, req, res, mockNext);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('maneja UnauthorizedError con 401', () => {
    const err = { name: 'UnauthorizedError', message: 'Unauthorized' };
    const req = { url: '/', method: 'GET' };
    const res = mockRes();
    errorHandler(err, req, res, mockNext);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  test('maneja error de clave duplicada (23505) con 409', () => {
    const err = { code: '23505', message: 'duplicate key' };
    const req = { url: '/', method: 'GET' };
    const res = mockRes();
    errorHandler(err, req, res, mockNext);
    expect(res.status).toHaveBeenCalledWith(409);
  });

  test('maneja error de referencia inválida (23503) con 400', () => {
    const err = { code: '23503', message: 'FK violation' };
    const req = { url: '/', method: 'GET' };
    const res = mockRes();
    errorHandler(err, req, res, mockNext);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('maneja error genérico con status o 500', () => {
    const err = { message: 'Something went wrong', status: 503 };
    const req = { url: '/', method: 'GET' };
    const res = mockRes();
    errorHandler(err, req, res, mockNext);
    expect(res.status).toHaveBeenCalledWith(503);
  });

  test('usa 500 cuando no hay status en el error', () => {
    const err = { message: 'Unknown error' };
    const req = { url: '/', method: 'GET' };
    const res = mockRes();
    errorHandler(err, req, res, mockNext);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe('notFound', () => {
  test('retorna 404 con mensaje descriptivo', () => {
    const req = { method: 'GET', originalUrl: '/api/nonexistent' };
    const res = mockRes();
    notFound(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.stringContaining('GET') }));
  });
});

describe('validate middleware', () => {
  test('llama a next si no hay errores de validación', () => {
    const { validationResult } = require('express-validator');
    jest.mock('express-validator', () => ({
      validationResult: jest.fn().mockReturnValue({ isEmpty: () => true }),
    }));

    const req = {};
    const res = mockRes();
    validate(req, res, mockNext);
    expect(mockNext).toHaveBeenCalledWith();
  });
});
