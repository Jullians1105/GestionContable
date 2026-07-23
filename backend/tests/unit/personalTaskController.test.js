jest.mock('../../src/config/database');
jest.mock('uuid', () => ({ v4: () => 'mock-uuid' }));

const db = require('../../src/config/database');
const {
  getPersonalTasks, createPersonalTask, updatePersonalTask, deletePersonalTask,
  addItem, updateItem, deleteItem,
} = require('../../src/controllers/personalTaskController');

function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.send = jest.fn().mockReturnValue(res);
  return res;
}

const mockNext = jest.fn();

const rawPersonalTask = {
  id: 'mock-uuid',
  title: 'Tarea personal',
  completed: false,
  position: 0,
  due_date: null,
  items: [{ id: 'item-1', title: 'Item 1', completed: false, position: 0, createdAt: '2026-01-01T00:00:00.000Z' }],
  created_at: new Date('2026-01-01'),
  updated_at: new Date('2026-01-02'),
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('getPersonalTasks', () => {
  test('retorna las tareas personales del usuario con sus items', async () => {
    db.query.mockResolvedValueOnce({ rows: [rawPersonalTask] });

    const req = { user: { userId: 'user-1' } };
    const res = mockRes();
    await getPersonalTasks(req, res, mockNext);

    expect(res.json).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'mock-uuid', items: expect.any(Array) }),
    ]);
  });

  test('llama a next en caso de error', async () => {
    db.query.mockRejectedValueOnce(new Error('DB error'));

    const req = { user: { userId: 'user-1' } };
    const res = mockRes();
    await getPersonalTasks(req, res, mockNext);

    expect(mockNext).toHaveBeenCalled();
  });
});

describe('createPersonalTask', () => {
  test('crea una tarea personal y retorna 201', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [rawPersonalTask] });

    const req = { body: { title: 'Tarea personal', dueDate: '2026-01-05' }, user: { userId: 'user-1' } };
    const res = mockRes();
    await createPersonalTask(req, res, mockNext);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ id: 'mock-uuid' }));
  });

  test('retorna 400 si falta el título', async () => {
    const req = { body: { title: '   ' }, user: { userId: 'user-1' } };
    const res = mockRes();
    await createPersonalTask(req, res, mockNext);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(db.query).not.toHaveBeenCalled();
  });

  test('llama a next en caso de error', async () => {
    db.query.mockRejectedValueOnce(new Error('DB error'));

    const req = { body: { title: 'Tarea' }, user: { userId: 'user-1' } };
    const res = mockRes();
    await createPersonalTask(req, res, mockNext);

    expect(mockNext).toHaveBeenCalled();
  });
});

describe('updatePersonalTask', () => {
  test('actualiza la tarea y retorna la versión completa', async () => {
    db.query
      .mockResolvedValueOnce({ rowCount: 1 })
      .mockResolvedValueOnce({ rows: [rawPersonalTask] });

    const req = {
      params: { id: 'mock-uuid' },
      body: { title: 'Editada', completed: true },
      user: { userId: 'user-1' },
    };
    const res = mockRes();
    await updatePersonalTask(req, res, mockNext);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ id: 'mock-uuid' }));
  });

  test('retorna 400 si no hay nada que actualizar', async () => {
    const req = { params: { id: 'mock-uuid' }, body: {}, user: { userId: 'user-1' } };
    const res = mockRes();
    await updatePersonalTask(req, res, mockNext);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('retorna 404 si la tarea no existe o no es del usuario', async () => {
    db.query.mockResolvedValueOnce({ rowCount: 0 });

    const req = { params: { id: 'bad-id' }, body: { completed: true }, user: { userId: 'user-1' } };
    const res = mockRes();
    await updatePersonalTask(req, res, mockNext);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  test('llama a next en caso de error', async () => {
    db.query.mockRejectedValueOnce(new Error('DB error'));

    const req = { params: { id: 'mock-uuid' }, body: { completed: true }, user: { userId: 'user-1' } };
    const res = mockRes();
    await updatePersonalTask(req, res, mockNext);

    expect(mockNext).toHaveBeenCalled();
  });
});

describe('deletePersonalTask', () => {
  test('elimina la tarea y retorna 204', async () => {
    db.query.mockResolvedValueOnce({ rowCount: 1 });

    const req = { params: { id: 'mock-uuid' }, user: { userId: 'user-1' } };
    const res = mockRes();
    await deletePersonalTask(req, res, mockNext);

    expect(res.status).toHaveBeenCalledWith(204);
    expect(res.send).toHaveBeenCalled();
  });

  test('retorna 404 si la tarea no existe o no es del usuario', async () => {
    db.query.mockResolvedValueOnce({ rowCount: 0 });

    const req = { params: { id: 'bad-id' }, user: { userId: 'user-1' } };
    const res = mockRes();
    await deletePersonalTask(req, res, mockNext);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  test('llama a next en caso de error', async () => {
    db.query.mockRejectedValueOnce(new Error('DB error'));

    const req = { params: { id: 'mock-uuid' }, user: { userId: 'user-1' } };
    const res = mockRes();
    await deletePersonalTask(req, res, mockNext);

    expect(mockNext).toHaveBeenCalled();
  });
});

describe('addItem', () => {
  test('agrega un item y retorna la tarea completa con 201', async () => {
    db.query
      .mockResolvedValueOnce({ rowCount: 1 })   // assertOwnsTask
      .mockResolvedValueOnce({ rows: [] })       // INSERT item
      .mockResolvedValueOnce({ rows: [rawPersonalTask] }); // SELECT full

    const req = { params: { id: 'mock-uuid' }, body: { title: 'Nuevo item' }, user: { userId: 'user-1' } };
    const res = mockRes();
    await addItem(req, res, mockNext);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ id: 'mock-uuid' }));
  });

  test('retorna 400 si falta el título', async () => {
    const req = { params: { id: 'mock-uuid' }, body: { title: '' }, user: { userId: 'user-1' } };
    const res = mockRes();
    await addItem(req, res, mockNext);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(db.query).not.toHaveBeenCalled();
  });

  test('retorna 404 si la tarea no existe o no es del usuario', async () => {
    db.query.mockResolvedValueOnce({ rowCount: 0 }); // assertOwnsTask falla

    const req = { params: { id: 'ajena' }, body: { title: 'x' }, user: { userId: 'user-1' } };
    const res = mockRes();
    await addItem(req, res, mockNext);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  test('llama a next en caso de error', async () => {
    db.query.mockRejectedValueOnce(new Error('DB error'));

    const req = { params: { id: 'mock-uuid' }, body: { title: 'x' }, user: { userId: 'user-1' } };
    const res = mockRes();
    await addItem(req, res, mockNext);

    expect(mockNext).toHaveBeenCalled();
  });
});

describe('updateItem', () => {
  test('actualiza el item y retorna la tarea completa', async () => {
    db.query
      .mockResolvedValueOnce({ rowCount: 1 })   // assertOwnsTask
      .mockResolvedValueOnce({ rowCount: 1 })   // UPDATE item
      .mockResolvedValueOnce({ rows: [rawPersonalTask] }); // SELECT full

    const req = {
      params: { id: 'mock-uuid', itemId: 'item-1' },
      body: { completed: true },
      user: { userId: 'user-1' },
    };
    const res = mockRes();
    await updateItem(req, res, mockNext);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ id: 'mock-uuid' }));
  });

  test('retorna 404 si la tarea no es del usuario', async () => {
    db.query.mockResolvedValueOnce({ rowCount: 0 });

    const req = { params: { id: 'ajena', itemId: 'item-1' }, body: { completed: true }, user: { userId: 'user-1' } };
    const res = mockRes();
    await updateItem(req, res, mockNext);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  test('retorna 400 si no hay nada que actualizar', async () => {
    db.query.mockResolvedValueOnce({ rowCount: 1 }); // assertOwnsTask ok

    const req = { params: { id: 'mock-uuid', itemId: 'item-1' }, body: {}, user: { userId: 'user-1' } };
    const res = mockRes();
    await updateItem(req, res, mockNext);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('retorna 404 si el item no existe', async () => {
    db.query
      .mockResolvedValueOnce({ rowCount: 1 })   // assertOwnsTask ok
      .mockResolvedValueOnce({ rowCount: 0 });  // UPDATE no encontró el item

    const req = { params: { id: 'mock-uuid', itemId: 'bad-item' }, body: { title: 'x' }, user: { userId: 'user-1' } };
    const res = mockRes();
    await updateItem(req, res, mockNext);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  test('llama a next en caso de error', async () => {
    db.query.mockRejectedValueOnce(new Error('DB error'));

    const req = { params: { id: 'mock-uuid', itemId: 'item-1' }, body: { completed: true }, user: { userId: 'user-1' } };
    const res = mockRes();
    await updateItem(req, res, mockNext);

    expect(mockNext).toHaveBeenCalled();
  });
});

describe('deleteItem', () => {
  test('elimina el item y retorna la tarea completa', async () => {
    db.query
      .mockResolvedValueOnce({ rowCount: 1 })   // assertOwnsTask
      .mockResolvedValueOnce({ rowCount: 1 })   // DELETE item
      .mockResolvedValueOnce({ rows: [rawPersonalTask] }); // SELECT full

    const req = { params: { id: 'mock-uuid', itemId: 'item-1' }, user: { userId: 'user-1' } };
    const res = mockRes();
    await deleteItem(req, res, mockNext);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ id: 'mock-uuid' }));
  });

  test('retorna 404 si la tarea no es del usuario', async () => {
    db.query.mockResolvedValueOnce({ rowCount: 0 });

    const req = { params: { id: 'ajena', itemId: 'item-1' }, user: { userId: 'user-1' } };
    const res = mockRes();
    await deleteItem(req, res, mockNext);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  test('retorna 404 si el item no existe', async () => {
    db.query
      .mockResolvedValueOnce({ rowCount: 1 })  // assertOwnsTask ok
      .mockResolvedValueOnce({ rowCount: 0 }); // DELETE no encontró el item

    const req = { params: { id: 'mock-uuid', itemId: 'bad-item' }, user: { userId: 'user-1' } };
    const res = mockRes();
    await deleteItem(req, res, mockNext);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  test('llama a next en caso de error', async () => {
    db.query.mockRejectedValueOnce(new Error('DB error'));

    const req = { params: { id: 'mock-uuid', itemId: 'item-1' }, user: { userId: 'user-1' } };
    const res = mockRes();
    await deleteItem(req, res, mockNext);

    expect(mockNext).toHaveBeenCalled();
  });
});
