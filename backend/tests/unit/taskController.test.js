jest.mock('../../src/config/database');
jest.mock('uuid', () => ({ v4: () => 'mock-uuid' }));
jest.mock('../../src/utils/logger', () => ({ info: jest.fn(), error: jest.fn() }));

const db = require('../../src/config/database');
const {
  getTasks, getTask, createTask, updateTask, deleteTask, getTaskHistory, searchTasks,
  addSubtask, updateSubtask, deleteSubtask,
  addComment, updateComment, deleteComment,
} = require('../../src/controllers/taskController');

function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

const mockNext = jest.fn();

const rawTask = {
  id: 'mock-uuid',
  title: 'Test Task',
  description: 'Desc',
  status: 'pending',
  priority: 'high',
  assigned_to: null,
  assigned_to_name: null,
  due_date: null,
  group_id: null,
  group_name: null,
  subtasks: [],
  comments: [],
  tag_ids: [],
  created_at: new Date(),
  updated_at: new Date(),
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('getTasks', () => {
  test('retorna lista de tareas y total', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [rawTask] })
      .mockResolvedValueOnce({ rows: [{ count: '1' }] });

    const req = { query: {} };
    const res = mockRes();
    await getTasks(req, res, mockNext);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      tasks: expect.any(Array),
      total: 1,
    }));
  });

  test('aplica filtros de status, priority, assignedTo, groupId y search', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ count: '0' }] });

    const req = { query: { status: 'pending', priority: 'high', assignedTo: 'u1', groupId: 'g1', search: 'test' } };
    const res = mockRes();
    await getTasks(req, res, mockNext);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ tasks: [], total: 0 }));
  });

  test('llama a next en caso de error', async () => {
    db.query.mockRejectedValueOnce(new Error('DB error'));

    const req = { query: {} };
    const res = mockRes();
    await getTasks(req, res, mockNext);

    expect(mockNext).toHaveBeenCalled();
  });
});

describe('getTask', () => {
  test('retorna la tarea por id', async () => {
    db.query.mockResolvedValueOnce({ rows: [rawTask] });

    const req = { params: { id: 'mock-uuid' } };
    const res = mockRes();
    await getTask(req, res, mockNext);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ id: 'mock-uuid' }));
  });

  test('retorna 404 si la tarea no existe', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });

    const req = { params: { id: 'bad-id' } };
    const res = mockRes();
    await getTask(req, res, mockNext);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  test('llama a next en caso de error', async () => {
    db.query.mockRejectedValueOnce(new Error('DB error'));

    const req = { params: { id: 'mock-uuid' } };
    const res = mockRes();
    await getTask(req, res, mockNext);

    expect(mockNext).toHaveBeenCalled();
  });
});

describe('createTask', () => {
  test('crea una tarea y retorna 201', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [rawTask] })
      .mockResolvedValueOnce({ rows: [] });

    const req = {
      body: { title: 'Test Task', priority: 'high' },
      user: { userId: 'user-1' },
      io: null,
    };
    const res = mockRes();
    await createTask(req, res, mockNext);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ title: 'Test Task' }));
  });

  test('crea tarea con tagIds y los inserta', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [rawTask] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const req = {
      body: { title: 'Test Task', tagIds: ['tag-1'] },
      user: { userId: 'user-1' },
      io: null,
    };
    const res = mockRes();
    await createTask(req, res, mockNext);

    expect(res.status).toHaveBeenCalledWith(201);
  });

  test('envía notificación si la tarea se asigna a otro usuario', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ ...rawTask, assigned_to: 'user-2' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ name: 'Actor' }] })
      .mockResolvedValueOnce({ rows: [] });

    const req = {
      body: { title: 'Test Task', assignedTo: 'user-2' },
      user: { userId: 'user-1' },
      io: null,
    };
    const res = mockRes();
    await createTask(req, res, mockNext);

    expect(res.status).toHaveBeenCalledWith(201);
  });

  test('llama a next en caso de error', async () => {
    db.query.mockRejectedValueOnce(new Error('DB error'));

    const req = {
      body: { title: 'Test Task' },
      user: { userId: 'user-1' },
      io: null,
    };
    const res = mockRes();
    await createTask(req, res, mockNext);

    expect(mockNext).toHaveBeenCalled();
  });
});

describe('updateTask', () => {
  test('actualiza una tarea existente', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [rawTask] })
      .mockResolvedValueOnce({ rows: [{ ...rawTask, status: 'in_progress' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [rawTask] });

    const req = {
      params: { id: 'mock-uuid' },
      body: { status: 'in_progress' },
      user: { userId: 'user-1' },
      io: null,
    };
    const res = mockRes();
    await updateTask(req, res, mockNext);

    expect(res.json).toHaveBeenCalled();
  });

  test('retorna 404 si la tarea no existe', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });

    const req = {
      params: { id: 'bad-id' },
      body: { status: 'pending' },
      user: { userId: 'user-1' },
      io: null,
    };
    const res = mockRes();
    await updateTask(req, res, mockNext);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  test('actualiza tagIds cuando se proveen', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [rawTask] })
      .mockResolvedValueOnce({ rows: [rawTask] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [rawTask] });

    const req = {
      params: { id: 'mock-uuid' },
      body: { tagIds: ['tag-1'] },
      user: { userId: 'user-1' },
      io: null,
    };
    const res = mockRes();
    await updateTask(req, res, mockNext);

    expect(res.json).toHaveBeenCalled();
  });

  test('envía notificación al cambiar asignado', async () => {
    const taskWithAssignee = { ...rawTask, assigned_to: 'user-1' };
    db.query
      .mockResolvedValueOnce({ rows: [taskWithAssignee] })
      .mockResolvedValueOnce({ rows: [{ ...taskWithAssignee, assigned_to: 'user-2' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ name: 'Actor' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [rawTask] });

    const req = {
      params: { id: 'mock-uuid' },
      body: { assignedTo: 'user-2' },
      user: { userId: 'user-1' },
      io: null,
    };
    const res = mockRes();
    await updateTask(req, res, mockNext);

    expect(res.json).toHaveBeenCalled();
  });

  test('envía notificación al completar tarea', async () => {
    const inProgressTask = { ...rawTask, status: 'in_progress' };
    db.query
      .mockResolvedValueOnce({ rows: [inProgressTask] })
      .mockResolvedValueOnce({ rows: [{ ...inProgressTask, status: 'completed' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ name: 'Actor' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [rawTask] });

    const req = {
      params: { id: 'mock-uuid' },
      body: { status: 'completed' },
      user: { userId: 'user-1' },
      io: null,
    };
    const res = mockRes();
    await updateTask(req, res, mockNext);

    expect(res.json).toHaveBeenCalled();
  });

  test('llama a next en caso de error', async () => {
    db.query.mockRejectedValueOnce(new Error('DB error'));

    const req = {
      params: { id: 'mock-uuid' },
      body: {},
      user: { userId: 'user-1' },
      io: null,
    };
    const res = mockRes();
    await updateTask(req, res, mockNext);

    expect(mockNext).toHaveBeenCalled();
  });
});

describe('deleteTask', () => {
  test('elimina la tarea y retorna success', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [rawTask] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const req = {
      params: { id: 'mock-uuid' },
      user: { userId: 'user-1' },
      io: null,
    };
    const res = mockRes();
    await deleteTask(req, res, mockNext);

    expect(res.json).toHaveBeenCalledWith({ success: true, id: 'mock-uuid' });
  });

  test('retorna 404 si la tarea no existe', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });

    const req = {
      params: { id: 'bad-id' },
      user: { userId: 'user-1' },
      io: null,
    };
    const res = mockRes();
    await deleteTask(req, res, mockNext);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  test('llama a next en caso de error', async () => {
    db.query.mockRejectedValueOnce(new Error('DB error'));

    const req = { params: { id: 'mock-uuid' }, user: { userId: 'user-1' }, io: null };
    const res = mockRes();
    await deleteTask(req, res, mockNext);

    expect(mockNext).toHaveBeenCalled();
  });
});

describe('getTaskHistory', () => {
  test('retorna el historial de la tarea', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ id: '1', action: 'CREATE', user_name: 'Test' }] });

    const req = { params: { id: 'mock-uuid' } };
    const res = mockRes();
    await getTaskHistory(req, res, mockNext);

    expect(res.json).toHaveBeenCalledWith({ history: expect.any(Array) });
  });

  test('llama a next en caso de error', async () => {
    db.query.mockRejectedValueOnce(new Error('DB error'));

    const req = { params: { id: 'mock-uuid' } };
    const res = mockRes();
    await getTaskHistory(req, res, mockNext);

    expect(mockNext).toHaveBeenCalled();
  });
});

describe('searchTasks', () => {
  test('retorna resultados de búsqueda', async () => {
    db.query.mockResolvedValueOnce({ rows: [rawTask] });

    const req = { query: { q: 'test' } };
    const res = mockRes();
    await searchTasks(req, res, mockNext);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ tasks: expect.any(Array) }));
  });

  test('retorna 400 si no se proporciona q', async () => {
    const req = { query: {} };
    const res = mockRes();
    await searchTasks(req, res, mockNext);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('llama a next en caso de error', async () => {
    db.query.mockRejectedValueOnce(new Error('DB error'));

    const req = { query: { q: 'test' } };
    const res = mockRes();
    await searchTasks(req, res, mockNext);

    expect(mockNext).toHaveBeenCalled();
  });
});

describe('addSubtask', () => {
  test('agrega subtarea y retorna la tarea completa', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [rawTask] });

    const req = {
      params: { id: 'mock-uuid' },
      body: { title: 'Subtarea' },
      io: null,
    };
    const res = mockRes();
    await addSubtask(req, res, mockNext);

    expect(res.status).toHaveBeenCalledWith(201);
  });

  test('retorna 400 si el título está vacío', async () => {
    const req = { params: { id: 'mock-uuid' }, body: { title: '' }, io: null };
    const res = mockRes();
    await addSubtask(req, res, mockNext);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('retorna 404 si la tarea no existe tras insertar subtarea', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const req = { params: { id: 'bad-id' }, body: { title: 'Sub' }, io: null };
    const res = mockRes();
    await addSubtask(req, res, mockNext);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  test('llama a next en caso de error', async () => {
    db.query.mockRejectedValueOnce(new Error('DB error'));

    const req = { params: { id: 'mock-uuid' }, body: { title: 'Sub' }, io: null };
    const res = mockRes();
    await addSubtask(req, res, mockNext);

    expect(mockNext).toHaveBeenCalled();
  });
});

describe('updateSubtask', () => {
  test('actualiza la subtarea', async () => {
    db.query
      .mockResolvedValueOnce({ rowCount: 1 })
      .mockResolvedValueOnce({ rows: [rawTask] });

    const req = {
      params: { id: 'mock-uuid', subtaskId: 'sub-1' },
      body: { completed: true },
      io: null,
    };
    const res = mockRes();
    await updateSubtask(req, res, mockNext);

    expect(res.json).toHaveBeenCalled();
  });

  test('retorna 400 si no hay nada que actualizar', async () => {
    const req = { params: { id: 'mock-uuid', subtaskId: 'sub-1' }, body: {}, io: null };
    const res = mockRes();
    await updateSubtask(req, res, mockNext);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('retorna 404 si la subtarea no existe', async () => {
    db.query.mockResolvedValueOnce({ rowCount: 0 });

    const req = { params: { id: 'mock-uuid', subtaskId: 'bad-sub' }, body: { title: 'X' }, io: null };
    const res = mockRes();
    await updateSubtask(req, res, mockNext);

    expect(res.status).toHaveBeenCalledWith(404);
  });
});

describe('deleteSubtask', () => {
  test('elimina la subtarea', async () => {
    db.query
      .mockResolvedValueOnce({ rowCount: 1 })
      .mockResolvedValueOnce({ rows: [rawTask] });

    const req = { params: { id: 'mock-uuid', subtaskId: 'sub-1' }, io: null };
    const res = mockRes();
    await deleteSubtask(req, res, mockNext);

    expect(res.json).toHaveBeenCalled();
  });

  test('retorna 404 si la subtarea no existe', async () => {
    db.query.mockResolvedValueOnce({ rowCount: 0 });

    const req = { params: { id: 'mock-uuid', subtaskId: 'bad-sub' }, io: null };
    const res = mockRes();
    await deleteSubtask(req, res, mockNext);

    expect(res.status).toHaveBeenCalledWith(404);
  });
});

describe('addComment', () => {
  test('agrega comentario y notifica', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ title: 'Task', assigned_to: 'user-2' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ name: 'Actor' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'leader-1' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [rawTask] });

    const req = {
      params: { id: 'mock-uuid' },
      body: { text: 'Un comentario' },
      user: { userId: 'user-1' },
      io: null,
    };
    const res = mockRes();
    await addComment(req, res, mockNext);

    expect(res.status).toHaveBeenCalledWith(201);
  });

  test('retorna 400 si el texto está vacío', async () => {
    const req = { params: { id: 'mock-uuid' }, body: { text: '' }, user: { userId: 'user-1' }, io: null };
    const res = mockRes();
    await addComment(req, res, mockNext);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('retorna 404 si la tarea no existe', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });

    const req = { params: { id: 'bad-id' }, body: { text: 'Comment' }, user: { userId: 'user-1' }, io: null };
    const res = mockRes();
    await addComment(req, res, mockNext);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  test('llama a next en caso de error', async () => {
    db.query.mockRejectedValueOnce(new Error('DB error'));

    const req = { params: { id: 'mock-uuid' }, body: { text: 'Comentario' }, user: { userId: 'user-1' }, io: null };
    const res = mockRes();
    await addComment(req, res, mockNext);

    expect(mockNext).toHaveBeenCalled();
  });
});

describe('updateComment', () => {
  test('actualiza el comentario', async () => {
    db.query
      .mockResolvedValueOnce({ rowCount: 1 })
      .mockResolvedValueOnce({ rows: [rawTask] });

    const req = {
      params: { id: 'mock-uuid', commentId: 'cmt-1' },
      body: { text: 'Texto actualizado' },
      user: { userId: 'user-1' },
      io: null,
    };
    const res = mockRes();
    await updateComment(req, res, mockNext);

    expect(res.json).toHaveBeenCalled();
  });

  test('retorna 400 si el texto está vacío', async () => {
    const req = {
      params: { id: 'mock-uuid', commentId: 'cmt-1' },
      body: { text: '' },
      user: { userId: 'user-1' },
      io: null,
    };
    const res = mockRes();
    await updateComment(req, res, mockNext);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('retorna 404 si el comentario no existe o no pertenece al usuario', async () => {
    db.query.mockResolvedValueOnce({ rowCount: 0 });

    const req = {
      params: { id: 'mock-uuid', commentId: 'bad-cmt' },
      body: { text: 'Texto' },
      user: { userId: 'user-1' },
      io: null,
    };
    const res = mockRes();
    await updateComment(req, res, mockNext);

    expect(res.status).toHaveBeenCalledWith(404);
  });
});

describe('deleteComment', () => {
  test('elimina el comentario', async () => {
    db.query
      .mockResolvedValueOnce({ rowCount: 1 })
      .mockResolvedValueOnce({ rows: [rawTask] });

    const req = {
      params: { id: 'mock-uuid', commentId: 'cmt-1' },
      user: { userId: 'user-1' },
      io: null,
    };
    const res = mockRes();
    await deleteComment(req, res, mockNext);

    expect(res.json).toHaveBeenCalled();
  });

  test('retorna 404 si el comentario no existe', async () => {
    db.query.mockResolvedValueOnce({ rowCount: 0 });

    const req = {
      params: { id: 'mock-uuid', commentId: 'bad-cmt' },
      user: { userId: 'user-1' },
      io: null,
    };
    const res = mockRes();
    await deleteComment(req, res, mockNext);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  test('llama a next en caso de error', async () => {
    db.query.mockRejectedValueOnce(new Error('DB error'));

    const req = { params: { id: 'mock-uuid', commentId: 'cmt-1' }, user: { userId: 'user-1' }, io: null };
    const res = mockRes();
    await deleteComment(req, res, mockNext);

    expect(mockNext).toHaveBeenCalled();
  });
});
