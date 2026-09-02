// Catálogo de empresas del módulo Contabilidad — mismo patrón que extEmpresasController.js,
// adaptado: acá no hay responsable/contador, pero sí `nit` (se completa solo con el primer
// reporte DIAN que se sube para esa empresa, ver dianController.js#uploadDian).
const { v4: uuidv4 } = require('uuid');
const db = require('../config/database');
const auditLog = require('../utils/auditLog');

const normalizeEmpresa = (row) => ({
  id:        row.id,
  name:      row.name,
  nit:       row.nit ?? null,
  activa:    row.activa,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const getEmpresas = async (req, res, next) => {
  try {
    const result = await db.query('SELECT * FROM contab_empresas ORDER BY name ASC');
    res.json(result.rows.map(normalizeEmpresa));
  } catch (err) {
    next(err);
  }
};

const getEmpresa = async (req, res, next) => {
  try {
    const result = await db.query('SELECT * FROM contab_empresas WHERE id = $1', [req.params.id]);
    if (!result.rows[0]) return res.status(404).json({ error: 'Empresa no encontrada' });
    res.json(normalizeEmpresa(result.rows[0]));
  } catch (err) {
    next(err);
  }
};

// Abierto a cualquier autenticado (no solo admin): el equipo necesita poder agregar una
// empresa nueva de las 52 en pleno flujo de subida, sin depender de un admin disponible.
const createEmpresa = async (req, res, next) => {
  try {
    const { name, nit = null } = req.body;
    const id = uuidv4();
    const result = await db.query(
      `INSERT INTO contab_empresas (id, name, nit)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [id, name.trim().toUpperCase(), nit ? nit.trim() : null]
    );
    await auditLog(req.user.userId, 'CREATE', 'contab_empresas', id, { name, nit });
    req.io.emit('contabilidad:updated', { empresaId: id, tipo: 'empresa' });
    res.status(201).json(normalizeEmpresa(result.rows[0]));
  } catch (err) {
    next(err);
  }
};

const updateEmpresa = async (req, res, next) => {
  try {
    const { id } = req.params;
    const existing = await db.query('SELECT id FROM contab_empresas WHERE id = $1', [id]);
    if (!existing.rows[0]) return res.status(404).json({ error: 'Empresa no encontrada' });

    const { name, activa } = req.body;
    // nit necesita distinguir "no lo mandaron" (no tocar) de "lo mandaron en null"
    // (desasignar) — COALESCE no sirve para eso, mismo patrón que responsableId en
    // extEmpresasController.js.
    const nitProvided = Object.prototype.hasOwnProperty.call(req.body, 'nit');
    const result = await db.query(
      `UPDATE contab_empresas SET
        name   = COALESCE($1, name),
        activa = COALESCE($2, activa),
        nit    = CASE WHEN $3 THEN $4 ELSE nit END
       WHERE id = $5
       RETURNING *`,
      [
        name !== undefined ? name.trim().toUpperCase() : null,
        activa ?? null,
        nitProvided,
        req.body.nit ? req.body.nit.trim() : null,
        id,
      ]
    );
    await auditLog(req.user.userId, 'UPDATE', 'contab_empresas', id, { name, activa, nit: req.body.nit });
    req.io.emit('contabilidad:updated', { empresaId: id, tipo: 'empresa' });
    res.json(normalizeEmpresa(result.rows[0]));
  } catch (err) {
    next(err);
  }
};

const deleteEmpresa = async (req, res, next) => {
  try {
    const { id } = req.params;
    const existing = await db.query('SELECT id FROM contab_empresas WHERE id = $1', [id]);
    if (!existing.rows[0]) return res.status(404).json({ error: 'Empresa no encontrada' });

    await db.query('DELETE FROM contab_empresas WHERE id = $1', [id]);
    await auditLog(req.user.userId, 'DELETE', 'contab_empresas', id, {});
    req.io.emit('contabilidad:updated', { empresaId: id, tipo: 'empresa' });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
};

module.exports = { getEmpresas, getEmpresa, createEmpresa, updateEmpresa, deleteEmpresa };
