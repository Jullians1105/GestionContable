const { v4: uuidv4 } = require('uuid');
const db = require('../config/database');
const auditLog = require('../utils/auditLog');

const normalizeProceso = (row) => ({
  id:        row.id,
  name:      row.name,
  orden:     row.orden,
  activo:    row.activo,
  grupoId:   row.grupo_id,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const getProcesos = async (req, res, next) => {
  try {
    const incluirInactivos = req.query.incluirInactivos === 'true';
    const where = incluirInactivos ? '' : 'WHERE activo = true';
    const result = await db.query(
      `SELECT * FROM fondo_procesos ${where} ORDER BY orden ASC`
    );
    res.json(result.rows.map(normalizeProceso));
  } catch (err) {
    next(err);
  }
};

const createProceso = async (req, res, next) => {
  try {
    const { name, orden, grupoId } = req.body;
    let ordenFinal = orden;
    if (ordenFinal === undefined || ordenFinal === null) {
      const maxResult = await db.query(
        'SELECT COALESCE(MAX(orden), -1) + 1 AS next_orden FROM fondo_procesos'
      );
      ordenFinal = maxResult.rows[0].next_orden;
    }
    const id = uuidv4();
    const result = await db.query(
      `INSERT INTO fondo_procesos (id, name, orden, grupo_id)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [id, name.trim(), ordenFinal, grupoId ?? null]
    );
    await auditLog(req.user.userId, 'CREATE', 'fondo_procesos', id, { name, orden: ordenFinal, grupoId });
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

    const { name, orden, activo, grupoId } = req.body;
    // grupoId necesita distinguir "no lo mandaron" (no tocar) de "lo mandaron
    // en null" (sacar el proceso de su grupo) — COALESCE no sirve para eso,
    // mismo problema que las notas del checklist (ver fondoChecklistController).
    const grupoIdProvided = Object.prototype.hasOwnProperty.call(req.body, 'grupoId');
    const result = await db.query(
      `UPDATE fondo_procesos SET
        name     = COALESCE($1, name),
        orden    = COALESCE($2, orden),
        activo   = COALESCE($3, activo),
        grupo_id = CASE WHEN $4 THEN $5 ELSE grupo_id END
       WHERE id = $6
       RETURNING *`,
      [
        name  !== undefined ? name.trim() : null,
        orden !== undefined ? orden        : null,
        activo !== undefined ? activo      : null,
        grupoIdProvided,
        grupoId ?? null,
        id,
      ]
    );
    await auditLog(req.user.userId, 'UPDATE', 'fondo_procesos', id, { name, orden, activo, grupoId });
    res.json(normalizeProceso(result.rows[0]));
  } catch (err) {
    next(err);
  }
};

module.exports = { getProcesos, createProceso, updateProceso };
