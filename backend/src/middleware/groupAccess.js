const db = require('../config/database');
const logger = require('../utils/logger');

const requireGroupLeader = async (req, res, next) => {
  if (!req.user) return res.status(401).json({ error: 'No autenticado' });
  if (req.user.role === 'admin') return next();

  if (req.user.role !== 'leader') {
    return res.status(403).json({ error: 'Permisos insuficientes' });
  }

  const groupId = req.params.id;
  try {
    const result = await db.query(
      'SELECT 1 FROM group_members WHERE group_id = $1 AND user_id = $2 AND is_leader = true',
      [groupId, req.user.userId]
    );
    if (result.rows.length === 0) {
      logger.warn(
        { userId: req.user.userId, groupId, path: req.path },
        'requireGroupLeader — no es líder de este grupo'
      );
      return res.status(403).json({ error: 'Solo el líder de este grupo puede hacer esta acción' });
    }
    next();
  } catch (err) {
    next(err);
  }
};

module.exports = { requireGroupLeader };
