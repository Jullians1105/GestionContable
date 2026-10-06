// Deudas vencidas DIAN: revisa en MUISCA las deudas de una empresa (o de todas) y guarda el resultado
// del mes en `dian_deudas_revisiones` / `dian_deudas_detalle` (migración 065). El navegador y la
// lectura viven en dianDeudas/muiscaScraper.js; las reglas (cruce con recibos pagados, textos del
// correo) en dianDeudas/logica.js. Acá solo se orquesta: validar, cifrar/descifrar la clave,
// encolar, guardar y llevar el avance de "Revisar todas".
//
// Decisiones:
//   - Una revisión por empresa y mes; revisar de nuevo el mismo mes la reemplaza. Un resultado
//     'error' o 'clave' NO pisa una revisión buena del mismo mes (no se pierde lo ya revisado por un
//     fallo posterior).
//   - Si la DIAN rechaza la clave, la empresa queda marcada `dian_clave_estado='invalida'` y NO se
//     vuelve a intentar hasta que alguien guarde una clave nueva (la DIAN bloquea cuentas tras varios
//     intentos fallidos). Al guardar una clave nueva se verifica antes con un login real.
//   - Dos personas dando "Revisar" a la misma empresa: la segunda recibe EN_CURSO (409).
//   - Cada revisión corre en su propio contexto de navegador (cookies aisladas), con concurrencia
//     máxima DIAN_DEUDAS_MAX_CONCURRENTE (2 por defecto: el servidor tiene 2 núcleos y el
//     generador de token comparte esos núcleos).
const db = require('../config/database');
const logger = require('../utils/logger');
const { cifrar, descifrar } = require('../utils/secretos');
const { chromium } = require('playwright');
const { CHROME_PATH } = require('./dianTokenService');
const scraper = require('./dianDeudas/muiscaScraper');
const { clasificarConcepto, cruzarConRecibos, estadoRevision, mesActualBogota } = require('./dianDeudas/logica');

const MAX_CONCURRENTE = parseInt(process.env.DIAN_DEUDAS_MAX_CONCURRENTE || '2', 10);
const TIMEOUT_EMPRESA_MS = 150000;

class ErrorDeudas extends Error {
  constructor(codigo, mensaje, status = 400) {
    super(mensaje);
    this.codigo = codigo;
    this.status = status;
  }
}

// ── Cola con concurrencia máxima ─────────────────────────────────────────────
let enCurso = 0;
const cola = [];

function encolar(tarea) {
  return new Promise((resolve, reject) => {
    const correr = async () => {
      enCurso++;
      try {
        resolve(await tarea());
      } catch (err) {
        reject(err);
      } finally {
        enCurso--;
        if (cola.length > 0) cola.shift()();
      }
    };
    if (enCurso < MAX_CONCURRENTE) correr();
    else cola.push(correr);
  });
}

// Chrome propio de las revisiones de deudas: SIN VENTANA (headless) y aparte del que usa el generador de token.
// Por qué no el mismo: ese necesita ventana real (Cloudflare) y un perfil "calentado", y cada contexto aislado
// que se le abría pintaba una SEGUNDA ventana visible, dejando la primera vacía y ociosa. MUISCA no pide
// Cloudflare ni captcha, así que acá basta un Chrome real en modo headless (probado contra la DIAN). Cada
// revisión sigue en su propio contexto (cookies aisladas). En el contenedor Docker corre como root: ahí
// Playwright agrega --no-sandbox solo (en Windows se deja el sandbox para que Chrome no muestre su aviso).
let navegador = null;

async function getNavegador() {
  if (navegador) {
    try {
      const n = await navegador;
      if (n.isConnected()) return n;
    } catch { /* se relanza abajo */ }
    navegador = null;
  }
  const promesa = chromium.launch({
    executablePath: CHROME_PATH,
    headless: true,
    chromiumSandbox: process.platform === 'win32',
    args: process.platform === 'win32' ? [] : ['--disable-dev-shm-usage'],
  });
  navegador = promesa;
  try {
    const n = await promesa;
    n.on('disconnected', () => { if (navegador === promesa) navegador = null; });
    return n;
  } catch (err) {
    if (navegador === promesa) navegador = null;
    throw err;
  }
}

// PERFIL FIJO del navegador de las revisiones: el MISMO en cualquier equipo (Windows de desarrollo, contenedor Linux del
// servidor). Es exactamente lo que el navegador de la máquina de desarrollo manda a la DIAN —medido: Chrome en Windows,
// navigator.language es-ES, Accept-Language "es-ES,es;q=0.9", zona America/Bogota—, que es donde se probó todo. Así lo
// probado aquí se comporta igual en el servidor por construcción, y no se descubren diferencias de a poco.
// Por qué importa: el contenedor del servidor viene en inglés/UTC y la DIAN, al ver un navegador en inglés, sirve una
// página rota (cientos de 404, tabla de obligaciones vacía: «Consolidado de obligaciones» nunca aparece). Y NO vale
// cualquier español: con es-419 y es-CO la pantalla de recibos pagados formatea con COMAS (2,347,000) y con es-ES usa
// PUNTOS (2.347.000) en todas las pantallas (visto en vivo).
// Cambiar CUALQUIER valor de este perfil exige volver a probar contra la DIAN real (incluida una empresa con deuda).
const PERFIL_NAVEGADOR = Object.freeze({
  viewport: Object.freeze({ width: 1280, height: 900 }),
  locale: 'es-ES',
  timezoneId: 'America/Bogota',
  extraHTTPHeaders: Object.freeze({ 'Accept-Language': 'es-ES,es;q=0.9' }),
});
// El modo headless anuncia "HeadlessChrome" en el user agent; se presenta como el Chrome normal que es (en Windows,
// igual que en la máquina de desarrollo, sea cual sea el sistema del servidor).
const userAgentNormal = (version) => `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${version} Safari/537.36`;

// Corre `fn(context)` en la cola, con un contexto de navegador aislado que siempre se cierra, y un
// tope de tiempo por empresa (si la DIAN se queda colgada no se traba la cola).
function conContextoAislado(fn) {
  return encolar(async () => {
    const browser = await getNavegador();
    const context = await browser.newContext({ ...PERFIL_NAVEGADOR, userAgent: userAgentNormal(browser.version()) });
    let temporizador;
    try {
      return await Promise.race([
        fn(context),
        new Promise((_, reject) => {
          temporizador = setTimeout(() => reject(new ErrorDeudas('TIMEOUT', 'La DIAN tardó demasiado en responder.', 504)), TIMEOUT_EMPRESA_MS);
        }),
      ]);
    } finally {
      clearTimeout(temporizador);
      await context.close().catch(() => {});
    }
  });
}

// ── Empresa y credenciales ───────────────────────────────────────────────────
const enRevision = new Set();

async function cargarEmpresa(empresaId) {
  const { rows } = await db.query(
    `SELECT id, name, nit, tipo_contribuyente, cedula_representante, iva_periodicidad,
            dian_clave_cifrada, dian_clave_estado
     FROM empresas WHERE id = $1`,
    [empresaId]
  );
  if (!rows[0]) throw new ErrorDeudas('NO_ENCONTRADA', 'Empresa no encontrada', 404);
  return rows[0];
}

function validarIdentidad(e) {
  if (!e.tipo_contribuyente) {
    throw new ErrorDeudas('SIN_TIPO', 'Esta empresa no tiene configurado el tipo de contribuyente (empresa/natural).');
  }
  if (!e.nit) throw new ErrorDeudas('SIN_NIT', 'Esta empresa no tiene NIT/documento registrado.');
  if (e.tipo_contribuyente === 'empresa' && !e.cedula_representante) {
    throw new ErrorDeudas('SIN_CEDULA', 'Falta la cédula del representante legal para ingresar como empresa.');
  }
}

const credencialesDe = (e, clave) => ({
  tipo: e.tipo_contribuyente, nit: e.nit, cedulaRepresentante: e.cedula_representante, clave,
});

// ── Guardar / verificar la clave ─────────────────────────────────────────────
// Verifica con un login REAL antes de guardar: una clave mala no se guarda. Un solo intento.
async function guardarClave(empresaId, clave) {
  if (typeof clave !== 'string' || clave.trim() === '') throw new ErrorDeudas('CLAVE_VACIA', 'La clave no puede estar vacía.');
  const empresa = await cargarEmpresa(empresaId);
  validarIdentidad(empresa);

  const resultado = await conContextoAislado((ctx) => scraper.verificarClave(ctx, credencialesDe(empresa, clave)));
  if (!resultado.ok) {
    if (resultado.motivo === 'clave') {
      throw new ErrorDeudas('CLAVE_INVALIDA', `La DIAN rechazó la clave: ${resultado.mensaje}`, 422);
    }
    throw new ErrorDeudas('DIAN_NO_RESPONDE', `No se pudo verificar la clave (no se guardó): ${resultado.mensaje}`, 502);
  }
  await db.query(
    `UPDATE empresas SET dian_clave_cifrada = $2, dian_clave_estado = 'verificada', dian_clave_verificada_at = NOW()
     WHERE id = $1`,
    [empresaId, cifrar(clave)]
  );
  return { ok: true };
}

// Claves guardadas de todas las empresas activas, DESCIFRADAS, como { [empresaId]: clave }. La pantalla las muestra
// junto a cada empresa para copiarlas y presentar a mano cuando la revisión automática falla (hoy esas claves están en
// un Excel que ve toda la oficina). Una clave que no se pueda descifrar (llave cambiada) se omite y se cuenta.
async function claves() {
  const { rows } = await db.query('SELECT id, dian_clave_cifrada FROM empresas WHERE activa AND dian_clave_cifrada IS NOT NULL');
  const porEmpresa = {};
  let sinDescifrar = 0;
  for (const { id, dian_clave_cifrada: cifrada } of rows) {
    try {
      porEmpresa[id] = descifrar(cifrada);
    } catch {
      sinDescifrar += 1;
    }
  }
  return { claves: porEmpresa, sinDescifrar };
}

async function quitarClave(empresaId) {
  const { rowCount } = await db.query(
    `UPDATE empresas SET dian_clave_cifrada = NULL, dian_clave_estado = NULL, dian_clave_verificada_at = NULL WHERE id = $1`,
    [empresaId]
  );
  if (rowCount === 0) throw new ErrorDeudas('NO_ENCONTRADA', 'Empresa no encontrada', 404);
}

// ── Persistencia ─────────────────────────────────────────────────────────────
// Revisión buena (al_dia / con_deuda): reemplaza la del mes y su detalle.
async function guardarRevisionBuena({ empresaId, mes, estado, mensaje, detalle, userId }) {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO dian_deudas_revisiones (empresa_id, mes, estado, mensaje, revisado_at, revisado_por)
       VALUES ($1, $2, $3, $4, NOW(), $5)
       ON CONFLICT (empresa_id, mes) DO UPDATE
         SET estado = EXCLUDED.estado, mensaje = EXCLUDED.mensaje, revisado_at = NOW(), revisado_por = EXCLUDED.revisado_por
       RETURNING id`,
      [empresaId, mes, estado, mensaje, userId]
    );
    const revisionId = rows[0].id;
    await client.query('DELETE FROM dian_deudas_detalle WHERE revision_id = $1', [revisionId]);
    for (const d of detalle) {
      await client.query(
        `INSERT INTO dian_deudas_detalle
           (revision_id, concepto, tipo_obligacion, anio, periodo, obligacion, valor_base, valor_total, estado, nota, vencida)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [revisionId, d.concepto, d.tipoObligacion, d.anio, d.periodo, d.obligacion, d.valorBase, d.valorTotal, d.estado, d.nota, d.vencida !== false]
      );
    }
    await client.query('COMMIT');
    return revisionId;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// Resultado malo (clave / error): solo se registra si ese mes no tiene ya una revisión buena.
async function guardarRevisionFallida({ empresaId, mes, estado, mensaje, userId }) {
  await db.query(
    `INSERT INTO dian_deudas_revisiones (empresa_id, mes, estado, mensaje, revisado_at, revisado_por)
     VALUES ($1, $2, $3, $4, NOW(), $5)
     ON CONFLICT (empresa_id, mes) DO UPDATE
       SET estado = EXCLUDED.estado, mensaje = EXCLUDED.mensaje, revisado_at = NOW(), revisado_por = EXCLUDED.revisado_por
       WHERE dian_deudas_revisiones.estado IN ('error', 'clave')`,
    [empresaId, mes, estado, mensaje, userId]
  );
}

// ── Revisar una empresa ──────────────────────────────────────────────────────
async function revisarEmpresa(empresaId, { userId, mes = mesActualBogota() } = {}) {
  if (enRevision.has(empresaId)) throw new ErrorDeudas('EN_CURSO', 'Esta empresa ya se está revisando.', 409);
  enRevision.add(empresaId);
  try {
    const empresa = await cargarEmpresa(empresaId);
    validarIdentidad(empresa);
    if (!empresa.dian_clave_cifrada) throw new ErrorDeudas('SIN_CLAVE', 'Esta empresa no tiene clave DIAN guardada.');
    if (empresa.dian_clave_estado === 'invalida') {
      throw new ErrorDeudas('CLAVE_INVALIDA', 'La DIAN rechazó la clave guardada: hay que registrar una nueva antes de revisar (no se reintenta para no bloquear la cuenta).', 409);
    }
    const clave = descifrar(empresa.dian_clave_cifrada);

    let resultado;
    try {
      resultado = await conContextoAislado((ctx) => scraper.consultarEmpresa(ctx, credencialesDe(empresa, clave)));
    } catch (err) {
      logger.warn({ empresaId, err: err.message }, 'Revisión de deudas DIAN falló');
      await guardarRevisionFallida({ empresaId, mes, estado: 'error', mensaje: err.message.slice(0, 500), userId });
      return { estado: 'error', mensaje: err.message };
    }

    if (!resultado.login.ok) {
      if (resultado.login.motivo === 'clave') {
        await db.query(`UPDATE empresas SET dian_clave_estado = 'invalida' WHERE id = $1`, [empresaId]);
        await guardarRevisionFallida({ empresaId, mes, estado: 'clave', mensaje: resultado.login.mensaje, userId });
        return { estado: 'clave', mensaje: resultado.login.mensaje };
      }
      await guardarRevisionFallida({ empresaId, mes, estado: 'error', mensaje: resultado.login.mensaje, userId });
      return { estado: 'error', mensaje: resultado.login.mensaje };
    }

    await db.query(`UPDATE empresas SET dian_clave_estado = 'verificada', dian_clave_verificada_at = NOW() WHERE id = $1`, [empresaId]);

    if (!resultado.hayDeuda) {
      await guardarRevisionBuena({ empresaId, mes, estado: 'al_dia', mensaje: null, detalle: [], userId });
      return { estado: 'al_dia', detalle: [] };
    }

    const conConcepto = resultado.deudas.map((d) => ({ ...d, concepto: clasificarConcepto(d.tipoObligacion) }));
    const detalle = cruzarConRecibos(conConcepto, resultado.recibos);
    const estado = estadoRevision(detalle);
    const mensaje = estado === 'al_dia' ? 'La DIAN aún lista deudas, pero todas tienen recibo pagado.' : null;
    await guardarRevisionBuena({ empresaId, mes, estado, mensaje, detalle, userId });
    return { estado, detalle };
  } finally {
    enRevision.delete(empresaId);
  }
}

// ── Revisar todas ────────────────────────────────────────────────────────────
const progresoInicial = () => ({
  enCurso: false, total: 0, hechas: 0, alDia: 0, conDeuda: 0, clave: 0, errores: 0,
  iniciadaAt: null, terminadaAt: null, empresasActuales: [],
});
let progreso = progresoInicial();

const getProgreso = () => ({ ...progreso, empresasActuales: [...progreso.empresasActuales] });

// Dispara la revisión en segundo plano y devuelve de inmediato cuántas empresas entran. Solo las que
// tienen clave guardada y no marcada como inválida; con soloPendientes (por defecto) se saltan las ya
// revisadas HOY (hora de Bogotá), no las del mes: así se puede retomar un lote interrumpido o reintentar solo los
// errores, pero la revisión de fin de mes NO se salta por tener una de hace días (que ya tiene los intereses viejos).
async function revisarTodas({ userId, soloPendientes = true, io = null } = {}) {
  if (progreso.enCurso) throw new ErrorDeudas('EN_CURSO', 'Ya hay una revisión de todas las empresas en curso.', 409);
  const mes = mesActualBogota();
  const { rows } = await db.query(
    `SELECT e.id, e.name FROM empresas e
     WHERE e.activa AND e.dian_clave_cifrada IS NOT NULL AND e.dian_clave_estado IS DISTINCT FROM 'invalida'
       AND e.tipo_contribuyente IS NOT NULL
       AND ($2::boolean = FALSE OR NOT EXISTS (
         SELECT 1 FROM dian_deudas_revisiones r
         WHERE r.empresa_id = e.id AND r.mes = $1 AND r.estado IN ('al_dia', 'con_deuda')
           AND r.revisado_at >= (date_trunc('day', now() AT TIME ZONE 'America/Bogota') AT TIME ZONE 'America/Bogota')))
     ORDER BY e.name`,
    [mes, soloPendientes]
  );

  progreso = { ...progresoInicial(), enCurso: true, total: rows.length, iniciadaAt: new Date().toISOString() };
  io?.emit('dianDeudas:progreso', getProgreso());
  if (rows.length === 0) {
    progreso = { ...progreso, enCurso: false, terminadaAt: new Date().toISOString() };
    return { total: 0 };
  }

  const pendientes = [...rows];
  const trabajador = async () => {
    while (pendientes.length > 0) {
      const { id, name } = pendientes.shift();
      progreso.empresasActuales.push(name);
      let estado;
      try {
        ({ estado } = await revisarEmpresa(id, { userId, mes }));
      } catch (err) {
        estado = err.codigo === 'CLAVE_INVALIDA' ? 'clave' : 'error';
        if (!(err instanceof ErrorDeudas)) logger.error({ empresaId: id, err: err.message }, 'Revisar todas: fallo inesperado');
      }
      progreso.empresasActuales = progreso.empresasActuales.filter((n) => n !== name);
      progreso.hechas += 1;
      if (estado === 'al_dia') progreso.alDia += 1;
      else if (estado === 'con_deuda') progreso.conDeuda += 1;
      else if (estado === 'clave') progreso.clave += 1;
      else progreso.errores += 1;
      io?.emit('dianDeudas:revisada', { empresaId: id, estado });
      io?.emit('dianDeudas:progreso', getProgreso());
    }
  };

  Promise.all(Array.from({ length: Math.min(MAX_CONCURRENTE, rows.length) }, trabajador))
    .catch((err) => logger.error({ err: err.message }, 'Revisar todas: falló el lote'))
    .finally(() => {
      progreso = { ...progreso, enCurso: false, terminadaAt: new Date().toISOString(), empresasActuales: [] };
      io?.emit('dianDeudas:progreso', getProgreso());
    });

  return { total: rows.length };
}

module.exports = {
  ErrorDeudas, revisarEmpresa, revisarTodas, getProgreso, guardarClave, quitarClave, claves,
  // solo para pruebas
  PERFIL_NAVEGADOR,
  _reiniciarEstado: () => { enRevision.clear(); progreso = progresoInicial(); navegador = null; },
};
