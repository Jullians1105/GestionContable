const db = require('../config/database');
const auditLog = require('../utils/auditLog');

const normalizeEmpresa = (row) => ({
  id:                row.id,
  name:              row.name,
  origen:            row.origen ?? null,
  responsableId:     row.responsable_id ?? null,
  responsableNombre: row.responsable_nombre ?? null,
  fondoEmpresaId:    row.fondo_empresa_id ?? null,
  fondoEmpresaNombre: row.fondo_empresa_nombre ?? null,
  extEmpresaId:      row.ext_empresa_id ?? null,
  extEmpresaNombre:  row.ext_empresa_nombre ?? null,
  activa:            row.activa,
  vigenteHastaAnio:  row.vigente_hasta_anio ?? null,
  vigenteHastaMes:   row.vigente_hasta_mes  ?? null,
  createdAt:         row.created_at,
  updatedAt:         row.updated_at,
});

const SELECT_BASE = `
  SELECT e.*,
         u.name  AS responsable_nombre,
         fe.name AS fondo_empresa_nombre,
         ee.name AS ext_empresa_nombre
  FROM ne_empresas e
  LEFT JOIN users u             ON u.id  = e.responsable_id
  LEFT JOIN fondo_empresas fe   ON fe.id = e.fondo_empresa_id
  LEFT JOIN ext_empresas ee     ON ee.id = e.ext_empresa_id
`;

// Con neScope === 'own' cada quien solo ve sus propias empresas (cada quien
// lleva lo suyo, ver nominaElectronicaAccess.js); admin/canVerTodo ven todas.
const getEmpresas = async (req, res, next) => {
  try {
    const own = req.neScope === 'own';
    const result = await db.query(
      `${SELECT_BASE} ${own ? 'WHERE e.responsable_id = $1' : ''} ORDER BY e.name ASC`,
      own ? [req.user.userId] : []
    );
    res.json(result.rows.map(normalizeEmpresa));
  } catch (err) {
    next(err);
  }
};

const getEmpresa = async (req, res, next) => {
  try {
    const result = await db.query(`${SELECT_BASE} WHERE e.id = $1`, [req.params.id]);
    if (!result.rows[0]) return res.status(404).json({ error: 'Empresa no encontrada' });
    res.json(normalizeEmpresa(result.rows[0]));
  } catch (err) {
    next(err);
  }
};

const updateEmpresa = async (req, res, next) => {
  try {
    const { id } = req.params;
    const existing = await db.query('SELECT id FROM ne_empresas WHERE id = $1', [id]);
    if (!existing.rows[0]) return res.status(404).json({ error: 'Empresa no encontrada' });

    const { name, activa } = req.body;
    // responsableId/fondoEmpresaId/extEmpresaId/origen necesitan distinguir
    // "no lo mandaron" (no tocar) de "lo mandaron en null" (desasignar) —
    // mismo problema documentado en extEmpresasController.updateEmpresa.
    const origenProvided = Object.prototype.hasOwnProperty.call(req.body, 'origen');
    const responsableIdProvided = Object.prototype.hasOwnProperty.call(req.body, 'responsableId');
    const fondoEmpresaIdProvided = Object.prototype.hasOwnProperty.call(req.body, 'fondoEmpresaId');
    const extEmpresaIdProvided = Object.prototype.hasOwnProperty.call(req.body, 'extEmpresaId');
    // vigenteHasta* viaja como par (o los dos o ninguno, ver constraint de la
    // migración 059) — un solo flag basta para distinguir "no lo mandaron" de
    // "lo mandaron en null" (quitar el límite, volver a "sin vencimiento").
    const vigenciaProvided = Object.prototype.hasOwnProperty.call(req.body, 'vigenteHastaAnio')
      || Object.prototype.hasOwnProperty.call(req.body, 'vigenteHastaMes');

    const result = await db.query(
      `UPDATE ne_empresas SET
        name              = COALESCE($1, name),
        activa            = COALESCE($2, activa),
        origen            = CASE WHEN $3 THEN $4 ELSE origen END,
        responsable_id    = CASE WHEN $5 THEN $6 ELSE responsable_id END,
        fondo_empresa_id  = CASE WHEN $7 THEN $8 ELSE fondo_empresa_id END,
        ext_empresa_id    = CASE WHEN $9 THEN $10 ELSE ext_empresa_id END,
        vigente_hasta_anio = CASE WHEN $12 THEN $13 ELSE vigente_hasta_anio END,
        vigente_hasta_mes  = CASE WHEN $12 THEN $14 ELSE vigente_hasta_mes END
       WHERE id = $11
       RETURNING *`,
      [
        name !== undefined ? name.trim().toUpperCase() : null,
        activa ?? null,
        origenProvided, req.body.origen ?? null,
        responsableIdProvided, req.body.responsableId ?? null,
        fondoEmpresaIdProvided, req.body.fondoEmpresaId ?? null,
        extEmpresaIdProvided, req.body.extEmpresaId ?? null,
        id,
        vigenciaProvided, req.body.vigenteHastaAnio ?? null, req.body.vigenteHastaMes ?? null,
      ]
    );
    await auditLog(req.user.userId, 'UPDATE', 'ne_empresas', id, {
      name, activa, origen: req.body.origen, responsableId: req.body.responsableId, fondoEmpresaId: req.body.fondoEmpresaId, extEmpresaId: req.body.extEmpresaId,
      vigenteHastaAnio: req.body.vigenteHastaAnio, vigenteHastaMes: req.body.vigenteHastaMes,
    });
    req.io.emit('nominaElectronica:updated', { empresaId: id, tipo: 'empresa' });
    res.json(await reload(id));
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Esa empresa de Fondo Emprender o Empresas Externas ya está enlazada a otra fila de Nómina Electrónica' });
    }
    next(err);
  }
};

const deleteEmpresa = async (req, res, next) => {
  try {
    const { id } = req.params;
    const existing = await db.query('SELECT id FROM ne_empresas WHERE id = $1', [id]);
    if (!existing.rows[0]) return res.status(404).json({ error: 'Empresa no encontrada' });

    await db.query('DELETE FROM ne_empresas WHERE id = $1', [id]);
    await auditLog(req.user.userId, 'DELETE', 'ne_empresas', id, {});
    req.io.emit('nominaElectronica:updated', { empresaId: id, tipo: 'empresa' });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
};

async function reload(id) {
  const result = await db.query(`${SELECT_BASE} WHERE e.id = $1`, [id]);
  return normalizeEmpresa(result.rows[0]);
}

module.exports = { getEmpresas, getEmpresa, updateEmpresa, deleteEmpresa };
