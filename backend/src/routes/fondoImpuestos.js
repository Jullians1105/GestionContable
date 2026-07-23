const { Router } = require('express');
const { body, query } = require('express-validator');
const { authMiddleware } = require('../middleware/auth');
const { requireFondoAccess } = require('../middleware/fondoAccess');
const { validate } = require('../middleware/validation');
const { validateUUIDParam } = require('../middleware/security');
const { getImpuestos, updateImpuestoItem } = require('../controllers/fondoImpuestosController');

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
 * /api/fondo/impuestos/{empresaId}:
 *   get:
 *     tags: [FondoImpuestos]
 *     summary: Obtener el checklist de impuestos (mp6) de una empresa para un mes
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { name: empresaId, in: path, required: true, schema: { type: string, format: uuid } }
 *       - { name: anio, in: query, required: true, schema: { type: integer } }
 *       - { name: mes,  in: query, required: true, schema: { type: integer, minimum: 1, maximum: 12 } }
 *     responses:
 *       200:
 *         description: >
 *           Los 4 ítems (Autorretención, Retención, IVA, Consumo). Crea las filas
 *           del mes en estado 'pending' si aún no existían.
 */
router.get('/:empresaId',
  ...validateUUIDParam('empresaId'),
  ...validateAnioMes,
  getImpuestos
);

/**
 * @openapi
 * /api/fondo/impuestos/{empresaId}/item/{impuestoId}:
 *   patch:
 *     tags: [FondoImpuestos]
 *     summary: Actualizar estado/nota de un impuesto individual en un mes
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { name: empresaId,  in: path, required: true, schema: { type: string, format: uuid } }
 *       - { name: impuestoId, in: path, required: true, schema: { type: string, format: uuid } }
 *       - { name: anio, in: query, required: true, schema: { type: integer } }
 *       - { name: mes,  in: query, required: true, schema: { type: integer, minimum: 1, maximum: 12 } }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               estado: { type: string, enum: [pending, presented, na] }
 *               nota:   { type: string }
 *     responses:
 *       200:
 *         description: Ítem actualizado (crea la fila si no existía).
 *       403:
 *         description: Sin permiso de edición en Fondo Emprender
 */
router.patch('/:empresaId/item/:impuestoId',
  ...validateUUIDParam('empresaId'),
  ...validateUUIDParam('impuestoId'),
  ...validateAnioMes,
  requireFondoAccess,
  body('estado').optional().isIn(['pending', 'presented', 'na'])
    .withMessage('estado debe ser pending, presented o na'),
  body('nota').optional({ nullable: true }).isString(),
  validate,
  updateImpuestoItem
);

module.exports = router;
