jest.mock('../../src/config/database');

const db = require('../../src/config/database');
const { clasificarEvento } = require('../../src/utils/actividadDescripcion');
const { getActividad } = require('../../src/controllers/actividadController');

const E1 = '7bd9f4c5-de9c-4f5e-82e1-c5d61bbc4b6e';
const E2 = '8cd9f4c5-de9c-4f5e-82e1-c5d61bbc4b6e';
const P1 = '5cbefc65-f9f0-4569-baf4-51c83d9fb362';

function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

beforeEach(() => jest.clearAllMocks());

describe('clasificarEvento', () => {
  const nombres = { fondoEmp: { [E1]: 'ACME' }, fondoProc: { [P1]: 'Ventas' }, neEmp: { [E1]: 'ACME' } };

  test('proceso de checklist: nombre, estado, empresa y casilla', () => {
    const r = clasificarEvento({ action: 'UPDATE', table_name: 'fondo_checklist_items', changes: { empresaId: E1, procesoId: P1, estado: 'done', mes: 9, anio: 2026 } }, nombres);
    expect(r).toMatchObject({ item: 'Ventas', estadoClave: 'hecho', empresa: 'ACME' });
    expect(r.clave).toBe(`${E1}|${P1}|2026-9`);
  });

  test('estados de nómina electrónica se agrupan en los mismos cuatro', () => {
    const base = { action: 'UPDATE', table_name: 'ne_meses' };
    const est = (changes) => clasificarEvento({ ...base, changes: { empresaId: E1, mes: 9, anio: 2026, ...changes } }, nombres).estadoClave;
    expect(est({ estado: 'presentada' })).toBe('hecho');
    expect(est({ estado: 'no_aplica' })).toBe('noaplica');
    expect(est({ estado: 'pendiente', autorizada: true })).toBe('proceso');
    expect(est({ estado: 'pendiente', autorizada: false })).toBe('pendiente');
  });

  test('acciones sin estado (claves DIAN, tokens, tareas) solo cuentan cambios', () => {
    expect(clasificarEvento({ action: 'READ', table_name: 'dian_clave', changes: {} })).toMatchObject({ item: 'Abrir pantallas con claves DIAN a la vista', estadoClave: null, clave: null });
    expect(clasificarEvento({ action: 'CREATE', table_name: 'dian_token', changes: {} }).item).toBe('Generar token DIAN');
    expect(clasificarEvento({ action: 'UPDATE', table_name: 'tasks', changes: { status: { to: 'completed' } } }).item).toBe('Cambiar el estado de una tarea');
  });
});

describe('getActividad → resumen por persona', () => {
  const item = (id, estado, empresaId, hora) => ({
    id, user_id: 'u1', user_name: 'Laura', action: 'UPDATE', table_name: 'fondo_checklist_items', record_id: 'x',
    changes: { empresaId, procesoId: P1, estado, mes: 9, anio: 2026 }, created_at: `2026-10-08T${hora}:00Z`,
  });

  test('cuenta por empresa el ÚLTIMO estado del día y todos los cambios', async () => {
    // Del más reciente al más antiguo (como llega de la base): E1 quedó "done" tras pasar por "na" y "done".
    db.query.mockImplementation(async (sql) => {
      if (sql.includes('FROM audit_log')) {
        return { rows: [
          item('4', 'done', E1, '16'),
          item('3', 'na', E1, '15'),
          item('2', 'done', E1, '14'),
          item('1', 'in_progress', E2, '13'),
          { id: '0', user_id: 'u1', user_name: 'Laura', action: 'READ', table_name: 'dian_clave', record_id: 'todas', changes: { cantidad: 3 }, created_at: '2026-10-08T12:00:00Z' },
        ] };
      }
      if (sql.includes('FROM fondo_empresas')) return { rows: [{ id: E1, name: 'ACME' }, { id: E2, name: 'BETA' }] };
      if (sql.includes('FROM fondo_procesos')) return { rows: [{ id: P1, name: 'Ventas' }] };
      return { rows: [] };
    });
    const res = mockRes();
    await getActividad({ query: { fecha: '2026-10-08' } }, res, jest.fn());

    const laura = res.json.mock.calls[0][0].usuarios[0];
    expect(laura.resumen).toMatchObject({ cambios: 5, empresas: 2, hecho: 1, proceso: 1, noaplica: 0, pendiente: 0 });
    const ventas = laura.resumen.items.find((i) => i.item === 'Ventas');
    expect(ventas).toMatchObject({ area: 'Fondo Emprender', hecho: 1, proceso: 1, empresas: 2, cambios: 4 });
    const claves = laura.resumen.items.find((i) => i.item === 'Abrir pantallas con claves DIAN a la vista');
    expect(claves).toMatchObject({ area: 'Claves DIAN', cambios: 1, empresas: 0, hecho: 0 });
    // la clasificación interna no viaja en los eventos
    expect(laura.eventos[0]).not.toHaveProperty('clasificacion');
  });
});
