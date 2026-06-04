// Tests de funciones helper (sin dependencias de BD)

describe('formatDate helper', () => {
  const formatDate = (dateStr) => {
    if (!dateStr) return '—';
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
    } catch { return dateStr; }
  };

  test('retorna — para null', () => {
    expect(formatDate(null)).toBe('—');
    expect(formatDate(undefined)).toBe('—');
    expect(formatDate('')).toBe('—');
  });

  test('formatea fecha ISO correctamente', () => {
    // Usar fecha sin ambigüedad de timezone: '2026-06-15'
    const result = formatDate('2026-06-15');
    expect(result).toContain('2026');
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(4);
  });
});

describe('isDueDateOverdue helper', () => {
  const isDueDateOverdue = (dateStr) => {
    if (!dateStr) return false;
    return new Date(dateStr) < new Date();
  };

  test('retorna false para null', () => {
    expect(isDueDateOverdue(null)).toBe(false);
  });

  test('detecta fecha vencida', () => {
    expect(isDueDateOverdue('2020-01-01')).toBe(true);
  });

  test('detecta fecha futura no vencida', () => {
    expect(isDueDateOverdue('2099-12-31')).toBe(false);
  });
});

describe('getInitials helper', () => {
  const getInitials = (name = '') =>
    name.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase();

  test('obtiene iniciales de nombre completo', () => {
    expect(getInitials('María García')).toBe('MG');
  });

  test('obtiene iniciales de nombre simple', () => {
    expect(getInitials('Carlos')).toBe('C');
  });

  test('maneja string vacío', () => {
    expect(getInitials('')).toBe('');
  });

  test('toma solo las dos primeras palabras', () => {
    expect(getInitials('Juan Carlos López Martínez')).toBe('JC');
  });
});

describe('Normalización de roles', () => {
  const ROLES = ['admin', 'leader', 'member', 'viewer'];
  const canEdit = (role) => role !== 'viewer';
  const isAdmin = (role) => role === 'admin';
  const isLeader = (role) => ['admin', 'leader'].includes(role);

  test('viewer no puede editar', () => {
    expect(canEdit('viewer')).toBe(false);
    expect(canEdit('member')).toBe(true);
    expect(canEdit('leader')).toBe(true);
    expect(canEdit('admin')).toBe(true);
  });

  test('isAdmin solo para admin', () => {
    expect(isAdmin('admin')).toBe(true);
    ROLES.filter(r => r !== 'admin').forEach(r => expect(isAdmin(r)).toBe(false));
  });

  test('isLeader para admin y leader', () => {
    expect(isLeader('admin')).toBe(true);
    expect(isLeader('leader')).toBe(true);
    expect(isLeader('member')).toBe(false);
    expect(isLeader('viewer')).toBe(false);
  });
});
