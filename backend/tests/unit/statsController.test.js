jest.mock('../../src/config/database');

const db = require('../../src/config/database');
const { getStats, getAuditLog } = require('../../src/controllers/statsController');

function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

const mockNext = jest.fn();

const statsRow = { total: '10', completadas: '3', en_progreso: '4', pendientes: '3', vencidas: '1' };

beforeEach(() => {
  jest.clearAllMocks();
});

describe('getStats', () => {
  test('retorna estadísticas correctamente', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [statsRow] })
      .mockResolvedValueOnce({ rows: [{ priority: 'high', count: '5' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'u1', name: 'User', total: '5', completadas: '2' }] })
      .mockResolvedValueOnce({ rows: [] });

    const req = {};
    const res = mockRes();
    await getStats(req, res, mockNext);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      total: statsRow.total,
      byPriority: expect.any(Array),
      byUser: expect.any(Array),
      recentActivity: expect.any(Array),
    }));
  });

  test('llama a next en caso de error', async () => {
    db.query.mockRejectedValueOnce(new Error('DB error'));

    const req = {};
    const res = mockRes();
    await getStats(req, res, mockNext);

    expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
  });
});

describe('getAuditLog', () => {
  test('retorna el audit log paginado', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ id: '1', action: 'CREATE', table_name: 'tasks', created_at: new Date() }] })
      .mockResolvedValueOnce({ rows: [{ count: '1' }] });

    const req = { query: {} };
    const res = mockRes();
    await getAuditLog(req, res, mockNext);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      audit_log: expect.any(Array),
      total: 1,
    }));
  });

  test('filtra por userId, action y table', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ count: '0' }] });

    const req = { query: { userId: 'u1', action: 'CREATE', table: 'tasks', page: '1', limit: '10' } };
    const res = mockRes();
    await getAuditLog(req, res, mockNext);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ total: 0 }));
  });

  test('llama a next en caso de error', async () => {
    db.query.mockRejectedValueOnce(new Error('DB error'));

    const req = { query: {} };
    const res = mockRes();
    await getAuditLog(req, res, mockNext);

    expect(mockNext).toHaveBeenCalled();
  });
});
