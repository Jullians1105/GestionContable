jest.mock('../../src/config/database');
jest.mock('uuid', () => ({ v4: () => 'mock-uuid' }));

const db = require('../../src/config/database');
const {
  getGrupos,
  createGrupo,
  updateGrupo,
  deleteGrupo,
} = require('../../src/controllers/fondoProcesoGruposController');

function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.send = jest.fn().mockReturnValue(res);
  return res;
}

const mockNext = jest.fn();

function baseReq(overrides = {}) {
  return {
    params: {},
    body: {},
    user: { userId: 'user-1' },
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('getGrupos', () => {
  test('devuelve los grupos ordenados por orden, camelCase', async () => {
    db.query.mockResolvedValueOnce({
      rows: [{ id: 'g1', name: 'Nómina', orden: 0, created_at: 't1', updated_at: 't1' }],
    });
    const req = baseReq();
    const res = mockRes();
    await getGrupos(req, res, mockNext);

    expect(res.json).toHaveBeenCalledWith([
      { id: 'g1', name: 'Nómina', orden: 0, createdAt: 't1', updatedAt: 't1' },
    ]);
  });
});

describe('createGrupo', () => {
  test('calcula orden automáticamente si no se envía', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ next_orden: 3 }] })
      .mockResolvedValueOnce({ rows: [{ id: 'mock-uuid', name: 'Impuestos', orden: 3 }] })
      .mockResolvedValueOnce({ rows: [] }); // audit log

    const req = baseReq({ body: { name: 'Impuestos' } });
    const res = mockRes();
    await createGrupo(req, res, mockNext);

    expect(db.query).toHaveBeenNthCalledWith(2,
      expect.stringContaining('INSERT INTO fondo_proceso_grupos'),
      ['mock-uuid', 'Impuestos', 3]
    );
    expect(res.status).toHaveBeenCalledWith(201);
  });

  test('usa el orden explícito si se envía', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ id: 'mock-uuid', name: 'Nómina', orden: 5 }] })
      .mockResolvedValueOnce({ rows: [] });

    const req = baseReq({ body: { name: 'Nómina', orden: 5 } });
    const res = mockRes();
    await createGrupo(req, res, mockNext);

    expect(db.query).toHaveBeenNthCalledWith(1,
      expect.stringContaining('INSERT INTO fondo_proceso_grupos'),
      ['mock-uuid', 'Nómina', 5]
    );
  });
});

describe('updateGrupo', () => {
  test('404 si el grupo no existe', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    const req = baseReq({ params: { id: 'missing' }, body: { name: 'x' } });
    const res = mockRes();
    await updateGrupo(req, res, mockNext);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  test('renombra sin tocar el orden existente', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ id: 'g1', name: 'Nómina', orden: 0 }] }) // existing
      .mockResolvedValueOnce({ rows: [{ id: 'g1', name: 'Nómina y pagos', orden: 0 }] }) // update
      .mockResolvedValueOnce({ rows: [] }); // audit

    const req = baseReq({ params: { id: 'g1' }, body: { name: 'Nómina y pagos' } });
    const res = mockRes();
    await updateGrupo(req, res, mockNext);

    expect(db.query).toHaveBeenNthCalledWith(2,
      expect.stringContaining('UPDATE fondo_proceso_grupos'),
      ['Nómina y pagos', null, 'g1']
    );
  });
});

describe('deleteGrupo', () => {
  test('404 si el grupo no existe', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    const req = baseReq({ params: { id: 'missing' } });
    const res = mockRes();
    await deleteGrupo(req, res, mockNext);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  test('borra el grupo — los procesos quedan sin grupo vía ON DELETE SET NULL, no se tocan acá', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ id: 'g1' }] })
      .mockResolvedValueOnce({ rows: [] }); // audit

    const req = baseReq({ params: { id: 'g1' } });
    const res = mockRes();
    await deleteGrupo(req, res, mockNext);

    expect(db.query).toHaveBeenNthCalledWith(1,
      'DELETE FROM fondo_proceso_grupos WHERE id = $1 RETURNING id',
      ['g1']
    );
    expect(res.status).toHaveBeenCalledWith(204);
  });
});
