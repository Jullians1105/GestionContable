jest.mock('../../src/config/database');
jest.mock('../../src/services/auditService', () => ({ auditLog: jest.fn() }), { virtual: true });

const db = require('../../src/config/database');
const { joinMesPrevio } = require('../../src/utils/nominaElectronicaArrastre');
const { getMesTodasEmpresas } = require('../../src/controllers/neMesesController');

beforeEach(() => jest.clearAllMocks());

describe('vigente_desde (migración 068)', () => {
  test('el arrastre de "en espera" no mira meses anteriores al ingreso de la empresa', () => {
    const sql = joinMesPrevio('$1', '$2');
    expect(sql).toContain('e.vigente_desde_anio IS NULL');
    expect(sql).toContain('(pm.anio * 100 + pm.mes) >= (e.vigente_desde_anio * 100 + e.vigente_desde_mes)');
  });

  test('respeta el alias de la empresa (celdas de Fondo/Externas usan "ne")', () => {
    const sql = joinMesPrevio('$2', '$3', { emp: 'ne', mes: 'nm', prev: 'nmp' });
    expect(sql).toContain('ne.vigente_desde_anio IS NULL');
  });

  test('Nómina Electrónica no lista la empresa en meses anteriores a su vigente_desde', async () => {
    db.query.mockResolvedValue({ rows: [] });
    const res = { json: jest.fn() };
    await getMesTodasEmpresas({ query: { anio: '2026', mes: '8' }, user: { userId: 'u' } }, res, jest.fn());
    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toContain('e.vigente_desde_anio IS NULL OR (e.vigente_desde_anio * 100 + e.vigente_desde_mes) <= ($1::int * 100 + $2::int)');
    expect(params.slice(0, 2)).toEqual([2026, 8]);
  });
});
