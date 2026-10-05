// Orquestación de Deudas vencidas DIAN (services/dianDeudasService.js) con el navegador y la base
// de datos simulados: bloqueo por empresa, claves malas, guardado y "revisar todas".
jest.mock('../../src/config/database');
jest.mock('../../src/services/dianTokenService', () => ({ CHROME_PATH: '/usr/bin/google-chrome' }));
jest.mock('playwright', () => ({ chromium: { launch: jest.fn() } }));
jest.mock('../../src/services/dianDeudas/muiscaScraper');
jest.mock('../../src/utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }));

process.env.DIAN_CLAVES_KEY = 'a'.repeat(64);

const db = require('../../src/config/database');
const { chromium } = require('playwright');
const scraper = require('../../src/services/dianDeudas/muiscaScraper');
const { cifrar, descifrar } = require('../../src/utils/secretos');
const servicio = require('../../src/services/dianDeudasService');

const EMPRESA_ID = '11111111-1111-1111-1111-111111111111';
const empresaBase = (o = {}) => ({
  id: EMPRESA_ID, name: 'ACME SAS', nit: '900123456', tipo_contribuyente: 'empresa', cedula_representante: '1000000001',
  iva_periodicidad: 'bimestral', dian_clave_cifrada: cifrar('Clave123*'), dian_clave_estado: 'verificada', ...o,
});

let client;
let sqls;
let navegador;
let contexto;

beforeEach(() => {
  jest.resetAllMocks();
  servicio._reiniciarEstado();
  sqls = [];
  client = { query: jest.fn().mockImplementation(async (sql, params) => { sqls.push([sql, params]); return { rows: [{ id: 'rev-1' }] }; }), release: jest.fn() };
  db.getClient.mockResolvedValue(client);
  db.query.mockImplementation(async (sql, params) => {
    sqls.push([sql, params]);
    if (/FROM empresas WHERE id/.test(sql)) return { rows: [empresaBase()] };
    return { rows: [], rowCount: 1 };
  });
  contexto = { close: jest.fn().mockResolvedValue() };
  navegador = { newContext: jest.fn().mockResolvedValue(contexto), isConnected: jest.fn().mockReturnValue(true), on: jest.fn(), version: () => '154.0.8037.93' };
  chromium.launch.mockResolvedValue(navegador);
});

const usoDeSql = (patron) => sqls.filter(([sql]) => patron.test(sql));

describe('revisarEmpresa', () => {
  it('sin clave guardada: SIN_CLAVE y no abre el navegador', async () => {
    db.query.mockImplementation(async (sql) => (/FROM empresas WHERE id/.test(sql) ? { rows: [empresaBase({ dian_clave_cifrada: null })] } : { rows: [] }));
    await expect(servicio.revisarEmpresa(EMPRESA_ID, { userId: 'u1' })).rejects.toMatchObject({ codigo: 'SIN_CLAVE' });
    expect(scraper.consultarEmpresa).not.toHaveBeenCalled();
  });

  it('clave ya rechazada por la DIAN: no reintenta (CLAVE_INVALIDA, 409)', async () => {
    db.query.mockImplementation(async (sql) => (/FROM empresas WHERE id/.test(sql) ? { rows: [empresaBase({ dian_clave_estado: 'invalida' })] } : { rows: [] }));
    await expect(servicio.revisarEmpresa(EMPRESA_ID, { userId: 'u1' })).rejects.toMatchObject({ codigo: 'CLAVE_INVALIDA', status: 409 });
    expect(scraper.consultarEmpresa).not.toHaveBeenCalled();
  });

  it('empresa que ingresa como "empresa" sin cédula de representante: SIN_CEDULA', async () => {
    db.query.mockImplementation(async (sql) => (/FROM empresas WHERE id/.test(sql) ? { rows: [empresaBase({ cedula_representante: null })] } : { rows: [] }));
    await expect(servicio.revisarEmpresa(EMPRESA_ID, { userId: 'u1' })).rejects.toMatchObject({ codigo: 'SIN_CEDULA' });
  });

  it('empresa inexistente: 404', async () => {
    db.query.mockResolvedValue({ rows: [] });
    await expect(servicio.revisarEmpresa(EMPRESA_ID, { userId: 'u1' })).rejects.toMatchObject({ codigo: 'NO_ENCONTRADA', status: 404 });
  });

  it('descifra la clave y la entrega al navegador (nunca la guarda ni la devuelve)', async () => {
    scraper.consultarEmpresa.mockResolvedValue({ login: { ok: true }, hayDeuda: false });
    const r = await servicio.revisarEmpresa(EMPRESA_ID, { userId: 'u1' });
    expect(scraper.consultarEmpresa.mock.calls[0][1]).toEqual({
      tipo: 'empresa', nit: '900123456', cedulaRepresentante: '1000000001', clave: 'Clave123*',
    });
    expect(JSON.stringify(r)).not.toContain('Clave123');
  });

  it('al día: guarda la revisión del mes sin detalle', async () => {
    scraper.consultarEmpresa.mockResolvedValue({ login: { ok: true }, hayDeuda: false });
    const r = await servicio.revisarEmpresa(EMPRESA_ID, { userId: 'u1', mes: '2026-10-01' });
    expect(r.estado).toBe('al_dia');
    const insert = client.query.mock.calls.find(([sql]) => /INSERT INTO dian_deudas_revisiones/.test(sql));
    expect(insert[1]).toEqual([EMPRESA_ID, '2026-10-01', 'al_dia', null, 'u1']);
    expect(client.query.mock.calls.some(([sql]) => /INSERT INTO dian_deudas_detalle/.test(sql))).toBe(false);
    expect(client.query.mock.calls.map(([s]) => s)).toEqual(expect.arrayContaining(['BEGIN', 'COMMIT']));
    expect(client.release).toHaveBeenCalled();
  });

  it('con deuda: clasifica, cruza con recibos y guarda una fila por obligación', async () => {
    scraper.consultarEmpresa.mockResolvedValue({
      login: { ok: true }, hayDeuda: true,
      deudas: [
        { tipoObligacion: 'Impuesto sobre las Ventas-IVA', anio: 2026, periodo: 2, obligacion: '1', valorBase: 17419000, valorTotal: 17609000 },
        { tipoObligacion: 'Retención en la Fuente', anio: 2026, periodo: 7, obligacion: '2', valorBase: 277000, valorTotal: 285000 },
      ],
      recibos: [{ numero: '99', concepto: 'RETENCION ATITULO DE RENTA', anio: 2026, periodo: 7, total: 285000 }],
    });
    const r = await servicio.revisarEmpresa(EMPRESA_ID, { userId: 'u1' });
    expect(r.estado).toBe('con_deuda');
    expect(r.detalle.map((d) => [d.concepto, d.estado])).toEqual([['iva', 'vigente'], ['rete_fte', 'pagada']]);
    const inserts = client.query.mock.calls.filter(([sql]) => /INSERT INTO dian_deudas_detalle/.test(sql));
    expect(inserts).toHaveLength(2);
    expect(inserts[0][1].slice(1, 9)).toEqual(['iva', 'Impuesto sobre las Ventas-IVA', 2026, 2, '1', 17419000, 17609000, 'vigente']);
  });

  it('guarda si cada obligación es vencida o no vencida (por defecto, vencida)', async () => {
    scraper.consultarEmpresa.mockResolvedValue({
      login: { ok: true }, hayDeuda: true,
      deudas: [
        { tipoObligacion: 'Retención en la Fuente', anio: 2026, periodo: 7, obligacion: '1', valorBase: 332000, valorTotal: 342000, vencida: true },
        { tipoObligacion: 'Retención en la Fuente', anio: 2026, periodo: 9, obligacion: '2', valorBase: 112000, valorTotal: 112000, vencida: false },
        { tipoObligacion: 'Retención en la Fuente', anio: 2026, periodo: 8, obligacion: '3', valorBase: 1, valorTotal: 1 },
      ],
      recibos: [],
    });
    const r = await servicio.revisarEmpresa(EMPRESA_ID, { userId: 'u1' });
    expect(r.estado).toBe('con_deuda');
    const inserts = client.query.mock.calls.filter(([sql]) => /INSERT INTO dian_deudas_detalle/.test(sql));
    expect(inserts.map(([, params]) => params[10])).toEqual([true, false, true]);
  });

  it('una empresa con SOLO deuda no vencida también queda con deuda (hay que avisarle)', async () => {
    scraper.consultarEmpresa.mockResolvedValue({
      login: { ok: true }, hayDeuda: true,
      deudas: [{ tipoObligacion: 'Retención en la Fuente', anio: 2026, periodo: 9, obligacion: '2', valorBase: 112000, valorTotal: 112000, vencida: false }],
      recibos: [],
    });
    expect((await servicio.revisarEmpresa(EMPRESA_ID, { userId: 'u1' })).estado).toBe('con_deuda');
  });

  it('si todas las deudas ya tenían recibo pagado, queda al día con una explicación', async () => {
    scraper.consultarEmpresa.mockResolvedValue({
      login: { ok: true }, hayDeuda: true,
      deudas: [{ tipoObligacion: 'Retención en la Fuente', anio: 2026, periodo: 7, obligacion: '2', valorBase: 277000, valorTotal: 285000 }],
      recibos: [{ numero: '99', concepto: 'RETENCION', anio: 2026, periodo: 7, total: 285000 }],
    });
    const r = await servicio.revisarEmpresa(EMPRESA_ID, { userId: 'u1' });
    expect(r.estado).toBe('al_dia');
    const insert = client.query.mock.calls.find(([sql]) => /INSERT INTO dian_deudas_revisiones/.test(sql));
    expect(insert[1][3]).toMatch(/recibo pagado/);
  });

  it('la DIAN rechaza la clave: marca la empresa como inválida y no pisa una revisión buena', async () => {
    scraper.consultarEmpresa.mockResolvedValue({ login: { ok: false, motivo: 'clave', mensaje: 'Contraseña incorrecta' } });
    const r = await servicio.revisarEmpresa(EMPRESA_ID, { userId: 'u1' });
    expect(r).toEqual({ estado: 'clave', mensaje: 'Contraseña incorrecta' });
    expect(usoDeSql(/dian_clave_estado = 'invalida'/)).toHaveLength(1);
    const fallida = usoDeSql(/INSERT INTO dian_deudas_revisiones/)[0][0];
    expect(fallida).toMatch(/WHERE dian_deudas_revisiones\.estado IN \('error', 'clave'\)/);
  });

  it('fallo de login sin motivo claro: error, sin marcar la clave como mala', async () => {
    scraper.consultarEmpresa.mockResolvedValue({ login: { ok: false, motivo: 'error', mensaje: 'La DIAN no respondió' } });
    const r = await servicio.revisarEmpresa(EMPRESA_ID, { userId: 'u1' });
    expect(r.estado).toBe('error');
    expect(usoDeSql(/dian_clave_estado = 'invalida'/)).toHaveLength(0);
  });

  it('una excepción del navegador se registra como error y libera el bloqueo', async () => {
    scraper.consultarEmpresa.mockRejectedValueOnce(new Error('timeout de página'));
    const r = await servicio.revisarEmpresa(EMPRESA_ID, { userId: 'u1' });
    expect(r).toEqual({ estado: 'error', mensaje: 'timeout de página' });
    scraper.consultarEmpresa.mockResolvedValue({ login: { ok: true }, hayDeuda: false });
    await expect(servicio.revisarEmpresa(EMPRESA_ID, { userId: 'u1' })).resolves.toMatchObject({ estado: 'al_dia' });
  });

  it('dos personas a la vez sobre la misma empresa: la segunda recibe EN_CURSO', async () => {
    let terminar;
    scraper.consultarEmpresa.mockImplementation(() => new Promise((resolve) => { terminar = () => resolve({ login: { ok: true }, hayDeuda: false }); }));
    const primera = servicio.revisarEmpresa(EMPRESA_ID, { userId: 'u1' });
    await new Promise((r) => setImmediate(r));
    await expect(servicio.revisarEmpresa(EMPRESA_ID, { userId: 'u2' })).rejects.toMatchObject({ codigo: 'EN_CURSO', status: 409 });
    await new Promise((r) => setImmediate(r));
    terminar();
    await expect(primera).resolves.toMatchObject({ estado: 'al_dia' });
  });

  it('un fallo al guardar hace ROLLBACK y suelta la conexión', async () => {
    scraper.consultarEmpresa.mockResolvedValue({ login: { ok: true }, hayDeuda: false });
    client.query.mockImplementation(async (sql) => {
      if (/INSERT INTO dian_deudas_revisiones/.test(sql)) throw new Error('db caída');
      return { rows: [] };
    });
    await expect(servicio.revisarEmpresa(EMPRESA_ID, { userId: 'u1' })).rejects.toThrow('db caída');
    expect(client.query.mock.calls.map(([s]) => s)).toContain('ROLLBACK');
    expect(client.release).toHaveBeenCalled();
  });
});

describe('navegador de las revisiones (sin ventana)', () => {
  beforeEach(() => scraper.consultarEmpresa.mockResolvedValue({ login: { ok: true }, hayDeuda: false }));

  it('lanza un Chrome real en headless y cada revisión usa un contexto aislado que siempre se cierra', async () => {
    await servicio.revisarEmpresa(EMPRESA_ID, { userId: 'u1' });
    expect(chromium.launch).toHaveBeenCalledTimes(1);
    expect(chromium.launch.mock.calls[0][0]).toMatchObject({ executablePath: '/usr/bin/google-chrome', headless: true });
    expect(navegador.newContext).toHaveBeenCalledTimes(1);
    expect(contexto.close).toHaveBeenCalledTimes(1);
  });

  it('reutiliza el mismo navegador entre revisiones (no abre uno por empresa)', async () => {
    await servicio.revisarEmpresa(EMPRESA_ID, { userId: 'u1' });
    await servicio.revisarEmpresa(EMPRESA_ID, { userId: 'u1' });
    expect(chromium.launch).toHaveBeenCalledTimes(1);
    expect(navegador.newContext).toHaveBeenCalledTimes(2);
  });

  it('si el navegador se cayó, lanza otro en la siguiente revisión', async () => {
    await servicio.revisarEmpresa(EMPRESA_ID, { userId: 'u1' });
    navegador.isConnected.mockReturnValue(false);
    await servicio.revisarEmpresa(EMPRESA_ID, { userId: 'u1' });
    expect(chromium.launch).toHaveBeenCalledTimes(2);
  });

  it('se presenta en español de España (números con punto) y hora de Bogotá (el servidor viene en inglés/UTC y la DIAN sirve una página rota)', async () => {
    await servicio.revisarEmpresa(EMPRESA_ID, { userId: 'u1' });
    const opciones = navegador.newContext.mock.calls[0][0];
    expect(opciones.locale).toBe('es-ES');   // es-419 / es-CO dan números con coma en recibos pagados
    expect(opciones.timezoneId).toBe('America/Bogota');
  });

  it('se presenta con un user agent normal (sin "Headless")', async () => {
    await servicio.revisarEmpresa(EMPRESA_ID, { userId: 'u1' });
    const { userAgent } = navegador.newContext.mock.calls[0][0];
    expect(userAgent).toMatch(/Chrome\/154\.0\.8037\.93/);
    expect(userAgent).not.toMatch(/Headless/i);
  });

  it('si Chrome no se puede lanzar, falla esa revisión pero el siguiente intento vuelve a probar', async () => {
    chromium.launch.mockRejectedValueOnce(new Error('no hay Chrome'));
    await expect(servicio.revisarEmpresa(EMPRESA_ID, { userId: 'u1' })).resolves.toMatchObject({ estado: 'error', mensaje: 'no hay Chrome' });
    await expect(servicio.revisarEmpresa(EMPRESA_ID, { userId: 'u1' })).resolves.toMatchObject({ estado: 'al_dia' });
    expect(chromium.launch).toHaveBeenCalledTimes(2);
  });
});

describe('guardarClave', () => {
  it('clave vacía: no consulta nada', async () => {
    await expect(servicio.guardarClave(EMPRESA_ID, '  ')).rejects.toMatchObject({ codigo: 'CLAVE_VACIA' });
    expect(scraper.verificarClave).not.toHaveBeenCalled();
  });

  it('clave rechazada por la DIAN: 422 y NO se guarda', async () => {
    scraper.verificarClave.mockResolvedValue({ ok: false, motivo: 'clave', mensaje: 'Contraseña incorrecta' });
    await expect(servicio.guardarClave(EMPRESA_ID, 'mala')).rejects.toMatchObject({ codigo: 'CLAVE_INVALIDA', status: 422 });
    expect(usoDeSql(/UPDATE empresas SET dian_clave_cifrada/)).toHaveLength(0);
  });

  it('la DIAN no respondió: 502 y NO se guarda (no sabemos si sirve)', async () => {
    scraper.verificarClave.mockResolvedValue({ ok: false, motivo: 'error', mensaje: 'sin respuesta' });
    await expect(servicio.guardarClave(EMPRESA_ID, 'x')).rejects.toMatchObject({ codigo: 'DIAN_NO_RESPONDE', status: 502 });
    expect(usoDeSql(/UPDATE empresas SET dian_clave_cifrada/)).toHaveLength(0);
  });

  it('clave válida: se guarda CIFRADA y marcada verificada', async () => {
    scraper.verificarClave.mockResolvedValue({ ok: true });
    await servicio.guardarClave(EMPRESA_ID, 'Nueva*2026');
    const [sql, params] = usoDeSql(/UPDATE empresas SET dian_clave_cifrada/)[0];
    expect(sql).toMatch(/dian_clave_estado = 'verificada'/);
    expect(params[1]).not.toContain('Nueva');
    expect(descifrar(params[1])).toBe('Nueva*2026');
  });

  it('exige tipo de contribuyente y cédula antes de intentar nada', async () => {
    db.query.mockImplementation(async (sql) => (/FROM empresas WHERE id/.test(sql) ? { rows: [empresaBase({ tipo_contribuyente: null })] } : { rows: [] }));
    await expect(servicio.guardarClave(EMPRESA_ID, 'x')).rejects.toMatchObject({ codigo: 'SIN_TIPO' });
    expect(scraper.verificarClave).not.toHaveBeenCalled();
  });
});

describe('claves (para mostrar/copiar)', () => {
  it('devuelve las claves descifradas por empresa (ida y vuelta con el cifrado) y consulta solo activas con clave', async () => {
    db.query.mockResolvedValue({ rows: [
      { id: 'a', dian_clave_cifrada: cifrar('Clave-A*1') },
      { id: 'b', dian_clave_cifrada: cifrar('Clave-B*2') },
    ] });
    await expect(servicio.claves()).resolves.toEqual({ claves: { a: 'Clave-A*1', b: 'Clave-B*2' }, sinDescifrar: 0 });
    expect(db.query.mock.calls[0][0]).toMatch(/activa AND dian_clave_cifrada IS NOT NULL/);
  });
  it('una clave que no se puede descifrar (llave cambiada) se omite y se cuenta, sin tumbar las demás', async () => {
    const mala = cifrar('otra');
    const buena = cifrar('Buena*1');
    process.env.DIAN_CLAVES_KEY = 'b'.repeat(64);
    const buenaConLlaveB = cifrar('Buena*1');
    db.query.mockResolvedValue({ rows: [{ id: 'x', dian_clave_cifrada: mala }, { id: 'y', dian_clave_cifrada: buenaConLlaveB }] });
    const r = await servicio.claves();
    process.env.DIAN_CLAVES_KEY = 'a'.repeat(64);
    expect(r).toEqual({ claves: { y: 'Buena*1' }, sinDescifrar: 1 });
    expect(buena).toBeDefined();
  });
  it('sin empresas con clave: vacío', async () => {
    db.query.mockResolvedValue({ rows: [] });
    await expect(servicio.claves()).resolves.toEqual({ claves: {}, sinDescifrar: 0 });
  });
});

describe('quitarClave', () => {
  it('borra clave y estado; 404 si la empresa no existe', async () => {
    await servicio.quitarClave(EMPRESA_ID);
    expect(usoDeSql(/dian_clave_cifrada = NULL/)).toHaveLength(1);
    db.query.mockResolvedValue({ rowCount: 0, rows: [] });
    await expect(servicio.quitarClave(EMPRESA_ID)).rejects.toMatchObject({ status: 404 });
  });
});

describe('revisarTodas', () => {
  const esperarFin = async () => {
    for (let i = 0; i < 200 && servicio.getProgreso().enCurso; i++) await new Promise((r) => setTimeout(r, 5));
  };
  const empresasLote = (n) => Array.from({ length: n }, (_, i) => ({ id: `id-${i}`, name: `EMPRESA ${i}` }));

  it('sin empresas por revisar devuelve 0 y no deja el lote "en curso"', async () => {
    db.query.mockResolvedValue({ rows: [] });
    await expect(servicio.revisarTodas({ userId: 'u1' })).resolves.toEqual({ total: 0 });
    expect(servicio.getProgreso().enCurso).toBe(false);
  });

  it('revisa todas, cuenta resultados y emite el avance', async () => {
    const estados = { 'id-0': 'al_dia', 'id-1': 'con_deuda', 'id-2': 'clave', 'id-3': 'error' };
    db.query.mockImplementation(async (sql, params) => {
      if (/FROM empresas e/.test(sql)) return { rows: empresasLote(4) };
      if (/FROM empresas WHERE id/.test(sql)) return { rows: [empresaBase({ id: params[0] })] };
      return { rows: [], rowCount: 1 };
    });
    scraper.consultarEmpresa.mockImplementation(async (_ctx, cred) => ({ login: { ok: true }, hayDeuda: false, _cred: cred }));
    // Resultado distinto por empresa, sin tocar el servicio: se simula con el propio mock del scraper.
    let llamada = 0;
    scraper.consultarEmpresa.mockImplementation(async () => {
      const id = `id-${llamada++}`;
      if (estados[id] === 'clave') return { login: { ok: false, motivo: 'clave', mensaje: 'x' } };
      if (estados[id] === 'error') throw new Error('boom');
      if (estados[id] === 'con_deuda') {
        return { login: { ok: true }, hayDeuda: true, deudas: [{ tipoObligacion: 'Retención en la Fuente', anio: 2026, periodo: 1, obligacion: '1', valorBase: 1, valorTotal: 2 }], recibos: [] };
      }
      return { login: { ok: true }, hayDeuda: false };
    });
    const io = { emit: jest.fn() };

    await expect(servicio.revisarTodas({ userId: 'u1', io })).resolves.toEqual({ total: 4 });
    await esperarFin();

    const p = servicio.getProgreso();
    expect(p).toMatchObject({ enCurso: false, total: 4, hechas: 4, alDia: 1, conDeuda: 1, clave: 1, errores: 1 });
    expect(io.emit).toHaveBeenCalledWith('dianDeudas:progreso', expect.objectContaining({ total: 4 }));
    expect(io.emit.mock.calls.filter(([e]) => e === 'dianDeudas:revisada')).toHaveLength(4);
  });

  it('por defecto salta las ya revisadas este mes y las de clave inválida (lo dice el SQL)', async () => {
    db.query.mockResolvedValue({ rows: [] });
    await servicio.revisarTodas({ userId: 'u1' });
    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toMatch(/dian_clave_estado IS DISTINCT FROM 'invalida'/);
    expect(sql).toMatch(/NOT EXISTS/);
    expect(params[1]).toBe(true);
    await servicio.revisarTodas({ userId: 'u1', soloPendientes: false });
    expect(db.query.mock.calls[1][1][1]).toBe(false);
  });

  it('mientras hay un lote en curso, otro recibe EN_CURSO', async () => {
    let liberar;
    db.query.mockImplementation(async (sql, params) => {
      if (/FROM empresas e/.test(sql)) return { rows: empresasLote(1) };
      if (/FROM empresas WHERE id/.test(sql)) return { rows: [empresaBase({ id: params[0] })] };
      return { rows: [], rowCount: 1 };
    });
    scraper.consultarEmpresa.mockImplementation(() => new Promise((resolve) => { liberar = () => resolve({ login: { ok: true }, hayDeuda: false }); }));
    await servicio.revisarTodas({ userId: 'u1' });
    await expect(servicio.revisarTodas({ userId: 'u2' })).rejects.toMatchObject({ codigo: 'EN_CURSO', status: 409 });
    for (let i = 0; i < 50 && !liberar; i++) await new Promise((r) => setTimeout(r, 5));
    liberar();
    await esperarFin();
    expect(servicio.getProgreso().enCurso).toBe(false);
  });
});
