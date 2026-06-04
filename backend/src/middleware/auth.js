const { verify } = require('../utils/jwt');
const db = require('../config/database');

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
    req.user = decoded;
    req.token = token;
    next();
  } catch {
    return res.status(401).json({ error: 'Token inválido o expirado' });
  }
};

const roleMiddleware = (...roles) => (req, res, next) => {
  if (!req.user) return res.status(401).json({ error: 'No autenticado' });
  if (!roles.includes(req.user.role)) {
    return res.status(403).json({ error: 'Permisos insuficientes' });
  }
  next();
};

const canEdit = (req, res, next) => {
  if (!req.user) return res.status(401).json({ error: 'No autenticado' });
  if (req.user.role === 'viewer') {
    return res.status(403).json({ error: 'Los viewers no pueden modificar datos' });
  }
  next();
};

module.exports = { authMiddleware, roleMiddleware, canEdit };
