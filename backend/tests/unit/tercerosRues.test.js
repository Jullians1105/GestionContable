jest.mock('../../src/config/database');
jest.mock('../../src/utils/auditLog', () => jest.fn().mockResolvedValue());
// Nunca pegarle al RUES real desde los tests: se conserva la lógica pura y solo se simula la red.
jest.mock('../../src/services/terceros/ruesService', () => ({
  ...jest.requireActual('../../src/services/terceros/ruesService'),
  consultarRues: jest.fn(),
}));

const db = require('../../src/config/database');
const auditLog = require('../../src/utils/auditLog');
const { consultarRues } = require('../../src/services/terceros/ruesService');
const {
  verificarRuesLote, calcularAlertas, origenDe,
} = require('../../src/controllers/tercerosController');

function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

const ANIO = 2026;

describe('origenDe', () => {
  test('pdf, rues o ambos según haya factura y/o verificación del RUES', () => {
    expect(origenDe({ tiene_pdf: true, rues_consulta: null })).toBe('pdf');
    expect(origenDe({ tiene_pdf: true, rues_consulta: 'no_encontrado' })).toBe('pdf');
    expect(origenDe({ tiene_pdf: true, rues_consulta: 'encontrado' })).toBe('ambos');
    expect(origenDe({ tiene_pdf: false, rues_consulta: 'encontrado' })).toBe('rues');
  });
});

describe('calcularAlertas', () => {
  const base = {
    tiene_pdf: true, razon_social: 'EMPRESA UNO', rues_consulta: 'encontrado',
    rues_razon_social: 'EMPRESA UNO SAS', rues_estado: 'ACTIVA', rues_ultimo_ano_renovado: 2026,
  };

  test('una empresa activa, renovada y con el mismo nombre no genera alertas', () => {
    expect(calcularAlertas(base, ANIO)).toEqual([]);
  });

  test('matrícula cancelada es alerta roja', () => {
    const a = calcularAlertas({ ...base, rues_estado: 'CANCELADA', rues_ultimo_ano_renovado: 2020 }, ANIO);
    expect(a.map((x) => x.codigo)).toEqual(['matricula_cancelada']);
    expect(a[0].nivel).toBe('rojo');
  });

  test('"cancelada por traslado de domicilio" NO es alerta: la empresa solo cambió de cámara', () => {
    const a = calcularAlertas({ ...base, rues_estado: 'MATRÍCULA CANCELADA POR TRASLADO DE DOMICILIO' }, ANIO);
    expect(a).toEqual([]);
  });

  test('activa pero sin renovar hace más de un año es alerta ámbar; renovada el año pasado no', () => {
    expect(calcularAlertas({ ...base, rues_ultimo_ano_renovado: 2024 }, ANIO).map((x) => x.codigo))
      .toEqual(['sin_renovar']);
    expect(calcularAlertas({ ...base, rues_ultimo_ano_renovado: 2025 }, ANIO)).toEqual([]);
  });

  test('nombre de factura sin nada en común con el del RUES es alerta ámbar (nombre de establecimiento)', () => {
    const a = calcularAlertas(
      { ...base, razon_social: 'TECNILED SOGAMOSO', rues_razon_social: 'MARTHA LUCIA ULLOA TORRES' }, ANIO,
    );
    expect(a.map((x) => x.codigo)).toEqual(['nombre_distinto']);
  });

  test('el orden de apellidos y nombres no cuenta como diferencia', () => {
    const a = calcularAlertas(
      { ...base, razon_social: 'VALERIA SEGURA DIAZ', rues_razon_social: 'SEGURA  DIAZ VALERIA' }, ANIO,
    );
    expect(a).toEqual([]);
  });

  test('un tercero solo-RUES no genera alerta de nombre (no hay nombre de factura)', () => {
    expect(calcularAlertas({ ...base, tiene_pdf: false }, ANIO)).toEqual([]);
  });

  test('no encontrado en el RUES es aviso gris; sin verificar no avisa nada', () => {
    expect(calcularAlertas({ rues_consulta: 'no_encontrado' }, ANIO).map((x) => x.nivel)).toEqual(['gris']);
    expect(calcularAlertas({ rues_consulta: null }, ANIO)).toEqual([]);
  });
});

describe('verificarRuesLote', () => {
  beforeEach(() => {
    db.query.mockReset();
    consultarRues.mockReset();
  });

  test('verifica los pendientes y devuelve el conteo; un error de red no se guarda', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ nit: '111111111' }, { nit: '222222222' }, { nit: '333333333' }] })
      .mockResolvedValue({ rows: [{ nit: 'x' }] });
    consultarRues.mockResolvedValue(new Map([
      ['111111111', {
        consulta: 'encontrado',
        datos: { razonSocial: 'A', estado: 'ACTIVA', ciiu: null, representanteLegal: null, organizacionJuridica: null, ultimoAnoRenovado: 2026 },
      }],
      ['222222222', { consulta: 'no_encontrado' }],
      ['333333333', { consulta: 'error' }],
    ]));
    const res = mockRes();
    await verificarRuesLote({ body: {}, user: { userId: 'u1' } }, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ pendientes: 3, verificados: 1, noEncontrados: 1, errores: 1, omitidos: 0 });
    expect(auditLog).toHaveBeenCalledWith('u1', 'UPDATE', 'terceros_rues', 'lote');
    expect(db.query).toHaveBeenCalledTimes(3); // 1 SELECT + 2 UPDATE (el error no escribe)
  });

  test('rechaza una segunda ejecución mientras otra sigue en curso', async () => {
    let liberar;
    db.query.mockReturnValueOnce(new Promise((resolve) => { liberar = resolve; }));
    consultarRues.mockResolvedValue(new Map());
    const primera = verificarRuesLote({ body: {} }, mockRes(), jest.fn());
    const res2 = mockRes();
    await verificarRuesLote({ body: {} }, res2, jest.fn());
    expect(res2.status).toHaveBeenCalledWith(409);
    liberar({ rows: [] });
    await primera;
  });
});
