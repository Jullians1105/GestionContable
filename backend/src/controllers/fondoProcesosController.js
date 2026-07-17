const { v4: uuidv4 } = require('uuid');
const db = require('../config/database');
const auditLog = require('../utils/auditLog');

const normalizeProceso = (row) => ({
  id:        row.id,
  name:      row.name,
  orden:     row.orden,
  activo:    row.activo,
  grupoId:   row.grupo_id,
  vigenteDesde: row.vigente_desde_anio == null ? null : { anio: row.vigente_desde_anio, mes: row.vigente_desde_mes },
  vigenteHasta: row.vigente_hasta_anio == null ? null : { anio: row.vigente_hasta_anio, mes: row.vigente_hasta_mes },
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const getProcesos = async (req, res, next) => {
  try {
    const incluirInactivos = req.query.incluirInactivos === 'true';
    const where = incluirInactivos ? '' : 'WHERE activo = true';
    const result = await db.query(
      `SELECT * FROM fondo_procesos ${where} ORDER BY orden ASC, created_at ASC`
    );
    res.json(result.rows.map(normalizeProceso));
  } catch (err) {
    next(err);
  }
};

const createProceso = async (req, res, next) => {
  try {
    const { name, orden, grupoId, vigenteDesde, vigenteHasta } = req.body;
    let ordenFinal = orden;
    if (ordenFinal === undefined || ordenFinal === null) {
      const maxResult = await db.query(
        'SELECT COALESCE(MAX(orden), -1) + 1 AS next_orden FROM fondo_procesos'
      );
      ordenFinal = maxResult.rows[0].next_orden;
    }
    const id = uuidv4();
    const result = await db.query(
      `INSERT INTO fondo_procesos
        (id, name, orden, grupo_id, vigente_desde_anio, vigente_desde_mes, vigente_hasta_anio, vigente_hasta_mes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        id, name.trim(), ordenFinal, grupoId ?? null,
        vigenteDesde?.anio ?? null, vigenteDesde?.mes ?? null,
        vigenteHasta?.anio ?? null, vigenteHasta?.mes ?? null,
      ]
    );
    await auditLog(req.user.userId, 'CREATE', 'fondo_procesos', id, { name, orden: ordenFinal, grupoId, vigenteDesde, vigenteHasta });
    res.status(201).json(normalizeProceso(result.rows[0]));
  } catch (err) {
    next(err);
  }
};

const updateProceso = async (req, res, next) => {
  try {
    const { id } = req.params;
    const existing = await db.query('SELECT * FROM fondo_procesos WHERE id = $1', [id]);
    if (!existing.rows[0]) return res.status(404).json({ error: 'Proceso no encontrado' });

    const { name, orden, activo, grupoId, vigenteDesde, vigenteHasta } = req.body;
    // grupoId/vigenteDesde/vigenteHasta necesitan distinguir "no lo mandaron"
    // (no tocar) de "lo mandaron en null" (quitar la restricción) — COALESCE
    // no sirve para eso, mismo problema que las notas del checklist (ver
    // fondoChecklistController).
    const grupoIdProvided      = Object.prototype.hasOwnProperty.call(req.body, 'grupoId');
    const vigenteDesdeProvided = Object.prototype.hasOwnProperty.call(req.body, 'vigenteDesde');
    const vigenteHastaProvided = Object.prototype.hasOwnProperty.call(req.body, 'vigenteHasta');
    const result = await db.query(
      `UPDATE fondo_procesos SET
        name                = COALESCE($1, name),
        orden               = COALESCE($2, orden),
        activo              = COALESCE($3, activo),
        grupo_id            = CASE WHEN $4 THEN $5  ELSE grupo_id            END,
        vigente_desde_anio  = CASE WHEN $6 THEN $7  ELSE vigente_desde_anio  END,
        vigente_desde_mes   = CASE WHEN $6 THEN $8  ELSE vigente_desde_mes   END,
        vigente_hasta_anio  = CASE WHEN $9 THEN $10 ELSE vigente_hasta_anio  END,
        vigente_hasta_mes   = CASE WHEN $9 THEN $11 ELSE vigente_hasta_mes   END
       WHERE id = $12
       RETURNING *`,
      [
        name  !== undefined ? name.trim() : null,
        orden !== undefined ? orden        : null,
        activo !== undefined ? activo      : null,
        grupoIdProvided,
        grupoId ?? null,
        vigenteDesdeProvided,
        vigenteDesde?.anio ?? null,
        vigenteDesde?.mes ?? null,
        vigenteHastaProvided,
        vigenteHasta?.anio ?? null,
        vigenteHasta?.mes ?? null,
        id,
      ]
    );
    await auditLog(req.user.userId, 'UPDATE', 'fondo_procesos', id, { name, orden, activo, grupoId, vigenteDesde, vigenteHasta });
    res.json(normalizeProceso(result.rows[0]));
  } catch (err) {
    next(err);
  }
};

module.exports = { getProcesos, createProceso, updateProceso };
