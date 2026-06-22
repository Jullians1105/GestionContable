const { v4: uuidv4 } = require('uuid');
const db = require('../config/database');
const auditLog = require('../utils/auditLog');

const normalizeEmpresa = (row) => ({
  id:         row.id,
  name:       row.name,
  categoria:  row.categoria,
  monthlyFee: row.monthly_fee !== null && row.monthly_fee !== undefined
                ? parseFloat(row.monthly_fee)
                : null,
  createdAt:  row.created_at,
  updatedAt:  row.updated_at,
});

const getEmpresas = async (req, res, next) => {
  try {
    const { categoria } = req.query;
    const params = [];
    let where = '';
    if (categoria) {
      where = 'WHERE categoria = $1';
      params.push(categoria);
    }
    const result = await db.query(
      `SELECT * FROM fondo_empresas ${where} ORDER BY name ASC`,
      params
    );
    res.json(result.rows.map(normalizeEmpresa));
  } catch (err) {
    next(err);
  }
};

const getEmpresa = async (req, res, next) => {
  try {
    const result = await db.query(
      'SELECT * FROM fondo_empresas WHERE id = $1',
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
    const { name, categoria = 'contable', monthlyFee = null } = req.body;
    const id = uuidv4();
    const result = await db.query(
      `INSERT INTO fondo_empresas (id, name, categoria, monthly_fee)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [id, name.trim().toUpperCase(), categoria, monthlyFee]
    );
    await auditLog(req.user.userId, 'CREATE', 'fondo_empresas', id, { name, categoria, monthlyFee });
    res.status(201).json(normalizeEmpresa(result.rows[0]));
  } catch (err) {
    next(err);
  }
};

const updateEmpresa = async (req, res, next) => {
  try {
    const { id } = req.params;
    const existing = await db.query('SELECT * FROM fondo_empresas WHERE id = $1', [id]);
    if (!existing.rows[0]) return res.status(404).json({ error: 'Empresa no encontrada' });

    const { name, categoria, monthlyFee } = req.body;
    const result = await db.query(
      `UPDATE fondo_empresas SET
        name        = COALESCE($1, name),
        categoria   = COALESCE($2, categoria),
        monthly_fee = COALESCE($3, monthly_fee)
       WHERE id = $4
       RETURNING *`,
      [
        name !== undefined ? name.trim().toUpperCase() : null,
        categoria ?? null,
        monthlyFee !== undefined ? monthlyFee : null,
        id,
      ]
    );
    await auditLog(req.user.userId, 'UPDATE', 'fondo_empresas', id, { name, categoria, monthlyFee });
    res.json(normalizeEmpresa(result.rows[0]));
  } catch (err) {
    next(err);
  }
};

const deleteEmpresa = async (req, res, next) => {
  try {
    const { id } = req.params;
    const existing = await db.query('SELECT id FROM fondo_empresas WHERE id = $1', [id]);
    if (!existing.rows[0]) return res.status(404).json({ error: 'Empresa no encontrada' });

    await db.query('DELETE FROM fondo_empresas WHERE id = $1', [id]);
    await auditLog(req.user.userId, 'DELETE', 'fondo_empresas', id, {});
    res.status(204).end();
  } catch (err) {
    next(err);
  }
};

module.exports = { getEmpresas, getEmpresa, createEmpresa, updateEmpresa, deleteEmpresa };
