const { v4: uuidv4 } = require('uuid');
const db = require('../config/database');
const auditLog = require('../utils/auditLog');

const normalizeGrupo = (row) => ({
  id:             row.id,
  name:           row.name,
  orden:          row.orden,
  // Vínculo estable a un macroproceso (ej. 'mp5' para el grupo que alimenta
  // Contabilidad) — se setea por migración, no editable desde acá.
  macroprocesoId: row.macroproceso_id ?? null,
  createdAt:      row.created_at,
  updatedAt:      row.updated_at,
});

const getGrupos = async (req, res, next) => {
  try {
    const result = await db.query('SELECT * FROM fondo_proceso_grupos ORDER BY orden ASC, created_at ASC');
    res.json(result.rows.map(normalizeGrupo));
  } catch (err) {
    next(err);
  }
};

const createGrupo = async (req, res, next) => {
  try {
    const { name, orden } = req.body;
    let ordenFinal = orden;
    if (ordenFinal === undefined || ordenFinal === null) {
      const maxResult = await db.query(
        'SELECT COALESCE(MAX(orden), -1) + 1 AS next_orden FROM fondo_proceso_grupos'
      );
      ordenFinal = maxResult.rows[0].next_orden;
    }
    const id = uuidv4();
    const result = await db.query(
      `INSERT INTO fondo_proceso_grupos (id, name, orden)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [id, name.trim(), ordenFinal]
    );
    await auditLog(req.user.userId, 'CREATE', 'fondo_proceso_grupos', id, { name, orden: ordenFinal });
    res.status(201).json(normalizeGrupo(result.rows[0]));
  } catch (err) {
    next(err);
  }
};

const updateGrupo = async (req, res, next) => {
  try {
    const { id } = req.params;
    const existing = await db.query('SELECT * FROM fondo_proceso_grupos WHERE id = $1', [id]);
    if (!existing.rows[0]) return res.status(404).json({ error: 'Grupo no encontrado' });

    const { name, orden } = req.body;
    const result = await db.query(
      `UPDATE fondo_proceso_grupos SET
        name  = COALESCE($1, name),
        orden = COALESCE($2, orden)
       WHERE id = $3
       RETURNING *`,
      [
        name  !== undefined ? name.trim() : null,
        orden !== undefined ? orden        : null,
        id,
      ]
    );
    await auditLog(req.user.userId, 'UPDATE', 'fondo_proceso_grupos', id, { name, orden });
    res.json(normalizeGrupo(result.rows[0]));
  } catch (err) {
    next(err);
  }
};

// Borrar un grupo no toca los procesos que contenía — quedan sin grupo
// (grupo_id = NULL vía ON DELETE SET NULL) en vez de perderse, ya que a
// diferencia de un proceso un grupo no tiene historial propio.
const deleteGrupo = async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await db.query('DELETE FROM fondo_proceso_grupos WHERE id = $1 RETURNING id', [id]);
    if (!result.rows[0]) return res.status(404).json({ error: 'Grupo no encontrado' });
    await auditLog(req.user.userId, 'DELETE', 'fondo_proceso_grupos', id, {});
    res.status(204).send();
  } catch (err) {
    next(err);
  }
};

module.exports = { getGrupos, createGrupo, updateGrupo, deleteGrupo };
