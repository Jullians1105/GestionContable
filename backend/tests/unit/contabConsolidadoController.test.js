jest.mock('../../src/config/database');

const db = require('../../src/config/database');
const { getResumenAnual } = require('../../src/controllers/contabConsolidadoController');

function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

const mockNext = jest.fn();

function baseReq(overrides = {}) {
  return {
    query: { empresaId: 'empresa-1', anio: '2026' },
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('getResumenAnual', () => {
  test('devuelve 12 posiciones, una por mes, con compras/ventas en cero por defecto', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });

    const req = baseReq();
    const res = mockRes();
    await getResumenAnual(req, res, mockNext);

    const porMes = res.json.mock.calls[0][0];
    expect(porMes).toHaveLength(12);
    expect(porMes[0]).toEqual({ mes: 1, compras: { cantidad: 0, base: 0 }, ventas: { cantidad: 0, base: 0 } });
  });

  test('ubica cada fila agrupada en el mes/grupo correcto', async () => {
    db.query.mockResolvedValueOnce({
      rows: [
        { mes: 5, grupo: 'Recibido', cantidad: 3, base: '580240.01' },
        { mes: 6, grupo: 'Emitido', cantidad: 2, base: '3114500' },
      ],
    });

    const req = baseReq();
    const res = mockRes();
    await getResumenAnual(req, res, mockNext);

    const porMes = res.json.mock.calls[0][0];
    expect(porMes[4].compras).toEqual({ cantidad: 3, base: 580240.01 });
    expect(porMes[5].ventas).toEqual({ cantidad: 2, base: 3114500 });
    expect(porMes[4].ventas).toEqual({ cantidad: 0, base: 0 });
  });

  test('sin empresaId o anio responde 400 sin consultar la base', async () => {
    const req = baseReq({ query: { empresaId: 'empresa-1' } });
    const res = mockRes();
    await getResumenAnual(req, res, mockNext);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(db.query).not.toHaveBeenCalled();
  });
});
