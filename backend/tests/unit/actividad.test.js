jest.mock('../../src/config/database');

const db = require('../../src/config/database');
const { describirEvento } = require('../../src/utils/actividadDescripcion');
const { requireActividad } = require('../../src/middleware/actividadAccess');
const { getActividad } = require('../../src/controllers/actividadController');

const EMP = '7bd9f4c5-de9c-4f5e-82e1-c5d61bbc4b6e';
const PROC = '5cbefc65-f9f0-4569-baf4-51c83d9fb362';

function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

beforeEach(() => jest.clearAllMocks());

describe('describirEvento', () => {
  test('checklist de Externas: empresa, proceso, estado y mes con nombres', () => {
    const r = describirEvento(
      { action: 'UPDATE', table_name: 'ext_checklist_items', record_id: 'x', changes: { empresaId: EMP, procesoId: PROC, estado: 'done', mes: 9, anio: 2026, nota: null } },
      { extEmp: { [EMP]: 'ACME SAS' }, extProc: { [PROC]: 'Declaración de IVA' } }
    );
    expect(r.area).toBe('Empresas Externas');
    expect(r.texto).toBe('ACME SAS: Declaración de IVA → Realizado (septiembre 2026)');
  });

  test('incluye la nota cuando existe y cae a "una empresa" si el nombre ya no existe', () => {
    const r = describirEvento(
      { action: 'UPDATE', table_name: 'fondo_checklist_items', changes: { empresaId: EMP, procesoId: PROC, estado: 'na', mes: 9, anio: 2026, nota: 'SALDO A FAVOR' } },
      {}
    );
    expect(r.texto).toBe('una empresa: un proceso → No aplica (septiembre 2026) — nota: «SALDO A FAVOR»');
  });

  test('claves DIAN: nunca muestra contenido, solo la acción y la cantidad', () => {
    const r = describirEvento({ action: 'READ', table_name: 'dian_clave', changes: { cantidad: 12, clave: 'secreta' } });
    expect(r.texto).toBe('Abrió una pantalla con las claves DIAN a la vista (Directorio o Deudas DIAN) — se cargaron 12 claves');
    expect(r.texto).not.toContain('secreta');
  });

  test('token DIAN fallido se distingue del exitoso', () => {
    expect(describirEvento({ action: 'CREATE', table_name: 'dian_token', changes: { success: false } }).texto).toMatch(/no se pudo/);
    expect(describirEvento({ action: 'CREATE', table_name: 'dian_token', changes: { success: true } }).texto).toBe('Generó un token DIAN');
  });

  test('nómina electrónica: estados legibles', () => {
    const base = { action: 'UPDATE', table_name: 'ne_meses' };
    expect(describirEvento({ ...base, changes: { empresaId: EMP, estado: 'presentada', mes: 9, anio: 2026 } }, { neEmp: { [EMP]: 'ACME' } }).texto).toContain('→ Presentada');
    expect(describirEvento({ ...base, changes: { empresaId: EMP, estado: 'no_aplica', mes: 9, anio: 2026 } }).texto).toContain('→ En espera');
    expect(describirEvento({ ...base, changes: { empresaId: EMP, estado: 'pendiente', autorizada: true, mes: 9, anio: 2026 } }).texto).toContain('→ Autorizada');
  });

  test('"vigente desde" de una empresa se describe con mes y año', () => {
    const r = describirEvento(
      { action: 'UPDATE', table_name: 'ne_empresas', record_id: EMP, changes: { vigenteDesdeAnio: 2026, vigenteDesdeMes: 9 } },
      { neEmp: { [EMP]: 'ACME' } }
    );
    expect(r.texto).toBe('Fijó el inicio de ACME en Nómina Electrónica: septiembre 2026');
  });

  test('tabla desconocida usa una descripción genérica en vez de fallar', () => {
    expect(describirEvento({ action: 'UPDATE', table_name: 'otra_tabla', changes: {} }).texto).toBe('Actualizó en otra_tabla');
  });
});

describe('requireActividad', () => {
  const next = jest.fn();
  test('admin pasa sin consultar permisos', async () => {
    await requireActividad({ user: { userId: 'u', role: 'admin' } }, mockRes(), next);
    expect(next).toHaveBeenCalledWith();
    expect(db.query).not.toHaveBeenCalled();
  });

  test('viewer siempre se bloquea', async () => {
    const res = mockRes();
    await requireActividad({ user: { userId: 'u', role: 'viewer' } }, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  test('líder sin el permiso se bloquea; con permiso pasa', async () => {
    const sin = mockRes();
    db.query.mockResolvedValueOnce({ rows: [{ permissions: {} }] });
    await requireActividad({ user: { userId: 'u', role: 'leader' } }, sin, next);
    expect(sin.status).toHaveBeenCalledWith(403);

    next.mockClear();
    db.query.mockResolvedValueOnce({ rows: [{ permissions: { modulos: { actividad: { canVer: true } } } }] });
    await requireActividad({ user: { userId: 'u', role: 'leader' } }, mockRes(), next);
    expect(next).toHaveBeenCalledWith();
  });
});

describe('getActividad', () => {
  test('fecha inválida devuelve 400', async () => {
    const res = mockRes();
    await getActividad({ query: { fecha: '08/10/2026' } }, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('agrupa por persona, cuenta por área y traduce nombres', async () => {
    const mk = (id, uid, uname, table, changes) => ({ id, user_id: uid, user_name: uname, action: 'UPDATE', table_name: table, record_id: 'r', changes, created_at: '2026-10-08T15:41:00Z' });
    db.query
      .mockResolvedValueOnce({
        rows: [
          mk('1', 'u1', 'Ruben', 'ext_checklist_items', { empresaId: EMP, procesoId: PROC, estado: 'done', mes: 9, anio: 2026 }),
          mk('2', 'u1', 'Ruben', 'ext_checklist_items', { empresaId: EMP, procesoId: PROC, estado: 'na', mes: 9, anio: 2026 }),
          mk('3', 'u2', 'Karen', 'tasks', { title: 'Llamar al cliente' }),
        ],
      })
      .mockResolvedValue({ rows: [] }); // consultas de nombres
    const res = mockRes();
    await getActividad({ query: { fecha: '2026-10-08' } }, res, jest.fn());

    const out = res.json.mock.calls[0][0];
    expect(out.total).toBe(3);
    expect(out.usuarios[0]).toMatchObject({ nombre: 'Ruben', total: 2, areas: { 'Empresas Externas': 2 } });
    expect(out.usuarios[1].eventos[0].texto).toContain('Llamar al cliente');
    const sql = db.query.mock.calls[0][0];
    expect(sql).toContain("AT TIME ZONE 'America/Bogota'");
    expect(db.query.mock.calls[0][1]).toEqual(['2026-10-08']);
  });
});
