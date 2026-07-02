jest.mock('../../src/config/database');
jest.mock('../../src/utils/email', () => ({ sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../../src/utils/logger', () => ({
  info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn(),
}));
jest.mock('../../src/utils/jwt');
jest.mock('../../src/services/pushService', () => ({ sendPushToUser: jest.fn() }));

describe('Routes registration', () => {
  test('auth routes se cargan correctamente', () => {
    expect(() => require('../../src/routes/auth')).not.toThrow();
  });

  test('task routes se cargan correctamente', () => {
    expect(() => require('../../src/routes/tasks')).not.toThrow();
  });

  test('group routes se cargan correctamente', () => {
    expect(() => require('../../src/routes/groups')).not.toThrow();
  });

  test('stats routes se cargan correctamente', () => {
    expect(() => require('../../src/routes/stats')).not.toThrow();
  });

  test('notification routes se cargan correctamente', () => {
    expect(() => require('../../src/routes/notifications')).not.toThrow();
  });

  test('employee routes se cargan correctamente', () => {
    expect(() => require('../../src/routes/employees')).not.toThrow();
  });

  test('tag routes se cargan correctamente', () => {
    expect(() => require('../../src/routes/tags')).not.toThrow();
  });
});

describe('services/emailService', () => {
  test('taskAssigned: sin SENDGRID_API_KEY no lanza error', async () => {
    const emailService = require('../../src/services/emailService');
    await expect(emailService.taskAssigned('to@test.com', 'Actor', 'Tarea', 'task-1')).resolves.toBeUndefined();
  });

  test('taskCompleted: sin SENDGRID_API_KEY no lanza error', async () => {
    const emailService = require('../../src/services/emailService');
    await expect(emailService.taskCompleted('to@test.com', 'Actor', 'Tarea')).resolves.toBeUndefined();
  });

  test('commentAdded: sin SENDGRID_API_KEY no lanza error', async () => {
    const emailService = require('../../src/services/emailService');
    await expect(emailService.commentAdded('to@test.com', 'Actor', 'Tarea')).resolves.toBeUndefined();
  });

  test('taskOverdue: sin SENDGRID_API_KEY no lanza error', async () => {
    const emailService = require('../../src/services/emailService');
    await expect(emailService.taskOverdue('to@test.com', 'Tarea')).resolves.toBeUndefined();
  });
});

describe('socket/events', () => {
  const jwtUtils = require('../../src/utils/jwt');

  beforeEach(() => {
    jwtUtils.verify.mockReturnValue({ userId: 'u1', email: 'test@test.com', role: 'member' });
  });

  test('setupSocket registra middleware de autenticación', () => {
    const { setupSocket } = require('../../src/socket/events');
    const mockIo = { use: jest.fn(), on: jest.fn(), emit: jest.fn() };
    setupSocket(mockIo);
    expect(mockIo.use).toHaveBeenCalled();
    expect(mockIo.on).toHaveBeenCalledWith('connection', expect.any(Function));
  });

  test('socket middleware rechaza conexión sin token', () => {
    const { setupSocket } = require('../../src/socket/events');
    let capturedMiddleware;
    const mockIo = { use: jest.fn((fn) => { capturedMiddleware = fn; }), on: jest.fn(), emit: jest.fn() };
    setupSocket(mockIo);

    const mockSocket = { handshake: { auth: {} } };
    const next = jest.fn();
    capturedMiddleware(mockSocket, next);
    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });

  test('socket middleware acepta token válido', () => {
    const { setupSocket } = require('../../src/socket/events');
    let capturedMiddleware;
    const mockIo = { use: jest.fn((fn) => { capturedMiddleware = fn; }), on: jest.fn(), emit: jest.fn() };
    setupSocket(mockIo);

    const mockSocket = { handshake: { auth: { token: 'valid-token' } } };
    const next = jest.fn();
    capturedMiddleware(mockSocket, next);
    expect(next).toHaveBeenCalledWith();
    expect(mockSocket.user).toBeDefined();
  });

  test('socket middleware rechaza token inválido', () => {
    jwtUtils.verify.mockImplementation(() => { throw new Error('invalid'); });
    const { setupSocket } = require('../../src/socket/events');
    let capturedMiddleware;
    const mockIo = { use: jest.fn((fn) => { capturedMiddleware = fn; }), on: jest.fn(), emit: jest.fn() };
    setupSocket(mockIo);

    const mockSocket = { handshake: { auth: { token: 'bad' } } };
    const next = jest.fn();
    capturedMiddleware(mockSocket, next);
    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });

  test('connection handler registra el usuario y ejecuta todos los eventos de socket', async () => {
    const { setupSocket } = require('../../src/socket/events');
    const db = require('../../src/config/database');
    db.query.mockResolvedValue({ rows: [] });

    let connectionHandler;
    const mockIo = {
      use: jest.fn(),
      on: jest.fn((event, fn) => { if (event === 'connection') connectionHandler = fn; }),
      emit: jest.fn(),
    };
    setupSocket(mockIo);

    const socketEvents = {};
    const mockSocket = {
      user: { userId: 'u1', email: 'test@test.com' },
      join: jest.fn(),
      leave: jest.fn(),
      on: jest.fn((event, fn) => { socketEvents[event] = fn; }),
      id: 'socket-1',
    };

    if (connectionHandler) {
      connectionHandler(mockSocket);

      expect(mockSocket.join).toHaveBeenCalledWith('user:u1');
      expect(mockIo.emit).toHaveBeenCalledWith('user:online', { userId: 'u1', email: 'test@test.com' });

      if (socketEvents['join:task']) socketEvents['join:task']('task-1');
      if (socketEvents['leave:task']) socketEvents['leave:task']('task-1');
      if (socketEvents['join:group']) socketEvents['join:group']('group-1');
      if (socketEvents['leave:group']) socketEvents['leave:group']('group-1');
      if (socketEvents['mark:read']) await socketEvents['mark:read']('notif-1');
      if (socketEvents['disconnect']) socketEvents['disconnect']();

      expect(mockSocket.join).toHaveBeenCalledWith('task:task-1');
      expect(mockSocket.leave).toHaveBeenCalledWith('task:task-1');
      expect(mockIo.emit).toHaveBeenCalledWith('user:offline', { userId: 'u1' });
    }
  });
});
