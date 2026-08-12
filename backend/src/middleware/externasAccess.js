const db = require('../config/database');
const logger = require('../utils/logger');

// Mismo patrón que fondoAccess.js — permisos guardados en users.permissions
// (JSONB), esta vez bajo la clave modulos.empresasExternas.

const requireExternasAccess = async (req, res, next) => {
  if (!req.user) return res.status(401).json({ error: 'No autenticado' });

  const { userId, role } = req.user;

  if (role === 'admin') return next();

  if (role === 'viewer') {
    logger.warn(
      { userId, path: req.path, method: req.method },
      'requireExternasAccess — viewer bloqueado'
    );
    return res.status(403).json({ error: 'No tienes permiso de edición en Empresas Externas' });
  }

  try {
    const result = await db.query(
      'SELECT permissions FROM users WHERE id = $1',
      [userId]
    );
    const perms = result.rows[0]?.permissions;
    if (perms?.modulos?.empresasExternas?.canEditar === true) return next();

    logger.warn(
      { userId, path: req.path, method: req.method },
      'requireExternasAccess — permiso empresasExternas.canEditar ausente'
    );
    return res.status(403).json({ error: 'No tienes permiso de edición en Empresas Externas' });
  } catch (err) {
    next(err);
  }
};

// Estructura (catálogo de procesos y catálogo de empresas): no hay página
// aparte para gestionar empresas, se hace desde "Editar estructura" en la
// misma grilla — por eso, a diferencia de canEditar (marcar el checklist),
// esto no tiene permiso granular: es admin o nada, mismo criterio que la
// estructura de columnas de Fondo Emprender.
const requireExternasAdmin = (req, res, next) => {
  if (!req.user) return res.status(401).json({ error: 'No autenticado' });

  if (req.user.role === 'admin') return next();

  logger.warn(
    { userId: req.user.userId, path: req.path, method: req.method },
    'requireExternasAdmin — rol no admin bloqueado'
  );
  return res.status(403).json({ error: 'Solo un administrador puede modificar la estructura de Empresas Externas' });
};

module.exports = { requireExternasAccess, requireExternasAdmin };
