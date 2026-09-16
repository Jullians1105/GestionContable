jest.mock('../../src/config/database');
jest.mock('uuid', () => ({ v4: () => 'mock-uuid' }));

const db = require('../../src/config/database');
const {
  getPosiblesDuplicados, createEmpresa, habilitarModulo, fusionar, descartarDuplicado,
} = require('../../src/controllers/empresasMaestroController');

function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.end = jest.fn().mockReturnValue(res);
  return res;
}

const mockNext = jest.fn();

function baseReq(overrides = {}) {
  return {
    params: {},
    body: {},
    user: { userId: 'user-1', role: 'admin' },
    io: { emit: jest.fn() },
    ...overrides,
  };
}

function mockClient() {
  return { query: jest.fn().mockResolvedValue({ rows: [] }), release: jest.fn() };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('getPosiblesDuplicados', () => {
  test('sugiere dos empresas que comparten una palabra significativa', async () => {
    db.query
      .mockResolvedValueOnce({
        rows: [
          { id: 'a', name: 'CATACAKES PASTELERIA', nit: null },
          { id: 'b', name: 'CATACAKES', nit: null },
          { id: 'c', name: 'ALGO TOTALMENTE DISTINTO', nit: null },
        ],
      })
      .mockResolvedValueOnce({ rows: [] }); // descartados

    const req = baseReq();
    const res = mockRes();
    await getPosiblesDuplicados(req, res, mockNext);

    const sugerencias = res.json.mock.calls[0][0];
    expect(sugerencias).toHaveLength(1);
    expect([sugerencias[0].empresaA.id, sugerencias[0].empresaB.id].sort()).toEqual(['a', 'b']);
    expect(sugerencias[0].motivo).toBe('nombre');
    expect(sugerencias[0].detalle).toContain('CATACAKES');
  });

  // Nombres cortos/genéricos (menos de 3 letras en cada palabra, o solo palabras genéricas
  // como "SAS") no deben inundar de falsos positivos — a diferencia de nombresSeParecen
  // (pensada para "no bloquear"), acá la falta de señal en cualquiera de los dos NO sugiere.
  test('no sugiere cuando a alguna de las dos no le queda ninguna palabra significativa', async () => {
    db.query
      .mockResolvedValueOnce({
        rows: [
          { id: 'a', name: 'GC', nit: null },
          { id: 'b', name: 'CATACAKES PASTELERIA', nit: null },
        ],
      })
      .mockResolvedValueOnce({ rows: [] }); // descartados

    const req = baseReq();
    const res = mockRes();
    await getPosiblesDuplicados(req, res, mockNext);

    expect(res.json.mock.calls[0][0]).toEqual([]);
  });

  test('mismo NIT en dos empresas se sugiere aunque el nombre no se parezca en nada', async () => {
    db.query
      .mockResolvedValueOnce({
        rows: [
          { id: 'a', name: 'RESTAURANTE ITALIANO PORTONOVO', nit: '900123456' },
          { id: 'b', name: 'ALGO TOTALMENTE DISTINTO', nit: '900123456' },
        ],
      })
      .mockResolvedValueOnce({ rows: [] }); // descartados

    const req = baseReq();
    const res = mockRes();
    await getPosiblesDuplicados(req, res, mockNext);

    const sugerencias = res.json.mock.calls[0][0];
    expect(sugerencias).toHaveLength(1);
    expect(sugerencias[0].motivo).toBe('nit');
    expect(sugerencias[0].detalle).toBe('900123456');
  });

  // NIT distinto conocido en ambas es prueba de que NO son la misma empresa — descarta el
  // falso positivo por nombre en vez de solo ignorarlo.
  test('NIT distinto conocido en ambas descarta la sugerencia por nombre parecido', async () => {
    db.query
      .mockResolvedValueOnce({
        rows: [
          { id: 'a', name: 'CATACAKES PASTELERIA', nit: '900111111' },
          { id: 'b', name: 'CATACAKES EVENTOS', nit: '900222222' },
        ],
      })
      .mockResolvedValueOnce({ rows: [] }); // descartados

    const req = baseReq();
    const res = mockRes();
    await getPosiblesDuplicados(req, res, mockNext);

    expect(res.json.mock.calls[0][0]).toEqual([]);
  });

  test('un par ya descartado no se vuelve a sugerir', async () => {
    db.query
      .mockResolvedValueOnce({
        rows: [
          { id: 'a', name: 'CATACAKES PASTELERIA', nit: null },
          { id: 'b', name: 'CATACAKES', nit: null },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ empresa_menor_id: 'a', empresa_mayor_id: 'b' }] });

    const req = baseReq();
    const res = mockRes();
    await getPosiblesDuplicados(req, res, mockNext);

    expect(res.json.mock.calls[0][0]).toEqual([]);
  });
});

describe('descartarDuplicado', () => {
  test('rechaza si falta un id o son iguales', async () => {
    const req = baseReq({ body: { empresaIdA: 'a', empresaIdB: 'a' } });
    const res = mockRes();
    await descartarDuplicado(req, res, mockNext);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(db.query).not.toHaveBeenCalled();
  });

  test('guarda el par ordenado (menor primero) y responde 204', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });

    const req = baseReq({ body: { empresaIdA: 'b', empresaIdB: 'a' } });
    const res = mockRes();
    await descartarDuplicado(req, res, mockNext);

    expect(db.query.mock.calls[0][1]).toEqual(['a', 'b', 'user-1']);
    expect(res.status).toHaveBeenCalledWith(204);
  });
});

describe('createEmpresa', () => {
  test('rechaza nombre vacío antes de tocar la base de datos', async () => {
    const req = baseReq({ body: { name: '   ' } });
    const res = mockRes();
    await createEmpresa(req, res, mockNext);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(db.query).not.toHaveBeenCalled();
  });

  test('crea la empresa maestra en mayúsculas', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ id: 'mock-uuid', name: 'ACME', activa: true }] })
      .mockResolvedValueOnce({ rows: [] }); // audit log

    const req = baseReq({ body: { name: 'acme' } });
    const res = mockRes();
    await createEmpresa(req, res, mockNext);

    expect(db.query.mock.calls[0][1]).toEqual(['mock-uuid', 'ACME']);
    expect(res.status).toHaveBeenCalledWith(201);
  });
});

describe('habilitarModulo', () => {
  test('módulo inválido devuelve 400 sin tocar la base de datos', async () => {
    const req = baseReq({ params: { id: 'empresa-1' }, body: { modulo: 'inventado' } });
    const res = mockRes();
    await habilitarModulo(req, res, mockNext);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('ya habilitada en ese módulo devuelve 409', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ id: 'empresa-1', name: 'ACME' }] }) // empresa existe
      .mockResolvedValueOnce({ rows: [{ id: 'fila-existente' }] }); // ya habilitada

    const req = baseReq({ params: { id: 'empresa-1' }, body: { modulo: 'fondo' } });
    const res = mockRes();
    await habilitarModulo(req, res, mockNext);

    expect(res.status).toHaveBeenCalledWith(409);
  });

  test('habilita insertando en la tabla del módulo con empresa_id', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ id: 'empresa-1', name: 'ACME' }] }) // empresa existe
      .mockResolvedValueOnce({ rows: [] }) // no habilitada todavía
      .mockResolvedValueOnce({ rows: [] }); // audit log

    const client = mockClient();
    db.getClient.mockResolvedValue(client);

    const req = baseReq({ params: { id: 'empresa-1' }, body: { modulo: 'fondo', categoria: 'tributario' } });
    const res = mockRes();
    await habilitarModulo(req, res, mockNext);

    const insertCall = client.query.mock.calls.find(([sql]) => sql.includes('INSERT INTO fondo_empresas'));
    expect(insertCall[1]).toEqual(['mock-uuid', 'ACME', 'tributario', 'empresa-1']);
    expect(res.status).toHaveBeenCalledWith(201);
  });
});

describe('fusionar', () => {
  test('avisa con 409 si las dos empresas tienen el mismo módulo habilitado', async () => {
    db.getClient.mockResolvedValue(mockClient());
    db.query
      .mockResolvedValueOnce({ rows: [{ id: 'a', name: 'ACME' }] })  // empresa A
      .mockResolvedValueOnce({ rows: [{ id: 'b', name: 'ACME SAS' }] }) // empresa B
      // por módulo: fondo (A y B tienen fila -> conflicto), ext/ne/contab sin fila en ninguna
      .mockResolvedValueOnce({ rows: [{ id: 'fa' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'fb' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const req = baseReq({ body: { empresaIdA: 'a', empresaIdB: 'b' } });
    const res = mockRes();
    await fusionar(req, res, mockNext);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json.mock.calls[0][0].conflictos).toEqual(['fondo']);
  });

  test('mueve las habilitaciones de B hacia A y borra B cuando no hay conflicto', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ id: 'a', name: 'ACME' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'b', name: 'ACME SAS' }] })
      // ningún módulo tiene fila en ambas a la vez
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 'fb' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const client = mockClient();
    db.getClient.mockResolvedValue(client);

    const req = baseReq({ body: { empresaIdA: 'a', empresaIdB: 'b' } });
    const res = mockRes();
    await fusionar(req, res, mockNext);

    expect(res.json).toHaveBeenCalledWith({ success: true, empresaId: 'a' });
    expect(client.query).toHaveBeenCalledWith('DELETE FROM empresas WHERE id = $1', ['b']);
  });
});
