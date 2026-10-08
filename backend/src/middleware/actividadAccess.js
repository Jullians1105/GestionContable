// Permiso para ver el registro de actividad del equipo (quién hizo qué, por día).
// Mismo patrón que empresasAccess.js: el administrador siempre puede, y a los demás roles (excepto
// viewer) se les da desde la pantalla Usuarios con `permissions.modulos.actividad.canVer`.
const db = require('../config/database');
const logger = require('../utils/logger');

const requireActividad = async (req, res, next) => {
  if (!req.user) return res.status(401).json({ error: 'No autenticado' });

  const { userId, role } = req.user;

  if (role === 'admin') return next();

  if (role === 'viewer') {
    logger.warn({ userId, path: req.path }, 'requireActividad — viewer bloqueado');
    return res.status(403).json({ error: 'No tienes permiso para ver la actividad' });
  }

  try {
    const result = await db.query('SELECT permissions FROM users WHERE id = $1', [userId]);
    const perms = result.rows[0]?.permissions;
    if (perms?.modulos?.actividad?.canVer === true) return next();

    logger.warn({ userId, path: req.path }, 'requireActividad — permiso actividad.canVer ausente');
    return res.status(403).json({ error: 'No tienes permiso para ver la actividad' });
  } catch (err) {
    next(err);
  }
};

module.exports = { requireActividad };
