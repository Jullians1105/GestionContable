const { Router } = require('express');
const db = require('../config/database');
const { authMiddleware } = require('../middleware/auth');

const router = Router();
router.use(authMiddleware);

function normalizeNotif(n) {
  return {
    id: n.id,
    type: n.type,
    message: n.message,
    taskId: n.task_id || null,
    read: n.read,
    extra: n.extra_data || null,
    createdAt: n.created_at,
  };
}

/**
 * @openapi
 * /api/notifications:
 *   get:
 *     tags: [Notifications]
 *     summary: Obtener notificaciones del usuario autenticado
 *     security:
 *       - bearerAuth: []
 */
router.get('/', async (req, res, next) => {
  try {
    const result = await db.query(
      `SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50`,
      [req.user.userId]
    );
    res.json(result.rows.map(normalizeNotif));
  } catch (err) { next(err); }
});

router.put('/:id/read', async (req, res, next) => {
  try {
    await db.query(
      'UPDATE notifications SET read = true WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.userId]
    );
    res.json({ success: true });
  } catch (err) { next(err); }
});

router.put('/read-all', async (req, res, next) => {
  try {
    await db.query('UPDATE notifications SET read = true WHERE user_id = $1', [req.user.userId]);
    res.json({ success: true });
  } catch (err) { next(err); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    await db.query('DELETE FROM notifications WHERE id = $1 AND user_id = $2', [req.params.id, req.user.userId]);
    res.json({ success: true });
  } catch (err) { next(err); }
});

module.exports = router;
