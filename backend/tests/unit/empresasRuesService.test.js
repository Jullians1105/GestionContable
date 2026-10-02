jest.mock('../../src/config/database');
jest.mock('../../src/utils/logger', () => ({ warn: jest.fn(), info: jest.fn(), error: jest.fn(), debug: jest.fn() }));
// Nunca pegarle al RUES real desde los tests: solo se simula la consulta de red.
jest.mock('../../src/services/terceros/ruesService', () => ({
  ...jest.requireActual('../../src/services/terceros/ruesService'),
  consultarRues: jest.fn(),
  fechaActualizacionFuente: jest.fn(),
}));

const db = require('../../src/config/database');
const { consultarRues, fechaActualizacionFuente } = require('../../src/services/terceros/ruesService');
const { verificarEmpresas, verificarEnSegundoPlano, estaEnCurso } = require('../../src/services/empresasRuesService');

const encontrado = (extra = {}) => ({
  consulta: 'encontrado',
  datos: { estado: 'ACTIVA', ultimoAnoRenovado: 2026, fechaRenovacion: '2026-03-17', ...extra },
});

const FOTO = new Date('2026-09-04T19:15:35Z');

beforeEach(() => {
  db.query.mockReset();
  consultarRues.mockReset();
  fechaActualizacionFuente.mockReset().mockResolvedValue(FOTO);
});

describe('verificarEmpresas', () => {
  test('consulta una vez por documento y actualiza solo las columnas rues_*', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ id: 'e1', nit: '900.123.456' }, { id: 'e2', nit: '811222333' }] }) // SELECT
      .mockResolvedValue({ rows: [] }); // UPDATEs
    consultarRues.mockResolvedValue(new Map([
      ['900123456', encontrado()],
      ['811222333', { consulta: 'no_encontrado' }],
    ]));

    const r = await verificarEmpresas();

    expect(consultarRues).toHaveBeenCalledWith(['900123456', '811222333']);
    expect(r).toEqual({
      pendientes: 2, verificadas: 1, noEncontradas: 1, errores: 0, sinDocumento: 0,
      fuenteActualizadaAl: '2026-09-04T19:15:35.000Z',
    });
    const updates = db.query.mock.calls.slice(1).map(([sql]) => sql);
    expect(updates).toHaveLength(2);
    updates.forEach((sql) => {
      expect(sql).toMatch(/UPDATE empresas SET/);
      expect(sql).not.toMatch(/\bname\s*=|\bnit\s*=|tipo_contribuyente\s*=/); // nunca toca la identidad
    });
    expect(db.query.mock.calls[1][1]).toEqual([['e1'], 'ACTIVA', 2026, '2026-03-17']);
  });

  test('dos empresas con el mismo documento se consultan una vez y se actualizan juntas', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ id: 'e1', nit: '900123456' }, { id: 'e2', nit: '900123456' }] })
      .mockResolvedValue({ rows: [] });
    consultarRues.mockResolvedValue(new Map([['900123456', encontrado()]]));
    const r = await verificarEmpresas();
    expect(consultarRues).toHaveBeenCalledWith(['900123456']);
    expect(db.query.mock.calls[1][1][0]).toEqual(['e1', 'e2']);
    expect(r.verificadas).toBe(2);
  });

  test('un error del RUES no se guarda (no pisa el dato anterior) y se cuenta', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ id: 'e1', nit: '900123456' }] });
    consultarRues.mockResolvedValue(new Map([['900123456', { consulta: 'error' }]]));
    const r = await verificarEmpresas();
    expect(r).toMatchObject({ errores: 1, verificadas: 0 });
    expect(db.query).toHaveBeenCalledTimes(1); // solo el SELECT
  });

  test('documentos que no se pueden consultar (ceros, muy cortos) se cuentan aparte y no se envían', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ id: 'e1', nit: '0000000000' }, { id: 'e2', nit: '123' }] });
    const r = await verificarEmpresas();
    expect(consultarRues).not.toHaveBeenCalled();
    expect(r).toMatchObject({ pendientes: 2, sinDocumento: 2 });
  });

  test('sin empresas pendientes no consulta nada', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    const r = await verificarEmpresas();
    expect(consultarRues).not.toHaveBeenCalled();
    expect(r.pendientes).toBe(0);
  });

  test('solo consulta a las empresas nunca verificadas o verificadas ANTES de la última foto del RUES', async () => {
    db.query.mockResolvedValue({ rows: [] });
    await verificarEmpresas();
    // límite = fecha de la foto: lo verificado después de ella ya está al día, volver a preguntar daría lo mismo
    expect(db.query.mock.calls[0][1]).toEqual([null, false, FOTO]);
    expect(db.query.mock.calls[0][0]).toMatch(/rues_consultado_at IS NULL OR rues_consultado_at < \$3::timestamptz/);
    expect(db.query.mock.calls[0][0]).toMatch(/WHERE activa/); // solo empresas activas
  });

  test('si no se puede saber la fecha de la foto, cae al criterio de 7 días', async () => {
    fechaActualizacionFuente.mockResolvedValue(null);
    db.query.mockResolvedValue({ rows: [] });
    const antes = Date.now();
    const r = await verificarEmpresas();
    const limite = db.query.mock.calls[0][1][2];
    expect(limite).toBeInstanceOf(Date);
    const dias = (antes - limite.getTime()) / 86400000;
    expect(dias).toBeGreaterThan(6.99);
    expect(dias).toBeLessThan(7.01);
    expect(r.fuenteActualizadaAl).toBeNull();
  });

  test('con forzar o ids no hace falta preguntar la fecha de la foto', async () => {
    db.query.mockResolvedValue({ rows: [] });
    await verificarEmpresas({ ids: ['e1'], forzar: true });
    expect(fechaActualizacionFuente).not.toHaveBeenCalled();
    expect(db.query.mock.calls[0][1].slice(0, 2)).toEqual([['e1'], true]);
  });

  test('no permite dos verificaciones a la vez (EN_CURSO) y se libera al terminar, incluso con error', async () => {
    let liberar;
    db.query.mockReturnValueOnce(new Promise((resolve) => { liberar = resolve; }));
    const primera = verificarEmpresas();
    expect(estaEnCurso()).toBe(true);
    await expect(verificarEmpresas()).rejects.toMatchObject({ codigo: 'EN_CURSO' });
    liberar({ rows: [] });
    await primera;
    expect(estaEnCurso()).toBe(false);

    db.query.mockRejectedValueOnce(new Error('boom'));
    await expect(verificarEmpresas()).rejects.toThrow('boom');
    expect(estaEnCurso()).toBe(false);
  });
});

describe('verificarEnSegundoPlano', () => {
  test('no lanza aunque la verificación falle', async () => {
    db.query.mockRejectedValueOnce(new Error('boom'));
    expect(() => verificarEnSegundoPlano({ ids: ['e1'] })).not.toThrow();
    await new Promise((resolve) => setImmediate(resolve));
    expect(estaEnCurso()).toBe(false);
  });
});
