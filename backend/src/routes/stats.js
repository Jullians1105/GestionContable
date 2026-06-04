const { Router } = require('express');
const { getStats, getAuditLog } = require('../controllers/statsController');
const { authMiddleware, roleMiddleware } = require('../middleware/auth');

const router = Router();
router.use(authMiddleware);

/**
 * @openapi
 * /api/stats:
 *   get:
 *     tags: [Stats]
 *     summary: Estadísticas generales del sistema
 *     security:
 *       - bearerAuth: []
 */
router.get('/', getStats);

/**
 * @openapi
 * /api/audit:
 *   get:
 *     tags: [Audit]
 *     summary: Log de auditoría (solo admin/leader)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { name: page, in: query, schema: { type: integer } }
 *       - { name: limit, in: query, schema: { type: integer } }
 *       - { name: userId, in: query, schema: { type: string } }
 *       - { name: action, in: query, schema: { type: string, enum: [CREATE, UPDATE, DELETE] } }
 *       - { name: table, in: query, schema: { type: string } }
 */
router.get('/audit', roleMiddleware('admin', 'leader'), getAuditLog);

module.exports = router;
