const { v4: uuidv4 } = require('uuid');
const db = require('../config/database');
const auditLog = require('../utils/auditLog');

const normalizeProceso = (row) => ({
  id:        row.id,
  name:      row.name,
  orden:     row.orden,
  activo:    row.activo,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const getProcesos = async (req, res, next) => {
  try {
    const incluirInactivos = req.query.incluirInactivos === 'true';
    const where = incluirInactivos ? '' : 'WHERE activo = true';
    const result = await db.query(
      `SELECT * FROM ext_procesos ${where} ORDER BY orden ASC, created_at ASC`
    );
    res.json(result.rows.map(normalizeProceso));
  } catch (err) {
    next(err);
  }
};

const createProceso = async (req, res, next) => {
  try {
    const { name, orden } = req.body;
    let ordenFinal = orden;
    if (ordenFinal === undefined || ordenFinal === null) {
      const maxResult = await db.query(
        'SELECT COALESCE(MAX(orden), -1) + 1 AS next_orden FROM ext_procesos'
      );
      ordenFinal = maxResult.rows[0].next_orden;
    }
    const id = uuidv4();
    const result = await db.query(
      `INSERT INTO ext_procesos (id, name, orden)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [id, name.trim(), ordenFinal]
    );
    await auditLog(req.user.userId, 'CREATE', 'ext_procesos', id, { name, orden: ordenFinal });
    res.status(201).json(normalizeProceso(result.rows[0]));
  } catch (err) {
    next(err);
  }
};

const updateProceso = async (req, res, next) => {
  try {
    const { id } = req.params;
    const existing = await db.query('SELECT * FROM ext_procesos WHERE id = $1', [id]);
    if (!existing.rows[0]) return res.status(404).json({ error: 'Proceso no encontrado' });

    const { name, orden, activo } = req.body;
    const result = await db.query(
      `UPDATE ext_procesos SET
        name   = COALESCE($1, name),
        orden  = COALESCE($2, orden),
        activo = COALESCE($3, activo)
       WHERE id = $4
       RETURNING *`,
      [
        name !== undefined ? name.trim() : null,
        orden !== undefined ? orden : null,
        activo !== undefined ? activo : null,
        id,
      ]
    );
    await auditLog(req.user.userId, 'UPDATE', 'ext_procesos', id, { name, orden, activo });
    res.json(normalizeProceso(result.rows[0]));
  } catch (err) {
    next(err);
  }
};

module.exports = { getProcesos, createProceso, updateProceso };
