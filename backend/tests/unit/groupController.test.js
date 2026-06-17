jest.mock('../../src/config/database');
jest.mock('uuid', () => ({ v4: () => 'mock-uuid' }));

const db = require('../../src/config/database');
const { getGroups, createGroup, updateGroup, deleteGroup, addMember, removeMember } = require('../../src/controllers/groupController');

function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

const mockNext = jest.fn();

const baseGroup = {
  id: 'mock-uuid',
  name: 'Test Group',
  description: 'A test group',
  leader_id: 'user-1',
  color: '#004ac6',
  created_at: new Date(),
  updated_at: new Date(),
  members: [],
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('getGroups', () => {
  test('retorna lista de grupos', async () => {
    db.query.mockResolvedValueOnce({ rows: [baseGroup] });

    const req = {};
    const res = mockRes();
    await getGroups(req, res, mockNext);

    expect(res.json).toHaveBeenCalledWith([baseGroup]);
  });

  test('llama a next en caso de error', async () => {
    db.query.mockRejectedValueOnce(new Error('DB error'));

    const req = {};
    const res = mockRes();
    await getGroups(req, res, mockNext);

    expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
  });
});

describe('createGroup', () => {
  test('crea un grupo y retorna 201', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [baseGroup] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const req = {
      body: { name: 'Test Group', description: 'A test group', memberIds: ['user-2'] },
      user: { userId: 'user-1' },
      io: null,
    };
    const res = mockRes();
    await createGroup(req, res, mockNext);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(baseGroup);
  });

  test('crea un grupo sin miembros adicionales', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [baseGroup] })
      .mockResolvedValueOnce({ rows: [] });

    const req = {
      body: { name: 'Test Group' },
      user: { userId: 'user-1' },
      io: null,
    };
    const res = mockRes();
    await createGroup(req, res, mockNext);

    expect(res.status).toHaveBeenCalledWith(201);
  });

  test('llama a next en caso de error', async () => {
    db.query.mockRejectedValueOnce(new Error('DB error'));

    const req = {
      body: { name: 'Test Group' },
      user: { userId: 'user-1' },
      io: null,
    };
    const res = mockRes();
    await createGroup(req, res, mockNext);

    expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
  });
});

describe('updateGroup', () => {
  test('actualiza un grupo existente', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ ...baseGroup, name: 'Updated' }] });

    const req = {
      params: { id: 'mock-uuid' },
      body: { name: 'Updated' },
      io: null,
    };
    const res = mockRes();
    await updateGroup(req, res, mockNext);

    expect(res.json).toHaveBeenCalled();
  });

  test('retorna 404 si el grupo no existe', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });

    const req = { params: { id: 'bad-id' }, body: { name: 'Updated' }, io: null };
    const res = mockRes();
    await updateGroup(req, res, mockNext);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  test('llama a next en caso de error', async () => {
    db.query.mockRejectedValueOnce(new Error('DB error'));

    const req = { params: { id: 'mock-uuid' }, body: {}, io: null };
    const res = mockRes();
    await updateGroup(req, res, mockNext);

    expect(mockNext).toHaveBeenCalled();
  });
});

describe('deleteGroup', () => {
  test('elimina el grupo y retorna success', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });

    const req = { params: { id: 'mock-uuid' }, io: null };
    const res = mockRes();
    await deleteGroup(req, res, mockNext);

    expect(res.json).toHaveBeenCalledWith({ success: true, id: 'mock-uuid' });
  });

  test('llama a next en caso de error', async () => {
    db.query.mockRejectedValueOnce(new Error('DB error'));

    const req = { params: { id: 'mock-uuid' }, io: null };
    const res = mockRes();
    await deleteGroup(req, res, mockNext);

    expect(mockNext).toHaveBeenCalled();
  });
});

describe('addMember', () => {
  test('agrega miembro al grupo', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });

    const req = { params: { id: 'mock-uuid' }, body: { userId: 'user-2' } };
    const res = mockRes();
    await addMember(req, res, mockNext);

    expect(res.json).toHaveBeenCalledWith({ success: true });
  });

  test('llama a next en caso de error', async () => {
    db.query.mockRejectedValueOnce(new Error('DB error'));

    const req = { params: { id: 'mock-uuid' }, body: { userId: 'user-2' } };
    const res = mockRes();
    await addMember(req, res, mockNext);

    expect(mockNext).toHaveBeenCalled();
  });
});

describe('removeMember', () => {
  test('elimina miembro del grupo', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });

    const req = { params: { id: 'mock-uuid', userId: 'user-2' } };
    const res = mockRes();
    await removeMember(req, res, mockNext);

    expect(res.json).toHaveBeenCalledWith({ success: true });
  });

  test('llama a next en caso de error', async () => {
    db.query.mockRejectedValueOnce(new Error('DB error'));

    const req = { params: { id: 'mock-uuid', userId: 'user-2' } };
    const res = mockRes();
    await removeMember(req, res, mockNext);

    expect(mockNext).toHaveBeenCalled();
  });
});
