const db = require('../config/database');
const auditLog = require('../utils/auditLog');
const { isMesHabilitado } = require('../utils/mesVencido');

const getImpuestos = async (req, res, next) => {
  try {
    const { empresaId } = req.params;
    const anio = parseInt(req.query.anio, 10);
    const mes  = parseInt(req.query.mes, 10);

    // Crear las 4 filas del mes si no existen aún — a diferencia del checklist
    // mensual, aquí siempre queremos las 4 filas disponibles desde la primera
    // lectura para que el PATCH individual nunca tenga que decidir si crea o actualiza.
    await db.query(
      `INSERT INTO fondo_impuestos_items (empresa_id, impuesto_id, anio, mes)
       SELECT $1, i.id, $2, $3
       FROM fondo_impuestos i
       ON CONFLICT (empresa_id, impuesto_id, anio, mes) DO NOTHING`,
      [empresaId, anio, mes]
    );

    const result = await db.query(
      `SELECT fi.id, i.id AS impuesto_id, i.codigo, i.nombre, i.orden, fi.estado, fi.nota, fi.updated_at
       FROM fondo_impuestos i
       JOIN fondo_impuestos_items fi
         ON fi.impuesto_id = i.id
        AND fi.empresa_id  = $1
        AND fi.anio        = $2
        AND fi.mes         = $3
       ORDER BY i.orden`,
      [empresaId, anio, mes]
    );

    const items = result.rows.map(row => ({
      id:         row.id,
      impuestoId: row.impuesto_id,
      codigo:     row.codigo,
      nombre:     row.nombre,
      orden:      row.orden,
      estado:     row.estado,
      nota:       row.nota,
      updatedAt:  row.updated_at,
    }));

    res.json({ items });
  } catch (err) {
    next(err);
  }
};

const updateImpuestoItem = async (req, res, next) => {
  try {
    const { empresaId, impuestoId } = req.params;
    const anio = parseInt(req.query.anio, 10);
    const mes  = parseInt(req.query.mes, 10);
    const { estado, nota } = req.body;

    if (!isMesHabilitado(anio, mes)) {
      return res.status(403).json({ error: 'Ese mes aún no está habilitado (mes vencido)' });
    }

    const result = await db.query(
      `INSERT INTO fondo_impuestos_items (empresa_id, impuesto_id, anio, mes, estado, nota)
       VALUES ($1, $2, $3, $4, COALESCE($5, 'pending'), $6)
       ON CONFLICT (empresa_id, impuesto_id, anio, mes) DO UPDATE
       SET estado = COALESCE(EXCLUDED.estado, fondo_impuestos_items.estado),
           nota   = COALESCE(EXCLUDED.nota,   fondo_impuestos_items.nota)
       RETURNING *`,
      [empresaId, impuestoId, anio, mes, estado ?? null, nota ?? null]
    );

    await auditLog(req.user.userId, 'UPDATE', 'fondo_impuestos_items', result.rows[0].id, {
      empresaId, impuestoId, anio, mes, estado, nota,
    });

    req.io.emit('empresa:updated', { empresaId, anio, mes, tipo: 'impuestos' });

    const row = result.rows[0];
    res.json({
      id:         row.id,
      empresaId:  row.empresa_id,
      impuestoId: row.impuesto_id,
      estado:     row.estado,
      nota:       row.nota,
      updatedAt:  row.updated_at,
    });
  } catch (err) {
    next(err);
  }
};

module.exports = { getImpuestos, updateImpuestoItem };
