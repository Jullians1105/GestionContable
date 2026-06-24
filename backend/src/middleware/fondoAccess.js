const db = require('../config/database');
const logger = require('../utils/logger');

const requireFondoAccess = async (req, res, next) => {
  if (!req.user) return res.status(401).json({ error: 'No autenticado' });

  const { userId, role } = req.user;

  if (role === 'admin') return next();

  if (role === 'viewer') {
    logger.warn(
      { userId, path: req.path, method: req.method },
      'requireFondoAccess — viewer bloqueado'
    );
    return res.status(403).json({ error: 'No tienes permiso de edición en Fondo Emprender' });
  }

  try {
    const result = await db.query(
      'SELECT permissions FROM users WHERE id = $1',
      [userId]
    );
    const perms = result.rows[0]?.permissions;
    if (perms?.modulos?.fondoEmprender?.canEditar === true) return next();

    logger.warn(
      { userId, path: req.path, method: req.method },
      'requireFondoAccess — permiso fondoEmprender.canEditar ausente'
    );
    return res.status(403).json({ error: 'No tienes permiso de edición en Fondo Emprender' });
  } catch (err) {
    next(err);
  }
};

module.exports = { requireFondoAccess };
