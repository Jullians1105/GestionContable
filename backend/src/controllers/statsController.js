const db = require('../config/database');

const getStats = async (req, res, next) => {
  try {
    const [general, byPriority, byUser, recentActivity] = await Promise.all([
      db.query(`
        SELECT
          COUNT(*) AS total,
          COUNT(CASE WHEN status = 'completed' THEN 1 END) AS completadas,
          COUNT(CASE WHEN status = 'in_progress' THEN 1 END) AS en_progreso,
          COUNT(CASE WHEN status = 'pending' THEN 1 END) AS pendientes,
          COUNT(CASE WHEN due_date < NOW() AND status != 'completed' THEN 1 END) AS vencidas
        FROM tasks
      `),
      db.query(`
        SELECT priority, COUNT(*) AS count
        FROM tasks GROUP BY priority ORDER BY count DESC
      `),
      db.query(`
        SELECT u.id, u.name, COUNT(t.id) AS total,
          COUNT(CASE WHEN t.status = 'completed' THEN 1 END) AS completadas
        FROM users u
        LEFT JOIN tasks t ON t.assigned_to = u.id
        GROUP BY u.id, u.name
        ORDER BY total DESC
        LIMIT 10
      `),
      db.query(`
        SELECT action, table_name, created_at
        FROM audit_log ORDER BY created_at DESC LIMIT 10
      `),
    ]);

    res.json({
      ...general.rows[0],
      byPriority: byPriority.rows,
      byUser: byUser.rows,
      recentActivity: recentActivity.rows,
    });
  } catch (err) {
    next(err);
  }
};

const getAuditLog = async (req, res, next) => {
  try {
    const { page = 1, limit = 50, userId, action, table: tableName } = req.query;
    const offset = (page - 1) * limit;
    const params = [];
    let i = 1;
    let where = 'WHERE 1=1';

    if (userId) { where += ` AND al.user_id = $${i++}`; params.push(userId); }
    if (action) { where += ` AND al.action = $${i++}`; params.push(action); }
    if (tableName) { where += ` AND al.table_name = $${i++}`; params.push(tableName); }

    const [logs, count] = await Promise.all([
      db.query(
        `SELECT al.*, u.name AS user_name FROM audit_log al
         LEFT JOIN users u ON u.id = al.user_id
         ${where} ORDER BY al.created_at DESC LIMIT $${i++} OFFSET $${i++}`,
        [...params, limit, offset]
      ),
      db.query(`SELECT COUNT(*) FROM audit_log al ${where}`, params),
    ]);

    res.json({ audit_log: logs.rows, total: parseInt(count.rows[0].count), page: parseInt(page) });
  } catch (err) {
    next(err);
  }
};

module.exports = { getStats, getAuditLog };
