jest.mock('../../src/utils/logger', () => ({ warn: jest.fn(), info: jest.fn(), error: jest.fn(), debug: jest.fn() }));

const {
  consultarRues, normalizarDocumento, clasificarEstado, elegirRegistro, TAMANO_LOTE,
} = require('../../src/services/terceros/ruesService');

const fila = (extra = {}) => ({
  numero_identificacion: '900123456', razon_social: 'EMPRESA EJEMPLO SAS', estado_matricula: 'ACTIVA',
  codigo_categoria_matricula: '01', ultimo_ano_renovado: '2026', cod_ciiu_act_econ_pri: '4711',
  organizacion_juridica: 'SAS', representante_legal: ' JUAN PEREZ ',
  num_identificacion_representante_legal: '70563173', clase_identificacion_rl: 'CEDULA DE CIUDADANIA', ...extra,
});
const respuesta = (cuerpo, { ok = true, status = 200 } = {}) => ({ ok, status, json: async () => cuerpo });

describe('normalizarDocumento', () => {
  test('deja solo dígitos', () => {
    expect(normalizarDocumento('901.939.874')).toBe('901939874');
  });
  test('descarta vacíos, ceros, demasiado cortos o largos', () => {
    expect(normalizarDocumento('')).toBeNull();
    expect(normalizarDocumento(null)).toBeNull();
    expect(normalizarDocumento('0000000000000')).toBeNull(); // el dataset tiene cientos de miles así
    expect(normalizarDocumento('1234')).toBeNull();
    expect(normalizarDocumento('1'.repeat(16))).toBeNull();
  });
  test('una consulta con letras o comillas queda reducida a dígitos (no se puede inyectar SoQL)', () => {
    // Solo sobreviven los dígitos: las comillas, paréntesis y palabras se pierden.
    expect(normalizarDocumento("900123456') OR ('1'='1")).toBe('90012345611');
    expect(normalizarDocumento("900123456'; DROP")).toBe('900123456');
  });
});

describe('clasificarEstado', () => {
  test.each([
    ['ACTIVA', 'activa'],
    ['MATRÍCULA NUEVA, CONSTITUCIÓN POR TRASLADO', 'activa'],
    ['CANCELADA', 'cancelada'],
    ['MATRÍCULA CANCELADA LEY 1429', 'cancelada'],
    ['MATRÍCULA CANCELADA POR TRASLADO DE DOMICILIO', 'otro'],
    ['NO ASIGNADO', 'otro'],
    [undefined, 'otro'],
  ])('%s -> %s', (estado, esperado) => {
    expect(clasificarEstado(estado)).toBe(esperado);
  });
});

describe('elegirRegistro', () => {
  test('prefiere la matrícula activa y principal sobre sucursales y canceladas', () => {
    const elegido = elegirRegistro([
      fila({ razon_social: 'CANCELADA VIEJA', estado_matricula: 'CANCELADA', ultimo_ano_renovado: '2019' }),
      fila({ razon_social: 'SUCURSAL', codigo_categoria_matricula: '02' }),
      fila({ razon_social: 'PRINCIPAL' }),
    ]);
    expect(elegido.razon_social).toBe('PRINCIPAL');
  });
  test('si no hay activas, toma la renovada más recientemente', () => {
    const elegido = elegirRegistro([
      fila({ razon_social: 'A', estado_matricula: 'CANCELADA', ultimo_ano_renovado: '2015' }),
      fila({ razon_social: 'B', estado_matricula: 'CANCELADA', ultimo_ano_renovado: '2021' }),
    ]);
    expect(elegido.razon_social).toBe('B');
  });
  test('ignora registros sin razón social y devuelve null si no queda ninguno', () => {
    expect(elegirRegistro([fila({ razon_social: '' })])).toBeNull();
    expect(elegirRegistro([])).toBeNull();
  });
});

describe('consultarRues', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });
  afterAll(() => {
    delete global.fetch;
  });

  test('devuelve los datos del RUES por documento y no_encontrado para los que no aparecen', async () => {
    global.fetch.mockResolvedValue(respuesta([fila()]));
    const r = await consultarRues(['900.123.456', '811222333']);
    expect(r.get('900123456')).toEqual({
      consulta: 'encontrado',
      datos: {
        razonSocial: 'EMPRESA EJEMPLO SAS', estado: 'ACTIVA', ciiu: '4711',
        representanteLegal: 'JUAN PEREZ', organizacionJuridica: 'SAS', ultimoAnoRenovado: 2026,
        representanteDocumento: '70563173', representanteTipoDocumento: 'CEDULA DE CIUDADANIA',
      },
    });
    expect(r.get('811222333')).toEqual({ consulta: 'no_encontrado' });
  });

  test('el documento del representante queda en null si el RUES no lo tiene o viene en ceros', async () => {
    global.fetch.mockResolvedValue(respuesta([
      fila({ num_identificacion_representante_legal: '000000000', clase_identificacion_rl: undefined }),
    ]));
    const r = await consultarRues(['900123456']);
    expect(r.get('900123456').datos).toMatchObject({ representanteDocumento: null, representanteTipoDocumento: null });
  });

  test('pide al RUES los campos del documento del representante legal', async () => {
    global.fetch.mockResolvedValue(respuesta([]));
    await consultarRues(['900123456']);
    const url = decodeURIComponent(global.fetch.mock.calls[0][0]);
    expect(url).toContain('num_identificacion_representante_legal');
    expect(url).toContain('clase_identificacion_rl');
  });

  test('hace una sola consulta por lote, solo con dígitos, y omite documentos inválidos', async () => {
    global.fetch.mockResolvedValue(respuesta([]));
    const r = await consultarRues(['900123456', '900123456', '0000000000000', 'abc']);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    const url = decodeURIComponent(global.fetch.mock.calls[0][0].replace(/\+/g, ' '));
    expect(url).toContain("numero_identificacion in('900123456')");
    expect(r.size).toBe(1);
  });

  test('parte las consultas en lotes', async () => {
    global.fetch.mockResolvedValue(respuesta([]));
    const docs = Array.from({ length: TAMANO_LOTE + 5 }, (_, i) => String(900000000 + i));
    await consultarRues(docs);
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  test('si el servicio falla marca "error" sin lanzar excepción, tras un reintento', async () => {
    global.fetch.mockResolvedValue(respuesta({}, { ok: false, status: 503 }));
    const r = await consultarRues(['900123456']);
    expect(r.get('900123456')).toEqual({ consulta: 'error' });
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  test('un error 4xx no se reintenta', async () => {
    global.fetch.mockResolvedValue(respuesta({}, { ok: false, status: 400 }));
    const r = await consultarRues(['900123456']);
    expect(r.get('900123456')).toEqual({ consulta: 'error' });
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  test('una respuesta que no es una lista cuenta como error', async () => {
    global.fetch.mockResolvedValue(respuesta({ error: true }));
    const r = await consultarRues(['900123456']);
    expect(r.get('900123456')).toEqual({ consulta: 'error' });
  });

  test('un fallo de red en un lote no afecta a los demás', async () => {
    const docs = Array.from({ length: TAMANO_LOTE + 1 }, (_, i) => String(900000000 + i));
    global.fetch
      .mockRejectedValueOnce(new Error('network')) // lote 1, intento 1
      .mockRejectedValueOnce(new Error('network')) // lote 1, reintento
      .mockResolvedValueOnce(respuesta([])); // lote 2
    const r = await consultarRues(docs);
    expect(r.get(docs[0])).toEqual({ consulta: 'error' });
    expect(r.get(docs[TAMANO_LOTE])).toEqual({ consulta: 'no_encontrado' });
  });
});
