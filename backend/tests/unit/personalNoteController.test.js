jest.mock('../../src/config/database');
jest.mock('uuid', () => ({ v4: () => 'mock-uuid' }));

const db = require('../../src/config/database');
const {
  getNotes, getNote, createNote, updateNote, deleteNote,
} = require('../../src/controllers/personalNoteController');

function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.send = jest.fn().mockReturnValue(res);
  return res;
}

const mockNext = jest.fn();

const rawNote = {
  id: 'mock-uuid',
  title: 'Nota de prueba',
  content: [{ type: 'paragraph', content: 'Hola' }],
  position: 0,
  created_at: new Date('2026-01-01'),
  updated_at: new Date('2026-01-02'),
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('getNotes', () => {
  test('retorna el listado liviano (sin content) del usuario', async () => {
    db.query.mockResolvedValueOnce({ rows: [rawNote] });

    const req = { user: { userId: 'user-1' } };
    const res = mockRes();
    await getNotes(req, res, mockNext);

    expect(res.json).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'mock-uuid', title: 'Nota de prueba' }),
    ]);
    const payload = res.json.mock.calls[0][0][0];
    expect(payload.content).toBeUndefined();
  });

  test('llama a next en caso de error', async () => {
    db.query.mockRejectedValueOnce(new Error('DB error'));

    const req = { user: { userId: 'user-1' } };
    const res = mockRes();
    await getNotes(req, res, mockNext);

    expect(mockNext).toHaveBeenCalled();
  });
});

describe('getNote', () => {
  test('retorna la nota completa (con content) por id', async () => {
    db.query.mockResolvedValueOnce({ rowCount: 1, rows: [rawNote] });

    const req = { params: { id: 'mock-uuid' }, user: { userId: 'user-1' } };
    const res = mockRes();
    await getNote(req, res, mockNext);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      id: 'mock-uuid',
      content: rawNote.content,
    }));
  });

  test('retorna 404 si la nota no existe o no es del usuario', async () => {
    db.query.mockResolvedValueOnce({ rowCount: 0, rows: [] });

    const req = { params: { id: 'bad-id' }, user: { userId: 'user-1' } };
    const res = mockRes();
    await getNote(req, res, mockNext);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  test('llama a next en caso de error', async () => {
    db.query.mockRejectedValueOnce(new Error('DB error'));

    const req = { params: { id: 'mock-uuid' }, user: { userId: 'user-1' } };
    const res = mockRes();
    await getNote(req, res, mockNext);

    expect(mockNext).toHaveBeenCalled();
  });
});

describe('createNote', () => {
  test('crea una nota con título y retorna 201', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [rawNote] });

    const req = { body: { title: 'Nota de prueba' }, user: { userId: 'user-1' } };
    const res = mockRes();
    await createNote(req, res, mockNext);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ id: 'mock-uuid' }));
  });

  test('crea una nota sin título (default string vacío)', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ ...rawNote, title: '' }] });

    const req = { body: {}, user: { userId: 'user-1' } };
    const res = mockRes();
    await createNote(req, res, mockNext);

    const insertCall = db.query.mock.calls[0];
    expect(insertCall[1]).toEqual(['mock-uuid', 'user-1', '']);
    expect(res.status).toHaveBeenCalledWith(201);
  });

  test('llama a next en caso de error', async () => {
    db.query.mockRejectedValueOnce(new Error('DB error'));

    const req = { body: { title: 'x' }, user: { userId: 'user-1' } };
    const res = mockRes();
    await createNote(req, res, mockNext);

    expect(mockNext).toHaveBeenCalled();
  });
});

describe('updateNote', () => {
  test('actualiza título, contenido y posición', async () => {
    db.query.mockResolvedValueOnce({ rowCount: 1, rows: [rawNote] });

    const req = {
      params: { id: 'mock-uuid' },
      body: { title: 'Editada', content: [{ type: 'paragraph' }], position: 2 },
      user: { userId: 'user-1' },
    };
    const res = mockRes();
    await updateNote(req, res, mockNext);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ id: 'mock-uuid' }));
  });

  test('retorna 400 si no hay nada que actualizar', async () => {
    const req = { params: { id: 'mock-uuid' }, body: {}, user: { userId: 'user-1' } };
    const res = mockRes();
    await updateNote(req, res, mockNext);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('retorna 404 si la nota no existe o no es del usuario', async () => {
    db.query.mockResolvedValueOnce({ rowCount: 0, rows: [] });

    const req = { params: { id: 'bad-id' }, body: { title: 'x' }, user: { userId: 'user-1' } };
    const res = mockRes();
    await updateNote(req, res, mockNext);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  test('llama a next en caso de error', async () => {
    db.query.mockRejectedValueOnce(new Error('DB error'));

    const req = { params: { id: 'mock-uuid' }, body: { title: 'x' }, user: { userId: 'user-1' } };
    const res = mockRes();
    await updateNote(req, res, mockNext);

    expect(mockNext).toHaveBeenCalled();
  });
});

describe('deleteNote', () => {
  test('elimina la nota y retorna 204', async () => {
    db.query.mockResolvedValueOnce({ rowCount: 1 });

    const req = { params: { id: 'mock-uuid' }, user: { userId: 'user-1' } };
    const res = mockRes();
    await deleteNote(req, res, mockNext);

    expect(res.status).toHaveBeenCalledWith(204);
    expect(res.send).toHaveBeenCalled();
  });

  test('retorna 404 si la nota no existe o no es del usuario', async () => {
    db.query.mockResolvedValueOnce({ rowCount: 0 });

    const req = { params: { id: 'bad-id' }, user: { userId: 'user-1' } };
    const res = mockRes();
    await deleteNote(req, res, mockNext);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  test('llama a next en caso de error', async () => {
    db.query.mockRejectedValueOnce(new Error('DB error'));

    const req = { params: { id: 'mock-uuid' }, user: { userId: 'user-1' } };
    const res = mockRes();
    await deleteNote(req, res, mockNext);

    expect(mockNext).toHaveBeenCalled();
  });
});
