const { verify } = require('../utils/jwt');
const db = require('../config/database');
const logger = require('../utils/logger');

const authMiddleware = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token requerido' });
  }
  const token = authHeader.slice(7);
  try {
    const blacklisted = await db.query(
      'SELECT 1 FROM token_blacklist WHERE token = $1',
      [token]
    );
    if (blacklisted.rows.length > 0) {
      return res.status(401).json({ error: 'Token inválido' });
    }
    const decoded = verify(token);
    // El JWT dura 1 h: el rol y el estado se leen de la BD para que desactivar a alguien
    // o cambiarle el rol aplique de inmediato y no cuando expire el token.
    const current = await db.query('SELECT role, is_active FROM users WHERE id = $1', [decoded.userId]);
    const row = current.rows[0];
    if (!row || row.is_active === false) {
      return res.status(401).json({ error: 'Cuenta desactivada o inexistente' });
    }
    req.user = { ...decoded, role: row.role };
    req.token = token;
    next();
  } catch {
    return res.status(401).json({ error: 'Token inválido o expirado' });
  }
};

const roleMiddleware = (...roles) => (req, res, next) => {
  if (!req.user) return res.status(401).json({ error: 'No autenticado' });
  if (!roles.includes(req.user.role)) {
    logger.warn(
      { userId: req.user.userId, role: req.user.role, required: roles, path: req.path },
      'Role check failed — access denied'
    );
    return res.status(403).json({ error: 'Permisos insuficientes' });
  }
  next();
};

const canEdit = (req, res, next) => {
  if (!req.user) return res.status(401).json({ error: 'No autenticado' });
  if (req.user.role === 'viewer') {
    logger.warn(
      { userId: req.user.userId, path: req.path, method: req.method },
      'canEdit check failed — viewer attempted write'
    );
    return res.status(403).json({ error: 'Los viewers no pueden modificar datos' });
  }
  next();
};

module.exports = { authMiddleware, roleMiddleware, canEdit };
