const { v4: uuidv4 } = require('uuid');
const db = require('../config/database');
const auditLog = require('../utils/auditLog');

const normalizeEmpresa = (row) => ({
  id:                row.id,
  name:              row.name,
  responsableId:     row.responsable_id ?? null,
  responsableNombre: row.responsable_nombre ?? null,
  activa:            row.activa,
  createdAt:         row.created_at,
  updatedAt:         row.updated_at,
});

const getEmpresas = async (req, res, next) => {
  try {
    const result = await db.query(
      `SELECT e.*, u.name AS responsable_nombre
       FROM ext_empresas e
       LEFT JOIN users u ON u.id = e.responsable_id
       ORDER BY e.name ASC`
    );
    res.json(result.rows.map(normalizeEmpresa));
  } catch (err) {
    next(err);
  }
};

const getEmpresa = async (req, res, next) => {
  try {
    const result = await db.query(
      `SELECT e.*, u.name AS responsable_nombre
       FROM ext_empresas e
       LEFT JOIN users u ON u.id = e.responsable_id
       WHERE e.id = $1`,
      [req.params.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Empresa no encontrada' });
    res.json(normalizeEmpresa(result.rows[0]));
  } catch (err) {
    next(err);
  }
};

const createEmpresa = async (req, res, next) => {
  try {
    const { name, responsableId = null } = req.body;
    const id = uuidv4();
    const result = await db.query(
      `INSERT INTO ext_empresas (id, name, responsable_id)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [id, name.trim().toUpperCase(), responsableId]
    );
    await auditLog(req.user.userId, 'CREATE', 'ext_empresas', id, { name, responsableId });
    req.io.emit('externas:updated', { empresaId: id, tipo: 'empresa' });
    res.status(201).json(normalizeEmpresa(result.rows[0]));
  } catch (err) {
    next(err);
  }
};

const updateEmpresa = async (req, res, next) => {
  try {
    const { id } = req.params;
    const existing = await db.query('SELECT id FROM ext_empresas WHERE id = $1', [id]);
    if (!existing.rows[0]) return res.status(404).json({ error: 'Empresa no encontrada' });

    const { name, activa } = req.body;
    // responsableId necesita distinguir "no lo mandaron" (no tocar) de "lo
    // mandaron en null" (desasignar el responsable) — COALESCE no sirve para
    // eso, mismo problema que codigo_siigo en fondoEmpresasController.js.
    const responsableIdProvided = Object.prototype.hasOwnProperty.call(req.body, 'responsableId');
    const result = await db.query(
      `UPDATE ext_empresas SET
        name           = COALESCE($1, name),
        activa         = COALESCE($2, activa),
        responsable_id = CASE WHEN $3 THEN $4 ELSE responsable_id END
       WHERE id = $5
       RETURNING *`,
      [
        name !== undefined ? name.trim().toUpperCase() : null,
        activa ?? null,
        responsableIdProvided,
        req.body.responsableId ?? null,
        id,
      ]
    );
    await auditLog(req.user.userId, 'UPDATE', 'ext_empresas', id, { name, activa, responsableId: req.body.responsableId });
    req.io.emit('externas:updated', { empresaId: id, tipo: 'empresa' });
    res.json(normalizeEmpresa(result.rows[0]));
  } catch (err) {
    next(err);
  }
};

const deleteEmpresa = async (req, res, next) => {
  try {
    const { id } = req.params;
    const existing = await db.query('SELECT id FROM ext_empresas WHERE id = $1', [id]);
    if (!existing.rows[0]) return res.status(404).json({ error: 'Empresa no encontrada' });

    await db.query('DELETE FROM ext_empresas WHERE id = $1', [id]);
    await auditLog(req.user.userId, 'DELETE', 'ext_empresas', id, {});
    req.io.emit('externas:updated', { empresaId: id, tipo: 'empresa' });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
};

module.exports = { getEmpresas, getEmpresa, createEmpresa, updateEmpresa, deleteEmpresa };
