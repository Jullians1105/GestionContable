jest.mock('../../src/config/database');
jest.mock('uuid', () => ({ v4: () => 'mock-uuid' }));
jest.mock('../../src/utils/logger', () => ({ info: jest.fn(), error: jest.fn(), warn: jest.fn() }));
jest.mock('../../src/services/pushService', () => ({ sendPushToUser: jest.fn() }));

const db = require('../../src/config/database');
const {
  getTasks, getTask, createTask, updateTask, deleteTask, getTaskHistory, searchTasks,
  updateMyAssigneeStatus,
  createDeleteRequest, respondDeleteRequest,
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
      .mockResolvedValueOnce({ rows: [rawTask] })  // INSERT tasks
      .mockResolvedValueOnce({ rows: [] })          // syncAssignees: DELETE (sin asignados)
      .mockResolvedValueOnce({ rows: [] });         // auditLog

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
      .mockResolvedValueOnce({ rows: [rawTask] })  // INSERT tasks
      .mockResolvedValueOnce({ rows: [] })          // INSERT task_tag_assignment
      .mockResolvedValueOnce({ rows: [] })          // syncAssignees: DELETE (sin asignados)
      .mockResolvedValueOnce({ rows: [] });         // auditLog

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
      .mockResolvedValueOnce({ rows: [{ ...rawTask, assigned_to: 'user-2' }] })  // INSERT tasks
      .mockResolvedValueOnce({ rows: [] })          // syncAssignees: DELETE (!= ALL)
      .mockResolvedValueOnce({ rows: [] })          // syncAssignees: INSERT user-2
      .mockResolvedValueOnce({ rows: [] })          // auditLog
      .mockResolvedValueOnce({ rows: [{ name: 'Actor' }] })  // SELECT name actor
      .mockResolvedValueOnce({ rows: [] })          // INSERT notifications
      .mockResolvedValueOnce({ rows: [] });         // SELECT assignees para la respuesta

    const req = {
      body: { title: 'Test Task', assignedTo: 'user-2' },
      user: { userId: 'user-1' },
      io: null,
    };
    const res = mockRes();
    await createTask(req, res, mockNext);

    expect(res.status).toHaveBeenCalledWith(201);
  });

  test('persiste task_assignees para TODOS los asignados, no solo el primero', async () => {
    const calls = [];
    db.query.mockImplementation((sql, params) => {
      calls.push({ sql, params });
      if (sql.startsWith('INSERT INTO tasks')) return Promise.resolve({ rows: [{ ...rawTask, assigned_to: 'user-2' }] });
      return Promise.resolve({ rows: [] });
    });

    const req = {
      body: { title: 'Multi', assignedTo: ['user-2', 'user-3'] },
      user: { userId: 'user-1' },
      io: null,
    };
    const res = mockRes();
    await createTask(req, res, mockNext);

    const assigneeInserts = calls.filter(c => c.sql.includes('INSERT INTO task_assignees'));
    expect(assigneeInserts.map(c => c.params[1])).toEqual(['user-2', 'user-3']);
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
      .mockResolvedValueOnce({ rows: [rawTask] })                                 // SELECT current
      .mockResolvedValueOnce({ rows: [{ ...rawTask, status: 'in_progress' }] })   // UPDATE tasks
      .mockResolvedValueOnce({ rows: [] })                                        // setAllAssigneesStatus
      .mockResolvedValueOnce({ rows: [] })                                        // auditLog
      .mockResolvedValueOnce({ rows: [rawTask] });                                // fetchFullTask

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
      .mockResolvedValueOnce({ rows: [taskWithAssignee] })                                  // SELECT current
      .mockResolvedValueOnce({ rows: [{ ...taskWithAssignee, assigned_to: 'user-2' }] })     // UPDATE tasks
      .mockResolvedValueOnce({ rows: [] })          // syncAssignees: DELETE (!= ALL)
      .mockResolvedValueOnce({ rows: [] })          // syncAssignees: INSERT user-2
      .mockResolvedValueOnce({ rows: [] })          // recalculateTaskStatus: SELECT (sin filas -> no recalcula)
      .mockResolvedValueOnce({ rows: [{ name: 'Actor' }] })  // SELECT name actor
      .mockResolvedValueOnce({ rows: [] })          // INSERT notifications
      .mockResolvedValueOnce({ rows: [] })          // auditLog
      .mockResolvedValueOnce({ rows: [rawTask] });  // fetchFullTask

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

  test('sincroniza task_assignees al cambiar la lista de asignados (agrega y quita)', async () => {
    const calls = [];
    db.query.mockImplementation((sql, params) => {
      calls.push({ sql, params });
      if (sql.startsWith('SELECT * FROM tasks WHERE id')) return Promise.resolve({ rows: [{ ...rawTask, assigned_to: 'user-2' }] });
      if (sql.startsWith('UPDATE tasks SET')) return Promise.resolve({ rows: [{ ...rawTask, assigned_to: 'user-3' }] });
      if (sql.includes('SELECT status FROM task_assignees')) return Promise.resolve({ rows: [] });
      if (sql.includes('assigned_to_name')) return Promise.resolve({ rows: [rawTask] });
      return Promise.resolve({ rows: [] });
    });

    const req = {
      params: { id: 'mock-uuid' },
      body: { assignedTo: ['user-3', 'user-4'] },
      user: { userId: 'user-1' },
      io: null,
    };
    const res = mockRes();
    await updateTask(req, res, mockNext);

    const deleteCall = calls.find(c => c.sql.includes('DELETE FROM task_assignees'));
    expect(deleteCall.params).toEqual(['mock-uuid', ['user-3', 'user-4']]);
    const insertCalls = calls.filter(c => c.sql.includes('INSERT INTO task_assignees'));
    expect(insertCalls.map(c => c.params[1])).toEqual(['user-3', 'user-4']);
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

describe('updateMyAssigneeStatus', () => {
  test('retorna 404 si el usuario no está asignado a la tarea', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });

    const req = {
      params: { id: 'mock-uuid' },
      body: { status: 'completed' },
      user: { userId: 'user-1' },
      io: null,
    };
    const res = mockRes();
    await updateMyAssigneeStatus(req, res, mockNext);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  test('marca mi estado y recalcula el agregado como in_progress si no todos completaron', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ status: 'pending', task_status: 'pending', title: 'Tarea X' }] })  // current
      .mockResolvedValueOnce({ rows: [] })                                                                   // UPDATE task_assignees
      .mockResolvedValueOnce({ rows: [{ status: 'in_progress' }, { status: 'pending' }] })                    // recalc SELECT
      .mockResolvedValueOnce({ rows: [] })                                                                    // recalc UPDATE tasks
      .mockResolvedValueOnce({ rows: [] })                                                                    // auditLog
      .mockResolvedValueOnce({ rows: [rawTask] });                                                            // fetchFullTask

    const req = {
      params: { id: 'mock-uuid' },
      body: { status: 'in_progress' },
      user: { userId: 'user-1' },
      io: null,
    };
    const res = mockRes();
    await updateMyAssigneeStatus(req, res, mockNext);

    expect(res.json).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalledWith(404);
  });

  test('cuando el último asignado completa su parte, recalcula a completed y notifica a líderes', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ status: 'in_progress', task_status: 'in_progress', title: 'Tarea Y' }] })  // current
      .mockResolvedValueOnce({ rows: [] })                                             // UPDATE task_assignees
      .mockResolvedValueOnce({ rows: [{ status: 'completed' }, { status: 'completed' }] })  // recalc SELECT (todos completed)
      .mockResolvedValueOnce({ rows: [] })                                             // recalc UPDATE tasks
      .mockResolvedValueOnce({ rows: [] })                                             // auditLog
      .mockResolvedValueOnce({ rows: [{ name: 'Actor' }] })                            // notifyTaskCompleted: actor
      .mockResolvedValueOnce({ rows: [] })                                             // notifyTaskCompleted: leaders (ninguno)
      .mockResolvedValueOnce({ rows: [] })                                             // notifyTaskCompleted: fondo link check
      .mockResolvedValueOnce({ rows: [rawTask] });                                     // fetchFullTask

    const req = {
      params: { id: 'mock-uuid' },
      body: { status: 'completed' },
      user: { userId: 'user-2' },
      io: null,
    };
    const res = mockRes();
    await updateMyAssigneeStatus(req, res, mockNext);

    expect(res.json).toHaveBeenCalled();
  });

  test('llama a next en caso de error', async () => {
    db.query.mockRejectedValueOnce(new Error('DB error'));

    const req = {
      params: { id: 'mock-uuid' },
      body: { status: 'completed' },
      user: { userId: 'user-1' },
      io: null,
    };
    const res = mockRes();
    await updateMyAssigneeStatus(req, res, mockNext);

    expect(mockNext).toHaveBeenCalled();
  });
});

describe('deleteTask', () => {
  test('admin elimina la tarea y retorna success', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [rawTask] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const req = {
      params: { id: 'mock-uuid' },
      user: { userId: 'user-1', role: 'admin' },
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
      user: { userId: 'user-1', role: 'admin' },
      io: null,
    };
    const res = mockRes();
    await deleteTask(req, res, mockNext);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  test('llama a next en caso de error', async () => {
    db.query.mockRejectedValueOnce(new Error('DB error'));

    const req = { params: { id: 'mock-uuid' }, user: { userId: 'user-1', role: 'admin' }, io: null };
    const res = mockRes();
    await deleteTask(req, res, mockNext);

    expect(mockNext).toHaveBeenCalled();
  });

  test('leader NO puede eliminar una tarea sin grupo', async () => {
    db.query.mockResolvedValueOnce({ rows: [rawTask] }); // group_id null

    const req = {
      params: { id: 'mock-uuid' },
      user: { userId: 'user-2', role: 'leader' },
      io: null,
    };
    const res = mockRes();
    await deleteTask(req, res, mockNext);

    expect(res.status).toHaveBeenCalledWith(403);
  });

  test('leader NO puede eliminar una tarea de un grupo que no lidera', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ ...rawTask, group_id: 'group-1' }] })
      .mockResolvedValueOnce({ rows: [] }); // no es líder de group-1

    const req = {
      params: { id: 'mock-uuid' },
      user: { userId: 'user-2', role: 'leader' },
      io: null,
    };
    const res = mockRes();
    await deleteTask(req, res, mockNext);

    expect(res.status).toHaveBeenCalledWith(403);
  });

  test('leader SÍ puede eliminar una tarea del grupo que lidera', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ ...rawTask, group_id: 'group-1' }] })
      .mockResolvedValueOnce({ rows: [{ '?column?': 1 }] }) // sí es líder de group-1
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const req = {
      params: { id: 'mock-uuid' },
      user: { userId: 'user-2', role: 'leader' },
      io: null,
    };
    const res = mockRes();
    await deleteTask(req, res, mockNext);

    expect(res.json).toHaveBeenCalledWith({ success: true, id: 'mock-uuid' });
  });
});

describe('createDeleteRequest', () => {
  test('crea la solicitud y notifica a los destinatarios', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [rawTask] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 'admin-1' }] })
      .mockResolvedValueOnce({ rows: [{ name: 'Member User' }] })
      .mockResolvedValueOnce({ rows: [] });

    const req = {
      params: { id: 'mock-uuid' },
      body: { reason: 'Ya no aplica' },
      user: { userId: 'user-1', role: 'member' },
      io: null,
    };
    const res = mockRes();
    await createDeleteRequest(req, res, mockNext);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ status: 'pending', reason: 'Ya no aplica' }));
  });

  test('retorna 400 si falta el motivo', async () => {
    const req = { params: { id: 'mock-uuid' }, body: {}, user: { userId: 'user-1' }, io: null };
    const res = mockRes();
    await createDeleteRequest(req, res, mockNext);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('retorna 404 si la tarea no existe', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });

    const req = { params: { id: 'bad-id' }, body: { reason: 'x' }, user: { userId: 'user-1' }, io: null };
    const res = mockRes();
    await createDeleteRequest(req, res, mockNext);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  test('retorna 409 si ya hay una solicitud pendiente', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [rawTask] })
      .mockResolvedValueOnce({ rows: [{ id: 'existing-req' }] });

    const req = { params: { id: 'mock-uuid' }, body: { reason: 'x' }, user: { userId: 'user-1' }, io: null };
    const res = mockRes();
    await createDeleteRequest(req, res, mockNext);

    expect(res.status).toHaveBeenCalledWith(409);
  });

  test('llama a next en caso de error', async () => {
    db.query.mockRejectedValueOnce(new Error('DB error'));

    const req = { params: { id: 'mock-uuid' }, body: { reason: 'x' }, user: { userId: 'user-1' }, io: null };
    const res = mockRes();
    await createDeleteRequest(req, res, mockNext);

    expect(mockNext).toHaveBeenCalled();
  });
});

describe('respondDeleteRequest', () => {
  test('admin aprueba: elimina la tarea y notifica al solicitante', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [rawTask] })
      .mockResolvedValueOnce({ rows: [{ id: 'req-1', task_id: 'mock-uuid', requested_by: 'user-3', status: 'pending' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ name: 'Admin User' }] })
      .mockResolvedValueOnce({ rows: [] });

    const req = {
      params: { id: 'mock-uuid', requestId: 'req-1' },
      body: { action: 'approve' },
      user: { userId: 'admin-1', role: 'admin' },
      io: null,
    };
    const res = mockRes();
    await respondDeleteRequest(req, res, mockNext);

    expect(res.json).toHaveBeenCalledWith({ success: true, action: 'approve', taskId: 'mock-uuid' });
  });

  test('admin rechaza: no elimina la tarea', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [rawTask] })
      .mockResolvedValueOnce({ rows: [{ id: 'req-1', task_id: 'mock-uuid', requested_by: 'user-3', status: 'pending' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ name: 'Admin User' }] })
      .mockResolvedValueOnce({ rows: [] });

    const req = {
      params: { id: 'mock-uuid', requestId: 'req-1' },
      body: { action: 'reject' },
      user: { userId: 'admin-1', role: 'admin' },
      io: null,
    };
    const res = mockRes();
    await respondDeleteRequest(req, res, mockNext);

    expect(res.json).toHaveBeenCalledWith({ success: true, action: 'reject', taskId: 'mock-uuid' });
  });

  test('leader NO puede resolver una solicitud de una tarea sin grupo', async () => {
    db.query.mockResolvedValueOnce({ rows: [rawTask] });

    const req = {
      params: { id: 'mock-uuid', requestId: 'req-1' },
      body: { action: 'approve' },
      user: { userId: 'leader-1', role: 'leader' },
      io: null,
    };
    const res = mockRes();
    await respondDeleteRequest(req, res, mockNext);

    expect(res.status).toHaveBeenCalledWith(403);
  });

  test('leader SÍ puede resolver una solicitud del grupo que lidera', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ ...rawTask, group_id: 'group-1' }] })
      .mockResolvedValueOnce({ rows: [{ '?column?': 1 }] })
      .mockResolvedValueOnce({ rows: [{ id: 'req-1', task_id: 'mock-uuid', requested_by: 'user-3', status: 'pending' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ name: 'Leader User' }] })
      .mockResolvedValueOnce({ rows: [] });

    const req = {
      params: { id: 'mock-uuid', requestId: 'req-1' },
      body: { action: 'reject' },
      user: { userId: 'leader-1', role: 'leader' },
      io: null,
    };
    const res = mockRes();
    await respondDeleteRequest(req, res, mockNext);

    expect(res.json).toHaveBeenCalledWith({ success: true, action: 'reject', taskId: 'mock-uuid' });
  });

  test('retorna 400 si la acción es inválida', async () => {
    const req = { params: { id: 'mock-uuid', requestId: 'req-1' }, body: { action: 'foo' }, user: { userId: 'admin-1', role: 'admin' }, io: null };
    const res = mockRes();
    await respondDeleteRequest(req, res, mockNext);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('retorna 404 si la tarea no existe', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });

    const req = { params: { id: 'bad-id', requestId: 'req-1' }, body: { action: 'approve' }, user: { userId: 'admin-1', role: 'admin' }, io: null };
    const res = mockRes();
    await respondDeleteRequest(req, res, mockNext);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  test('retorna 404 si la solicitud ya fue resuelta', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [rawTask] })
      .mockResolvedValueOnce({ rows: [] });

    const req = { params: { id: 'mock-uuid', requestId: 'req-1' }, body: { action: 'approve' }, user: { userId: 'admin-1', role: 'admin' }, io: null };
    const res = mockRes();
    await respondDeleteRequest(req, res, mockNext);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  test('llama a next en caso de error', async () => {
    db.query.mockRejectedValueOnce(new Error('DB error'));

    const req = { params: { id: 'mock-uuid', requestId: 'req-1' }, body: { action: 'approve' }, user: { userId: 'admin-1', role: 'admin' }, io: null };
    const res = mockRes();
    await respondDeleteRequest(req, res, mockNext);

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
      user: { userId: 'user-1' },
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
