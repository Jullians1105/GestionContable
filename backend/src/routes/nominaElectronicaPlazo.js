const { Router } = require('express');
const { body, query } = require('express-validator');
const { authMiddleware } = require('../middleware/auth');
const { requireNEView, requireNEPlazoAdmin } = require('../middleware/nominaElectronicaAccess');
const { validate } = require('../middleware/validation');
const { getPlazo, updatePlazo } = require('../controllers/nePlazoController');

const router = Router();
router.use(authMiddleware);

/**
 * @openapi
 * /api/nomina-electronica/plazo:
 *   get:
 *     tags: [NominaElectronicaPlazo]
 *     summary: Fecha límite de un mes (?anio&mes; por defecto el mes habilitado, ver ne_plazo_mes)
 *     security:
 *       - bearerAuth: []
 */
router.get('/',
  requireNEView,
  query('anio').optional().isInt({ min: 2000, max: 2100 }),
  query('mes').optional().isInt({ min: 1, max: 12 }),
  validate,
  getPlazo
);

/**
 * @openapi
 * /api/nomina-electronica/plazo:
 *   put:
 *     tags: [NominaElectronicaPlazo]
 *     summary: Actualizar la fecha límite de un mes (solo las cuentas responsables, ver requireNEPlazoAdmin)
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               anio: { type: integer }
 *               mes: { type: integer }
 *               fechaLimite: { type: string, format: date, nullable: true }
 */
router.put('/',
  requireNEPlazoAdmin,
  body('anio').isInt({ min: 2000, max: 2100 }).toInt(),
  body('mes').isInt({ min: 1, max: 12 }).toInt(),
  body('fechaLimite').optional({ nullable: true }).isISO8601().withMessage('fechaLimite debe ser una fecha válida (YYYY-MM-DD)'),
  validate,
  updatePlazo
);

module.exports = router;
