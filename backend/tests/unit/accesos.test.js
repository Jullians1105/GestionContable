jest.mock('../../src/config/database');

const db = require('../../src/config/database');
const { getAccesos } = require('../../src/controllers/actividadController');
const { clientIp } = require('../../src/utils/clientIp');

function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

const U1 = '11111111-1111-4111-8111-111111111111';
const U2 = '22222222-2222-4222-8222-222222222222';
const U3 = '33333333-3333-4333-8333-333333333333';

// Responde cada consulta según lo que pide, sin depender del orden de Promise.all.
function mockDb() {
  db.query.mockImplementation(async (sql) => {
    if (sql.includes('FROM users WHERE is_active')) {
      return { rows: [{ id: U1, name: 'Ana', role: 'member' }, { id: U2, name: 'Beto', role: 'leader' }, { id: U3, name: 'Caro', role: 'member' }] };
    }
    if (sql.includes("count(*) FILTER (WHERE tipo = 'login')")) {
      return { rows: [
        { user_id: U1, inicios: '2', acciones: '10', dias: '3', horas: '9', primero: '2026-10-08T13:05:00Z', ultimo: '2026-10-08T22:10:00Z' },
        { user_id: U2, inicios: '1', acciones: '0', dias: '1', horas: '2', primero: '2026-10-08T14:00:00Z', ultimo: '2026-10-08T15:00:00Z' },
      ] };
    }
    if (sql.includes('extract(hour FROM')) return { rows: [{ hora: 8, personas: '2' }, { hora: 9, personas: '1' }] };
    if (sql.includes('AS fecha, count(DISTINCT user_id)')) return { rows: [{ fecha: '2026-10-08', personas: '2' }] };
    if (sql.includes('SELECT la.created_at, la.email')) {
      return { rows: [
        { created_at: '2026-10-08T15:00:00Z', email: 'ana@x.co', ip_address: '172.18.0.5', name: 'Ana' },
        { created_at: '2026-10-08T14:00:00Z', email: 'raro@x.co', ip_address: '::ffff:190.1.2.3', name: null },
      ] };
    }
    if (sql.includes('count(*) AS fallidos')) return { rows: [{ user_id: U1, fallidos: '1' }, { user_id: null, fallidos: '4' }] };
    return { rows: [] };
  });
}

beforeEach(() => { jest.clearAllMocks(); mockDb(); });

describe('getAccesos', () => {
  test('valida la fecha y la cantidad de días', async () => {
    const r1 = mockRes();
    await getAccesos({ query: { hasta: 'hoy' } }, r1, jest.fn());
    expect(r1.status).toHaveBeenCalledWith(400);
    const r2 = mockRes();
    await getAccesos({ query: { hasta: '2026-10-08', dias: '5' } }, r2, jest.fn());
    expect(r2.status).toHaveBeenCalledWith(400);
  });

  test('calcula el rango (7 días termina en la fecha pedida, inclusive)', async () => {
    const res = mockRes();
    await getAccesos({ query: { hasta: '2026-10-08', dias: '7' } }, res, jest.fn());
    expect(res.json.mock.calls[0][0]).toMatchObject({ desde: '2026-10-02', hasta: '2026-10-08', dias: 7 });
    expect(db.query.mock.calls[0][1]).toEqual(['2026-10-02', '2026-10-08']);
  });

  test('incluye a quienes no entraron (en cero) y los ordena por uso', async () => {
    const res = mockRes();
    await getAccesos({ query: { hasta: '2026-10-08', dias: '1' } }, res, jest.fn());
    const out = res.json.mock.calls[0][0];
    expect(out.personas.map((p) => p.nombre)).toEqual(['Ana', 'Beto', 'Caro']);
    expect(out.personas[0]).toMatchObject({ iniciosSesion: 2, acciones: 10, diasActivos: 3, horasConectadas: 9, fallidos: 1 });
    expect(out.personas[2]).toMatchObject({ horasConectadas: 0, primerAcceso: null, ultimoAcceso: null });
    expect(out.resumen).toMatchObject({ inicios: 3, fallidos: 5, fallidosCorreoDesconocido: 4, personasActivas: 2, personasTotal: 3 });
    expect(out.porHora).toEqual([{ hora: 8, personas: 2 }, { hora: 9, personas: 1 }]);
    expect(out.porDia).toEqual([{ fecha: '2026-10-08', personas: 2 }]);
  });

  test('oculta las IP internas del proxy y muestra las reales', async () => {
    const res = mockRes();
    await getAccesos({ query: { hasta: '2026-10-08' } }, res, jest.fn());
    const { fallidos } = res.json.mock.calls[0][0];
    expect(fallidos[0]).toMatchObject({ correo: 'ana@x.co', nombre: 'Ana', ip: null });
    expect(fallidos[1]).toMatchObject({ correo: 'raro@x.co', nombre: null, ip: '190.1.2.3' });
  });
});

describe('clientIp', () => {
  test('usa CF-Connecting-IP cuando es una IP válida', () => {
    expect(clientIp({ headers: { 'cf-connecting-ip': '190.1.2.3' }, ip: '172.18.0.1' })).toBe('190.1.2.3');
  });
  test('ignora un encabezado que no es una IP y cae a req.ip', () => {
    expect(clientIp({ headers: { 'cf-connecting-ip': 'no-soy-ip' }, ip: '192.168.1.20' })).toBe('192.168.1.20');
  });
  test('sin encabezado usa req.ip', () => {
    expect(clientIp({ headers: {}, ip: '192.168.1.20' })).toBe('192.168.1.20');
  });
});
