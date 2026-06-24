const { Router } = require('express');
const { body, query } = require('express-validator');
const { authMiddleware } = require('../middleware/auth');
const { requireFondoAccess } = require('../middleware/fondoAccess');
const { validate } = require('../middleware/validation');
const { validateUUIDParam } = require('../middleware/security');
const { getPagos, listPagos, createPago, updatePago } = require('../controllers/fondoPagosController');

const router = Router();
router.use(authMiddleware);

/**
 * @openapi
 * /api/fondo/pagos/{empresaId}:
 *   get:
 *     tags: [FondoPagos]
 *     summary: >
 *       Obtener pago de un mes específico + mora calculada (con anio+mes),
 *       o historial completo + mora (sin anio+mes).
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { name: empresaId, in: path,  required: true, schema: { type: string, format: uuid } }
 *       - { name: anio,      in: query, required: false, schema: { type: integer } }
 *       - { name: mes,       in: query, required: false, schema: { type: integer, minimum: 1, maximum: 12 } }
 *     responses:
 *       200:
 *         description: >
 *           Con anio+mes: { pago, mora }. Sin anio+mes: { pagos: [...], mora }.
 *           mora = cantidad de meses consecutivos sin aprobar desde el último aprobado.
 */
router.get('/:empresaId',
  ...validateUUIDParam('empresaId'),
  query('anio').optional().isInt({ min: 2000, max: 2100 }).withMessage('anio debe ser un año entre 2000 y 2100').toInt(),
  query('mes').optional().isInt({ min: 1, max: 12 }).withMessage('mes debe ser entre 1 y 12').toInt(),
  validate,
  (req, res, next) => {
    if (req.query.anio != null && req.query.mes != null) {
      return getPagos(req, res, next);
    }
    return listPagos(req, res, next);
  }
);

/**
 * @openapi
 * /api/fondo/pagos/{empresaId}:
 *   post:
 *     tags: [FondoPagos]
 *     summary: Registrar envío de documentos de pago para un mes (crea con estado=pendiente)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { name: empresaId, in: path, required: true, schema: { type: string, format: uuid } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [anio, mes]
 *             properties:
 *               anio: { type: integer, minimum: 2000, maximum: 2100 }
 *               mes:  { type: integer, minimum: 1, maximum: 12 }
 *     responses:
 *       201:
 *         description: Pago creado. monto es snapshot de fondo_empresas.monthly_fee.
 *       409:
 *         description: Ya existe un pago para esta empresa y período.
 *       403:
 *         description: Sin permiso de edición en Fondo Emprender.
 */
router.post('/:empresaId',
  ...validateUUIDParam('empresaId'),
  requireFondoAccess,
  body('anio')
    .notEmpty().withMessage('anio es requerido')
    .isInt({ min: 2000, max: 2100 }).withMessage('anio debe ser un año entre 2000 y 2100')
    .toInt(),
  body('mes')
    .notEmpty().withMessage('mes es requerido')
    .isInt({ min: 1, max: 12 }).withMessage('mes debe ser entre 1 y 12')
    .toInt(),
  validate,
  createPago
);

/**
 * @openapi
 * /api/fondo/pagos/{empresaId}/{pagoId}:
 *   put:
 *     tags: [FondoPagos]
 *     summary: Actualizar estado y/o nota de un pago (fecha_resolucion se registra al aprobar/rechazar)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { name: empresaId, in: path, required: true, schema: { type: string, format: uuid } }
 *       - { name: pagoId,    in: path, required: true, schema: { type: string, format: uuid } }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               estado: { type: string, enum: [pendiente, enviado, aprobado, rechazado] }
 *               nota:   { type: string }
 *     responses:
 *       200:
 *         description: Pago actualizado. fecha_resolucion se fija al aprobar o rechazar.
 *       404:
 *         description: Pago no encontrado.
 *       403:
 *         description: Sin permiso de edición en Fondo Emprender.
 */
router.put('/:empresaId/:pagoId',
  ...validateUUIDParam('empresaId'),
  ...validateUUIDParam('pagoId'),
  requireFondoAccess,
  body('estado')
    .optional()
    .isIn(['pendiente', 'enviado', 'aprobado', 'rechazado'])
    .withMessage('estado debe ser pendiente, enviado, aprobado o rechazado'),
  body('nota').optional({ nullable: true }).isString(),
  validate,
  updatePago
);

module.exports = router;
