const { Router } = require('express');
const { body } = require('express-validator');
const { authMiddleware } = require('../middleware/auth');
const { requireNEView, requireNEAdmin } = require('../middleware/nominaElectronicaAccess');
const { validate } = require('../middleware/validation');
const { getPlazo, updatePlazo } = require('../controllers/nePlazoController');

const router = Router();
router.use(authMiddleware);

/**
 * @openapi
 * /api/nomina-electronica/plazo:
 *   get:
 *     tags: [NominaElectronicaPlazo]
 *     summary: Fecha límite vigente para presentar (editada a mano, ver ne_plazo)
 *     security:
 *       - bearerAuth: []
 */
router.get('/', requireNEView, getPlazo);

/**
 * @openapi
 * /api/nomina-electronica/plazo:
 *   put:
 *     tags: [NominaElectronicaPlazo]
 *     summary: Actualizar la fecha límite (admin o permiso canGestionar)
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               fechaLimite: { type: string, format: date, nullable: true }
 */
router.put('/',
  requireNEAdmin,
  body('fechaLimite').optional({ nullable: true }).isISO8601().withMessage('fechaLimite debe ser una fecha válida (YYYY-MM-DD)'),
  validate,
  updatePlazo
);

module.exports = router;
