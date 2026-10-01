const db = require('../config/database');
const auditLog = require('../utils/auditLog');
const { getMesHabilitado } = require('../utils/mesVencidoNominaElectronica');

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

// Fecha límite por mes de trabajo — ver migración 061 (ne_plazo_mes). Sin ?anio&mes devuelve la
// del mes habilitado. fecha_limite puede no existir todavía (mes sin configurar): el frontend lo
// muestra como "sin configurar".
const getPlazo = async (req, res, next) => {
  try {
    const habilitado = getMesHabilitado();
    const anio = parseInt(req.query.anio ?? habilitado.anio, 10);
    const mes  = parseInt(req.query.mes  ?? habilitado.mes, 10);
    const result = await db.query(
      'SELECT fecha_limite, updated_at FROM ne_plazo_mes WHERE anio = $1 AND mes = $2',
      [anio, mes]
    );
    const row = result.rows[0];
    res.json({
      anio, mes,
      fechaLimite: toDateOnlyString(row?.fecha_limite),
      updatedAt:   row?.updated_at ?? null,
    });
  } catch (err) {
    next(err);
  }
};

const updatePlazo = async (req, res, next) => {
  try {
    const { anio, mes, fechaLimite } = req.body;
    const result = await db.query(
      `INSERT INTO ne_plazo_mes (anio, mes, fecha_limite) VALUES ($1, $2, $3)
       ON CONFLICT (anio, mes) DO UPDATE SET fecha_limite = EXCLUDED.fecha_limite
       RETURNING fecha_limite, updated_at`,
      [anio, mes, fechaLimite ?? null]
    );
    await auditLog(req.user.userId, 'UPDATE', 'ne_plazo_mes', `${anio}-${mes}`, { anio, mes, fechaLimite });
    req.io.emit('nominaElectronica:updated', { tipo: 'plazo', anio, mes });
    res.json({
      anio, mes,
      fechaLimite: toDateOnlyString(result.rows[0].fecha_limite),
      updatedAt:   result.rows[0].updated_at,
    });
  } catch (err) {
    next(err);
  }
};

module.exports = { getPlazo, updatePlazo };
