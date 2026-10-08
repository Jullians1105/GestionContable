// Endpoints de Deudas vencidas DIAN (controllers/dianDeudasController.js).
jest.mock('../../src/config/database');
jest.mock('../../src/services/dianDeudasService', () => {
  class ErrorDeudas extends Error {
    constructor(codigo, mensaje, status = 400) { super(mensaje); this.codigo = codigo; this.status = status; }
  }
  return {
    ErrorDeudas, revisarEmpresa: jest.fn(), revisarTodas: jest.fn(), getProgreso: jest.fn(), guardarClave: jest.fn(), quitarClave: jest.fn(), claves: jest.fn(),
  };
});
jest.mock('../../src/utils/auditLog', () => jest.fn().mockResolvedValue());
jest.mock('../../src/services/dianDeudas/logica', () => ({
  ...jest.requireActual('../../src/services/dianDeudas/logica'),
  mesActualBogota: () => '2026-10-01',
}));

const db = require('../../src/config/database');
const servicio = require('../../src/services/dianDeudasService');
const auditLog = require('../../src/utils/auditLog');
const c = require('../../src/controllers/dianDeudasController');

const { ErrorDeudas } = servicio;
const mockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.end = jest.fn().mockReturnValue(res);
  res.set = jest.fn().mockReturnValue(res);
  return res;
};
const next = jest.fn();
const req = (o = {}) => ({ params: {}, query: {}, body: {}, user: { userId: 'u1', role: 'admin' }, io: { emit: jest.fn() }, ...o });

const fila = (o = {}) => ({
  id: 'e1', name: 'ACME', nit: '9', tipo_contribuyente: 'empresa', iva_periodicidad: null,
  tiene_clave: true, dian_clave_estado: 'verificada', dian_clave_verificada_at: null,
  revision_id: null, estado: null, mensaje: null, revisado_at: null, correo_enviado_at: null, revisado_por: null, detalle: [], ...o,
});

beforeEach(() => { jest.clearAllMocks(); delete process.env.DIAN_CLAVES_KEY; });

describe('listar', () => {
  it('rechaza un mes mal formado', async () => {
    const res = mockRes();
    await c.listar(req({ query: { mes: '2026-13' } }), res, next);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(db.query).not.toHaveBeenCalled();
  });

  it('usa el mes actual por defecto y consulta con el primer día del mes', async () => {
    db.query.mockResolvedValue({ rows: [] });
    const res = mockRes();
    await c.listar(req(), res, next);
    expect(db.query.mock.calls[0][1]).toEqual(['2026-10-01']);
    expect(res.json.mock.calls[0][0].mes).toBe('2026-10');
  });

  it('el estado visible: el de la revisión, o por qué todavía no hay (sin clave / clave mala / pendiente)', async () => {
    db.query.mockResolvedValue({ rows: [
      fila({ id: 'a', estado: 'con_deuda' }),
      fila({ id: 'b', tiene_clave: false }),
      fila({ id: 'c', dian_clave_estado: 'invalida' }),
      fila({ id: 'd' }),
      fila({ id: 'e', tiene_clave: false, dian_clave_estado: 'invalida' }),
    ] });
    const res = mockRes();
    await c.listar(req(), res, next);
    const { empresas } = res.json.mock.calls[0][0];
    expect(empresas.map((e) => [e.id, e.estado])).toEqual([['a', 'con_deuda'], ['b', 'sin_clave'], ['c', 'clave'], ['d', 'pendiente'], ['e', 'clave']]);
  });

  it('cada obligación llega con su descripción legible según la periodicidad del IVA', async () => {
    db.query.mockResolvedValue({ rows: [fila({
      iva_periodicidad: 'bimestral',
      detalle: [
        { id: 'd1', concepto: 'iva', anio: 2026, periodo: 2, estado: 'vigente', valorTotal: 1 },
        { id: 'd2', concepto: 'rete_fte', anio: 2026, periodo: 7, estado: 'vigente', valorTotal: 1 },
      ],
    })] });
    const res = mockRes();
    await c.listar(req(), res, next);
    expect(res.json.mock.calls[0][0].empresas[0].detalle.map((d) => d.descripcion)).toEqual([
      'IVA del bimestre marzo-abril de 2026', 'Retención en la fuente del mes de julio de 2026',
    ]);
  });

  it('nunca expone la clave (ni cifrada)', async () => {
    db.query.mockResolvedValue({ rows: [fila({ dian_clave_cifrada: 'v1:secreto' })] });
    const res = mockRes();
    await c.listar(req(), res, next);
    expect(JSON.stringify(res.json.mock.calls[0][0])).not.toContain('secreto');
    expect(db.query.mock.calls[0][0]).not.toMatch(/dian_clave_cifrada\s*,|e\.dian_clave_cifrada AS/);
  });
});

describe('revisar', () => {
  it('devuelve el resultado y avisa por socket', async () => {
    servicio.revisarEmpresa.mockResolvedValue({ estado: 'al_dia', detalle: [] });
    const res = mockRes();
    const r = req({ params: { id: 'e1' } });
    await c.revisar(r, res, next);
    expect(res.json).toHaveBeenCalledWith({ estado: 'al_dia', detalle: [] });
    expect(r.io.emit).toHaveBeenCalledWith('dianDeudas:revisada', { empresaId: 'e1', estado: 'al_dia' });
  });

  it('errores de negocio salen con su código HTTP (EN_CURSO -> 409)', async () => {
    servicio.revisarEmpresa.mockRejectedValue(new ErrorDeudas('EN_CURSO', 'Esta empresa ya se está revisando.', 409));
    const res = mockRes();
    await c.revisar(req({ params: { id: 'e1' } }), res, next);
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({ error: 'Esta empresa ya se está revisando.', codigo: 'EN_CURSO' });
    expect(next).not.toHaveBeenCalled();
  });

  it('errores inesperados van al manejador general', async () => {
    const boom = new Error('x');
    servicio.revisarEmpresa.mockRejectedValue(boom);
    await c.revisar(req({ params: { id: 'e1' } }), mockRes(), next);
    expect(next).toHaveBeenCalledWith(boom);
  });
});

describe('revisarTodas', () => {
  it('responde 202 con el total y por defecto solo pendientes', async () => {
    servicio.revisarTodas.mockResolvedValue({ total: 127 });
    const res = mockRes();
    await c.revisarTodas(req(), res, next);
    expect(servicio.revisarTodas).toHaveBeenCalledWith(expect.objectContaining({ soloPendientes: true, userId: 'u1' }));
    expect(res.status).toHaveBeenCalledWith(202);
    expect(res.json).toHaveBeenCalledWith({ total: 127 });
  });
  it('soloPendientes:false revisa todas de nuevo', async () => {
    servicio.revisarTodas.mockResolvedValue({ total: 1 });
    await c.revisarTodas(req({ body: { soloPendientes: false } }), mockRes(), next);
    expect(servicio.revisarTodas).toHaveBeenCalledWith(expect.objectContaining({ soloPendientes: false }));
  });
});

describe('guardarClave', () => {
  it('sin llave de cifrado en el servidor: 503 y no intenta nada', async () => {
    const res = mockRes();
    await c.guardarClave(req({ params: { id: 'e1' }, body: { clave: 'x' } }), res, next);
    expect(res.status).toHaveBeenCalledWith(503);
    expect(servicio.guardarClave).not.toHaveBeenCalled();
  });

  it('guarda y deja constancia en la auditoría SIN la clave', async () => {
    process.env.DIAN_CLAVES_KEY = 'a'.repeat(64);
    servicio.guardarClave.mockResolvedValue({ ok: true });
    const res = mockRes();
    await c.guardarClave(req({ params: { id: 'e1' }, body: { clave: 'Secreta*1' } }), res, next);
    expect(res.json).toHaveBeenCalledWith({ ok: true });
    expect(JSON.stringify(auditLog.mock.calls)).not.toContain('Secreta');
  });

  it('clave rechazada por la DIAN: 422 con el motivo', async () => {
    process.env.DIAN_CLAVES_KEY = 'a'.repeat(64);
    servicio.guardarClave.mockRejectedValue(new ErrorDeudas('CLAVE_INVALIDA', 'La DIAN rechazó la clave', 422));
    const res = mockRes();
    await c.guardarClave(req({ params: { id: 'e1' }, body: { clave: 'mala' } }), res, next);
    expect(res.status).toHaveBeenCalledWith(422);
  });
});

describe('claves (mostrar/copiar)', () => {
  it('entrega las claves sin caché y deja UNA línea de auditoría (quién y cuándo; nunca las claves)', async () => {
    servicio.claves.mockResolvedValue({ claves: { e1: 'Secreta*1', e2: 'Otra*2' }, sinDescifrar: 0 });
    const res = mockRes();
    await c.claves(req(), res, next);
    expect(res.set).toHaveBeenCalledWith('Cache-Control', 'no-store');
    expect(res.json).toHaveBeenCalledWith({ claves: { e1: 'Secreta*1', e2: 'Otra*2' }, sinDescifrar: 0 });
    expect(auditLog).toHaveBeenCalledWith('u1', 'READ', 'dian_clave', 'todas');
    expect(JSON.stringify(auditLog.mock.calls)).not.toContain('Secreta');
  });
  it('un error del servicio va al manejador general', async () => {
    const boom = new Error('x');
    servicio.claves.mockRejectedValue(boom);
    await c.claves(req(), mockRes(), next);
    expect(next).toHaveBeenCalledWith(boom);
  });
  it('el listado trae la cédula del representante pero nunca la clave', async () => {
    db.query.mockResolvedValue({ rows: [fila({ cedula_representante: '1000000001' })] });
    const res = mockRes();
    await c.listar(req(), res, next);
    const [e] = res.json.mock.calls[0][0].empresas;
    expect(e.cedulaRepresentante).toBe('1000000001');
    expect(Object.keys(e)).not.toContain('clave');
  });
});

describe('actualizarConfig', () => {
  it('guarda la periodicidad del IVA; null la quita; 404 si no existe', async () => {
    db.query.mockResolvedValue({ rowCount: 1 });
    const res = mockRes();
    await c.actualizarConfig(req({ params: { id: 'e1' }, body: { ivaPeriodicidad: 'bimestral' } }), res, next);
    expect(db.query.mock.calls[0][1]).toEqual(['e1', 'bimestral']);
    await c.actualizarConfig(req({ params: { id: 'e1' }, body: {} }), mockRes(), next);
    expect(db.query.mock.calls[1][1]).toEqual(['e1', null]);
    db.query.mockResolvedValue({ rowCount: 0 });
    const res404 = mockRes();
    await c.actualizarConfig(req({ params: { id: 'zz' }, body: {} }), res404, next);
    expect(res404.status).toHaveBeenCalledWith(404);
  });
});

describe('correo', () => {
  it('arma el texto con lo vigente', async () => {
    db.query.mockResolvedValue({ rows: [{
      id: 'r1', name: 'EMPRESA EJEMPLO S.A.S', iva_periodicidad: null,
      detalle: [{ concepto: 'rete_fte', anio: 2026, periodo: 7, valorTotal: 273000, estado: 'vigente' }],
    }] });
    const res = mockRes();
    await c.correo(req({ params: { id: 'r1' } }), res, next);
    const { asunto, texto } = res.json.mock.calls[0][0];
    expect(asunto).toBe('DEUDAS VENCIDAS DIAN');
    expect(texto).toContain('EMPRESA EJEMPLO S.A.S');
    expect(texto).toContain('$273.000');
  });
  it('404 si la revisión no existe o no hay nada vigente', async () => {
    db.query.mockResolvedValue({ rows: [] });
    const res = mockRes();
    await c.correo(req({ params: { id: 'r1' } }), res, next);
    expect(res.status).toHaveBeenCalledWith(404);
    db.query.mockResolvedValue({ rows: [{ id: 'r1', name: 'X', iva_periodicidad: null, detalle: [{ concepto: 'iva', anio: 2026, periodo: 1, valorTotal: 1, estado: 'pagada' }] }] });
    const res2 = mockRes();
    await c.correo(req({ params: { id: 'r1' } }), res2, next);
    expect(res2.status).toHaveBeenCalledWith(404);
  });
});

describe('marcarCorreo', () => {
  it('marca como enviado con el usuario; enviado:false lo desmarca', async () => {
    db.query.mockResolvedValue({ rowCount: 1 });
    await c.marcarCorreo(req({ params: { id: 'r1' }, body: {} }), mockRes(), next);
    expect(db.query.mock.calls[0][0]).toMatch(/correo_enviado_at = NOW\(\)/);
    expect(db.query.mock.calls[0][1]).toEqual(['r1', 'u1']);
    await c.marcarCorreo(req({ params: { id: 'r1' }, body: { enviado: false } }), mockRes(), next);
    expect(db.query.mock.calls[1][0]).toMatch(/correo_enviado_at = NULL/);
  });
  it('404 si no existe', async () => {
    db.query.mockResolvedValue({ rowCount: 0 });
    const res = mockRes();
    await c.marcarCorreo(req({ params: { id: 'zz' }, body: {} }), res, next);
    expect(res.status).toHaveBeenCalledWith(404);
  });
});

describe('resolverDetalle', () => {
  it('al pasar la última obligación pendiente a pagada, la revisión queda al día', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ revision_id: 'r1' }] })       // UPDATE detalle
      .mockResolvedValueOnce({ rows: [{ estado: 'pagada' }, { estado: 'pagada' }] }) // SELECT estados
      .mockResolvedValueOnce({ rows: [] });                            // UPDATE revision
    const res = mockRes();
    await c.resolverDetalle(req({ params: { id: 'd1' }, body: { estado: 'pagada' } }), res, next);
    expect(res.json).toHaveBeenCalledWith({ ok: true, estadoRevision: 'al_dia' });
    expect(db.query.mock.calls[2][1]).toEqual(['r1', 'al_dia']);
    expect(db.query.mock.calls[2][0]).toMatch(/estado IN \('al_dia', 'con_deuda'\)/);
  });
  it('si queda algo por pagar, sigue con deuda', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ revision_id: 'r1' }] })
      .mockResolvedValueOnce({ rows: [{ estado: 'pagada' }, { estado: 'revisar' }] })
      .mockResolvedValueOnce({ rows: [] });
    const res = mockRes();
    await c.resolverDetalle(req({ params: { id: 'd1' }, body: { estado: 'pagada' } }), res, next);
    expect(res.json).toHaveBeenCalledWith({ ok: true, estadoRevision: 'con_deuda' });
  });
  it('404 si la obligación no existe', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    const res = mockRes();
    await c.resolverDetalle(req({ params: { id: 'zz' }, body: { estado: 'pagada' } }), res, next);
    expect(res.status).toHaveBeenCalledWith(404);
  });
});

describe('PATRON_CLAVE_INVALIDA (mensajes de login de MUISCA)', () => {
  const { PATRON_CLAVE_INVALIDA } = require('../../src/services/dianDeudas/muiscaScraper');
  it('reconoce el mensaje real de la DIAN para una clave errada', () => {
    expect(PATRON_CLAVE_INVALIDA.test('Datos incorrectos o no encontrados. Verifique e intente de nuevo.')).toBe(true);
    expect(PATRON_CLAVE_INVALIDA.test('Su cuenta está bloqueada')).toBe(true);
  });
  it('no confunde un error cualquiera con una clave mala', () => {
    expect(PATRON_CLAVE_INVALIDA.test('Servicio no disponible, intente más tarde')).toBe(false);
    expect(PATRON_CLAVE_INVALIDA.test('')).toBe(false);
  });
});

describe('lecturas a prueba de navegación (muiscaScraper)', () => {
  const { _internos: { leer, evaluarClic, esCarreraDeNavegacion } } = require('../../src/services/dianDeudas/muiscaScraper');
  const carrera = () => new Error('page.evaluate: Execution context was destroyed, most likely because of a navigation');
  const paginaFalsa = () => ({ waitForLoadState: jest.fn().mockResolvedValue(), waitForTimeout: jest.fn().mockResolvedValue() });

  it('reconoce el error de carrera de navegación y no otros', () => {
    expect(esCarreraDeNavegacion(carrera())).toBe(true);
    expect(esCarreraDeNavegacion(new Error('Timeout 15000ms exceeded'))).toBe(false);
    expect(esCarreraDeNavegacion(undefined)).toBe(false);
  });

  it('una lectura que cae en plena navegación se repite y devuelve el valor', async () => {
    const page = paginaFalsa();
    const op = jest.fn().mockRejectedValueOnce(carrera()).mockRejectedValueOnce(carrera()).mockResolvedValue('texto');
    await expect(leer(page, op)).resolves.toBe('texto');
    expect(op).toHaveBeenCalledTimes(3);
    expect(page.waitForLoadState).toHaveBeenCalledTimes(2);
  });

  it('se rinde tras 4 intentos si la página nunca asienta', async () => {
    const op = jest.fn().mockRejectedValue(carrera());
    await expect(leer(paginaFalsa(), op)).rejects.toThrow(/Execution context was destroyed/);
    expect(op).toHaveBeenCalledTimes(4);
  });

  it('un error que NO es de navegación se propaga de inmediato (sin reintentos)', async () => {
    const op = jest.fn().mockRejectedValue(new Error('selector no encontrado'));
    await expect(leer(paginaFalsa(), op)).rejects.toThrow('selector no encontrado');
    expect(op).toHaveBeenCalledTimes(1);
  });

  it('un clic por DOM que navega se da por hecho aunque el contexto se destruya, y NO se repite', async () => {
    const locator = { evaluate: jest.fn().mockRejectedValue(carrera()) };
    await expect(evaluarClic(locator)).resolves.toBeUndefined();
    expect(locator.evaluate).toHaveBeenCalledTimes(1);
  });

  it('otros errores de un clic sí se propagan', async () => {
    const locator = { evaluate: jest.fn().mockRejectedValue(new Error('elemento no existe')) };
    await expect(evaluarClic(locator)).rejects.toThrow('elemento no existe');
  });
});

describe('FILA_RECIBO (lectura de la tabla de recibos pagados)', () => {
  const { FILA_RECIBO } = require('../../src/services/dianDeudas/muiscaScraper');
  it('lee la fila real de la captura de la DIAN', () => {
    const m = FILA_RECIBO.exec('4910514083361 RETENCION ATITULO DE RENTA 2021 8 20211015 1.000');
    expect(m.slice(1)).toEqual(['4910514083361', 'RETENCION ATITULO DE RENTA', '2021', '8', '20211015', '1.000']);
  });
  it('ignora filas que no son recibos', () => {
    expect(FILA_RECIBO.exec('Número de Documento Concepto Año Período')).toBeNull();
  });
});
