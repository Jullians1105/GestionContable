const { Router } = require('express');
const { authMiddleware } = require('../middleware/auth');
const { requireActividad } = require('../middleware/actividadAccess');
const { getActividad } = require('../controllers/actividadController');

const router = Router();
router.use(authMiddleware);

/**
 * @openapi
 * /api/actividad:
 *   get:
 *     tags: [Actividad]
 *     summary: Qué hizo cada persona en un día (admin, o con permiso actividad.canVer)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { name: fecha, in: query, schema: { type: string, example: "2026-10-08" } }
 *       - { name: userId, in: query, schema: { type: string } }
 */
router.get('/', requireActividad, getActividad);

module.exports = router;
