// Matrícula mercantil (RUES) en el directorio maestro de empresas — migración 064.
jest.mock('../../src/config/database');
jest.mock('uuid', () => ({ v4: () => 'mock-uuid' }));
jest.mock('../../src/services/dianTokenService');
// Nunca consultar el RUES real desde estos tests: la verificación de matrículas se simula.
jest.mock('../../src/services/empresasRuesService');
jest.mock('../../src/services/terceros/ruesService', () => ({
  ...jest.requireActual('../../src/services/terceros/ruesService'),
  fechaActualizacionFuente: jest.fn(),
}));

const db = require('../../src/config/database');
const empresasRues = require('../../src/services/empresasRuesService');
const { fechaActualizacionFuente } = require('../../src/services/terceros/ruesService');
const {
  getDirectorio, createEmpresa, updateEmpresa, verificarMatricula, getRuesFuente,
} = require('../../src/controllers/empresasMaestroController');

function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}
const mockNext = jest.fn();
const baseReq = (overrides = {}) => ({
  params: {}, body: {}, user: { userId: 'user-1', role: 'admin' }, io: { emit: jest.fn() }, ...overrides,
});
const mockClient = () => ({ query: jest.fn().mockResolvedValue({ rows: [] }), release: jest.fn() });

beforeEach(() => {
  jest.clearAllMocks();
});

const anio = new Date().getFullYear();
const filaBase = {
  id: 'a', name: 'ACME', nit: '900123456', tipo_contribuyente: 'empresa', cedula_representante: null,
  activa: true, created_at: '2026-01-01', updated_at: '2026-01-01',
  fondo_id: null, ne_id: null, ext_id: null, contab_id: null,
};

describe('getDirectorio — matrícula', () => {
  test('expone la situación de la matrícula, con la fecha como YYYY-MM-DD', async () => {
    db.query.mockResolvedValueOnce({
      rows: [{
        ...filaBase, rues_consulta: 'encontrado', rues_estado: 'ACTIVA', rues_ultimo_ano_renovado: anio,
        rues_fecha_renovacion: new Date(anio, 2, 17), rues_consultado_at: '2026-10-02T10:00:00Z',
      }],
    });
    const res = mockRes();
    await getDirectorio(baseReq(), res, mockNext);
    const [empresa] = res.json.mock.calls[0][0];
    expect(empresa.matricula).toEqual({
      situacion: 'al_dia', estado: 'ACTIVA', ultimoAnoRenovado: anio, fechaRenovacion: `${anio}-03-17`,
      consultadoAt: '2026-10-02T10:00:00Z', plazoLimite: null,
    });
  });

  test('una empresa nunca verificada sale como sin_verificar, sin fechas inventadas', async () => {
    db.query.mockResolvedValueOnce({ rows: [filaBase] });
    const res = mockRes();
    await getDirectorio(baseReq(), res, mockNext);
    const [empresa] = res.json.mock.calls[0][0];
    expect(empresa.matricula).toMatchObject({ situacion: 'sin_verificar', estado: null, fechaRenovacion: null, plazoLimite: null });
  });

  test('cancelada y sin renovar se distinguen; sin renovar trae el plazo del 31 de marzo', async () => {
    db.query.mockResolvedValueOnce({
      rows: [
        { ...filaBase, id: 'b', rues_consulta: 'encontrado', rues_estado: 'CANCELADA', rues_ultimo_ano_renovado: 2013 },
        { ...filaBase, id: 'c', rues_consulta: 'encontrado', rues_estado: 'ACTIVA', rues_ultimo_ano_renovado: 2020 },
      ],
    });
    const res = mockRes();
    await getDirectorio(baseReq(), res, mockNext);
    const [b, c] = res.json.mock.calls[0][0];
    expect(b.matricula.situacion).toBe('cancelada');
    expect(c.matricula.situacion).toBe('sin_renovar');
    expect(c.matricula.plazoLimite).toBe(`${anio}-03-31`);
  });
});

describe('crear y editar empresas lanzan la verificación', () => {
  test('crear una empresa con NIT lanza la verificación en segundo plano', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ id: 'mock-uuid', name: 'ACME', activa: true }] })
      .mockResolvedValueOnce({ rows: [] }); // audit log
    await createEmpresa(baseReq({ body: { name: 'acme', tipoContribuyente: 'empresa', nit: '900123456' } }), mockRes(), mockNext);
    expect(empresasRues.verificarEnSegundoPlano).toHaveBeenCalledWith({ ids: ['mock-uuid'], forzar: true });
  });

  test('crear una empresa sin NIT no consulta el RUES (no hay qué consultar)', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ id: 'mock-uuid', name: 'ACME', activa: true }] })
      .mockResolvedValueOnce({ rows: [] });
    await createEmpresa(baseReq({ body: { name: 'acme' } }), mockRes(), mockNext);
    expect(empresasRues.verificarEnSegundoPlano).not.toHaveBeenCalled();
  });

  async function editar(actual, body) {
    const client = mockClient();
    client.query.mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [actual] }) // SELECT actual
      .mockResolvedValueOnce({ rows: [{ id: 'e1', name: 'X', activa: true }] }) // UPDATE
      .mockResolvedValue({ rows: [] });
    db.getClient.mockResolvedValue(client);
    db.query.mockResolvedValue({ rows: [] });
    await updateEmpresa(baseReq({ params: { id: 'e1' }, body }), mockRes(), mockNext);
    return client.query.mock.calls.find(([sql]) => sql.includes('UPDATE empresas SET'));
  }
  const actual = { nit: '900111222', tipo_contribuyente: 'empresa', cedula_representante: null };

  test('cambiar el NIT limpia lo que se sabía de la matrícula en el mismo UPDATE y vuelve a verificar', async () => {
    const upd = await editar(actual, { nit: '900333444' });
    // El cambio de NIT se calcula en JS y va como parámetro aparte ($7): reutilizar $4 en una
    // comparación hace que PostgreSQL le deduzca dos tipos distintos (error 42P08, encontrado
    // probando contra una base real, no con la base simulada).
    expect(upd[0]).toMatch(/rues_consulta = CASE WHEN \$7::boolean THEN NULL/);
    expect(upd[0]).toMatch(/rues_fecha_renovacion = CASE WHEN \$7::boolean THEN NULL/);
    expect(upd[1][6]).toBe(true);
    expect(empresasRues.verificarEnSegundoPlano).toHaveBeenCalledWith({ ids: ['e1'], forzar: true });
  });

  test('editar sin cambiar el NIT no vuelve a consultar el RUES', async () => {
    const upd = await editar(actual, { name: 'otro nombre' });
    expect(upd[1][6]).toBe(false); // el NIT no cambió: no se limpia nada
    expect(empresasRues.verificarEnSegundoPlano).not.toHaveBeenCalled();
  });
});

describe('verificarMatricula', () => {
  test('repasa las pendientes por defecto y avisa por socket', async () => {
    empresasRues.verificarEmpresas.mockResolvedValue({ pendientes: 3, verificadas: 2, noEncontradas: 1, errores: 0, sinDocumento: 0 });
    const req = baseReq();
    const res = mockRes();
    await verificarMatricula(req, res, mockNext);
    expect(empresasRues.verificarEmpresas).toHaveBeenCalledWith({ forzar: false });
    expect(res.json).toHaveBeenCalledWith({ pendientes: 3, verificadas: 2, noEncontradas: 1, errores: 0, sinDocumento: 0 });
    expect(req.io.emit).toHaveBeenCalledWith('empresas:updated', { tipo: 'matricula' });
    // Queda constancia de quién actualizó las matrículas y con qué resultado
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO audit_log'),
      expect.arrayContaining(['user-1', 'UPDATE', 'empresas_rues', 'lote'])
    );
  });

  test('con forzar: true repasa todas', async () => {
    empresasRues.verificarEmpresas.mockResolvedValue({ pendientes: 0 });
    await verificarMatricula(baseReq({ body: { forzar: true } }), mockRes(), mockNext);
    expect(empresasRues.verificarEmpresas).toHaveBeenCalledWith({ forzar: true });
  });

  test('si ya hay una verificación en curso responde 409', async () => {
    empresasRues.verificarEmpresas.mockRejectedValue(Object.assign(new Error('en curso'), { codigo: 'EN_CURSO' }));
    const res = mockRes();
    await verificarMatricula(baseReq(), res, mockNext);
    expect(res.status).toHaveBeenCalledWith(409);
  });

  test('cualquier otro error pasa al manejador global', async () => {
    const boom = new Error('boom');
    empresasRues.verificarEmpresas.mockRejectedValue(boom);
    await verificarMatricula(baseReq(), mockRes(), mockNext);
    expect(mockNext).toHaveBeenCalledWith(boom);
  });
});

describe('getRuesFuente', () => {
  test('devuelve la fecha de la última actualización de los datos del RUES en ISO', async () => {
    fechaActualizacionFuente.mockResolvedValue(new Date('2026-09-04T19:15:35Z'));
    const res = mockRes();
    await getRuesFuente(baseReq(), res, mockNext);
    expect(res.json).toHaveBeenCalledWith({ actualizadaAl: '2026-09-04T19:15:35.000Z' });
  });

  test('si no se pudo saber, actualizadaAl es null (la pantalla simplemente no la muestra)', async () => {
    fechaActualizacionFuente.mockResolvedValue(null);
    const res = mockRes();
    await getRuesFuente(baseReq(), res, mockNext);
    expect(res.json).toHaveBeenCalledWith({ actualizadaAl: null });
  });
});
