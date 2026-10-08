const { Router } = require('express');
const { authMiddleware } = require('../middleware/auth');
const { requireActividad } = require('../middleware/actividadAccess');
const { getActividad, getAccesos } = require('../controllers/actividadController');

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

/**
 * @openapi
 * /api/actividad/accesos:
 *   get:
 *     tags: [Actividad]
 *     summary: Cómo usa el equipo la aplicación (inicios de sesión, días y horas de uso, intentos fallidos)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { name: hasta, in: query, schema: { type: string, example: "2026-10-08" } }
 *       - { name: dias, in: query, schema: { type: integer, enum: [1, 7, 30] } }
 */
router.get('/accesos', requireActividad, getAccesos);

module.exports = router;
