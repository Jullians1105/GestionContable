const { Router } = require('express');
const { body, query } = require('express-validator');
const { authMiddleware } = require('../middleware/auth');
const { requireNEAccess, requireNEView } = require('../middleware/nominaElectronicaAccess');
const { validate } = require('../middleware/validation');
const { validateUUIDParam } = require('../middleware/security');
const { getMesTodasEmpresas, updateMes } = require('../controllers/neMesesController');

const router = Router();
router.use(authMiddleware);

const validateAnioMes = [
  query('anio')
    .notEmpty().withMessage('anio es requerido')
    .isInt({ min: 2000, max: 2100 }).withMessage('anio debe ser un año entre 2000 y 2100')
    .toInt(),
  query('mes')
    .notEmpty().withMessage('mes es requerido')
    .isInt({ min: 1, max: 12 }).withMessage('mes debe ser entre 1 y 12')
    .toInt(),
  validate,
];

/**
 * @openapi
 * /api/nomina-electronica/meses:
 *   get:
 *     tags: [NominaElectronicaMeses]
 *     summary: Estado del mes para todas las empresas — de momento sin filtrar por responsable (ver todas)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { name: anio, in: query, required: true, schema: { type: integer } }
 *       - { name: mes,  in: query, required: true, schema: { type: integer, minimum: 1, maximum: 12 } }
 */
router.get('/', requireNEView, ...validateAnioMes, getMesTodasEmpresas);

/**
 * @openapi
 * /api/nomina-electronica/meses/{empresaId}:
 *   put:
 *     tags: [NominaElectronicaMeses]
 *     summary: Marcar estado/novedad/nota de una empresa en un mes
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { name: empresaId, in: path, required: true, schema: { type: string, format: uuid } }
 *       - { name: anio, in: query, required: true, schema: { type: integer } }
 *       - { name: mes,  in: query, required: true, schema: { type: integer, minimum: 1, maximum: 12 } }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               estado:       { type: string, enum: [pendiente, presentada, no_aplica] }
 *               autorizada:   { type: boolean, description: "Ya avisaron que se puede presentar (rojo); independiente de estado" }
 *               tieneNovedad: { type: boolean }
 *               novedadNota:  { type: string, nullable: true }
 *               nota:         { type: string, nullable: true }
 *     responses:
 *       200:
 *         description: Fila actualizada
 *       403:
 *         description: Sin permiso, empresa fuera de tu responsabilidad, o mes vencido
 */
router.put('/:empresaId',
  ...validateUUIDParam('empresaId'),
  ...validateAnioMes,
  requireNEAccess,
  body('estado').optional().isIn(['pendiente', 'presentada', 'no_aplica'])
    .withMessage('estado debe ser pendiente, presentada o no_aplica'),
  body('autorizada').optional().isBoolean(),
  body('tieneNovedad').optional().isBoolean(),
  body('novedadNota').optional({ nullable: true }).isString(),
  body('nota').optional({ nullable: true }).isString(),
  validate,
  updateMes
);

module.exports = router;
