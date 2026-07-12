const { Router } = require('express');
const { getStats, getAuditLog, getWorkload } = require('../controllers/statsController');
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

/**
 * @openapi
 * /api/stats/workload:
 *   get:
 *     tags: [Stats]
 *     summary: Carga de trabajo por persona (snapshot actual + histórico mensual, solo admin/leader)
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: >
 *           { current: [{ id, name, abiertas, vencidas }], monthly: [{ mes, name, creadas }] }
 */
router.get('/workload', roleMiddleware('admin', 'leader'), getWorkload);

module.exports = router;
