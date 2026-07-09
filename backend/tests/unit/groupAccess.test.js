jest.mock('../../src/config/database');
jest.mock('../../src/utils/logger', () => ({ info: jest.fn(), error: jest.fn(), warn: jest.fn() }));

const db = require('../../src/config/database');
const { requireGroupLeader } = require('../../src/middleware/groupAccess');

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

describe('requireGroupLeader', () => {
  test('retorna 401 si no hay usuario', async () => {
    const req = { params: { id: 'group-1' } };
    const res = mockRes();
    await requireGroupLeader(req, res, mockNext);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  test('admin pasa sin consultar la BD', async () => {
    const req = { params: { id: 'group-1' }, user: { userId: 'u1', role: 'admin' } };
    const res = mockRes();
    await requireGroupLeader(req, res, mockNext);
    expect(mockNext).toHaveBeenCalledWith();
    expect(db.query).not.toHaveBeenCalled();
  });

  test('member/viewer reciben 403 sin consultar la BD', async () => {
    const req = { params: { id: 'group-1' }, user: { userId: 'u1', role: 'member' } };
    const res = mockRes();
    await requireGroupLeader(req, res, mockNext);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(db.query).not.toHaveBeenCalled();
  });

  test('leader que SÍ lidera el grupo pasa', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ '?column?': 1 }] });
    const req = { params: { id: 'group-1' }, user: { userId: 'u1', role: 'leader' } };
    const res = mockRes();
    await requireGroupLeader(req, res, mockNext);
    expect(mockNext).toHaveBeenCalledWith();
  });

  test('leader que NO lidera el grupo recibe 403', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    const req = { params: { id: 'group-1' }, user: { userId: 'u1', role: 'leader' } };
    const res = mockRes();
    await requireGroupLeader(req, res, mockNext);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  test('llama a next en caso de error de BD', async () => {
    db.query.mockRejectedValueOnce(new Error('DB error'));
    const req = { params: { id: 'group-1' }, user: { userId: 'u1', role: 'leader' } };
    const res = mockRes();
    await requireGroupLeader(req, res, mockNext);
    expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
  });
});
