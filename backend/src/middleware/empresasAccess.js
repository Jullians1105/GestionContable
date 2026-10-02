// Permiso por usuario para "Actualizar matrícula" (RUES) en el directorio de empresas.
// Mismo patrón que fondoAccess.js / nominaElectronicaAccess.js: el administrador siempre puede, y
// a los demás roles (excepto viewer) se les puede dar desde la pantalla Usuarios con
// `permissions.modulos.empresas.canActualizarMatricula`.
const db = require('../config/database');
const logger = require('../utils/logger');

const requireEmpresasMatricula = async (req, res, next) => {
  if (!req.user) return res.status(401).json({ error: 'No autenticado' });

  const { userId, role } = req.user;

  if (role === 'admin') return next();

  if (role === 'viewer') {
    logger.warn({ userId, path: req.path, method: req.method }, 'requireEmpresasMatricula — viewer bloqueado');
    return res.status(403).json({ error: 'No tienes permiso para actualizar la matrícula' });
  }

  try {
    const result = await db.query('SELECT permissions FROM users WHERE id = $1', [userId]);
    const perms = result.rows[0]?.permissions;
    if (perms?.modulos?.empresas?.canActualizarMatricula === true) return next();

    logger.warn(
      { userId, path: req.path, method: req.method },
      'requireEmpresasMatricula — permiso empresas.canActualizarMatricula ausente'
    );
    return res.status(403).json({ error: 'No tienes permiso para actualizar la matrícula' });
  } catch (err) {
    next(err);
  }
};

module.exports = { requireEmpresasMatricula };
