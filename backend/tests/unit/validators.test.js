const { sign, verify, signRefresh, verifyRefresh } = require('../../src/utils/jwt');

describe('JWT Utils', () => {
  const payload = { userId: 'test-id', email: 'test@test.com', role: 'member' };

  test('sign genera un token válido', () => {
    const token = sign(payload);
    expect(typeof token).toBe('string');
    expect(token.split('.')).toHaveLength(3);
  });

  test('verify decodifica el token correctamente', () => {
    const token = sign(payload);
    const decoded = verify(token);
    expect(decoded.userId).toBe(payload.userId);
    expect(decoded.email).toBe(payload.email);
    expect(decoded.role).toBe(payload.role);
  });

  test('verify lanza error con token inválido', () => {
    expect(() => verify('token.invalido.aqui')).toThrow();
  });

  test('verify lanza error con token corrupto', () => {
    const token = sign(payload);
    expect(() => verify(token + 'corrupto')).toThrow();
  });

  test('signRefresh genera un refresh token válido', () => {
    const token = signRefresh({ userId: payload.userId });
    expect(typeof token).toBe('string');
    expect(token.split('.')).toHaveLength(3);
  });

  test('verifyRefresh decodifica el refresh token correctamente', () => {
    const token = signRefresh({ userId: payload.userId });
    const decoded = verifyRefresh(token);
    expect(decoded.userId).toBe(payload.userId);
  });

  test('verifyRefresh lanza error con token de acceso (secret incorrecto)', () => {
    const accessToken = sign(payload);
    expect(() => verifyRefresh(accessToken)).toThrow();
  });
});

describe('Validaciones de entrada', () => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  test('email válido pasa la regex', () => {
    expect(emailRegex.test('user@example.com')).toBe(true);
    expect(emailRegex.test('user.name+tag@domain.co')).toBe(true);
  });

  test('email inválido falla la regex', () => {
    expect(emailRegex.test('no-at-sign')).toBe(false);
    expect(emailRegex.test('@nodomain')).toBe(false);
    expect(emailRegex.test('')).toBe(false);
  });

  test('contraseña mínimo 8 caracteres', () => {
    const isValid = (pwd) => !!(pwd && pwd.length >= 8);
    expect(isValid('12345678')).toBe(true);
    expect(isValid('1234567')).toBe(false);
    expect(isValid('')).toBe(false);
    expect(isValid(null)).toBe(false);
  });
});

describe('Normalización de tareas', () => {
  const raw = {
    id: 'uuid-123',
    title: 'Test task',
    description: null,
    status: 'pending',
    priority: 'high',
    assigned_to: null,
    due_date: new Date('2026-12-31'),
    group_id: null,
    subtasks: null,
    comments: null,
    tag_ids: null,
    created_at: new Date(),
    updated_at: new Date(),
  };

  function normalizeTask(t) {
    return {
      id: t.id,
      title: t.title,
      description: t.description || '',
      status: t.status,
      priority: t.priority,
      assignedTo: t.assigned_to || null,
      dueDate: t.due_date ? t.due_date.toISOString().slice(0, 10) : null,
      groupId: t.group_id || null,
      subtasks: t.subtasks || [],
      comments: t.comments || [],
      tagIds: t.tag_ids || [],
    };
  }

  test('normaliza correctamente una tarea raw', () => {
    const result = normalizeTask(raw);
    expect(result.id).toBe('uuid-123');
    expect(result.description).toBe('');
    expect(result.assignedTo).toBeNull();
    expect(result.dueDate).toBe('2026-12-31');
    expect(result.subtasks).toEqual([]);
    expect(result.tagIds).toEqual([]);
  });

  test('prioridades válidas', () => {
    const valid = ['high', 'medium', 'low'];
    valid.forEach(p => expect(valid.includes(p)).toBe(true));
    expect(valid.includes('invalid')).toBe(false);
  });

  test('estados válidos', () => {
    const valid = ['pending', 'in_progress', 'completed'];
    valid.forEach(s => expect(valid.includes(s)).toBe(true));
    expect(valid.includes('done')).toBe(false);
  });
});
