const { v4: uuidv4 } = require('uuid');
const db = require('../config/database');
const auditLog = require('../utils/auditLog');

const getChecklistMes = async (req, res, next) => {
  try {
    const { empresaId } = req.params;
    const anio = parseInt(req.query.anio, 10);
    const mes  = parseInt(req.query.mes, 10);

    const result = await db.query(
      `SELECT p.id, p.name, p.orden, p.activo,
              COALESCE(i.estado, 'pending') AS estado,
              i.nota,
              COALESCE(m.confirmed, false) AS confirmed
       FROM fondo_procesos p
       LEFT JOIN fondo_checklist_meses m
              ON m.empresa_id = $1 AND m.anio = $2 AND m.mes = $3
       LEFT JOIN fondo_checklist_items i
              ON i.mes_id = m.id AND i.proceso_id = p.id
       WHERE p.activo = true OR i.id IS NOT NULL
       ORDER BY p.orden`,
      [empresaId, anio, mes]
    );

    const rows = result.rows;
    const confirmed = rows.length > 0 ? rows[0].confirmed : false;
    const items = rows.map(row => ({
      id:     row.id,
      name:   row.name,
      orden:  row.orden,
      activo: row.activo,
      estado: row.estado,
      nota:   row.nota,
    }));

    res.json({ confirmed, items });
  } catch (err) {
    next(err);
  }
};

const updateChecklistItem = async (req, res, next) => {
  try {
    const { empresaId, procesoId } = req.params;
    const anio = parseInt(req.query.anio, 10);
    const mes  = parseInt(req.query.mes, 10);
    const { estado, nota } = req.body;

    // Crear la fila del mes solo si no existe aún
    await db.query(
      `INSERT INTO fondo_checklist_meses (id, empresa_id, anio, mes)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (empresa_id, anio, mes) DO NOTHING`,
      [uuidv4(), empresaId, anio, mes]
    );
    const mesResult = await db.query(
      'SELECT id FROM fondo_checklist_meses WHERE empresa_id = $1 AND anio = $2 AND mes = $3',
      [empresaId, anio, mes]
    );
    const mesId = mesResult.rows[0].id;

    const result = await db.query(
      `INSERT INTO fondo_checklist_items (id, mes_id, proceso_id, estado, nota)
       VALUES ($1, $2, $3, COALESCE($4, 'pending'), $5)
       ON CONFLICT (mes_id, proceso_id) DO UPDATE
       SET estado = COALESCE(EXCLUDED.estado, fondo_checklist_items.estado),
           nota   = COALESCE(EXCLUDED.nota,   fondo_checklist_items.nota)
       RETURNING *`,
      [uuidv4(), mesId, procesoId, estado ?? null, nota ?? null]
    );

    await auditLog(req.user.userId, 'UPDATE', 'fondo_checklist_items', result.rows[0].id, {
      empresaId, anio, mes, procesoId, estado, nota,
    });

    req.io.emit('empresa:updated', { empresaId, anio, mes, tipo: 'checklist' });

    res.json({
      id:        result.rows[0].id,
      mesId:     result.rows[0].mes_id,
      procesoId: result.rows[0].proceso_id,
      estado:    result.rows[0].estado,
      nota:      result.rows[0].nota,
      updatedAt: result.rows[0].updated_at,
    });
  } catch (err) {
    next(err);
  }
};

const updateChecklistConfirmado = async (req, res, next) => {
  try {
    const { empresaId } = req.params;
    const anio = parseInt(req.query.anio, 10);
    const mes  = parseInt(req.query.mes, 10);
    const { confirmed } = req.body;

    const result = await db.query(
      `INSERT INTO fondo_checklist_meses (id, empresa_id, anio, mes, confirmed)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (empresa_id, anio, mes) DO UPDATE
       SET confirmed = EXCLUDED.confirmed
       RETURNING *`,
      [uuidv4(), empresaId, anio, mes, confirmed]
    );

    await auditLog(req.user.userId, 'UPDATE', 'fondo_checklist_meses', result.rows[0].id, {
      empresaId, anio, mes, confirmed,
    });

    req.io.emit('empresa:updated', { empresaId, anio, mes, tipo: 'checklist' });

    res.json({
      id:        result.rows[0].id,
      empresaId: result.rows[0].empresa_id,
      anio:      result.rows[0].anio,
      mes:       result.rows[0].mes,
      confirmed: result.rows[0].confirmed,
      updatedAt: result.rows[0].updated_at,
    });
  } catch (err) {
    next(err);
  }
};

module.exports = { getChecklistMes, updateChecklistItem, updateChecklistConfirmado };
