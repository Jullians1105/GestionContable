// Directorio maestro de empresas — une fondo_empresas, ext_empresas, ne_empresas y
// contab_empresas bajo una sola identidad (tabla `empresas`, ver migración 053). Cada una de
// esas 4 tablas sigue siendo dueña de sus propios campos (categoria/monthlyFee, responsable_id,
// nit, etc.) — acá solo se administra la identidad (nombre, activa) y qué módulos tiene
// habilitados cada empresa, para poder verlo y corregirlo desde un solo lugar en vez de
// buscarlo por separado en 4 pantallas.
const { v4: uuidv4 } = require('uuid');
const db = require('../config/database');
const auditLog = require('../utils/auditLog');
const { palabrasSignificativas } = require('../utils/nombresSeParecen');

// Un módulo = una tabla + sus campos propios (los que SÍ importan para mostrarlos en el
// directorio; no es la lista completa de columnas de cada tabla, solo lo identificable a
// simple vista). `insertar` arma el INSERT de habilitación con lo mínimo de cada tabla.
const MODULOS = {
  fondo: {
    tabla: 'fondo_empresas',
    campos: (row) => ({ categoria: row.categoria, monthlyFee: row.monthly_fee != null ? parseFloat(row.monthly_fee) : null }),
    insertar: async (client, { id, name, empresaId, extra }) => {
      await client.query(
        `INSERT INTO fondo_empresas (id, name, categoria, empresa_id) VALUES ($1, $2, $3, $4)`,
        [id, name, extra?.categoria ?? 'contable', empresaId]
      );
    },
  },
  ext: {
    tabla: 'ext_empresas',
    campos: (row) => ({ responsableId: row.responsable_id ?? null }),
    insertar: async (client, { id, name, empresaId }) => {
      await client.query(
        `INSERT INTO ext_empresas (id, name, empresa_id) VALUES ($1, $2, $3)`,
        [id, name, empresaId]
      );
    },
  },
  ne: {
    tabla: 'ne_empresas',
    campos: (row) => ({ responsableId: row.responsable_id ?? null }),
    insertar: async (client, { id, name, empresaId }) => {
      await client.query(
        `INSERT INTO ne_empresas (id, name, empresa_id) VALUES ($1, $2, $3)`,
        [id, name, empresaId]
      );
    },
  },
  contab: {
    tabla: 'contab_empresas',
    campos: (row) => ({ nit: row.nit ?? null }),
    insertar: async (client, { id, name, empresaId }) => {
      await client.query(
        `INSERT INTO contab_empresas (id, name, empresa_id) VALUES ($1, $2, $3)`,
        [id, name, empresaId]
      );
    },
  },
};

const normalizeEmpresa = (row) => ({
  id: row.id,
  name: row.name,
  nit: row.nit ?? null,
  activa: row.activa,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

// ── Directorio ───────────────────────────────────────────────────────────────────
const getDirectorio = async (req, res, next) => {
  try {
    const { rows } = await db.query(`
      SELECT
        e.id, e.name, e.nit, e.activa, e.created_at, e.updated_at,
        fe.id AS fondo_id, fe.categoria AS fondo_categoria, fe.monthly_fee AS fondo_monthly_fee,
        ee.id AS ext_id, ee.responsable_id AS ext_responsable_id,
        ne.id AS ne_id, ne.responsable_id AS ne_responsable_id,
        ce.id AS contab_id, ce.nit AS contab_nit
      FROM empresas e
      LEFT JOIN fondo_empresas  fe ON fe.empresa_id = e.id
      LEFT JOIN ext_empresas    ee ON ee.empresa_id = e.id
      LEFT JOIN ne_empresas     ne ON ne.empresa_id = e.id
      LEFT JOIN contab_empresas ce ON ce.empresa_id = e.id
      ORDER BY e.name ASC
    `);
    res.json(rows.map((r) => ({
      ...normalizeEmpresa(r),
      modulos: {
        fondo: r.fondo_id ? { id: r.fondo_id, categoria: r.fondo_categoria, monthlyFee: r.fondo_monthly_fee != null ? parseFloat(r.fondo_monthly_fee) : null } : null,
        ext: r.ext_id ? { id: r.ext_id, responsableId: r.ext_responsable_id } : null,
        ne: r.ne_id ? { id: r.ne_id, responsableId: r.ne_responsable_id } : null,
        contab: r.contab_id ? { id: r.contab_id, nit: r.contab_nit } : null,
      },
    })));
  } catch (err) {
    next(err);
  }
};

// Sugerencias de posible duplicado — dos señales, en orden de confianza:
//
// 1. Mismo NIT en dos empresas distintas (motivo 'nit'): señal casi segura, el NIT es un
//    identificador oficial real. Hoy solo lo captura Contabilidad (se aprende del primer
//    reporte DIAN, ver dianController.js#uploadDian y la cascada hacia `empresas.nit` ahí
//    mismo) — a futuro, cualquier módulo que llegue a guardar NIT participa igual.
// 2. Nombre parecido (motivo 'nombre', comparten al menos una palabra significativa) — SOLO
//    cuando el NIT no puede descartarlo: si ambas empresas ya tienen NIT conocido y son
//    distintos, eso es prueba de que no son la misma, así que la sugerencia por nombre se
//    descarta aunque compartan palabra (evita el falso positivo, no solo lo ignora a ciegas).
//
// A propósito NO se reutiliza nombresSeParecen tal cual para el nombre: esa función devuelve
// true también cuando a alguno de los dos nombres no le queda ninguna palabra significativa
// (pensada para "no bloquear una subida por datos insuficientes"), lo que acá inundaría de
// falsos positivos cualquier nombre corto/genérico ("GC", "SB PUBLICIDAD"). Acá se exige que
// AMBOS nombres tengan señal real y la compartan.
const getPosiblesDuplicados = async (req, res, next) => {
  try {
    const { rows } = await db.query('SELECT id, name, nit FROM empresas ORDER BY name ASC');
    const empresas = rows.map((e) => ({ ...e, palabras: new Set(palabrasSignificativas(e.name)) }));
    const sugerencias = [];
    for (let i = 0; i < empresas.length; i++) {
      for (let j = i + 1; j < empresas.length; j++) {
        const a = empresas[i];
        const b = empresas[j];
        const par = { empresaA: { id: a.id, name: a.name }, empresaB: { id: b.id, name: b.name } };

        if (a.nit && b.nit) {
          if (a.nit === b.nit) sugerencias.push({ ...par, motivo: 'nit', detalle: a.nit });
          continue; // NIT conocido en ambas ya resuelve el caso, para bien o para mal
        }

        if (a.palabras.size === 0 || b.palabras.size === 0) continue;
        const compartidas = [...a.palabras].filter((p) => b.palabras.has(p));
        if (compartidas.length > 0) {
          sugerencias.push({ ...par, motivo: 'nombre', detalle: compartidas.join(', ') });
        }
      }
    }
    // Los de NIT primero — son la señal fuerte, no deberían perderse entre las de nombre.
    sugerencias.sort((s) => (s.motivo === 'nit' ? -1 : 1));
    res.json(sugerencias);
  } catch (err) {
    next(err);
  }
};

// ── CRUD de identidad ────────────────────────────────────────────────────────────
const createEmpresa = async (req, res, next) => {
  try {
    const { name } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'El nombre es obligatorio' });
    const id = uuidv4();
    const result = await db.query(
      'INSERT INTO empresas (id, name) VALUES ($1, $2) RETURNING *',
      [id, name.trim().toUpperCase()]
    );
    await auditLog(req.user.userId, 'CREATE', 'empresas', id, { name });
    req.io.emit('empresas:updated', { empresaId: id });
    res.status(201).json(normalizeEmpresa(result.rows[0]));
  } catch (err) {
    next(err);
  }
};

// Renombrar/activar-desactivar es la única escritura que toca el nombre — cascada a las filas
// de módulo ya habilitadas para que ningún SELECT existente en esos 4 controladores quede
// mostrando un nombre viejo (ver comentario de la migración 053 sobre por qué no se centralizó
// el nombre con un JOIN).
const updateEmpresa = async (req, res, next) => {
  const client = await db.getClient();
  try {
    const { id } = req.params;
    const { name, activa } = req.body;
    const nombreNuevo = name !== undefined ? name.trim().toUpperCase() : null;

    await client.query('BEGIN');
    const result = await client.query(
      `UPDATE empresas SET name = COALESCE($1, name), activa = COALESCE($2, activa) WHERE id = $3 RETURNING *`,
      [nombreNuevo, activa ?? null, id]
    );
    if (!result.rows[0]) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Empresa no encontrada' });
    }
    if (nombreNuevo) {
      for (const { tabla } of Object.values(MODULOS)) {
        await client.query(`UPDATE ${tabla} SET name = $1 WHERE empresa_id = $2`, [nombreNuevo, id]);
      }
    }
    await client.query('COMMIT');
    await auditLog(req.user.userId, 'UPDATE', 'empresas', id, { name, activa });
    req.io.emit('empresas:updated', { empresaId: id });
    res.json(normalizeEmpresa(result.rows[0]));
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
};

// ── Habilitar / deshabilitar por módulo ──────────────────────────────────────────
const habilitarModulo = async (req, res, next) => {
  try {
    const { id: empresaId } = req.params;
    const { modulo, ...extra } = req.body;
    const cfg = MODULOS[modulo];
    if (!cfg) return res.status(400).json({ error: `Módulo inválido. Usa: ${Object.keys(MODULOS).join(', ')}` });

    const empresa = await db.query('SELECT id, name FROM empresas WHERE id = $1', [empresaId]);
    if (!empresa.rows[0]) return res.status(404).json({ error: 'Empresa no encontrada' });

    const yaHabilitada = await db.query(`SELECT id FROM ${cfg.tabla} WHERE empresa_id = $1`, [empresaId]);
    if (yaHabilitada.rows[0]) {
      return res.status(409).json({ error: `Esta empresa ya está habilitada en ese módulo` });
    }

    const id = uuidv4();
    const client = await db.getClient();
    try {
      await client.query('BEGIN');
      await cfg.insertar(client, { id, name: empresa.rows[0].name, empresaId, extra });
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    await auditLog(req.user.userId, 'CREATE', cfg.tabla, id, { empresaId, modulo, ...extra });
    req.io.emit('empresas:updated', { empresaId, tipo: 'habilitar', modulo });
    res.status(201).json({ id, modulo });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Esa empresa ya está habilitada en ese módulo' });
    }
    next(err);
  }
};

const deshabilitarModulo = async (req, res, next) => {
  try {
    const { id: empresaId, modulo } = req.params;
    const cfg = MODULOS[modulo];
    if (!cfg) return res.status(400).json({ error: `Módulo inválido. Usa: ${Object.keys(MODULOS).join(', ')}` });

    const fila = await db.query(`SELECT id FROM ${cfg.tabla} WHERE empresa_id = $1`, [empresaId]);
    if (!fila.rows[0]) return res.status(404).json({ error: 'Esta empresa no está habilitada en ese módulo' });

    await db.query(`DELETE FROM ${cfg.tabla} WHERE empresa_id = $1`, [empresaId]);
    await auditLog(req.user.userId, 'DELETE', cfg.tabla, fila.rows[0].id, { empresaId, modulo });
    req.io.emit('empresas:updated', { empresaId, tipo: 'deshabilitar', modulo });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
};

// ── Fusionar dos empresas maestras (misma empresa real, creada por separado) ────
// Mueve las habilitaciones de módulo de `empresaIdB` hacia `empresaIdA` y borra B. Si ambas ya
// tienen el mismo módulo habilitado, no se elige a ciegas cuál conservar — se avisa con 409 y
// hay que deshabilitar uno de los dos primero, a mano.
const fusionar = async (req, res, next) => {
  const client = await db.getClient();
  try {
    const { empresaIdA, empresaIdB } = req.body;
    if (!empresaIdA || !empresaIdB || empresaIdA === empresaIdB) {
      return res.status(400).json({ error: 'empresaIdA y empresaIdB son requeridos y deben ser distintos' });
    }

    const [a, b] = await Promise.all([
      db.query('SELECT id, name FROM empresas WHERE id = $1', [empresaIdA]),
      db.query('SELECT id, name FROM empresas WHERE id = $1', [empresaIdB]),
    ]);
    if (!a.rows[0] || !b.rows[0]) return res.status(404).json({ error: 'Alguna de las dos empresas no existe' });

    const conflictos = [];
    for (const [modulo, cfg] of Object.entries(MODULOS)) {
      const [filaA, filaB] = await Promise.all([
        db.query(`SELECT id FROM ${cfg.tabla} WHERE empresa_id = $1`, [empresaIdA]),
        db.query(`SELECT id FROM ${cfg.tabla} WHERE empresa_id = $1`, [empresaIdB]),
      ]);
      if (filaA.rows[0] && filaB.rows[0]) conflictos.push(modulo);
    }
    if (conflictos.length > 0) {
      return res.status(409).json({
        error: `Las dos empresas tienen habilitado el mismo módulo (${conflictos.join(', ')}) — deshabilita uno de los dos ahí antes de fusionar.`,
        conflictos,
      });
    }

    await client.query('BEGIN');
    for (const { tabla } of Object.values(MODULOS)) {
      await client.query(`UPDATE ${tabla} SET empresa_id = $1, name = $2 WHERE empresa_id = $3`, [empresaIdA, a.rows[0].name, empresaIdB]);
    }
    await client.query('DELETE FROM empresas WHERE id = $1', [empresaIdB]);
    await client.query('COMMIT');

    await auditLog(req.user.userId, 'UPDATE', 'empresas', empresaIdA, { fusionadaCon: empresaIdB });
    req.io.emit('empresas:updated', { empresaId: empresaIdA, tipo: 'fusion' });
    res.json({ success: true, empresaId: empresaIdA });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
};

module.exports = {
  MODULOS,
  getDirectorio,
  getPosiblesDuplicados,
  createEmpresa,
  updateEmpresa,
  habilitarModulo,
  deshabilitarModulo,
  fusionar,
};
