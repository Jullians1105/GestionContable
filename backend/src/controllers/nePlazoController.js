const db = require('../config/database');
const auditLog = require('../utils/auditLog');

// El driver `pg` parsea columnas DATE a un objeto Date de JS (no a un string
// "YYYY-MM-DD"), y res.json() lo serializa como timestamp ISO completo con
// hora y "Z" — el frontend esperaba justo "YYYY-MM-DD" y con eso rompía
// (Invalid Date). Se normaliza acá para que la API siempre devuelva la fecha
// pura, sin importar qué forma tenga el valor que vino de la base.
function toDateOnlyString(value) {
  if (!value) return null;
  if (typeof value === 'string') return value.slice(0, 10);
  return value.toISOString().slice(0, 10);
}

// Singleton (id=1) — ver migración 050. fecha_limite puede ser NULL (nunca
// configurado todavía), el frontend lo maneja mostrando "sin configurar".
const getPlazo = async (req, res, next) => {
  try {
    const result = await db.query('SELECT fecha_limite, updated_at FROM ne_plazo WHERE id = 1');
    const row = result.rows[0];
    res.json({
      fechaLimite: toDateOnlyString(row?.fecha_limite),
      updatedAt:   row?.updated_at ?? null,
    });
  } catch (err) {
    next(err);
  }
};

const updatePlazo = async (req, res, next) => {
  try {
    const { fechaLimite } = req.body;
    const result = await db.query(
      `UPDATE ne_plazo SET fecha_limite = $1 WHERE id = 1 RETURNING fecha_limite, updated_at`,
      [fechaLimite ?? null]
    );
    await auditLog(req.user.userId, 'UPDATE', 'ne_plazo', 1, { fechaLimite });
    req.io.emit('nominaElectronica:updated', { tipo: 'plazo' });
    res.json({
      fechaLimite: toDateOnlyString(result.rows[0].fecha_limite),
      updatedAt:   result.rows[0].updated_at,
    });
  } catch (err) {
    next(err);
  }
};

module.exports = { getPlazo, updatePlazo };
