jest.mock('../../src/config/database');
jest.mock('uuid', () => ({ v4: () => 'mock-uuid' }));
jest.mock('../../src/services/dianTokenService');

const db = require('../../src/config/database');
const dianTokenService = require('../../src/services/dianTokenService');
const {
  getDirectorio, getPosiblesDuplicados, createEmpresa, updateEmpresa, habilitarModulo,
  deshabilitarModulo, fusionar, descartarDuplicado, generarTokenDian,
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

describe('getDirectorio', () => {
  test('arma el mapa de módulos habilitados a partir del join', async () => {
    db.query.mockResolvedValueOnce({
      rows: [
        {
          id: 'a', name: 'ACME', nit: '900123456', tipo_contribuyente: 'empresa', cedula_representante: '111',
          activa: true, created_at: '2026-01-01', updated_at: '2026-01-01',
          fondo_id: 'f1', fondo_categoria: 'contable', fondo_monthly_fee: '150000',
          ext_id: null, ext_responsable_id: null,
          ne_id: null, ne_responsable_id: null,
          contab_id: null, contab_nit: null,
        },
      ],
    });

    const req = baseReq();
    const res = mockRes();
    await getDirectorio(req, res, mockNext);

    const [empresa] = res.json.mock.calls[0][0];
    expect(empresa.modulos.fondo).toEqual({ id: 'f1', categoria: 'contable', monthlyFee: 150000, vigenteHastaAnio: null, vigenteHastaMes: null });
    expect(empresa.modulos.ext).toBeNull();
  });
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

describe('updateEmpresa', () => {
  test('renombrar cascada el nombre nuevo a las 4 tablas de módulo', async () => {
    const client = mockClient();
    client.query.mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [{ id: 'empresa-1', name: 'ACME SAS', activa: true }] }) // UPDATE empresas
      .mockResolvedValue({ rows: [] }); // UPDATE de cada tabla de módulo + COMMIT
    db.getClient.mockResolvedValue(client);
    db.query.mockResolvedValueOnce({ rows: [] }); // audit log

    const req = baseReq({ params: { id: 'empresa-1' }, body: { name: 'acme sas' } });
    const res = mockRes();
    await updateEmpresa(req, res, mockNext);

    const updatesDeModulo = client.query.mock.calls.filter(([sql]) => sql.includes('SET name = $1 WHERE empresa_id = $2'));
    expect(updatesDeModulo).toHaveLength(4);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ name: 'ACME SAS' }));
  });

  test('empresa inexistente responde 404 y hace rollback', async () => {
    const client = mockClient();
    client.query.mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [] }) // UPDATE no encontró nada
      .mockResolvedValueOnce({ rows: [] }); // ROLLBACK
    db.getClient.mockResolvedValue(client);

    const req = baseReq({ params: { id: 'no-existe' }, body: { name: 'ACME' } });
    const res = mockRes();
    await updateEmpresa(req, res, mockNext);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(client.query).toHaveBeenCalledWith('ROLLBACK');
  });
});

describe('deshabilitarModulo', () => {
  test('módulo inválido devuelve 400', async () => {
    const req = baseReq({ params: { id: 'empresa-1', modulo: 'inventado' } });
    const res = mockRes();
    await deshabilitarModulo(req, res, mockNext);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(db.query).not.toHaveBeenCalled();
  });

  test('no habilitada en ese módulo devuelve 404', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });

    const req = baseReq({ params: { id: 'empresa-1', modulo: 'fondo' } });
    const res = mockRes();
    await deshabilitarModulo(req, res, mockNext);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  test('borra la fila del módulo y responde 204', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ id: 'fila-1' }] }) // ya habilitada
      .mockResolvedValueOnce({ rows: [] }) // DELETE
      .mockResolvedValueOnce({ rows: [] }); // audit log

    const req = baseReq({ params: { id: 'empresa-1', modulo: 'fondo' } });
    const res = mockRes();
    await deshabilitarModulo(req, res, mockNext);

    expect(db.query.mock.calls[1][0]).toContain('DELETE FROM fondo_empresas');
    expect(res.status).toHaveBeenCalledWith(204);
  });
});

describe('generarTokenDian', () => {
  test('empresa inexistente responde 404', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });

    const req = baseReq({ params: { id: 'no-existe' } });
    const res = mockRes();
    await generarTokenDian(req, res, mockNext);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(dianTokenService.generarToken).not.toHaveBeenCalled();
  });

  test('sin tipo_contribuyente configurado responde 400', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ nit: '900123456', tipo_contribuyente: null, cedula_representante: null }] });

    const req = baseReq({ params: { id: 'empresa-1' } });
    const res = mockRes();
    await generarTokenDian(req, res, mockNext);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(dianTokenService.generarToken).not.toHaveBeenCalled();
  });

  test('con datos completos delega en dianTokenService y responde el resultado', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ nit: '900123456', tipo_contribuyente: 'empresa', cedula_representante: '123' }] })
      .mockResolvedValueOnce({ rows: [] }); // audit log
    dianTokenService.generarToken.mockResolvedValue({ success: true, mensaje: 'ok' });

    const req = baseReq({ params: { id: 'empresa-1' } });
    const res = mockRes();
    await generarTokenDian(req, res, mockNext);

    expect(dianTokenService.generarToken).toHaveBeenCalledWith({ tipo: 'empresa', nit: '900123456', cedulaRepresentante: '123' });
    expect(res.json).toHaveBeenCalledWith({ success: true, mensaje: 'ok' });
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

    expect(db.query.mock.calls[0][1]).toEqual(['mock-uuid', 'ACME', null, null, null]);
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
