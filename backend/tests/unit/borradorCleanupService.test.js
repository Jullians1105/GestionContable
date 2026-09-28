jest.mock('../../src/config/database');

const db = require('../../src/config/database');
const { limpiarBorradoresVencidos } = require('../../src/services/borradorCleanupService');

beforeEach(() => {
  jest.clearAllMocks();
});

describe('limpiarBorradoresVencidos', () => {
  test('borra los borradores vencidos de calculo_borradores y exogenas_borradores', async () => {
    db.query
      .mockResolvedValueOnce({ rowCount: 3 })
      .mockResolvedValueOnce({ rowCount: 1 });

    await limpiarBorradoresVencidos();

    expect(db.query).toHaveBeenCalledTimes(2);
    expect(db.query.mock.calls[0][0]).toMatch(/DELETE FROM calculo_borradores WHERE expires_at < NOW\(\)/);
    expect(db.query.mock.calls[1][0]).toMatch(/DELETE FROM exogenas_borradores WHERE expires_at < NOW\(\)/);
  });

  test('no lanza si ningún borrador estaba vencido', async () => {
    db.query
      .mockResolvedValueOnce({ rowCount: 0 })
      .mockResolvedValueOnce({ rowCount: 0 });

    await expect(limpiarBorradoresVencidos()).resolves.toBeUndefined();
  });

  test('no lanza si falla la consulta — solo se registra el error', async () => {
    db.query.mockRejectedValueOnce(new Error('conexión perdida'));

    await expect(limpiarBorradoresVencidos()).resolves.toBeUndefined();
  });
});
