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

// Estructura del Seguimiento Mensual (grupos y catálogo de procesos): a
// diferencia del resto de Fondo Emprender, esto no se abre por el permiso
// granular `canEditar` — lo pidió el equipo para que solo el admin pueda
// reorganizar columnas, y el resto le pida los cambios a él.
const requireFondoAdmin = (req, res, next) => {
  if (!req.user) return res.status(401).json({ error: 'No autenticado' });

  if (req.user.role === 'admin') return next();

  logger.warn(
    { userId: req.user.userId, path: req.path, method: req.method },
    'requireFondoAdmin — rol no admin bloqueado'
  );
  return res.status(403).json({ error: 'Solo un administrador puede modificar la estructura de columnas' });
};

const requireFondoAutorizarPagos = async (req, res, next) => {
  if (!req.user) return res.status(401).json({ error: 'No autenticado' });

  const { userId, role } = req.user;

  if (role === 'admin') return next();

  try {
    const result = await db.query(
      'SELECT permissions FROM users WHERE id = $1',
      [userId]
    );
    const perms = result.rows[0]?.permissions;
    if (perms?.modulos?.fondoEmprender?.canAutorizarPagos === true) return next();

    logger.warn(
      { userId, path: req.path, method: req.method },
      'requireFondoAutorizarPagos — permiso fondoEmprender.canAutorizarPagos ausente'
    );
    return res.status(403).json({ error: 'No tienes permiso para autorizar el envío de pagos' });
  } catch (err) {
    next(err);
  }
};

module.exports = { requireFondoAccess, requireFondoAdmin, requireFondoAutorizarPagos };
